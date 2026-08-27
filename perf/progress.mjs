/**
 * Live progress for a running benchmark.
 *
 *   node perf/progress.mjs           # print once
 *   node perf/progress.mjs --watch   # refresh until everything finishes
 *
 * Reads the benchmark's stdout logs. Node block-buffers those writes, so the
 * displayed rep can lag the real one by a few seconds; the ETA accounts for
 * elapsed wall-clock rather than the log timestamp.
 */
import { readFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

// The benchmark is launched from Git Bash, whose /tmp is the Windows user temp
// directory. Node on Windows would resolve a literal "/tmp/..." to C:\tmp, so
// the path has to be rebuilt from the environment.
const TMP = process.env.TEMP ?? process.env.TMP ?? "/tmp"
const RUNS = [
    { label: "baseline-A", log: join(TMP, "bA.log") },
    { label: "baseline-B", log: join(TMP, "bB.log") },
]

const WATCH = process.argv.includes("--watch")

function parse(run) {
    if (!existsSync(run.log)) return { ...run, state: "queued" }
    const text = readFileSync(run.log, "utf8")

    if (text.includes("PRIMARY")) {
        const p95 = text.match(/p95_navigation_ms = ([\d.]+)/)?.[1]
        const secs = text.match(/\((\d+)s, (\d+) measured/)
        return { ...run, state: "done", p95, durationSec: secs?.[1], samples: secs?.[2] }
    }

    const reps = [...text.matchAll(/(warmup|measure) rep (\d+)\/(\d+)/g)]
    if (!reps.length) return { ...run, state: "starting" }
    const last = reps[reps.length - 1]
    const done = Number(last[2])
    const total = Number(last[3])
    const startedMs = statSync(run.log).birthtimeMs || statSync(run.log).ctimeMs
    const elapsedSec = (Date.now() - startedMs) / 1000
    const perRep = done > 0 ? elapsedSec / done : 0
    return {
        ...run,
        state: "running",
        phase: last[1],
        done,
        total,
        elapsedSec: Math.round(elapsedSec),
        etaSec: Math.round(perRep * (total - done)),
    }
}

function bar(done, total, width = 32) {
    const filled = Math.round((done / total) * width)
    return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]"
}

function fmt(sec) {
    if (sec == null || !Number.isFinite(sec)) return "?"
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`
}

function render() {
    const runs = RUNS.map(parse)
    const lines = ["", "Connexus navigation benchmark — baseline runs", ""]
    for (const r of runs) {
        if (r.state === "done") {
            lines.push(`  ${r.label.padEnd(12)} DONE     p95 = ${r.p95} ms   (${r.samples} samples, ${fmt(Number(r.durationSec))})`)
        } else if (r.state === "running") {
            lines.push(`  ${r.label.padEnd(12)} ${bar(r.done, r.total)} ${String(r.done).padStart(2)}/${r.total} ${r.phase.padEnd(7)} elapsed ${fmt(r.elapsedSec)}  eta ${fmt(r.etaSec)}`)
        } else {
            lines.push(`  ${r.label.padEnd(12)} ${r.state}`)
        }
    }
    const allDone = runs.every((r) => r.state === "done")
    const totalEta = runs.reduce((a, r) => a + (r.state === "running" ? r.etaSec : r.state === "queued" ? (runs[0].etaSec ? runs[0].elapsedSec + runs[0].etaSec : 0) : 0), 0)
    lines.push("")
    lines.push(allDone ? "  all runs complete" : `  overall eta ~${fmt(totalEta)}`)
    lines.push("")
    return { text: lines.join("\n"), allDone }
}

if (!WATCH) {
    console.log(render().text)
} else {
    for (;;) {
        const { text, allDone } = render()
        process.stdout.write("\x1b[2J\x1b[H" + text)
        if (allDone) break
        await new Promise((r) => setTimeout(r, 5000))
    }
}
