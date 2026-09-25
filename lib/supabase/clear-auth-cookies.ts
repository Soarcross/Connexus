import type { NextResponse } from "next/server"

/** Every Supabase auth cookie is `sb-<project-ref>-...`. */
export const AUTH_COOKIE_PREFIX = "sb-"

/**
 * Expire every `sb-*` cookie in `cookieNames`, at **both** the host-only and
 * the `domain`-scoped variant.
 *
 * A cookie's identity is the triple `(name, domain, path)`, so expiring
 * `sb-x-auth-token` with `Domain=hsconnexus.com` does **not** remove a
 * host-only cookie of the same name — the browser keeps sending the leftover
 * one, and the app reads a session that can never be refreshed. Sessions issued
 * before the apex-domain move are host-only; everything written since is
 * domain-scoped, so a purge has to cover both or it silently half-works.
 *
 * Written straight onto the `set-cookie` header rather than through
 * `response.cookies.set()`, because `ResponseCookies` is keyed by name alone:
 * setting the same name twice overwrites the first entry, emitting one header
 * instead of the two required.
 */
export function clearAuthCookies(
    response: NextResponse,
    cookieNames: string[],
    cookieDomain: string | undefined
): void {
    const expired = "Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/"

    for (const name of new Set(cookieNames)) {
        if (!name.startsWith(AUTH_COOKIE_PREFIX)) continue

        response.headers.append("set-cookie", `${name}=; ${expired}`)
        if (cookieDomain) {
            response.headers.append(
                "set-cookie",
                `${name}=; ${expired}; Domain=${cookieDomain}`
            )
        }
    }
}

/**
 * True when `getUser()`/`getSession()` failed because the stored session is
 * unusable (refresh token revoked, already rotated, or malformed) rather than
 * because Supabase was unreachable. Only the former justifies deleting the
 * user's cookies — clearing them on a transient 5xx or a network blip would log
 * out a perfectly valid session.
 */
export function isUnrecoverableAuthError(
    error: { status?: number; code?: string } | null
): boolean {
    if (!error) return false
    if (typeof error.status === "number") {
        // 408 (timeout) and 429 (rate limited) are 4xx but say nothing about the
        // session -- clearing on them logged valid users out whenever the Auth
        // server throttled the refresh, which production has seen.
        if (error.status === 408 || error.status === 429) return false
        return error.status >= 400 && error.status < 500
    }
    // No status at all means the failure never reached the auth server.
    return false
}
