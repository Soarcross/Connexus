/**
 * Paired A/B navigation benchmark.
 *
 * WHY THIS EXISTS
 * ---------------
 * Comparing two separate benchmark runs could not decide anything. Two
 * *identical* baseline runs differed by 55.9 ms in p95 with a bootstrap 95% CI
 * of [-267, +126] — an order of magnitude wider than the ~45 ms effect a single
 * removed Supabase round trip is expected to produce.
 *
 * The cause is visible in the raw samples: outliers cluster by *repetition*,
 * not by route. In baseline-A, one repetition held 4 of the run's outliers; in
 * baseline-B, two adjacent repetitions held 7. Only 12 of 40 (A) and 6 of 40
 * (B) repetitions contained any sample over 600 ms, and when one did, several
 * unrelated routes were hit together. That is a transient machine/network
 * episode, i.e. common-mode noise.
 *
 * Common-mode noise cancels under pairing. This tool therefore runs both
 * variants against two servers *within the same repetition*, alternating which
 * goes first, so an episode hits both and cancels in the difference. The
 * decision statistic is a paired bootstrap over repetition indices, which
 * preserves that correlation structure rather than assuming independence.
 *
 * The variants must differ ONLY in application code. Same machine, same
 * browser, same context, same fixture, same Supabase project.
 *
 *   node perf/bench-ab.mjs --a http://localhost:3101 --b http://localhost:3100 \
 *                          --label E2-getClaims --reps 40
 *
 * `--a` is the control (baseline build), `--b` the treatment.
 */
import { chromium } from "@playwright/test"
import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
    ROOT, ROUTES, ORIGIN_READY, ORIGIN_PATH, PAGE_HELPERS, percentile, summarise,
} from "./shared.mjs"

const RESULTS_DIR = join(ROOT, "perf", "results")
const AUTH_PATH = join(ROOT, "perf", ".auth", "bench.json")

const argv = process.argv.slice(2)
const argValue = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const BASE_A = argValue("--a", "http://localhost:3101")
const BASE_B = argValue("--b", "http://localhost:3100")
const NAME_A = argValue("--name-a", "control")
const NAME_B = argValue("--name-b", "treatment")
const REPS = Number(argValue("--reps", "40"))
const WARMUP = Number(argValue("--warmup", "6"))
const LABEL = argValue("--label", "ab")

if (!existsSync(AUTH_PATH)) {
    console.error(`Missing ${AUTH_PATH}. Run: node perf/auth-setup.mjs`)
    process.exit(1)
}
mkdirSync(RESULTS_DIR, { recursive: true })

const SETTLE_QUIET_MS = 2500
const RECYCLE_EVERY = 8

const browser = await chromium.launch()
// One context for both variants. Cookies ignore port, so localhost:3100 and
// localhost:3101 share the session — which is what we want: identical auth
// state, and no second login to introduce a difference between the variants.
const context = await browser.newContext({
    storageState: AUTH_PATH,
    viewport: { width: 1440, height: 900 },
})
await context.addInitScript(PAGE_HELPERS)

const diagnostics = {
    consoleErrors: [], pageErrors: [], failedRequests: [], cancelledRequests: 0, windows: [],
}
let currentWindow = null
const isEnvironmentalNoise = (t) => /_vercel\/(insights|speed-insights)/.test(t)

function attachDiagnostics(page, variant) {
    page.on("console", (m) => {
        if (m.type() !== "error") return
        const text = m.text()
        const where = m.location()?.url ?? ""
        if (isEnvironmentalNoise(text) || isEnvironmentalNoise(where)) return
        diagnostics.consoleErrors.push(`[${variant}] ${text.slice(0, 200)} @ ${where.slice(0, 120)}`)
        if (currentWindow) currentWindow.consoleErrors += 1
    })
    page.on("pageerror", (e) => {
        diagnostics.pageErrors.push(`[${variant}] ${String(e).slice(0, 300)}`)
        if (currentWindow) currentWindow.pageErrors += 1
    })
    page.on("request", () => { if (currentWindow) currentWindow.requests += 1 })
    page.on("requestfailed", (r) => {
        const err = r.failure()?.errorText ?? ""
        if (err.includes("ERR_ABORTED")) { diagnostics.cancelledRequests += 1; return }
        if (isEnvironmentalNoise(r.url())) return
        diagnostics.failedRequests.push(`[${variant}] ${err} ${r.url().slice(0, 160)}`)
        if (currentWindow) currentWindow.failedRequests += 1
    })
    page.on("response", (r) => {
        if (!currentWindow) return
        const len = Number(r.headers()["content-length"] ?? 0)
        if (Number.isFinite(len)) currentWindow.bytes += len
        if (r.status() >= 400 && !isEnvironmentalNoise(r.url())) {
            diagnostics.failedRequests.push(`[${variant}] HTTP ${r.status()} ${r.url().slice(0, 160)}`)
            if (currentWindow) currentWindow.failedRequests += 1
        }
    })
}

const variants = [
    { name: NAME_A, base: BASE_A, page: null },
    { name: NAME_B, base: BASE_B, page: null },
]

async function makePage(v) {
    const page = await context.newPage()
    attachDiagnostics(page, v.name)
    await page.goto(v.base + "/home", { waitUntil: "domcontentloaded" })
    return page
}
for (const v of variants) v.page = await makePage(v)

const settleDurations = []

async function settleOn(v, originKey) {
    const started = Date.now()
    const target = v.base + ORIGIN_PATH[originKey]
    if (v.page.url() !== target) {
        await v.page.goto(target, { waitUntil: "domcontentloaded" })
    }
    await v.page.waitForFunction((s) => window.__bench.isReady(s), ORIGIN_READY[originKey], { timeout: 30000 })
    await v.page.waitForLoadState("networkidle", { timeout: SETTLE_QUIET_MS }).catch(() => {})
    settleDurations.push(Date.now() - started)
}

async function measure(v, route, rep) {
    await settleOn(v, route.from)
    await v.page.evaluate((spec) => window.__bench.arm(spec), route.ready)
    currentWindow = { variant: v.name, route: route.id, rep, requests: 0, bytes: 0, failedRequests: 0, consoleErrors: 0, pageErrors: 0 }
    await v.page.locator(route.click).first().click()
    await v.page.waitForFunction(() => window.__bench.result() !== null, undefined, { timeout: 15000 })
    const res = await v.page.evaluate(() => window.__bench.result())
    const win = currentWindow
    currentWindow = null
    diagnostics.windows.push({ ...win, ms: res.ms, phases: res.phases })
    return res.ms
}

// samples[variant][route] = array indexed by measured rep, null where a
// measurement failed. Index alignment is what makes the pairing possible.
const samples = Object.fromEntries(variants.map((v) => [v.name, Object.fromEntries(ROUTES.map((r) => [r.id, []]))]))
const failures = []

const started = Date.now()
console.log(`Connexus paired A/B navigation benchmark — "${LABEL}"`)
console.log(`  ${NAME_A}: ${BASE_A}`)
console.log(`  ${NAME_B}: ${BASE_B}`)
console.log(`  reps ${REPS} (+${WARMUP} warmup)   paths ${ROUTES.length}   paired, order alternating\n`)

for (let rep = 0; rep < WARMUP + REPS; rep += 1) {
    const isWarmup = rep < WARMUP
    if (rep > 0 && rep % RECYCLE_EVERY === 0) {
        for (const v of variants) {
            try {
                const fresh = await makePage(v)
                const old = v.page
                v.page = fresh
                await old.close().catch(() => {})
            } catch (err) {
                failures.push({ rep, route: `(recycle ${v.name})`, error: String(err).slice(0, 200) })
            }
        }
    }
    for (const route of ROUTES) {
        // Alternate which variant is measured first. Whichever goes first pays
        // any residual warming for that route in that repetition, so fixing the
        // order would hand one variant a systematic advantage.
        const order = rep % 2 === 0 ? variants : [...variants].reverse()
        const got = {}
        for (const v of order) {
            try {
                got[v.name] = await measure(v, route, rep)
            } catch (err) {
                got[v.name] = null
                failures.push({ rep, variant: v.name, route: route.id, error: String(err).slice(0, 200) })
                currentWindow = null
                await v.page.goto(v.base + "/home", { waitUntil: "domcontentloaded" }).catch(() => {})
            }
        }
        if (!isWarmup) {
            // Keep a pair only if BOTH variants produced a sample, so every
            // paired difference is a genuine like-for-like comparison.
            const bothOk = variants.every((v) => got[v.name] != null)
            for (const v of variants) {
                samples[v.name][route.id].push(bothOk ? +got[v.name].toFixed(1) : null)
            }
        }
    }
    process.stdout.write(`\r  ${isWarmup ? "warmup" : "measure"} rep ${rep + 1}/${WARMUP + REPS}   `)
}
console.log("\n")

// --- statistics ------------------------------------------------------------

const pooled = (name) => Object.values(samples[name]).flat().filter((x) => x != null)

/**
 * Paired bootstrap over repetition indices, for the difference in p95.
 *
 * Resampling whole repetitions (rather than individual samples independently)
 * keeps each repetition's A and B measurements together, so shared episode
 * noise is resampled as a unit.
 *
 * This is reported because p95 is the stated objective, but it is NOT the
 * decision statistic: p95 is an extreme statistic driven by the same rare
 * environmental episodes that made unpaired comparison useless. An A/A run of
 * identical code produced a CI of [-98.6, +400.9] on this quantity — still far
 * too wide to judge a ~45 ms effect. See pairedDeltaStats() for what is
 * actually used to decide.
 */
function pairedP95BootstrapCI(iters = 4000) {
    const repCount = samples[NAME_A][ROUTES[0].id].length
    const deltas = []
    for (let i = 0; i < iters; i += 1) {
        const a = [], b = []
        for (let k = 0; k < repCount; k += 1) {
            const rep = (Math.random() * repCount) | 0
            for (const r of ROUTES) {
                const va = samples[NAME_A][r.id][rep]
                const vb = samples[NAME_B][r.id][rep]
                if (va != null && vb != null) { a.push(va); b.push(vb) }
            }
        }
        a.sort((x, y) => x - y); b.sort((x, y) => x - y)
        deltas.push(percentile(b, 95) - percentile(a, 95))
    }
    deltas.sort((x, y) => x - y)
    return { lo: +percentile(deltas, 2.5).toFixed(1), hi: +percentile(deltas, 97.5).toFixed(1) }
}

/**
 * THE DECISION STATISTIC: the per-navigation paired difference.
 *
 * Each pair is the same navigation, on the same route, in the same repetition,
 * seconds apart on the same machine — so everything except the application code
 * is held constant and subtracts out. On an A/A run of identical code this
 * estimator returned a median of +3.1 ms with a 95% CI of [-2.3, +6.2], i.e.
 * roughly +/-4 ms resolution, against expected effects of ~45 ms per removed
 * Supabase round trip.
 *
 * The trimmed mean is reported alongside the median because a change that
 * removes fixed work should shift the whole distribution: if the median moves
 * but the tail does not, that is a signal the mechanism is not what was assumed.
 */
function pairedDeltaStats(iters = 4000) {
    const deltas = []
    for (const r of ROUTES) {
        for (let i = 0; i < samples[NAME_A][r.id].length; i += 1) {
            const va = samples[NAME_A][r.id][i], vb = samples[NAME_B][r.id][i]
            if (va != null && vb != null) deltas.push(vb - va)
        }
    }
    const sorted = [...deltas].sort((x, y) => x - y)
    const trimmedMean = (s) => {
        const t = s.slice(Math.floor(s.length * 0.05), Math.ceil(s.length * 0.95))
        return t.reduce((a, b) => a + b, 0) / (t.length || 1)
    }
    const boot = (stat) => {
        const out = []
        for (let i = 0; i < iters; i += 1) {
            const s = []
            for (let k = 0; k < deltas.length; k += 1) s.push(deltas[(Math.random() * deltas.length) | 0])
            s.sort((x, y) => x - y)
            out.push(stat(s))
        }
        out.sort((x, y) => x - y)
        return { lo: +percentile(out, 2.5).toFixed(1), hi: +percentile(out, 97.5).toFixed(1) }
    }
    return {
        n: deltas.length,
        median: +percentile(sorted, 50).toFixed(1),
        medianCI: boot((s) => percentile(s, 50)),
        trimmedMean: +trimmedMean(sorted).toFixed(1),
        trimmedMeanCI: boot(trimmedMean),
        q10: +percentile(sorted, 10).toFixed(1),
        q90: +percentile(sorted, 90).toFixed(1),
    }
}

const pa = pooled(NAME_A), pb = pooled(NAME_B)
const sa = summarise(pa), sb = summarise(pb)
const pointDelta = +(sb.p95 - sa.p95).toFixed(1)
const ci = pairedP95BootstrapCI()
const paired = pairedDeltaStats()

// The verdict comes from the paired per-navigation delta, whose resolution is
// ~+/-4ms, not from the p95-of-pooled-samples difference, whose resolution is
// ~+/-250ms even on identical code. Both are reported.
const verdict =
    paired.medianCI.lo < 0 && paired.medianCI.hi > 0 ? "INCONCLUSIVE"
    : paired.medianCI.hi < 0 ? "IMPROVEMENT"
    : "REGRESSION"

// Per-navigation paired differences, which are far less noisy than either
// variant's absolute numbers.
const perRoute = {}
for (const r of ROUTES) {
    const d = []
    for (let i = 0; i < samples[NAME_A][r.id].length; i += 1) {
        const va = samples[NAME_A][r.id][i], vb = samples[NAME_B][r.id][i]
        if (va != null && vb != null) d.push(vb - va)
    }
    const sorted = [...d].sort((x, y) => x - y)
    perRoute[r.id] = {
        a: summarise(samples[NAME_A][r.id].filter((x) => x != null)),
        b: summarise(samples[NAME_B][r.id].filter((x) => x != null)),
        pairedMedianDelta: sorted.length ? +percentile(sorted, 50).toFixed(1) : null,
        n: sorted.length,
    }
}

/**
 * Server think-time percentiles, and the paired difference in them.
 *
 * End-to-end p95/p99 turned out not to be decidable on this machine: of the
 * samples over 1000 ms in the E3 run, only 25% hit both variants in the same
 * repetition (one rep read 1667 ms control vs 9584 ms treatment on the same
 * route seconds apart), so the extreme tail is partly idiosyncratic per sample
 * and pairing cannot cancel it.
 *
 * Server think-time is measured from the RSC response itself and so excludes
 * browser-side stalls, which is where those episodes live. It is therefore a
 * far cleaner view of the tail for a change whose whole mechanism is
 * server-side round trips.
 */
const serverSamples = (name, routeId) =>
    diagnostics.windows
        .filter((w) => w.variant === name && w.route === routeId && w.phases)
        .map((w) => w.phases.serverTotal)

const serverStats = (name, routeId) => {
    const v = serverSamples(name, routeId).sort((x, y) => x - y)
    if (!v.length) return null
    return {
        n: v.length,
        median: +percentile(v, 50).toFixed(1),
        p90: +percentile(v, 90).toFixed(1),
        p95: +percentile(v, 95).toFixed(1),
        p99: +percentile(v, 99).toFixed(1),
        max: +v[v.length - 1].toFixed(1),
    }
}

const serverPooled = (name) => {
    const v = ROUTES.flatMap((r) => serverSamples(name, r.id)).sort((x, y) => x - y)
    if (!v.length) return null
    return {
        n: v.length,
        median: +percentile(v, 50).toFixed(1),
        p90: +percentile(v, 90).toFixed(1),
        p95: +percentile(v, 95).toFixed(1),
        p99: +percentile(v, 99).toFixed(1),
        max: +v[v.length - 1].toFixed(1),
    }
}

const serverMedian = (name, routeId) => {
    const v = diagnostics.windows.filter((w) => w.variant === name && w.route === routeId && w.phases).map((w) => w.phases.serverTotal).sort((x, y) => x - y)
    return v.length ? +percentile(v, 50).toFixed(1) : null
}

const result = {
    label: LABEL,
    startedAt: new Date(started).toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    design: "paired A/B, two servers, alternating order within each repetition",
    config: { baseA: BASE_A, baseB: BASE_B, nameA: NAME_A, nameB: NAME_B, reps: REPS, warmup: WARMUP, viewport: "1440x900", browser: "chromium" },
    overall: { [NAME_A]: sa, [NAME_B]: sb },
    p95Delta: pointDelta,
    p95DeltaCI: ci,
    pairedDelta: paired,
    verdict,
    verdictBasis: "median paired per-navigation delta and its bootstrap CI; p95-of-pooled is reported but is too noisy to decide (A/A CI was [-98.6, +400.9])",
    perRoute,
    serverTotalMedian: Object.fromEntries(ROUTES.map((r) => [r.id, { [NAME_A]: serverMedian(NAME_A, r.id), [NAME_B]: serverMedian(NAME_B, r.id) }])),
    // Server think-time distribution — the cleaner view of the tail, since it
    // excludes the browser-side stalls that make end-to-end p95/p99 undecidable
    // on this machine.
    serverTotalStats: {
        pooled: { [NAME_A]: serverPooled(NAME_A), [NAME_B]: serverPooled(NAME_B) },
        perRoute: Object.fromEntries(ROUTES.map((r) => [r.id, { [NAME_A]: serverStats(NAME_A, r.id), [NAME_B]: serverStats(NAME_B, r.id) }])),
    },
    secondary: {
        requestsPerNavigation: Object.fromEntries(variants.map((v) => {
            const ws = diagnostics.windows.filter((w) => w.variant === v.name)
            return [v.name, +(ws.reduce((a, w) => a + w.requests, 0) / (ws.length || 1)).toFixed(2)]
        })),
        appConsoleErrors: diagnostics.consoleErrors.length,
        pageErrors: diagnostics.pageErrors.length,
        failedRequests: diagnostics.failedRequests.length,
        settleMsMedian: settleDurations.length ? +percentile([...settleDurations].sort((a, b) => a - b), 50).toFixed(0) : null,
    },
    failures,
    raw: samples,
    diagnosticsSample: {
        consoleErrors: diagnostics.consoleErrors.slice(0, 10),
        pageErrors: diagnostics.pageErrors.slice(0, 10),
        failedRequests: [...new Set(diagnostics.failedRequests)].slice(0, 10),
    },
}

const stamp = new Date(started).toISOString().replace(/[:.]/g, "-")
const outPath = join(RESULTS_DIR, `${stamp}__AB__${LABEL.replace(/[^a-z0-9]+/gi, "-")}.json`)
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n")

// --- report ----------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n)
const num = (v, n = 10) => String(v ?? "-").padStart(n)
const signed = (v, n = 10) => String(v == null ? "-" : (v > 0 ? "+" : "") + Number(v).toFixed(1)).padStart(n)

console.log(`${LABEL}   (${result.durationSec}s, ${pa.length} paired navigations)\n`)
console.log(pad("metric", 12) + num(NAME_A) + num(NAME_B) + signed(null))
console.log("-".repeat(42))
for (const k of ["median", "p90", "p95", "p99"]) {
    console.log(pad(k, 12) + num(sa[k]) + num(sb[k]) + signed(sb[k] - sa[k]))
}

console.log("\nper navigation")
console.log(pad("navigation", 26) + num("A p95") + num("B p95") + num("pairedMed") + num("A srv") + num("B srv"))
console.log("-".repeat(26 + 10 * 5))
for (const r of ROUTES) {
    const p = perRoute[r.id]
    console.log(pad(r.id, 26) + num(p.a.p95) + num(p.b.p95) + signed(p.pairedMedianDelta) +
        num(result.serverTotalMedian[r.id][NAME_A]) + num(result.serverTotalMedian[r.id][NAME_B]))
}

console.log(`\n  OBJECTIVE   p95 ${NAME_A} = ${sa.p95} ms   p95 ${NAME_B} = ${sb.p95} ms`)
console.log(`              delta ${pointDelta > 0 ? "+" : ""}${pointDelta} ms  CI [${ci.lo}, ${ci.hi}]  — reported, but too noisy to decide on`)
console.log(`  DECISION    paired per-navigation delta, n=${paired.n}`)
console.log(`                median       ${paired.median > 0 ? "+" : ""}${paired.median} ms   CI [${paired.medianCI.lo}, ${paired.medianCI.hi}]`)
console.log(`                trimmed mean ${paired.trimmedMean > 0 ? "+" : ""}${paired.trimmedMean} ms   CI [${paired.trimmedMeanCI.lo}, ${paired.trimmedMeanCI.hi}]`)
console.log(`                q10 ${paired.q10}  q90 ${paired.q90}   (the tail should move with the median if the mechanism is real)`)
const spa = result.serverTotalStats.pooled[NAME_A], spb = result.serverTotalStats.pooled[NAME_B]
if (spa && spb) {
    console.log(`
  SERVER THINK-TIME (excludes browser-side stalls, so the tail is readable)`)
    console.log(`                ${pad("", 8)}${num("median")}${num("p90")}${num("p95")}${num("p99")}${num("max")}`)
    console.log(`                ${pad(NAME_A.slice(0, 8), 8)}${num(spa.median)}${num(spa.p90)}${num(spa.p95)}${num(spa.p99)}${num(spa.max)}`)
    console.log(`                ${pad(NAME_B.slice(0, 8), 8)}${num(spb.median)}${num(spb.p90)}${num(spb.p95)}${num(spb.p99)}${num(spb.max)}`)
    console.log(`                ${pad("delta", 8)}${signed(spb.median - spa.median)}${signed(spb.p90 - spa.p90)}${signed(spb.p95 - spa.p95)}${signed(spb.p99 - spa.p99)}${signed(spb.max - spa.max)}`)
}
console.log(`  VERDICT: ${result.verdict}`)
console.log(`  console errors ${result.secondary.appConsoleErrors} | page errors ${result.secondary.pageErrors} | failed requests ${result.secondary.failedRequests} | measurement failures ${failures.length}`)
console.log(`  requests/nav ${JSON.stringify(result.secondary.requestsPerNavigation)}`)
if (failures.length) console.log("  FAILURES:", JSON.stringify(failures.slice(0, 4), null, 1))
console.log(`\n  saved ${outPath.replace(ROOT, "").replace(/^[\\/]/, "")}`)

await browser.close()
