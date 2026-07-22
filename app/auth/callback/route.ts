import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getChapterSlug } from "@/lib/chapter"
import { getChapterHomeUrl } from "@/lib/chapter-shared"
import { NextRequest, NextResponse } from "next/server"

// Only allow same-origin, absolute-path redirects (e.g. "/reset-password").
// Rejects anything that isn't a single leading slash: protocol-relative
// ("//evil.com"), backslash-based ("/\evil.com", which some browsers treat
// the same as "//"), or any absolute URL -- all of which would otherwise
// send the OAuth/password-reset landing flow off-site.
function sanitizeNextPath(next: string | null): string | null {
    if (!next) return null
    if (!next.startsWith("/")) return null
    if (next.startsWith("//") || next.startsWith("/\\")) return null
    return next
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const next = sanitizeNextPath(searchParams.get("next"))

    if (code) {
        const supabase = await createSupabaseServerClient()
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
            return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
        }

        // if there's a next param (e.g. password reset) redirect there
        if (next) {
            return NextResponse.redirect(`${origin}${next}`)
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("grad_year, interests, chapter_id, chapters(slug)")
                .eq("id", user.id)
                .single()

            let chapterSlug = profile?.chapters?.slug ?? null

            // OAuth signups (e.g. Google) don't carry our custom chapter metadata,
            // so backfill from the subdomain here if the profile has no chapter yet.
            if (!profile?.chapter_id) {
                const currentSlug = await getChapterSlug()
                if (currentSlug) {
                    const { data: chapter } = await supabase
                        .from("chapters")
                        .select("id, slug")
                        .eq("slug", currentSlug)
                        .eq("status", "Active")
                        .maybeSingle()
                    if (chapter) {
                        await supabase.from("profiles").update({ chapter_id: chapter.id }).eq("id", user.id)
                        chapterSlug = chapter.slug
                    }
                }
            }

            const destinationPath = (!profile?.grad_year || !profile?.interests?.length)
                ? `/profile/${user.id}`
                : "/home"

            // Always land the user on their own chapter's subdomain, not whichever
            // one they happened to authenticate from.
            if (chapterSlug && chapterSlug !== (await getChapterSlug())) {
                return NextResponse.redirect(getChapterHomeUrl(chapterSlug, destinationPath, origin))
            }

            return NextResponse.redirect(`${origin}${destinationPath}`)
        }
    }

    return NextResponse.redirect(`${origin}/login`)
}