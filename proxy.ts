import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { resolveCookieDomain } from "@/lib/supabase/cookie-domain"
import { AUTH_COOKIE_PREFIX, clearAuthCookies, isUnrecoverableAuthError } from "@/lib/supabase/clear-auth-cookies"

// Chapter subdomain resolution used to live here (x-chapter-slug); chapters
// all share one site now and chapter identity comes from profiles.chapter_id.
// What remains is the session refresh, and it is load-bearing — see below.

export async function proxy(request: NextRequest) {
    let response = NextResponse.next()

    // Refreshing the session is the only place in the app that can actually
    // persist a rotated token: server components cannot write cookies (their
    // setAll() throws and is swallowed in lib/supabase/server.ts), so without
    // this the access token expires, every refresh replays the same spent
    // refresh token, and Supabase answers refresh_token_already_used forever.
    // A session issued before the apex-domain move is also still host-only,
    // which no later write can overwrite -- this is what re-issues it at the
    // correct scope.
    const authCookies = request.cookies
        .getAll()
        .filter((cookie) => cookie.name.startsWith(AUTH_COOKIE_PREFIX))

    // Anonymous requests (the marketing page, /login, /apply) carry no session
    // to refresh; skip the round trip rather than paying it on every visit.
    if (authCookies.length === 0) return response

    // /auth/callback is mid-PKCE-exchange and owns the cookie jar for the
    // length of that request. Refreshing underneath it would rotate the very
    // token the route is about to write.
    if (request.nextUrl.pathname.startsWith("/auth/callback")) return response

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) return response

    const cookieDomain = resolveCookieDomain(request.headers.get("host"))

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
        cookies: {
            getAll() {
                return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
                // Write into the forwarded request too, so a server component
                // rendering later in this same pass reads the refreshed token
                // rather than the expired one.
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                response = NextResponse.next()
                cookiesToSet.forEach(({ name, value, options }) =>
                    response.cookies.set(name, value, options)
                )
            },
        },
    })

    const { error } = await supabase.auth.getUser()

    if (isUnrecoverableAuthError(error)) {
        // The stored session can never be revived. Leaving it in place is what
        // made this state permanent: the poisoned client never persisted the
        // PKCE code_verifier, so /auth/callback failed with
        // pkce_code_verifier_not_found and the user could not log back in
        // without clearing cookies by hand. Purge it and let them start over.
        clearAuthCookies(response, authCookies.map((cookie) => cookie.name), cookieDomain)
    }

    return response
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
