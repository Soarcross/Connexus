// Verifies the loading.tsx states render during a real client-side navigation.
// Uses CDP network throttling rather than blocking _rsc= requests: blocking
// those also blocks the prefetch the router needs to obtain the loading
// boundary, which makes the fallback never appear.
import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "./shared.mjs"

const base = "http://localhost:3100"
const dir = join(ROOT, "perf", "screenshots", "loading-states")
mkdirSync(dir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ storageState: join(ROOT, "perf", ".auth", "bench.json"), viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)

await page.goto(base + "/home", { waitUntil: "networkidle" })

const targets = [
    ["people", 'header a[href="/people"]'],
    ["opportunities", 'header a[href="/opportunities"]'],
    ["community", 'header a[href="/community"]'],
    ["chapters", 'header a[href="/chapters"]'],
    ["messages", 'header a[href="/messages"]'],
]

let ok = 0
for (const [name, sel] of targets) {
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await page.goto(base + "/home", { waitUntil: "networkidle" })
    // Throttle only now, so the prefetch of the loading boundary has completed.
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 1200, downloadThroughput: 50_000, uploadThroughput: 50_000 })
    await page.locator(sel).first().click()
    await page.waitForTimeout(600)
    const n = await page.evaluate(() => document.querySelectorAll('[data-slot="skeleton"]').length)
    const path = await page.evaluate(() => location.pathname)
    const heading = await page.evaluate(() => document.querySelector("main h1")?.textContent?.trim() ?? "(none)")
    await page.screenshot({ path: join(dir, `${name}.png`) })
    console.log(`  ${name.padEnd(14)} at ${path.padEnd(16)} skeletons: ${String(n).padStart(3)}   heading: "${heading}"`)
    if (n > 0) ok += 1
}
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
console.log(`\n  ${ok}/${targets.length} routes showed their loading state during client-side navigation`)
await browser.close()
