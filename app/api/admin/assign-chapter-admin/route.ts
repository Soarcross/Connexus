import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

// A newly-approved chapter starts with no chapter_admin (see approve-chapter/route.ts) --
// this is the only path that assigns one afterward. Uses the service-role client
// because chapter_role is revoked from anon/authenticated at the column level
// (supabase/sql/002_security_hardening.sql), same reasoning as set-admin/route.ts.
const bodySchema = z.object({
    chapterId: z.string().uuid(),
    userId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
    // verify the caller is a platform admin
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: callerProfile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
    if (!callerProfile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
    const { chapterId, userId } = parsed.data

    const supabaseAdmin = createSupabaseAdminClient()

    // The target must belong to this chapter, or to none yet -- a brand-new
    // chapter has zero members, so assigning a chapterless user also joins
    // them to the chapter. Members of OTHER chapters are still rejected:
    // this route never moves someone between chapters.
    const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("chapter_id")
        .eq("id", userId)
        .single()

    if (!targetProfile || (targetProfile.chapter_id !== null && targetProfile.chapter_id !== chapterId)) {
        return NextResponse.json({ error: "That user belongs to a different chapter." }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from("profiles")
        .update({ chapter_role: "chapter_admin", chapter_id: chapterId })
        .eq("id", userId)

    if (error) {
        console.error("assign-chapter-admin: failed to update chapter_role", error)
        return NextResponse.json({ error: "Failed to assign chapter admin." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
