/**
 * Pixel-level visual regression gate for the performance experiments.
 *
 * The brief's hard constraint is that no optimisation may cause an intentional
 * user-visible change. This captures full-page screenshots of every benchmarked
 * route at both viewports and compares two captures pixel by pixel.
 *
 *   node perf/visual-check.mjs --capture before
 *   ...apply an experiment, rebuild, restart the server...
 *   node perf/visual-check.mjs --capture after
 *   node perf/visual-check.mjs --compare before after
 *
 * Comparison is done without an image library: PNGs of identical dimensions
 * rendered from identical DOM are byte-identical, so a byte diff is the
 * strictest possible check. When bytes differ, the run reports it and the two
 * PNGs are kept side by side for a human to look at — some diffs are legitimate
 * (a timestamp, an avatar that loaded in one run and not the other) and this
 * script deliberately does not decide that on its own.
 */
import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SHOT_DIR = join(ROOT, "perf", "screenshots")
const AUTH_PATH = join(ROOT, "perf", ".auth", "bench.json")
const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100"

const argv = process.argv.slice(2)
const argValue = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }

const fixture = JSON.parse(readFileSync(join(ROOT, "perf", "bench-fixture.json"), "utf8"))
const VIEWER_ID = fixture.users.find((u) => u.role === "viewer").id
const CONV_ID = fixture.conversations[0].id

const ROUTES = [
    ["home", "/home"],
    ["people", "/people"],
    ["opportunities", "/opportunities"],
    ["community", "/community"],
    ["chapters", "/chapters"],
    ["chapter-detail", "/chapters/stuy"],
    ["messages", "/messages"],
    ["conversation", `/messages/${CONV_ID}`],
    ["profile", `/profile/${VIEWER_ID}`],
]

const VIEWPORTS = [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
]

async function capture(label) {
    const dir = join(SHOT_DIR, label)
    mkdirSync(dir, { recursive: true })
    const browser = await chromium.launch()

    for (const [vpName, viewport] of VIEWPORTS) {
        const ctx = await browser.newContext({ storageState: AUTH_PATH, viewport })
        const page = await ctx.newPage()
        for (const [name, path] of ROUTES) {
            await page.goto(BASE + path, { waitUntil: "networkidle" })
            // Freeze anything that legitimately varies between captures but is
            // not a design change: CSS animation/transition state, and caret
            // blink. Nothing here alters layout, colour, or content.
            await page.addStyleTag({
                content: `*, *::before, *::after {
                    animation-duration: 0s !important;
                    animation-delay: 0s !important;
                    transition-duration: 0s !important;
                    transition-delay: 0s !important;
                    caret-color: transparent !important;
                }`,
            })
            await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
            await page.screenshot({ path: join(dir, `${name}__${vpName}.png`), fullPage: true })
            process.stdout.write(`  captured ${name} @ ${vpName}\n`)
        }
        await ctx.close()
    }
    await browser.close()
    console.log(`\nSaved to perf/screenshots/${label}/`)
}

function compare(a, b) {
    const da = join(SHOT_DIR, a), db = join(SHOT_DIR, b)
    for (const d of [da, db]) {
        if (!existsSync(d)) { console.error(`missing capture: ${d}`); process.exit(1) }
    }
    const files = readdirSync(da).filter((f) => f.endsWith(".png")).sort()
    let identical = 0
    const differing = []
    for (const f of files) {
        const pa = join(da, f), pb = join(db, f)
        if (!existsSync(pb)) { differing.push({ f, why: "missing in B" }); continue }
        const ba = readFileSync(pa), bb = readFileSync(pb)
        if (ba.equals(bb)) { identical += 1; continue }
        differing.push({
            f,
            why: `bytes differ (${ba.length} vs ${bb.length})`,
            hashA: createHash("sha256").update(ba).digest("hex").slice(0, 12),
            hashB: createHash("sha256").update(bb).digest("hex").slice(0, 12),
        })
    }
    console.log(`\nvisual comparison  ${a} -> ${b}`)
    console.log(`  identical: ${identical}/${files.length}`)
    if (!differing.length) {
        console.log("  PASS — every route is pixel-identical at both viewports.")
        return
    }
    console.log(`  ${differing.length} differ — inspect before accepting:`)
    for (const d of differing) console.log(`    ${d.f.padEnd(34)} ${d.why}`)
    console.log(`\n  Compare: perf/screenshots/${a}/<file>  vs  perf/screenshots/${b}/<file>`)
    process.exitCode = 1
}

const captureLabel = argValue("--capture", null)
if (captureLabel) {
    await capture(captureLabel)
} else if (argv.includes("--compare")) {
    const i = argv.indexOf("--compare")
    compare(argv[i + 1], argv[i + 2])
} else {
    console.error("usage: --capture <label> | --compare <labelA> <labelB>")
    process.exit(1)
}
