/**
 * Logs the benchmark account in once through the real login form and saves the
 * resulting storage state to perf/.auth/bench.json.
 *
 * Authentication is deliberately not part of the navigation metric: the
 * benchmark reuses this state rather than logging in per measurement.
 *
 *   node perf/auth-setup.mjs
 */
import { chromium } from "@playwright/test"
import { readFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BASE = process.env.BENCH_BASE_URL ?? "http://localhost:3100"
const AUTH_DIR = join(ROOT, "perf", ".auth")

const bench = Object.fromEntries(
    readFileSync(join(ROOT, ".env.benchmark.local"), "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()])
)
if (!bench.BENCH_EMAIL || !bench.BENCH_PASSWORD) {
    throw new Error("BENCH_EMAIL / BENCH_PASSWORD missing from .env.benchmark.local — run perf/setup-account.mjs")
}

mkdirSync(AUTH_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
await page.getByLabel(/email/i).fill(bench.BENCH_EMAIL)
await page.locator('input[type="password"]').first().fill(bench.BENCH_PASSWORD)
await page.locator('button[type="submit"]').first().click()
await page.waitForURL(/\/home$/, { timeout: 30000 })

await page.context().storageState({ path: join(AUTH_DIR, "bench.json") })
console.log(`Auth state saved to perf/.auth/bench.json (landed on ${page.url()})`)

await browser.close()
