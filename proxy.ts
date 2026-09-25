import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { resolveCookieDomain } from "@/lib/supabase/cookie-domain"
import { AUTH_COOKIE_PREFIX, clearAuthCookies, isUnrecoverableAuthError } from "@/lib/supabase/clear-auth-cookies"

// Chapter subdomain resolution used to live here (x-chapter-slug); chapters
// all share one site now and chapter identity comes from profiles.chapter_id.
// What remains is the session refresh, and it is load-bearing — see below.

/**
 * Remaining access-token lifetime, in seconds, below which this request must
 * actually refresh rather than skip.
 *
 * Comfortably larger than the few seconds a request takes, so a token that
 * passes this check cannot expire midway through the render it is about to
 * serve, and large enough that the refresh still happens well before the token
 * lapses even for a user who navigates only occasionally.
 */
const REFRESH_MARGIN_SECONDS = 5 * 60

/** base64 or base64url -> UTF-8. `atob` alone mangles multi-byte characters. */
function decodeBase64(input: string): string {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const binary = atob(padded)
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/**
 * `exp` of the access token in the request's auth cookie, or null when it
 * cannot be read for any reason.
 *
 * Returning null is the safe answer: the caller then takes the full refresh
 * path, which is exactly what should happen for a cookie this cannot parse.
 */
function readAccessTokenExp(cookies: { name: string; value: string }[]): number | null {
    try {
        // Supabase chunks a large session across `...auth-token.0`, `.1`, ...
        // Order matters, and a single unchunked cookie has no numeric suffix.
        const chunks = cookies
            .filter((c) => /auth-token(\.\d+)?$/.test(c.name))
            .sort((a, b) => {
                const index = (name: string) => {
                    const tail = name.split(".").pop()
                    const n = Number(tail)
                    return Number.isFinite(n) ? n : -1
                }
                return index(a.name) - index(b.name)
            })
        if (chunks.length === 0) return null

        let raw = chunks.map((c) => c.value).join("")
        if (raw.startsWith("base64-")) raw = decodeBase64(raw.slice("base64-".length))

        const accessToken = JSON.parse(raw)?.access_token
        if (typeof accessToken !== "string") return null

        const payload = JSON.parse(decodeBase64(accessToken.split(".")[1] ?? ""))
        return typeof payload?.exp === "number" ? payload.exp : null
    } catch {
        return null
    }
}

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

    // A token with plenty of life left has nothing to rotate, so the round trip
    // to the Auth server buys nothing on this request. getUser() is a network
    // call and this runs before rendering starts, so it sat on the critical path
    // of every navigation — measured as a near-constant 40-50ms of time-to-first
    // -byte on every route regardless of what the page fetched.
    //
    // The refresh itself stays load-bearing and is NOT removed: once the token
    // is within REFRESH_MARGIN_SECONDS of expiry (or the cookie cannot be
    // parsed), the full path below runs, rotates the token, and persists it —
    // which is still the only place in the app that can, since server components
    // cannot write cookies.
    //
    // The cost of skipping is that a session revoked elsewhere is not noticed on
    // this request; it is noticed at the next refresh, bounded by the token
    // lifetime. Authorization is unaffected either way: RLS is the boundary, and
    // every read still carries the JWT to PostgREST, which validates it.
    const expiresAt = readAccessTokenExp(authCookies)
    if (expiresAt !== null && expiresAt - Math.floor(Date.now() / 1000) > REFRESH_MARGIN_SECONDS) {
        return response
    }

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
                // Mutating request.cookies alone is not enough: Next forwards the
                // modified request headers only when the request is passed back
                // through NextResponse.next({ request }).
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                response = NextResponse.next({ request })
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
