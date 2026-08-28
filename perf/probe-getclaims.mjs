/**
 * De-risks the getClaims() experiment before any application code is touched.
 *
 * Verifies, against the real project, that:
 *   1. getClaims() returns the same identity as getUser()
 *   2. it verifies the signature locally (no network round trip) rather than
 *      silently falling back to getUser()
 *   3. it rejects a tampered token
 *   4. it rejects an expired token
 *
 * Read-only: signs in as the benchmark account and reads. Writes nothing.
 *
 *   node perf/probe-getclaims.mjs
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const readEnv = (file) => Object.fromEntries(
    readFileSync(join(ROOT, file), "utf8").split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean)
        .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")])
)
const env = readEnv(".env.local")
const bench = readEnv(".env.benchmark.local")

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
    email: bench.BENCH_EMAIL,
    password: bench.BENCH_PASSWORD,
})
if (signInErr) { console.error("sign-in failed:", signInErr.message); process.exit(1) }
const token = signIn.session.access_token

// Count outbound HTTP calls so a hidden getUser() fallback cannot go unnoticed.
let httpCalls = []
const origFetch = globalThis.fetch
globalThis.fetch = (...args) => {
    httpCalls.push(String(args[0]).replace(env.NEXT_PUBLIC_SUPABASE_URL, ""))
    return origFetch(...args)
}
const countingClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

function time(fn) {
    const t = process.hrtime.bigint()
    return fn().then((r) => ({ r, ms: Number(process.hrtime.bigint() - t) / 1e6 }))
}

console.log("\n1. identity agreement + cost\n")

httpCalls = []
const gu = await time(() => countingClient.auth.getUser(token))
console.log(`   getUser()    ${gu.ms.toFixed(1).padStart(7)} ms   ${httpCalls.length} http call(s)  ${httpCalls.join(", ")}`)
const userId = gu.r.data.user?.id

// First getClaims pays the one-off JWKS fetch.
httpCalls = []
const gc1 = await time(() => countingClient.auth.getClaims(token))
console.log(`   getClaims() cold ${gc1.ms.toFixed(1).padStart(4)} ms   ${httpCalls.length} http call(s)  ${httpCalls.join(", ")}`)

// Subsequent calls should hit the module-global JWKS cache (10 min TTL).
const warm = []
for (let i = 0; i < 5; i += 1) {
    httpCalls = []
    const g = await time(() => countingClient.auth.getClaims(token))
    warm.push({ ms: g.ms, calls: httpCalls.length })
}
console.log(`   getClaims() warm ${warm.map((w) => w.ms.toFixed(2)).join(", ")} ms   http calls: ${warm.map((w) => w.calls).join(",")}`)

const claimsId = gc1.r.data?.claims?.sub
console.log(`\n   getUser().id   === getClaims().sub : ${userId === claimsId ? "YES" : "NO  <-- BLOCKER"}`)
console.log(`   getClaims().email matches         : ${gc1.r.data?.claims?.email === gu.r.data.user?.email ? "YES" : "NO  <-- BLOCKER"}`)
console.log(`   alg=${gc1.r.data?.header?.alg}  (must be ES256 for local verification)`)
console.log(`   warm calls made zero network requests: ${warm.every((w) => w.calls === 0) ? "YES" : "NO  <-- would not save anything"}`)

console.log("\n2. rejects a tampered token\n")

// Flip one character of the payload, keeping the structure valid.
const [h, p, s] = token.split(".")
const payload = JSON.parse(Buffer.from(p, "base64url").toString())
payload.sub = "00000000-0000-0000-0000-000000000000"
const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url").replace(/=+$/, "")
const forged = `${h}.${forgedPayload}.${s}`

const forgedResult = await countingClient.auth.getClaims(forged)
const forgedRejected = !!forgedResult.error || !forgedResult.data
console.log(`   forged sub rejected: ${forgedRejected ? "YES" : "NO  <-- BLOCKER"}   ${forgedResult.error?.message ?? ""}`)

console.log("\n3. rejects an expired token\n")

const expiredPayload = { ...JSON.parse(Buffer.from(p, "base64url").toString()), exp: Math.floor(Date.now() / 1000) - 60 }
const expired = `${h}.${Buffer.from(JSON.stringify(expiredPayload)).toString("base64url").replace(/=+$/, "")}.${s}`
// NOTE: getClaims() does NOT return { error } for an expired token the way
// getUser() does -- validateExp throws a plain Error, and getClaims only
// converts AuthErrors into a result object, so this THROWS. Any helper built on
// getClaims must catch, or an expired token turns the guest/redirect path into
// an unhandled exception and a 500.
let expiredRejected = false, expiredHow = ""
try {
    const expiredResult = await countingClient.auth.getClaims(expired)
    expiredRejected = !!expiredResult.error || !expiredResult.data
    expiredHow = `returned error: ${expiredResult.error?.message ?? "(none)"}`
} catch (e) {
    expiredRejected = true
    expiredHow = `THREW ${e.constructor.name}: ${e.message}  <-- helper must catch`
}
console.log(`   expired rejected: ${expiredRejected ? "YES" : "NO  <-- BLOCKER"}   ${expiredHow}`)

globalThis.fetch = origFetch
await supabase.auth.signOut()
console.log()
