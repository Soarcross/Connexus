/**
 * Compares two benchmark result files and reports whether the difference is
 * larger than the benchmark's own noise.
 *
 *   node perf/compare.mjs baseline-A baseline-B          # measure noise
 *   node perf/compare.mjs baseline-B E2-getClaims        # judge an experiment
 *
 * Arguments are matched against result filenames as substrings; the newest
 * match wins, so labels are enough.
 *
 * A p95 delta is only called a real improvement when it clears the noise band
 * established by comparing two baselines. Bootstrap resampling gives a
 * confidence interval on the p95 difference so a single lucky run cannot be
 * mistaken for a win.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const RESULTS = join(ROOT, "perf", "results")

const [aArg, bArg] = process.argv.slice(2)
if (!aArg || !bArg) {
    console.error("usage: node perf/compare.mjs <labelA> <labelB>")
    process.exit(1)
}

function load(arg) {
    const files = readdirSync(RESULTS).filter((f) => f.endsWith(".json") && f.includes(arg)).sort()
    if (!files.length) {
        console.error(`no result file matching "${arg}" in perf/results`)
        process.exit(1)
    }
    const file = files[files.length - 1]
    return { file, data: JSON.parse(readFileSync(join(RESULTS, file), "utf8")) }
}

const A = load(aArg)
const B = load(bArg)

function percentile(sorted, p) {
    if (!sorted.length) return null
    const rank = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(rank), hi = Math.ceil(rank)
    return lo === hi ? sorted[lo] : sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo])
}

const pooled = (r) => Object.values(r.raw).flat()

/**
 * Bootstrap CI for the difference in p95 between two independent samples.
 * Percentiles have no closed-form standard error, and this distribution is
 * heavily right-skewed, so resampling is the honest way to put an interval on
 * the delta.
 */
function bootstrapDeltaCI(a, b, iters = 4000) {
    const pick = (arr) => arr[(Math.random() * arr.length) | 0]
    const deltas = []
    for (let i = 0; i < iters; i += 1) {
        const ra = Array.from({ length: a.length }, () => pick(a)).sort((x, y) => x - y)
        const rb = Array.from({ length: b.length }, () => pick(b)).sort((x, y) => x - y)
        deltas.push(percentile(rb, 95) - percentile(ra, 95))
    }
    deltas.sort((x, y) => x - y)
    return {
        lo: +percentile(deltas, 2.5).toFixed(1),
        hi: +percentile(deltas, 97.5).toFixed(1),
        point: +(percentile([...b].sort((x, y) => x - y), 95) - percentile([...a].sort((x, y) => x - y), 95)).toFixed(1),
    }
}

const pa = pooled(A.data)
const pb = pooled(B.data)

const pad = (s, n) => String(s).padEnd(n)
const num = (v, n = 10) => String(v ?? "-").padStart(n)
const signed = (v, n = 10) => String(v == null ? "-" : (v > 0 ? "+" : "") + v.toFixed(1)).padStart(n)
const pct = (from, to) => (from == null || to == null || from === 0 ? "-" : `${(((to - from) / from) * 100).toFixed(1)}%`)

console.log(`\nA: ${A.data.label}   (${A.file})`)
console.log(`B: ${B.data.label}   (${B.file})\n`)

console.log(pad("metric", 12) + num("A") + num("B") + signed(null) + num("change"))
console.log("-".repeat(52))
for (const k of ["median", "p90", "p95", "p99"]) {
    const a = A.data.overall[k], b = B.data.overall[k]
    console.log(pad(k, 12) + num(a) + num(b) + signed(b - a) + num(pct(a, b)))
}

const ci = bootstrapDeltaCI(pa, pb)
console.log(`\noverall p95 delta: ${ci.point > 0 ? "+" : ""}${ci.point} ms   95% CI [${ci.lo}, ${ci.hi}]  (bootstrap, n=${pa.length}/${pb.length})`)
if (ci.lo < 0 && ci.hi > 0) {
    console.log("  -> CI spans zero: NOT a demonstrated change.")
} else if (ci.hi < 0) {
    console.log("  -> improvement is statistically distinguishable from noise.")
} else {
    console.log("  -> REGRESSION is statistically distinguishable from noise.")
}

console.log("\nper route (p95 nav / p95 server think-time)")
console.log(pad("navigation", 26) + num("A p95") + num("B p95") + signed(null) + num("A srv") + num("B srv") + signed(null))
console.log("-".repeat(26 + 10 * 6))
for (const id of Object.keys(A.data.perRoute)) {
    const a = A.data.perRoute[id]?.p95, b = B.data.perRoute[id]?.p95
    const sa = A.data.secondary.serverTotalP95PerRoute?.[id], sb = B.data.secondary.serverTotalP95PerRoute?.[id]
    console.log(pad(id, 26) + num(a) + num(b) + signed(b - a) + num(sa) + num(sb) + signed(sb == null || sa == null ? null : sb - sa))
}

console.log("\nconstraint checks")
const chk = (label, a, b, lowerIsBetter = true) => {
    const worse = lowerIsBetter ? b > a : b < a
    console.log(`  ${pad(label, 34)} A=${String(a).padStart(8)}  B=${String(b).padStart(8)}  ${worse ? "WORSE" : "ok"}`)
}
chk("app console errors", A.data.secondary.appConsoleErrors, B.data.secondary.appConsoleErrors)
chk("page errors", A.data.secondary.pageErrors, B.data.secondary.pageErrors)
chk("failed requests", A.data.secondary.failedRequests, B.data.secondary.failedRequests)
chk("measurement failures", A.data.failures.length, B.data.failures.length)
chk("avg requests / navigation", A.data.secondary.avgRequestsPerNavigation, B.data.secondary.avgRequestsPerNavigation)
chk("avg bytes / navigation", A.data.secondary.avgContentLengthBytesPerNavigation, B.data.secondary.avgContentLengthBytesPerNavigation)
console.log()
