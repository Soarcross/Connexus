/**
 * Live progress for any running Connexus benchmark.
 *
 *   node perf/progress.mjs           # print once
 *   node perf/progress.mjs --watch   # refresh every 5s until everything finishes
 *
 * Auto-discovers benchmark logs: any recently-written *.log in the temp
 * directory whose contents identify it as a Connexus benchmark. Works for both
 * the single-variant benchmark (bench.mjs) and the paired A/B one
 * (bench-ab.mjs), so new experiments show up without touching this file.
 *
 * Rate and ETA are measured from this script's own observations across polls,
 * not from filesystem timestamps: NTFS file tunneling preserves a file's
 * original creation time when it is deleted and recreated under the same name,
 * which made an earlier birthtime-based ETA badly wrong after logs were cleared
 * for a re-run.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(HERE, ".progress-state.json")
// Git Bash's /tmp is the Windows user temp directory; Node on Windows would
// resolve a literal "/tmp/..." to C:\tmp instead.
const TMP = process.env.TEMP ?? process.env.TMP ?? "/tmp"
const WATCH = process.argv.includes("--watch")
const FRESH_MINUTES = 90

function discoverLogs() {
    let entries = []
    try { entries = readdirSync(TMP) } catch { return [] }
    const cutoff = Date.now() - FRESH_MINUTES * 60_000
    const found = []
    for (const name of entries) {
        if (!name.endsWith(".log")) continue
        const path = join(TMP, name)
        let st
        try { st = statSync(path) } catch { continue }
        if (!st.isFile() || st.mtimeMs < cutoff || st.size === 0) continue
        let head
        try { head = readFileSync(path, "utf8").slice(0, 400) } catch { continue }
        if (!/Connexus.*benchmark/i.test(head)) continue
        found.push({ path, name: basename(name, ".log"), mtimeMs: st.mtimeMs })
    }
    return found.sort((a, b) => a.mtimeMs - b.mtimeMs)
}

function loadState() {
    try { return JSON.parse(readFileSync(STATE_PATH, "utf8")) } catch { return {} }
}

function recordSample(key, rep) {
    const state = loadState()
    const prev = state[key]
    if (!prev || rep < prev.firstSeenRep) state[key] = { firstSeenMs: Date.now(), firstSeenRep: rep }
    try { writeFileSync(STATE_PATH, JSON.stringify(state, null, 1)) } catch { /* best effort */ }
    return state[key] ?? { firstSeenMs: Date.now(), firstSeenRep: rep }
}

function parse(log) {
    let text
    try { text = readFileSync(log.path, "utf8") } catch { return { ...log, state: "unreadable" } }

    // bench.mjs header:    ... benchmark — label "X"
    // bench-ab.mjs header: ... benchmark — "X"
    const label = (text.match(/label\s+"([^"]+)"/) ?? text.match(/benchmark\s*[—-]\s*"([^"]+)"/))?.[1]?.trim() ?? log.name
    const paired = /paired A\/B/i.test(text)

    if (/VERDICT:/.test(text)) {
        return {
            ...log, label, paired, state: "done",
            verdict: text.match(/VERDICT: (\w+)/)?.[1],
            detail: text.match(/median\s+([+-]?[\d.]+) ms\s+CI \[([^\]]+)\]/)?.slice(1).join(" ms  CI [") ?? "",
        }
    }
    if (/PRIMARY/.test(text)) {
        return {
            ...log, label, paired, state: "done",
            verdict: null,
            detail: `p95 = ${text.match(/p95_navigation_ms = ([\d.]+)/)?.[1]} ms`,
        }
    }

    const reps = [...text.matchAll(/(warmup|measure) rep (\d+)\/(\d+)/g)]
    if (!reps.length) return { ...log, label, paired, state: "starting" }
    const last = reps[reps.length - 1]
    const done = Number(last[2]), total = Number(last[3])
    const { firstSeenMs, firstSeenRep } = recordSample(log.path, done)
    const observedSec = (Date.now() - firstSeenMs) / 1000
    const observedReps = done - firstSeenRep
    const perRep = observedReps > 0 ? observedSec / observedReps : null
    return {
        ...log, label, paired, state: "running", phase: last[1], done, total,
        watchedSec: Math.round(observedSec),
        partial: firstSeenRep > 0,
        etaSec: perRep == null ? null : Math.round(perRep * (total - done)),
    }
}

const bar = (done, total, w = 30) => "[" + "#".repeat(Math.round((done / total) * w)) + "-".repeat(w - Math.round((done / total) * w)) + "]"
const fmt = (s) => s == null || !Number.isFinite(s) ? "?" : (s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`)

function render() {
    const logs = discoverLogs()
    const out = ["", "  Connexus performance benchmarks", "  " + "-".repeat(74)]
    if (!logs.length) {
        out.push("  no benchmark running (no recent benchmark log found)")
        out.push("")
        return { text: out.join("\n"), allDone: true, anyRunning: false }
    }
    let anyRunning = false
    for (const log of logs.map(parse)) {
        const tag = (log.paired ? "A/B " : "solo") + "  " + log.label.slice(0, 24).padEnd(24)
        if (log.state === "done") {
            out.push(`  ${tag} DONE   ${log.verdict ? log.verdict.padEnd(13) : ""}${log.detail}`)
        } else if (log.state === "running") {
            anyRunning = true
            out.push(`  ${tag} ${bar(log.done, log.total)} ${String(log.done).padStart(2)}/${log.total} ${log.phase.padEnd(7)} ${log.partial ? "watched" : "elapsed"} ${fmt(log.watchedSec)}  eta ${log.etaSec == null ? "measuring" : fmt(log.etaSec)}`)
        } else {
            // "starting" means the process is alive but has not written its
            // first rep line yet. Treating it as finished let an earlier
            // monitor declare "all complete" seconds after a run was launched.
            if (log.state === "starting") anyRunning = true
            out.push(`  ${tag} ${log.state}`)
        }
    }
    out.push("  " + "-".repeat(74))
    out.push(anyRunning ? "  running" : "  all complete")
    out.push("")
    return { text: out.join("\n"), allDone: !anyRunning, anyRunning }
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
