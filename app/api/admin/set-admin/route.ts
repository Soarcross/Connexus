import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

// Replaces the browser's direct `.from("profiles").update({ is_admin })` write.
// A DB migration (supabase/sql/002_security_hardening.sql) revokes UPDATE on
// the is_admin/chapter_role columns from anon/authenticated, since the old RLS
// policy only checked `auth.uid() = id` with no column scoping -- letting any
// authenticated user self-promote. This route is the privileged replacement.
//
// Scope: is_admin only. No browser code writes chapter_role anywhere in this
// codebase (chapter-admin-dashboard.tsx only reads it for display, and
// signup-form.tsx deliberately never sends it -- see its comment), so there's
// nothing else this revoke breaks and nothing else this route needs to cover.
const bodySchema = z.object({
    userId: z.string().uuid(),
    isAdmin: z.boolean(),
})

export async function POST(req: NextRequest) {
    // verify the caller is an admin
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    let json: unknown
    try {
        json = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }
    const { userId, isAdmin } = parsed.data

    // Prevent self-lockout (and a murkier audit trail) by refusing to let an
    // admin change their own admin status through this route.
    if (userId === user.id) {
        return NextResponse.json({ error: "You cannot change your own admin status." }, { status: 400 })
    }

    // use service role since the is_admin column is no longer writable by
    // the authenticated role directly
    const supabaseAdmin = createSupabaseAdminClient()

    const { error } = await supabaseAdmin.from("profiles").update({ is_admin: isAdmin }).eq("id", userId)
    if (error) {
        console.error("set-admin: failed to update is_admin", error)
        return NextResponse.json({ error: "Failed to update admin status." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
