/**
 * Throwaway: logs the benchmark account in against the local production server
 * and dumps the DOM landmarks each route offers, so the benchmark's "usable"
 * conditions can be written against selectors that actually exist.
 *
 *   node perf/explore.mjs
 */
import { chromium } from "@playwright/test"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100"

const benchEnv = Object.fromEntries(
    readFileSync(join(ROOT, ".env.benchmark.local"), "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()])
)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

page.on("console", (m) => { if (m.type() === "error") console.log("  [console.error]", m.text().slice(0, 200)) })

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.getByLabel(/email/i).fill(benchEnv.BENCH_EMAIL)
await page.locator('input[type="password"]').first().fill(benchEnv.BENCH_PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(/\/(home|profile)/, { timeout: 30000 })
console.log("logged in, landed on", page.url())

await ctx.storageState({ path: join(ROOT, "perf", ".auth", "bench.json") })

const routes = ["/home", "/people", "/opportunities", "/community", "/chapters", "/messages"]

for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle" })
    const info = await page.evaluate(() => ({
        h1: [...document.querySelectorAll("h1")].map((e) => e.textContent.trim()),
        h2: [...document.querySelectorAll("h2")].map((e) => e.textContent.trim()).slice(0, 6),
        testCandidates: {
            links: [...document.querySelectorAll("main a[href]")].slice(0, 12).map((a) => a.getAttribute("href")),
            cardish: [...document.querySelectorAll('main [data-slot="card"]')].length,
            inputs: [...document.querySelectorAll("main input")].map((i) => i.placeholder).slice(0, 5),
            buttons: [...document.querySelectorAll("main button")].map((b) => b.textContent.trim()).slice(0, 8),
        },
    }))
    console.log("\n===", route, "===")
    console.log(JSON.stringify(info, null, 1))
}

// Conversation detail
await page.goto(BASE + "/messages", { waitUntil: "networkidle" })
const convHref = await page.evaluate(() => {
    const el = [...document.querySelectorAll("main *")].find((e) => e.className && String(e.className).includes("cursor-pointer"))
    return el ? el.outerHTML.slice(0, 400) : null
})
console.log("\n=== /messages first clickable row ===\n", convHref)

const firstConv = JSON.parse(readFileSync(join(ROOT, "perf", "bench-fixture.json"), "utf8")).conversations[0].id
await page.goto(`${BASE}/messages/${firstConv}`, { waitUntil: "networkidle" })
console.log("\n=== /messages/[id] ===")
console.log(JSON.stringify(await page.evaluate(() => ({
    inputs: [...document.querySelectorAll("main input, main textarea")].map((i) => i.placeholder),
    buttons: [...document.querySelectorAll("main button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim()).slice(0, 8),
    msgCount: document.querySelectorAll("main p").length,
    sampleHtml: document.querySelector("main")?.innerHTML.slice(0, 500),
})), null, 1))

// people carousel card on /home
await page.goto(BASE + "/home", { waitUntil: "networkidle" })
console.log("\n=== /home carousel card ===")
console.log(await page.evaluate(() => {
    const el = [...document.querySelectorAll("main *")].find((e) => e.className && String(e.className).includes("cursor-pointer"))
    return el ? el.outerHTML.slice(0, 600) : "none"
}))

await browser.close()
