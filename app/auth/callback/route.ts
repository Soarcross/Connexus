import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getChapterSlug } from "@/lib/chapter"
import { getChapterHomeUrl } from "@/lib/chapter-shared"
import { resolveCookieDomain } from "@/lib/supabase/cookie-domain"
import { AUTH_COOKIE_PREFIX, clearAuthCookies } from "@/lib/supabase/clear-auth-cookies"
import { formatFullName } from "@/lib/name-validation"
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
            // The generic redirect hides why the exchange failed; log the real
            // reason server-side so it is diagnosable from the dev terminal and
            // the Vercel function logs.
            console.error("[auth/callback] exchangeCodeForSession failed:", {
                message: exchangeError.message,
                status: exchangeError.status,
                code: exchangeError.code,
                origin,
            })

            // A failed exchange used to dead-end here: the stale session that
            // caused it was still in the jar on the next attempt, so the retry
            // failed identically and the only escape was clearing cookies by
            // hand in devtools. Purge the auth cookies on the way out so the
            // next login starts from a clean jar. proxy.ts skips this route
            // precisely so this is the only writer during the exchange.
            const response = NextResponse.redirect(
                `${origin}/login?error=${exchangeError.code === "pkce_code_verifier_not_found"
                    ? "session_expired"
                    : "auth_callback_failed"}`
            )
            clearAuthCookies(
                response,
                request.cookies.getAll()
                    .filter((cookie) => cookie.name.startsWith(AUTH_COOKIE_PREFIX))
                    .map((cookie) => cookie.name),
                resolveCookieDomain(request.headers.get("host"))
            )
            return response
        }

        // if there's a next param (e.g. password reset) redirect there
        if (next) {
            return NextResponse.redirect(`${origin}${next}`)
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            let { data: profile } = await supabase
                .from("profiles")
                .select("grad_year, interests, chapter_id, chapters(slug)")
                .eq("id", user.id)
                .single()

            // The on-signup DB trigger should always create this row, but a
            // handful of accounts predate a since-fixed version of it, and any
            // future trigger hiccup would reproduce the same gap: an
            // authenticated user with no profiles row, which used to hard-404
            // them at /profile/[id] with no way back in. Self-heal here.
            if (!profile) {
                const rawName = user.user_metadata?.full_name ?? user.email ?? "New User"
                const { data: created } = await supabase
                    .from("profiles")
                    .insert({
                        id: user.id,
                        // OAuth-provided names bypass the signup form's
                        // validateFullName/formatFullName step entirely, so
                        // this is the only normalization they ever get.
                        full_name: formatFullName(rawName) || rawName,
                    })
                    .select("grad_year, interests, chapter_id, chapters(slug)")
                    .single()
                profile = created
            }

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