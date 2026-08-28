/**
 * Connexus internal-navigation latency benchmark.
 *
 * Objective metric: p95_navigation_ms — the 95th percentile of the elapsed time
 * from the user's click on an in-app navigation control until the destination
 * page is actually usable.
 *
 * HOW THE TIMING WORKS
 * --------------------
 * Both endpoints of the measurement are taken *inside the page*, so no
 * Playwright IPC or actionability-check overhead is included:
 *
 *   t0  a capture-phase click listener installed before the click records
 *       performance.now() at the moment the real click event fires.
 *   t1  a watcher (rAF + MutationObserver) records performance.now() the first
 *       frame at which the destination's "usable" condition holds.
 *
 * "Usable" is never just "the URL changed". Every condition pairs the
 * destination pathname with real rendered content and, where the page has one,
 * an enabled primary control. The conditions are defined once in ROUTES below
 * and must not be weakened to make a result look better.
 *
 * NOISE CONTROL
 * -------------
 *   - Chromium, one browser, one page, strictly sequential.
 *   - Fixed 1440x900 viewport.
 *   - Authenticated once via storageState; login is never part of a measurement.
 *   - Paths are interleaved round-robin rather than run in blocks, so ambient
 *     network drift is spread evenly over all paths instead of biasing one.
 *   - Warmup repetitions are recorded but excluded from the statistics.
 *   - No fixed sleeps anywhere.
 *
 * Usage:
 *   node perf/bench.mjs                       # full run
 *   node perf/bench.mjs --reps 5              # quick smoke run
 *   node perf/bench.mjs --label "E1 cache()"  # tag the result file
 */
import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const RESULTS_DIR = join(ROOT, "perf", "results")
const AUTH_PATH = join(ROOT, "perf", ".auth", "bench.json")

const argv = process.argv.slice(2)
const argValue = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100"
const REPS = Number(argValue("--reps", "40"))
// The first measured repetition consistently carried the run's worst outliers
// when only 3 warmups ran (4 of the 6 samples over 1s in baseline-run1 landed
// on rep 0), so the warmup is deliberately generous.
const WARMUP = Number(argValue("--warmup", "6"))
const LABEL = argValue("--label", "baseline")

// Route definitions, usable conditions, in-page instrumentation and stats live
// in perf/shared.mjs so this tool and perf/bench-ab.mjs cannot diverge.
import { READY, ROUTES, ORIGIN_READY, ORIGIN_PATH, PAGE_HELPERS, percentile, summarise } from "./shared.mjs"

// --- run -------------------------------------------------------------------

if (!existsSync(AUTH_PATH)) {
    console.error(`Missing ${AUTH_PATH}. Run: node perf/auth-setup.mjs`)
    process.exit(1)
}
mkdirSync(RESULTS_DIR, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
    storageState: AUTH_PATH,
    viewport: { width: 1440, height: 900 },
})
await context.addInitScript(PAGE_HELPERS)
let page = await context.newPage()

// --- diagnostics collection ------------------------------------------------
const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    cancelledRequests: 0,
    // Requests are attributed to whichever measurement window was open when
    // they started.
    windows: [],
}
let currentWindow = null

// Vercel Analytics / Speed Insights are served by the Vercel edge, not by
// `next start`, so they 404 locally on every single page in every run. They are
// environmental, identical across experiments, and are recorded separately
// rather than being allowed to mask a real regression.
const isEnvironmentalNoise = (text) => /_vercel\/(insights|speed-insights)/.test(text)

// Diagnostics are attached per page object, so a recycled page keeps
// reporting into the same accumulators.
function attachDiagnostics(page) {
    page.on("console", (m) => {
        if (m.type() !== "error") return
        // The text of a resource-load failure is just "Failed to load resource: ...
        // 404" with no URL, so classification has to use the message's location.
        const text = m.text()
        const where = m.location()?.url ?? ""
        const bucket = isEnvironmentalNoise(text) || isEnvironmentalNoise(where) ? "env" : "app"
        if (bucket === "app") diagnostics.consoleErrors.push(`${text.slice(0, 200)} @ ${where.slice(0, 120)}`)
        if (currentWindow) currentWindow.consoleErrors[bucket] += 1
    })
    page.on("pageerror", (e) => {
        diagnostics.pageErrors.push(String(e).slice(0, 300))
        if (currentWindow) currentWindow.pageErrors += 1
    })
    page.on("request", () => { if (currentWindow) currentWindow.requests += 1 })
    page.on("requestfailed", (r) => {
        const url = r.url()
        const err = r.failure()?.errorText ?? ""
        // Chromium aborts an in-flight RSC prefetch the moment the navigation it was
        // speculating about actually starts. That is normal and expected; counting
        // it as a failed request would swamp the signal.
        const cancelled = err.includes("ERR_ABORTED")
        if (cancelled) {
            diagnostics.cancelledRequests += 1
            if (currentWindow) currentWindow.cancelledRequests += 1
            return
        }
        if (isEnvironmentalNoise(url)) return
        diagnostics.failedRequests.push(`${err} ${url.slice(0, 160)}`)
        if (currentWindow) currentWindow.failedRequests += 1
    })
    page.on("response", async (r) => {
        if (!currentWindow) return
        const len = Number(r.headers()["content-length"] ?? 0)
        if (Number.isFinite(len)) currentWindow.bytes += len
        // Per-navigation phase timing is taken in-page from PerformanceResourceTiming
        // instead, so it shares the performance.now() clock with t0/t1 — see
        // window.__bench.result(). Supabase calls are made server-side and are
        // invisible to the browser; the streamed RSC response is the only
        // browser-observable handle on them.
        if (r.status() >= 400 && !isEnvironmentalNoise(r.url())) {
            currentWindow.httpErrors += 1
            diagnostics.failedRequests.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`)
        }
    })
}

attachDiagnostics(page)

// `networkidle` is deliberately bounded. A first attempt at this benchmark used
// an unbounded wait and degraded from ~40s/rep to ~5min/rep after roughly 30
// minutes: the app holds an open realtime WebSocket and Next re-prefetches on
// every navigation, so "no network activity for 500ms" stops being reachable in
// a long-lived SPA session and each settle ran to its 30s default timeout.
// The deterministic `isReady` check above is what actually establishes the
// origin state; this is only a best-effort quiet period, so timing out here is
// fine and must not stall the run.
const SETTLE_QUIET_MS = 2500
const settleDurations = []

async function settleOn(originKey) {
    const started = Date.now()
    const spec = ORIGIN_READY[originKey]
    if (page.url() !== BASE + ORIGIN_PATH[originKey]) {
        await page.goto(BASE + ORIGIN_PATH[originKey], { waitUntil: "domcontentloaded" })
    }
    await page.waitForFunction((s) => window.__bench.isReady(s), spec, { timeout: 30000 })
    // Let in-flight client work (navbar unread count, realtime subscribe) finish
    // so it cannot land inside the next measurement window.
    await page.waitForLoadState("networkidle", { timeout: SETTLE_QUIET_MS }).catch(() => {})
    settleDurations.push(Date.now() - started)
}

async function measure(route) {
    await settleOn(route.from)

    await page.evaluate((spec) => window.__bench.arm(spec), route.ready)

    currentWindow = { route: route.id, requests: 0, bytes: 0, failedRequests: 0, cancelledRequests: 0, httpErrors: 0, consoleErrors: { app: 0, env: 0 }, pageErrors: 0 }

    await page.locator(route.click).first().click()

    // 15s rather than 30s: a hung measurement is a failure either way, and the
    // shorter bound halves what one costs the run.
    await page.waitForFunction(() => window.__bench.result() !== null, undefined, { timeout: 15000 })
    const res = await page.evaluate(() => window.__bench.result())

    const win = currentWindow
    currentWindow = null
    diagnostics.windows.push({ ...win, ms: res.ms, phases: res.phases })
    return res.ms
}

const samples = Object.fromEntries(ROUTES.map((r) => [r.id, []]))
const warmupSamples = Object.fromEntries(ROUTES.map((r) => [r.id, []]))
const failures = []

const started = Date.now()
console.log(`Connexus navigation benchmark — label "${LABEL}"`)
console.log(`  base ${BASE}   reps ${REPS} (+${WARMUP} warmup)   paths ${ROUTES.length}\n`)

// A single page held across hundreds of client-side navigations degrades: the
// renderer's memory climbs, the router cache and prefetch set grow, and the run
// slows down over its own length — which would silently bias later reps against
// earlier ones and make two runs incomparable. Recycling the page on a fixed
// cadence bounds that. It happens outside every measurement window, and the
// cadence is fixed so every run pays it identically.
const RECYCLE_EVERY = 8

async function recyclePage() {
    const fresh = await context.newPage()
    attachDiagnostics(fresh)
    await fresh.goto(BASE + "/home", { waitUntil: "domcontentloaded" })
    const old = page
    page = fresh
    await old.close().catch(() => {})
}

for (let rep = 0; rep < WARMUP + REPS; rep += 1) {
    const isWarmup = rep < WARMUP
    if (rep > 0 && rep % RECYCLE_EVERY === 0) {
        await recyclePage().catch((err) => {
            failures.push({ rep, route: "(page recycle)", error: String(err).slice(0, 300) })
        })
    }
    for (const route of ROUTES) {
        try {
            const ms = await measure(route)
            ;(isWarmup ? warmupSamples : samples)[route.id].push(+ms.toFixed(1))
        } catch (err) {
            failures.push({ rep, route: route.id, error: String(err).slice(0, 300) })
            currentWindow = null
            // Recover to a known page so one failure does not cascade.
            await page.goto(BASE + "/home", { waitUntil: "domcontentloaded" }).catch(() => {})
        }
    }
    const done = rep + 1
    process.stdout.write(`\r  ${isWarmup ? "warmup" : "measure"} rep ${done}/${WARMUP + REPS}   `)
}
console.log("\n")

// Overall = every measured sample from every path pooled. This is the primary
// objective: p95 across all internal navigations, not an average of p95s.
const pooled = Object.values(samples).flat()

const result = {
    label: LABEL,
    startedAt: new Date(started).toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    config: { base: BASE, reps: REPS, warmup: WARMUP, viewport: "1440x900", browser: "chromium", workers: 1, interleaved: true },
    git: null,
    overall: summarise(pooled),
    perRoute: Object.fromEntries(ROUTES.map((r) => [r.id, summarise(samples[r.id])])),
    secondary: {
        avgRequestsPerNavigation: +(diagnostics.windows.reduce((a, w) => a + w.requests, 0) / (diagnostics.windows.length || 1)).toFixed(2),
        avgContentLengthBytesPerNavigation: Math.round(diagnostics.windows.reduce((a, w) => a + w.bytes, 0) / (diagnostics.windows.length || 1)),
        requestsPerRoute: Object.fromEntries(ROUTES.map((r) => {
            const ws = diagnostics.windows.filter((w) => w.route === r.id)
            return [r.id, +(ws.reduce((a, w) => a + w.requests, 0) / (ws.length || 1)).toFixed(2)]
        })),
        // Median phase split per route -- says whether a route's latency is
        // server chain or client rendering, which decides what to optimise.
        phasesMedianPerRoute: Object.fromEntries(ROUTES.map((r) => {
            const ps = diagnostics.windows.filter((w) => w.route === r.id && w.phases).map((w) => w.phases)
            if (!ps.length) return [r.id, null]
            const med = (k) => {
                const v = ps.map((x) => x[k]).sort((a, b) => a - b)
                return +percentile(v, 50).toFixed(1)
            }
            return [r.id, { n: ps.length, dispatch: med("dispatch"), ttfb: med("ttfb"), stream: med("stream"), serverTotal: med("serverTotal"), client: med("client"), bytes: med("bytes") }]
        })),
        // p95 of server think-time (ttfb + stream) per route — the part of the
        // navigation the sequential Supabase chain is responsible for, and the
        // number the experiments are trying to move.
        serverTotalP95PerRoute: Object.fromEntries(ROUTES.map((r) => {
            const vals = diagnostics.windows.filter((w) => w.route === r.id && w.phases).map((w) => w.phases.serverTotal).sort((a, b) => a - b)
            return [r.id, vals.length ? +percentile(vals, 95).toFixed(1) : null]
        })),
        // Settle time is outside every measurement window and so cannot bias
        // the metric — but it is reported because a settle that starts running
        // long is the signature of the SPA-session degradation that ruined the
        // first baseline attempt. If p95 settle approaches SETTLE_QUIET_MS,
        // treat the run as suspect.
        settleMsMedian: settleDurations.length ? +percentile([...settleDurations].sort((a, b) => a - b), 50).toFixed(0) : null,
        settleMsP95: settleDurations.length ? +percentile([...settleDurations].sort((a, b) => a - b), 95).toFixed(0) : null,
        settleMsMax: settleDurations.length ? Math.max(...settleDurations) : null,
        appConsoleErrors: diagnostics.consoleErrors.length,
        cancelledPrefetches: diagnostics.cancelledRequests,
        pageErrors: diagnostics.pageErrors.length,
        failedRequests: diagnostics.failedRequests.length,
        environmentalNoiseNote: "Vercel Analytics/Speed Insights 404s are excluded — they are a `next start` artefact, present identically in every run.",
    },
    failures,
    raw: samples,
    rawWarmup: warmupSamples,
    diagnosticsSample: {
        consoleErrors: diagnostics.consoleErrors.slice(0, 10),
        pageErrors: diagnostics.pageErrors.slice(0, 10),
        failedRequests: [...new Set(diagnostics.failedRequests)].slice(0, 10),
    },
}

const stamp = new Date(started).toISOString().replace(/[:.]/g, "-")
const outPath = join(RESULTS_DIR, `${stamp}__${LABEL.replace(/[^a-z0-9]+/gi, "-")}.json`)
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n")

// --- human summary ---------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n)
const num = (v, n = 8) => String(v ?? "-").padStart(n)

console.log(`Label: ${LABEL}   (${result.durationSec}s, ${pooled.length} measured navigations)\n`)
console.log(pad("navigation", 26) + num("median") + num("p90") + num("p95") + num("p99") + num("max") + num("reqs") + num("srvP95"))
console.log("-".repeat(26 + 8 * 7))
for (const r of ROUTES) {
    const s = result.perRoute[r.id]
    console.log(pad(r.id, 26) + num(s.median) + num(s.p90) + num(s.p95) + num(s.p99) + num(s.max) + num(result.secondary.requestsPerRoute[r.id]) + num(result.secondary.serverTotalP95PerRoute[r.id]))
}
console.log("-".repeat(26 + 8 * 7))
const o = result.overall
console.log(pad("OVERALL", 26) + num(o.median) + num(o.p90) + num(o.p95) + num(o.p99) + num(o.max) + num(result.secondary.avgRequestsPerNavigation))
console.log("\nmedian phase split (ms) — ttfb+stream = server think-time, client = React render")
console.log(pad("navigation", 26) + num("dispatch") + num("ttfb") + num("stream") + num("server") + num("client") + num("bytes", 9))
console.log("-".repeat(26 + 8 * 5 + 9))
for (const r of ROUTES) {
    const ph = result.secondary.phasesMedianPerRoute[r.id]
    if (!ph) { console.log(pad(r.id, 26) + "  (no RSC entry captured)"); continue }
    console.log(pad(r.id, 26) + num(ph.dispatch) + num(ph.ttfb) + num(ph.stream) + num(ph.serverTotal) + num(ph.client) + num(ph.bytes, 9))
}

console.log(`\n  PRIMARY  p95_navigation_ms = ${o.p95} ms`)
console.log(`  app console errors ${result.secondary.appConsoleErrors} | page errors ${result.secondary.pageErrors} | failed requests ${result.secondary.failedRequests} | cancelled prefetches ${result.secondary.cancelledPrefetches} | measurement failures ${failures.length}`)
console.log(`  settle ms (outside the measurement window): median ${result.secondary.settleMsMedian}  p95 ${result.secondary.settleMsP95}  max ${result.secondary.settleMsMax}`)
if (failures.length) console.log("  FAILURES:", JSON.stringify(failures.slice(0, 5), null, 1))
console.log(`\n  saved ${outPath.replace(ROOT + "\\", "")}`)

await browser.close()
