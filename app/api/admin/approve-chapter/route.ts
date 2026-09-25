import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { validateFullName } from "@/lib/name-validation"

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/

const bodySchema = z.object({
    applicationId: z.string().uuid(),
    slug: z.string().regex(SLUG_PATTERN, "Slug must be lowercase letters, numbers and hyphens, 2-31 characters."),
})

export async function POST(req: NextRequest) {
    // verify the caller is a platform admin
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
        const message = parsed.error.issues[0]?.message ?? "Invalid request."
        return NextResponse.json({ error: message }, { status: 400 })
    }
    const { applicationId, slug } = parsed.data

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
        console.error("approve-chapter: failed to claim application", claimError)
        return NextResponse.json({ error: "Failed to approve application." }, { status: 500 })
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
        console.error("approve-chapter: failed to create chapter", chapterError)
        return NextResponse.json({ error: "Failed to create chapter." }, { status: 500 })
    }

    const { error: linkError } = await supabaseAdmin
        .from("chapter_applications")
        .update({ chapter_id: chapter.id })
        .eq("id", applicationId)

    // Not fatal: the chapter exists and its id is known, so the invite can
    // still go out. Returning here used to strand the applicant -- the claim
    // was already taken, so a retry answered 409 and no invite was ever sent.
    if (linkError) {
        console.error("approve-chapter: failed to link application to chapter", linkError)
    }

    const { origin } = new URL(req.url)
    const inviteName = validateFullName(application.applicant_name ?? "")
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        application.applicant_email,
        {
            redirectTo: `${origin}/auth/callback`,
            // The application form only length-checks the name. One that fails
            // the profiles.full_name_sane rules is left out; the new-user
            // trigger then uses a placeholder the leader fixes on first login.
            data: {
                ...(inviteName.ok ? { full_name: inviteName.value } : {}),
                chapter_id: chapter.id,
            },
        }
    )

    if (inviteError) {
        // the chapter was still created successfully — surface the invite failure separately
        // so the admin can invite the leader manually (e.g. the email already has an account).
        console.error("approve-chapter: failed to send invite email", inviteError)
        return NextResponse.json({
            chapter,
            error: `Chapter created, but the invite email failed to send. If ${application.applicant_email} already has an account, a platform admin must move that account into the new chapter (members cannot change their own chapter once set).`,
        }, { status: 207 })
    }

    // The invited applicant joins as a regular member (chapter_role defaults
    // to 'member' via the new-user trigger, same as any other signup) — a
    // new chapter has no chapter_admin until a platform admin explicitly
    // assigns one via /api/chapter-admin/set-role. This is intentional:
    // don't assume the applicant is who should run moderation for the chapter.

    if (linkError) {
        return NextResponse.json({
            chapter,
            error: "Chapter created and invite sent, but the application could not be linked to the chapter.",
        }, { status: 207 })
    }

    return NextResponse.json({ success: true, chapter })
}
