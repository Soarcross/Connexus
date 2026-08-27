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

const fixture = JSON.parse(readFileSync(join(ROOT, "perf", "bench-fixture.json"), "utf8"))
const VIEWER_ID = fixture.users.find((u) => u.role === "viewer").id
const CONV_ID = fixture.conversations[0].id
// partner emails are perf-bench-partner-N@...; the profile names are spelled out
// because profiles.full_name_sane forbids digits.
const CONV_PARTNER_NAME = ["Perf Bench Partner One", "Perf Bench Partner Two", "Perf Bench Partner Three"][
    Number(fixture.conversations[0].with.match(/partner-(\d)/)[1]) - 1
]

// --- "usable" conditions ---------------------------------------------------
// Each is plain data so it can be evaluated inside the page. `sel` selectors are
// checked for existence, minimum count, visibility, and (where relevant) that
// the control is enabled.

const READY = {
    home: {
        pathname: "/home",
        selectors: [
            { sel: "main h1", text: "Welcome back" },
            { sel: "main h2", text: "Opportunities of the Month" },
            { sel: 'main [data-slot="card"]', min: 3 },
        ],
    },
    opportunities: {
        pathname: "/opportunities",
        selectors: [
            { sel: "main h1", text: "Opportunities" },
            { sel: 'main [data-slot="card"]', min: 2 },
            { sel: 'main input[placeholder="Search opportunities..."]', enabled: true },
        ],
    },
    people: {
        pathname: "/people",
        selectors: [
            { sel: "main h1", text: "People" },
            // 52 chapter-mates + the 4 benchmark accounts render as cards; 10 is
            // a floor that proves the real list rendered, not a lucky first row.
            { sel: 'main [data-slot="card"]', min: 10 },
            { sel: "main input[placeholder^='Search by name']", enabled: true },
        ],
    },
    community: {
        pathname: "/community",
        selectors: [
            { sel: "main h1", text: "Community" },
            { sel: 'main [data-slot="card"]', min: 2 },
        ],
    },
    chapters: {
        pathname: "/chapters",
        selectors: [
            { sel: "main h1", text: "Chapters" },
            { sel: 'main a[href="/chapters/stuy"]' },
            { sel: 'main [data-slot="card"]', min: 3 },
        ],
    },
    chapterDetail: {
        pathname: "/chapters/stuy",
        selectors: [
            { sel: "main h1", text: "chapter" },
            { sel: 'main [role="tab"]', min: 2 },
            { sel: 'main [data-slot="card"]', min: 5 },
        ],
    },
    messages: {
        pathname: "/messages",
        selectors: [
            { sel: "main h1", text: "Messages" },
            // The three fixture conversations, each a clickable row.
            { sel: "main .cursor-pointer", min: 3 },
        ],
    },
    conversation: {
        pathname: `/messages/${CONV_ID}`,
        selectors: [
            { sel: 'main input[placeholder="Type a message..."]', enabled: true },
            // The thread itself must have rendered, not just the composer.
            // Message bubbles are the .rounded-2xl divs in chat-window.tsx.
            { sel: "main div.rounded-2xl", min: 4 },
        ],
    },
    ownProfile: {
        pathname: `/profile/${VIEWER_ID}`,
        selectors: [
            { sel: "main h1", text: "Perf Bench Viewer" },
            { sel: 'main [data-slot="card"]', min: 1 },
        ],
    },
    anyProfile: {
        pathnamePrefix: "/profile/",
        selectors: [
            { sel: "main h1", min: 1 },
            { sel: 'main [data-slot="card"]', min: 1 },
        ],
    },
}

// --- the navigation paths under test ---------------------------------------
// `click` is a CSS selector resolved on the origin page. Every one of these is a
// control a real user actually clicks.

const ROUTES = [
    { id: "home->opportunities", from: "home", ready: READY.opportunities, click: 'header a[href="/opportunities"]' },
    { id: "home->people",        from: "home", ready: READY.people,        click: 'header a[href="/people"]' },
    { id: "home->community",     from: "home", ready: READY.community,     click: 'header a[href="/community"]' },
    { id: "home->chapters",      from: "home", ready: READY.chapters,      click: 'header a[href="/chapters"]' },
    { id: "home->messages",      from: "home", ready: READY.messages,      click: 'header a[href="/messages"]' },
    // The People carousel card — a <div onClick={router.push}>, not a <Link>.
    { id: "home->profile",       from: "home", ready: READY.anyProfile,    click: 'main section:last-of-type [data-slot="card"].cursor-pointer' },
    // Rows are ordered by last_message_at, so an nth-index would not be stable;
    // target the row by the partner's name instead.
    { id: "messages->conversation", from: "messages", ready: READY.conversation, click: `main .cursor-pointer:has-text("${CONV_PARTNER_NAME}")` },
    { id: "chapters->detail",    from: "chapters", ready: READY.chapterDetail, click: 'main a[href="/chapters/stuy"]' },
    { id: "people->profile",     from: "people", ready: READY.anyProfile,  click: 'main [data-slot="card"].cursor-pointer' },
]

const ORIGIN_READY = { home: READY.home, messages: READY.messages, chapters: READY.chapters, people: READY.people }
const ORIGIN_PATH = { home: "/home", messages: "/messages", chapters: "/chapters", people: "/people" }

// --- in-page instrumentation ----------------------------------------------
// Stringified and injected; must be self-contained.

const PAGE_HELPERS = `
window.__bench = {
  isReady(spec) {
    if (spec.pathname && location.pathname !== spec.pathname) return false
    if (spec.pathnamePrefix && !location.pathname.startsWith(spec.pathnamePrefix)) return false
    for (const s of spec.selectors) {
      const els = Array.from(document.querySelectorAll(s.sel))
      if (els.length < (s.min ?? 1)) return false
      let candidates = els
      if (s.text) {
        candidates = els.filter(e => (e.textContent || '').includes(s.text))
        if (candidates.length === 0) return false
      }
      // At least one match must be laid out (non-zero box) — proves it painted,
      // not merely that it exists in a hidden subtree.
      const visible = candidates.some(e => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      if (!visible) return false
      if (s.enabled) {
        const usable = candidates.some(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true')
        if (!usable) return false
      }
    }
    return true
  },
  arm(spec) {
    // The resource-timing buffer is capped (250 entries) and this page never
    // reloads during a run, so without clearing it the buffer fills with stale
    // prefetch entries and result() can no longer find the RSC fetch belonging
    // to the current navigation. Clearing per measurement keeps the phase
    // breakdown correct and the lookup cheap. It cannot affect t0/t1.
    try { performance.clearResourceTimings() } catch (e) { /* diagnostics only */ }
    const state = { t0: null, t1: null, spec }
    window.__benchState = state
    state.onClick = () => { if (state.t0 === null) state.t0 = performance.now() }
    document.addEventListener('click', state.onClick, true)
    const check = () => {
      if (state.t1 !== null) return true
      if (state.t0 === null) return false
      if (window.__bench.isReady(state.spec)) { state.t1 = performance.now(); return true }
      return false
    }
    const stop = () => {
      document.removeEventListener('click', state.onClick, true)
      if (state.obs) state.obs.disconnect()
    }
    state.obs = new MutationObserver(() => { if (check()) stop() })
    state.obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
    const tick = () => {
      if (check()) { stop(); return }
      state.raf = requestAnimationFrame(tick)
    }
    state.raf = requestAnimationFrame(tick)
  },
  result() {
    const s = window.__benchState
    if (!s || s.t0 === null || s.t1 === null) return null
    // Phase breakdown, on the same performance.now() clock as t0/t1, from the
    // RSC fetch this navigation actually issued. Purely diagnostic: it never
    // feeds the primary metric, which stays t1 - t0.
    //   dispatch  click -> the browser put the RSC request on the wire
    //   ttfb      request sent -> first byte. Next flushes early, so this is
    //             NOT the data-fetching cost.
    //   stream    first byte -> last byte. The RSC response is STREAMED, so
    //             this is where the page's sequential Supabase awaits are
    //             actually paid. ttfb + stream = server think-time.
    //   client    last byte -> destination usable (React render + paint)
    let phases = null
    try {
      const entry = performance.getEntriesByType('resource')
        .filter(e => e.name.includes('_rsc=') && e.startTime >= s.t0 && e.responseEnd > 0 && e.responseEnd <= s.t1)
        .sort((a, b) => b.responseEnd - a.responseEnd)[0]
      if (entry) {
        phases = {
          dispatch: +(entry.startTime - s.t0).toFixed(1),
          ttfb: +(entry.responseStart - entry.startTime).toFixed(1),
          stream: +(entry.responseEnd - entry.responseStart).toFixed(1),
          serverTotal: +(entry.responseEnd - entry.startTime).toFixed(1),
          client: +(s.t1 - entry.responseEnd).toFixed(1),
          bytes: entry.transferSize || 0,
        }
      }
    } catch (e) { /* diagnostics only */ }
    return { t0: s.t0, t1: s.t1, ms: s.t1 - s.t0, phases }
  }
}
`

// --- stats -----------------------------------------------------------------

function percentile(sorted, p) {
    if (sorted.length === 0) return null
    // Linear interpolation between closest ranks (NIST/Excel PERCENTILE.INC).
    const rank = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(rank)
    const hi = Math.ceil(rank)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo])
}

function summarise(samples) {
    const s = [...samples].sort((a, b) => a - b)
    const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1)
    return {
        n: s.length,
        min: s[0] ?? null,
        mean: +mean.toFixed(1),
        median: s.length ? +percentile(s, 50).toFixed(1) : null,
        p90: s.length ? +percentile(s, 90).toFixed(1) : null,
        p95: s.length ? +percentile(s, 95).toFixed(1) : null,
        p99: s.length ? +percentile(s, 99).toFixed(1) : null,
        max: s[s.length - 1] ?? null,
    }
}

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
