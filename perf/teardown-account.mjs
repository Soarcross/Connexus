/**
 * Deletes the temporary benchmark fixture created by perf/setup-account.mjs.
 *
 * SAFETY
 * ------
 * Only ever deletes objects listed in perf/bench-fixture.json, and only those
 * whose `createdByThisScript` flag is true. Anything the setup script *reused*
 * (i.e. already existed) is left alone.
 *
 * Every user id is re-verified against auth.users before deletion: the email
 * must still match the recorded benchmark address. A mismatch aborts the whole
 * run rather than guessing.
 *
 *   node perf/teardown-account.mjs          # dry run, prints the plan
 *   node perf/teardown-account.mjs --apply  # actually deletes
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync, unlinkSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const FIXTURE_PATH = join(ROOT, "perf", "bench-fixture.json")
const ENV_PATH = join(ROOT, ".env.benchmark.local")
const APPLY = process.argv.includes("--apply")

// Anything outside this domain is not ours. Belt and braces on top of the
// fixture file: even a corrupted fixture cannot make this delete a real user.
const EMAIL_DOMAIN = "connexus-perf.example.com"

if (!existsSync(FIXTURE_PATH)) {
    console.error("perf/bench-fixture.json not found — nothing recorded, so nothing to delete.")
    process.exit(1)
}
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"))

function loadEnvLocal() {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8")
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
    }
    return env
}
const env = loadEnvLocal()
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const usersToDelete = fixture.users.filter((u) => u.createdByThisScript)
const convsToDelete = fixture.conversations.filter((c) => c.createdByThisScript)

// --- verification pass, before anything is deleted -------------------------
for (const u of usersToDelete) {
    if (!u.email.endsWith(`@${EMAIL_DOMAIN}`)) {
        console.error(`ABORT: ${u.email} is not a benchmark address. Refusing to delete.`)
        process.exit(1)
    }
    const { data, error } = await admin.auth.admin.getUserById(u.id)
    if (error || !data?.user) {
        console.log(`  already gone: ${u.email}`)
        u.missing = true
        continue
    }
    if (data.user.email?.toLowerCase() !== u.email.toLowerCase()) {
        console.error(`ABORT: id ${u.id} is now ${data.user.email}, not ${u.email}. Refusing to delete.`)
        process.exit(1)
    }
}

const benchUserIds = new Set(fixture.users.map((u) => u.id))
for (const c of convsToDelete) {
    const { data, error } = await admin
        .from("conversations")
        .select("id, participant_1, participant_2")
        .eq("id", c.id)
        .maybeSingle()
    if (error) { console.error(error); process.exit(1) }
    if (!data) { console.log(`  already gone: conversation ${c.id}`); c.missing = true; continue }
    if (!benchUserIds.has(data.participant_1) || !benchUserIds.has(data.participant_2)) {
        console.error(`ABORT: conversation ${c.id} involves a non-benchmark participant. Refusing to delete.`)
        process.exit(1)
    }
}

console.log("\nPlan:")
for (const c of convsToDelete.filter((c) => !c.missing)) {
    console.log(`  delete messages of conversation ${c.id}, then the conversation`)
}
for (const u of usersToDelete.filter((u) => !u.missing)) {
    console.log(`  delete auth user ${u.email} (${u.id})  [cascades to profiles]`)
}
console.log(`  delete .env.benchmark.local`)

if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to execute.")
    process.exit(0)
}

// --- execute ---------------------------------------------------------------
for (const c of convsToDelete.filter((c) => !c.missing)) {
    const { error: mErr } = await admin.from("messages").delete().eq("conversation_id", c.id)
    if (mErr) { console.error(mErr); process.exit(1) }
    const { error: cErr } = await admin.from("conversations").delete().eq("id", c.id)
    if (cErr) { console.error(cErr); process.exit(1) }
    console.log(`  deleted conversation ${c.id}`)
}
for (const u of usersToDelete.filter((u) => !u.missing)) {
    const { error } = await admin.auth.admin.deleteUser(u.id)
    if (error) { console.error(error); process.exit(1) }
    console.log(`  deleted ${u.email}`)
}
if (existsSync(ENV_PATH)) {
    unlinkSync(ENV_PATH)
    console.log("  deleted .env.benchmark.local")
}
console.log("\nTeardown complete. perf/bench-fixture.json kept as the audit record.")
