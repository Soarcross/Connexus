import { ROOT_DOMAIN } from "@/lib/chapter-shared";

/**
 * The `Domain` to scope Supabase auth cookies to, or `undefined` for a
 * host-only cookie.
 *
 * Sessions are deliberately shared across chapter subdomains, which requires
 * `domain=ROOT_DOMAIN`. But a browser silently discards a cookie whose `Domain`
 * the current host is not under — so keying this off `NODE_ENV` breaks every
 * production-mode host that is not under the root domain:
 *
 *   - preview deployments (`*.vercel.app`)
 *   - any custom domain not yet pointed at `ROOT_DOMAIN`
 *
 * On those hosts the PKCE `code_verifier` is never stored, and the OAuth
 * callback fails with `pkce_code_verifier_not_found`. Matching on the real
 * hostname instead means previews fall back to host-only cookies and work
 * without an environment variable per deployment.
 *
 * `NEXT_PUBLIC_COOKIE_DOMAIN` still overrides, but must never be set broader
 * than the root domain itself or the session cookie becomes a cross-host
 * "supercookie".
 */
export function resolveCookieDomain(
    hostname: string | null | undefined
): string | undefined {
    const override = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
    if (override) return override;

    if (!hostname) return undefined;

    // Strip any port ("localhost:3000") before comparing.
    const host = hostname.split(":")[0].toLowerCase();

    if (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) {
        return ROOT_DOMAIN;
    }

    // localhost, *.vercel.app, anything else -> host-only cookie.
    return undefined;
}
