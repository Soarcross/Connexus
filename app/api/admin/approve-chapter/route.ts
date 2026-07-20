import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/

export async function POST(req: NextRequest) {
    // verify the caller is a platform admin
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { applicationId, slug } = await req.json()
    if (!applicationId || !slug) {
        return NextResponse.json({ error: "applicationId and slug are required" }, { status: 400 })
    }
    if (!SLUG_PATTERN.test(slug)) {
        return NextResponse.json({ error: "Slug must be lowercase letters, numbers and hyphens, 2-31 characters." }, { status: 400 })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    // Atomically claim the application so two concurrent approvals can't both
    // proceed (the WHERE status='Pending' makes this a compare-and-swap).
    const { data: application, error: claimError } = await supabaseAdmin
        .from("chapter_applications")
        .update({ status: "Approved" })
        .eq("id", applicationId)
        .eq("status", "Pending")
        .select("*")
        .maybeSingle()

    if (claimError) {
        return NextResponse.json({ error: claimError.message }, { status: 500 })
    }
    if (!application) {
        return NextResponse.json({ error: "Application not found or already reviewed." }, { status: 409 })
    }

    const { data: chapter, error: chapterError } = await supabaseAdmin
        .from("chapters")
        .insert({
            slug,
            name: application.school_name,
            school_name: application.school_name,
            city: application.city,
            state: application.state,
        })
        .select("*")
        .single()

    if (chapterError) {
        // release the claim so the application isn't stuck in limbo
        await supabaseAdmin.from("chapter_applications").update({ status: "Pending" }).eq("id", applicationId)

        if (chapterError.code === "23505") {
            return NextResponse.json({ error: `A chapter with slug "${slug}" already exists.` }, { status: 409 })
        }
        return NextResponse.json({ error: chapterError.message }, { status: 500 })
    }

    const { error: linkError } = await supabaseAdmin
        .from("chapter_applications")
        .update({ chapter_id: chapter.id })
        .eq("id", applicationId)

    if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    const { origin } = new URL(req.url)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        application.applicant_email,
        {
            redirectTo: `${origin}/auth/callback`,
            data: {
                full_name: application.applicant_name,
                chapter_id: chapter.id,
            },
        }
    )

    if (inviteError) {
        // the chapter was still created successfully — surface the invite failure separately
        // so the admin can invite the leader manually (e.g. the email already has an account).
        return NextResponse.json({
            chapter,
            error: `Chapter created, but the invite email failed: ${inviteError.message}. If ${application.applicant_email} already has an account, ask them to log in and set their chapter manually.`,
        }, { status: 207 })
    }

    // Elevate the invited user to chapter_admin directly, via this already
    // admin-gated, service-role code path -- never via raw_user_meta_data on
    // the invite/signup itself, which a self-signup could forge to claim
    // chapter_admin on any chapter. This also means the leader is chapter-
    // scoped correctly even if the profiles-insert trigger only copies
    // chapter_id (see supabase/sql/001_chapters.sql section 4).
    const invitedUserId = inviteData.user?.id
    if (invitedUserId) {
        const { error: roleError } = await supabaseAdmin
            .from("profiles")
            .update({ chapter_id: chapter.id, chapter_role: "chapter_admin" })
            .eq("id", invitedUserId)

        if (roleError) {
            return NextResponse.json({
                chapter,
                error: `Chapter created and invite sent, but setting up ${application.applicant_email} as chapter admin failed: ${roleError.message}. You may need to set this manually once they accept the invite.`,
            }, { status: 207 })
        }
    }

    return NextResponse.json({ success: true, chapter })
}
