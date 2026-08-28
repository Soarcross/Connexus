// Verifies E6's deferred read-receipt write actually executes. after() runs
// post-response, so a silent failure would leave messages unread forever - a
// functional regression the latency benchmark cannot see.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const env = Object.fromEntries(readFileSync(".env.local","utf8").split(/\r?\n/)
    .map(l=>l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].trim()]))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} })

const fixture = JSON.parse(readFileSync("perf/bench-fixture.json","utf8"))
const convId = fixture.conversations[0].id
const viewer = fixture.users.find(u=>u.role==="viewer").id
const partner = fixture.users.find(u=>u.email===fixture.conversations[0].with).id

const state = JSON.parse(readFileSync("perf/.auth/bench.json","utf8"))
const c = state.cookies.find(x=>x.name.includes("auth-token"))

async function unreadCount() {
    const { count } = await admin.from("messages").select("id",{count:"exact",head:true})
        .eq("conversation_id", convId).eq("read", false).neq("sender_id", viewer)
    return count ?? 0
}

// Mark the partner's messages unread (fixture rows created by this benchmark).
await admin.from("messages").update({ read:false }).eq("conversation_id", convId).eq("sender_id", partner)
console.log("  seeded unread:", await unreadCount())

for (const [label, base] of [["control :3101 (awaited write)", "http://localhost:3101"], ["E6 :3100 (after() write)", "http://localhost:3100"]]) {
    await admin.from("messages").update({ read:false }).eq("conversation_id", convId).eq("sender_id", partner)
    const before = await unreadCount()
    const res = await fetch(`${base}/messages/${convId}`, { headers:{ cookie:`${c.name}=${c.value}` } })
    await res.text()
    // after() runs post-response; poll briefly rather than assuming instant.
    let after = before, waited = 0
    while (after > 0 && waited < 5000) { await new Promise(r=>setTimeout(r,250)); waited += 250; after = await unreadCount() }
    console.log(`  ${label.padEnd(32)} HTTP ${res.status}  unread ${before} -> ${after}  ${after===0?`PASS (${waited}ms)`:"FAIL - write never landed"}`)
}

// Restore the fixture to its normal all-read state.
await admin.from("messages").update({ read:true }).eq("conversation_id", convId)
console.log("  fixture restored, unread:", await unreadCount())
