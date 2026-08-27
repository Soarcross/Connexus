/**
 * Creates (idempotently) the temporary benchmark fixture used by perf/bench.spec.ts.
 *
 * SAFETY
 * ------
 * This writes to the production Supabase project, which is the only project that
 * exists (no branches, no staging). The developer approved this explicitly.
 *
 * Everything it creates is recorded in perf/bench-fixture.json so that
 * perf/teardown-account.mjs can delete exactly those objects and nothing else.
 * It never touches a row it did not create, never grants is_admin, and never
 * sets chapter_role above 'member'.
 *
 * The generated password is written only to .env.benchmark.local (gitignored via
 * `.env*`) and is never printed to stdout.
 *
 *   node perf/setup-account.mjs
 */
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "node:crypto"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const FIXTURE_PATH = join(ROOT, "perf", "bench-fixture.json")
const ENV_PATH = join(ROOT, ".env.benchmark.local")

// The chapter the benchmark viewer joins. `stuy` holds 52 of the 55 profiles,
// so this is what an ordinary member's People/Home pages actually look like.
// Benchmarking against an empty chapter would measure a page that no real user
// ever sees.
const CHAPTER_SLUG = "stuy"

// One viewer + three DM partners. Three conversations is what makes the
// /messages N+1 (2 + 3N requests) observable; a single conversation would hide
// the very bottleneck being measured. Partners are benchmark accounts rather
// than real users so that no real person's inbox is touched.
const PARTNER_COUNT = 3
const MESSAGES_PER_CONVERSATION = 8

const EMAIL_DOMAIN = "connexus-perf.example.com"
const VIEWER_EMAIL = `perf-bench-viewer@${EMAIL_DOMAIN}`
const partnerEmail = (n) => `perf-bench-partner-${n}@${EMAIL_DOMAIN}`
// profiles has CHECK full_name_sane: 3..60 chars and no digits. Spell the
// ordinal out rather than using "Partner 1", which the constraint rejects
// (and which surfaces only as "Database error creating new user").
const PARTNER_NAMES = ["Perf Bench Partner One", "Perf Bench Partner Two", "Perf Bench Partner Three"]

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
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local")
}

const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

function die(context, error) {
    if (error) {
        console.error(`FAILED: ${context}`)
        console.error(error)
        process.exit(1)
    }
}

/** Find an existing auth user by email without listing the whole table twice. */
async function findUserByEmail(email) {
    let page = 1
    for (;;) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
        die(`listUsers page ${page}`, error)
        const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
        if (hit) return hit
        if (data.users.length < 200) return null
        page += 1
    }
}

async function ensureUser(email, password, fullName) {
    const existing = await findUserByEmail(email)
    if (existing) {
        // Re-assert the password so a re-run still produces a usable login.
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
        })
        die(`updateUserById ${email}`, error)
        return { id: existing.id, created: false }
    }
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // The on_auth_user_created trigger inserts profiles.full_name straight
        // from raw_user_meta_data, and profiles.full_name is NOT NULL -- so
        // creating a user without this metadata fails the whole auth insert
        // with "Database error creating new user". The signup form supplies it
        // the same way (signup-form.tsx:83).
        user_metadata: { full_name: fullName },
    })
    die(`createUser ${email}`, error)
    return { id: data.user.id, created: true }
}

async function ensureProfile(id, fields) {
    const { error } = await admin.from("profiles").upsert({ id, ...fields }, { onConflict: "id" })
    die(`upsert profile ${id}`, error)
}

async function ensureConversation(a, b) {
    // The unique index is on the ordered pair (participant_1, participant_2),
    // so look for either orientation before inserting.
    const { data: found, error: findErr } = await admin
        .from("conversations")
        .select("id")
        .or(`and(participant_1.eq.${a},participant_2.eq.${b}),and(participant_1.eq.${b},participant_2.eq.${a})`)
        .maybeSingle()
    die("find conversation", findErr)
    if (found) return { id: found.id, created: false }

    const { data, error } = await admin
        .from("conversations")
        .insert({ participant_1: a, participant_2: b })
        .select("id")
        .single()
    die("insert conversation", error)
    return { id: data.id, created: true }
}

async function ensureMessages(conversationId, a, b) {
    const { count, error: countErr } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
    die("count messages", countErr)
    if ((count ?? 0) >= MESSAGES_PER_CONVERSATION) return { created: 0 }

    const base = Date.now() - MESSAGES_PER_CONVERSATION * 60_000
    const rows = Array.from({ length: MESSAGES_PER_CONVERSATION }, (_, i) => ({
        conversation_id: conversationId,
        sender_id: i % 2 === 0 ? a : b,
        content: `Benchmark fixture message ${i + 1}. This account exists only for performance measurement.`,
        created_at: new Date(base + i * 60_000).toISOString(),
        // Left read so the unread badge does not drift between benchmark runs.
        read: true,
    }))
    const { error } = await admin.from("messages").insert(rows)
    die("insert messages", error)

    const { error: bumpErr } = await admin
        .from("conversations")
        .update({ last_message_at: rows[rows.length - 1].created_at })
        .eq("id", conversationId)
    die("bump last_message_at", bumpErr)

    return { created: rows.length }
}

// --- run -------------------------------------------------------------------

const { data: chapter, error: chapterErr } = await admin
    .from("chapters")
    .select("id, name")
    .eq("slug", CHAPTER_SLUG)
    .single()
die(`lookup chapter ${CHAPTER_SLUG}`, chapterErr)

const password = existsSync(ENV_PATH)
    ? (readFileSync(ENV_PATH, "utf8").match(/^BENCH_PASSWORD=(.*)$/m)?.[1]?.trim() ??
       randomBytes(24).toString("base64url"))
    : randomBytes(24).toString("base64url")

const fixture = {
    note: "Temporary objects created by perf/setup-account.mjs for navigation benchmarking. Delete with perf/teardown-account.mjs.",
    createdAt: new Date().toISOString(),
    chapter: { slug: CHAPTER_SLUG, id: chapter.id },
    users: [],
    conversations: [],
}

const viewer = await ensureUser(VIEWER_EMAIL, password, "Perf Bench Viewer")
await ensureProfile(viewer.id, {
    full_name: "Perf Bench Viewer",
    grad_year: 2027,
    // Non-empty grad_year + interests is what keeps login landing on /home
    // rather than the onboarding redirect to /profile/[id].
    interests: ["Software Engineering", "Research", "Data Science"],
    looking_for: ["Internships", "Networking"],
    club_roles: ["Robotics Team", "Math Team"],
    bio: "Temporary account used for performance benchmarking. Not a real member.",
    chapter_id: chapter.id,
    chapter_role: "member",
    is_admin: false,
})
fixture.users.push({ role: "viewer", email: VIEWER_EMAIL, id: viewer.id, createdByThisScript: viewer.created })

for (let n = 1; n <= PARTNER_COUNT; n += 1) {
    const email = partnerEmail(n)
    const partner = await ensureUser(email, password, PARTNER_NAMES[n - 1])
    await ensureProfile(partner.id, {
        full_name: PARTNER_NAMES[n - 1],
        grad_year: 2026,
        interests: ["Research"],
        looking_for: ["Networking"],
        club_roles: [],
        bio: "Temporary account used for performance benchmarking. Not a real member.",
        chapter_id: chapter.id,
        chapter_role: "member",
        is_admin: false,
    })
    fixture.users.push({ role: `partner-${n}`, email, id: partner.id, createdByThisScript: partner.created })

    const conv = await ensureConversation(viewer.id, partner.id)
    const msgs = await ensureMessages(conv.id, viewer.id, partner.id)
    fixture.conversations.push({
        id: conv.id,
        with: email,
        createdByThisScript: conv.created,
        messagesInserted: msgs.created,
    })
}

writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + "\n")

const existingEnv = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : ""
if (!/^BENCH_PASSWORD=/m.test(existingEnv)) {
    writeFileSync(
        ENV_PATH,
        `# Generated by perf/setup-account.mjs. Gitignored via .env* — do not commit.\n` +
        `BENCH_EMAIL=${VIEWER_EMAIL}\n` +
        `BENCH_PASSWORD=${password}\n`
    )
}

console.log("Benchmark fixture ready.")
console.log(`  chapter:       ${chapter.name} (${CHAPTER_SLUG})`)
console.log(`  users:         ${fixture.users.length} (1 viewer + ${PARTNER_COUNT} DM partners)`)
console.log(`  conversations: ${fixture.conversations.length}`)
console.log(`  fixture map:   perf/bench-fixture.json`)
console.log(`  credentials:   .env.benchmark.local (gitignored, not printed)`)
for (const u of fixture.users) {
    console.log(`    ${u.createdByThisScript ? "created" : "reused "}  ${u.email}  ${u.id}`)
}
for (const c of fixture.conversations) {
    console.log(`    ${c.createdByThisScript ? "created" : "reused "}  conversation ${c.id} (+${c.messagesInserted} messages)`)
}
