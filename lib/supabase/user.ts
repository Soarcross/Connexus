import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * The subset of the auth user that server components actually read.
 *
 * Deliberately narrow: every field here is present in the access token's
 * claims, so resolving it costs no network round trip.
 */
export type ServerUser = {
    id: string;
    email: string | null;
    /**
     * `user_metadata.full_name` from the token, narrowed to a string.
     *
     * The auth `User` type declares `user_metadata` as `Record<string, any>`,
     * so reading `.full_name` off it was implicitly `any`. Exposing the one
     * field the app actually reads keeps that access typed instead of
     * re-introducing an `any` at the call site.
     */
    fullName: string | null;
};

/**
 * The signed-in user for a server component, or `null` for a guest.
 *
 * This replaces `supabase.auth.getUser()` on read paths. `getUser()` issues a
 * `GET /auth/v1/user` to the Auth server on *every* call — measured at ~38 ms
 * from this machine — and the app called it once per page plus once in the
 * layout plus once in `proxy.ts`, three network round trips to establish one
 * identity. `getClaims()` instead verifies the access token's ES256 signature
 * locally against the project's published JWKS (cached process-wide for 10
 * minutes by auth-js), measured at 0.22–0.47 ms with zero network calls.
 *
 * Why this is not a weaker check:
 *
 *   - The signature really is verified. This is not `getSession()`, which
 *     decodes the cookie without validating it. A tampered token is rejected
 *     with `Invalid JWT signature`.
 *   - `exp` is enforced, so an expired token is rejected.
 *   - **RLS is the authorization boundary, not the page query.** Every read
 *     still carries the JWT to PostgREST, which validates it independently, so
 *     nothing here can widen what a caller is allowed to read.
 *   - `proxy.ts` keeps its networked `getUser()` and its cookie-clearing path,
 *     so a revoked or deleted session is still detected on the next request.
 *
 * What it gives up is a live revocation check on this particular hop; the
 * exposure window is the remaining access-token lifetime (1 hour). That trade
 * is deliberately *not* made where identity is the only boundary — the
 * service-role routes under `app/api/admin/` and the two admin dashboards keep
 * `getUser()`.
 */
export async function getServerUser(
    supabase: SupabaseClient<Database>
): Promise<ServerUser | null> {
    let claims;
    try {
        const { data, error } = await supabase.auth.getClaims();
        if (error || !data?.claims) return null;
        claims = data.claims;
    } catch {
        // getClaims() does NOT mirror getUser()'s error contract. auth-js
        // validates `exp` with a helper that throws a plain Error, and
        // getClaims only converts AuthErrors into a result object — so an
        // expired token throws out of the call rather than returning
        // `{ error }`. Letting that propagate would turn every guest/redirect
        // path into an unhandled exception and a 500 page. A token we cannot
        // verify means "no user", which is exactly what getUser() returned.
        return null;
    }

    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;

    const metadata =
        claims.user_metadata && typeof claims.user_metadata === "object"
            ? (claims.user_metadata as Record<string, unknown>)
            : {};

    return {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : null,
        fullName: typeof metadata.full_name === "string" ? metadata.full_name : null,
    };
}
