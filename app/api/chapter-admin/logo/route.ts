import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"

// The chapters table is platform-admin-only at the RLS level
// (supabase/sql/001_chapters.sql's chapters_write_platform_admin), so a chapter
// admin cannot set their own chapter's logo from the browser client. This route
// is the escape hatch: it re-checks chapter_role server-side and then writes
// with the service-role client, the same shape as
// app/api/chapter-admin/set-role/route.ts.
//
// Identity is the only boundary here, so this keeps the networked getUser()
// rather than getServerUser() -- see the note in lib/supabase/user.ts.

const BUCKET = "chapter-logos"
const MAX_BYTES = 2 * 1024 * 1024

// Extensions are derived from the MIME type, never from file.name: the name is
// caller-controlled and this path is built server-side.
const MIME_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}

type Authorized = { chapterId: string }

async function authorize(): Promise<Authorized | NextResponse> {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, chapter_role, chapter_id")
        .eq("id", user.id)
        .single()

    const allowed = profile?.chapter_role === "chapter_admin" || profile?.is_admin === true
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // The chapter is always the caller's OWN chapter, never one named in the
    // request -- there is deliberately no chapterId parameter to forge.
    if (!profile?.chapter_id) {
        return NextResponse.json({ error: "You are not a member of a chapter." }, { status: 400 })
    }

    return { chapterId: profile.chapter_id }
}

/** Clear the chapter's folder. Returns an error string, or null on success. */
async function removeExisting(
    supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
    chapterId: string
): Promise<string | null> {
    const { data: existing, error: listError } = await supabaseAdmin.storage.from(BUCKET).list(chapterId)
    if (listError) return listError.message
    if (!existing || existing.length === 0) return null

    const { error: removeError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(existing.map(f => `${chapterId}/${f.name}`))
    return removeError ? removeError.message : null
}

export async function POST(req: NextRequest) {
    const auth = await authorize()
    if (auth instanceof NextResponse) return auth
    const { chapterId } = auth

    let form: FormData
    try {
        form = await req.formData()
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "No image was uploaded." }, { status: 400 })
    }
    const ext = MIME_EXT[file.type]
    if (!ext) {
        return NextResponse.json({ error: "Logo must be a PNG, JPG, WebP or GIF." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Logo must be under 2MB." }, { status: 400 })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    // Delete-then-upload rather than upsert, so the filename can carry a
    // timestamp and bust the CDN cache on the public URL. Same strategy as the
    // avatar uploader in app/components/profile/profile-view.tsx.
    const removeError = await removeExisting(supabaseAdmin, chapterId)
    if (removeError) {
        console.error("chapter-admin/logo: failed to clear existing logo", removeError)
        return NextResponse.json({ error: "Failed to replace the existing logo." }, { status: 500 })
    }

    const path = `${chapterId}/logo-${Date.now()}.${ext}`
    const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type })

    if (uploadError) {
        console.error("chapter-admin/logo: upload failed", uploadError)
        return NextResponse.json({ error: "Failed to upload the logo." }, { status: 500 })
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

    const { error: updateError } = await supabaseAdmin
        .from("chapters")
        .update({ logo_url: publicUrl })
        .eq("id", chapterId)

    if (updateError) {
        console.error("chapter-admin/logo: failed to save logo_url", updateError)
        return NextResponse.json({ error: "Logo uploaded, but saving it to the chapter failed." }, { status: 500 })
    }

    return NextResponse.json({ success: true, logoUrl: publicUrl })
}

export async function DELETE() {
    const auth = await authorize()
    if (auth instanceof NextResponse) return auth
    const { chapterId } = auth

    const supabaseAdmin = createSupabaseAdminClient()

    // A storage failure is logged but not fatal: the column still gets nulled,
    // so a missing or already-deleted object can't wedge the chapter with a
    // logo it can never clear. Same tolerance as the purge cron's image cleanup.
    const removeError = await removeExisting(supabaseAdmin, chapterId)
    if (removeError) {
        console.error("chapter-admin/logo: failed to delete logo object", removeError)
    }

    const { error: updateError } = await supabaseAdmin
        .from("chapters")
        .update({ logo_url: null })
        .eq("id", chapterId)

    if (updateError) {
        console.error("chapter-admin/logo: failed to clear logo_url", updateError)
        return NextResponse.json({ error: "Failed to remove the logo." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
