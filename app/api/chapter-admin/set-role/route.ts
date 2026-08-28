import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

// Promotes a chapter member to chapter_admin, or demotes one back to member.
// Two callers, two different reaches:
//
//   * a platform admin, from the admin dashboard's Chapters tab -- may act on
//     any chapter, and may promote a user who has no chapter yet (that also
//     joins them to the chapter; a brand-new chapter has no members to promote,
//     see approve-chapter/route.ts).
//   * a chapter admin, from /chapter-admin's Members tab -- may act only on
//     their OWN chapter, only on users who are already members of it, and never
//     on a platform admin.
//
// The service-role client is required either way: 002_security_hardening.sql
// revokes UPDATE on profiles.chapter_role from anon/authenticated, so no
// browser write can set it. Same shape as chapter-admin/logo/route.ts.
//
// Identity is the only boundary here, so this keeps the networked getUser()
// rather than getServerUser() -- see the note in lib/supabase/user.ts.
const bodySchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["member", "chapter_admin"]),
    // Platform admins only -- a chapter admin is always pinned to their own
    // chapter and any chapterId they send is ignored.
    chapterId: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: caller } = await supabase
        .from("profiles")
        .select("is_admin, chapter_role, chapter_id")
        .eq("id", user.id)
        .single()

    const isPlatformAdmin = caller?.is_admin === true
    const isChapterAdmin = caller?.chapter_role === "chapter_admin"
    if (!isPlatformAdmin && !isChapterAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

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
    const { userId, role } = parsed.data

    // Mirrors set-admin/route.ts: refusing self-changes rules out a chapter
    // admin demoting themselves into a chapter with no admin left.
    if (userId === user.id) {
        return NextResponse.json({ error: "You cannot change your own chapter role." }, { status: 400 })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("chapter_id, chapter_role, is_admin")
        .eq("id", userId)
        .single()

    if (!target) {
        return NextResponse.json({ error: "That user no longer exists." }, { status: 404 })
    }

    // Resolve the chapter this change applies to, and whether the target may
    // be pulled into it.
    let chapterId: string
    if (isPlatformAdmin) {
        const requested = parsed.data.chapterId ?? target.chapter_id
        if (!requested) {
            return NextResponse.json({ error: "That user does not belong to a chapter." }, { status: 400 })
        }
        chapterId = requested
        // Joining a chapterless user is part of a promotion only; this route
        // never moves someone between chapters.
        const joinable = target.chapter_id === null && role === "chapter_admin"
        if (target.chapter_id !== chapterId && !joinable) {
            return NextResponse.json({ error: "That user belongs to a different chapter." }, { status: 400 })
        }
    } else {
        if (!caller?.chapter_id) {
            return NextResponse.json({ error: "You are not a member of a chapter." }, { status: 400 })
        }
        chapterId = caller.chapter_id
        // A chapter admin's reach stops at their own existing members --
        // they cannot recruit a chapterless user by promoting them.
        if (target.chapter_id !== chapterId) {
            return NextResponse.json({ error: "That user is not a member of your chapter." }, { status: 403 })
        }
        // Nor can they strip a platform admin who happens to sit in their chapter.
        if (target.is_admin) {
            return NextResponse.json({ error: "You cannot change a platform admin's chapter role." }, { status: 403 })
        }
    }

    const { error } = await supabaseAdmin
        .from("profiles")
        .update({ chapter_role: role, chapter_id: chapterId })
        .eq("id", userId)

    if (error) {
        console.error("set-role: failed to update chapter_role", error)
        return NextResponse.json({ error: "Failed to update chapter role." }, { status: 500 })
    }

    return NextResponse.json({ success: true, chapterId })
}
