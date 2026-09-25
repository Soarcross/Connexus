import { ROOT_DOMAIN } from "@/lib/chapter-shared";

/** Domains the app used to be served from; every host under them is retired. */
const LEGACY_DOMAINS = ["stuyconnections.com"];

/**
 * The host a request must be permanently redirected to, or null to serve it.
 *
 * Sign-in only works on ROOT_DOMAIN itself. Production pins every auth cookie
 * to `Domain=ROOT_DOMAIN`, so on a legacy host (www.stuyconnections.com) the
 * browser silently drops the PKCE code_verifier and Google sign-in dies at
 * /auth/callback with pkce_code_verifier_not_found -- shown to users as a
 * misleading "your session expired". Subdomains of ROOT_DOMAIN keep the cookie
 * but are not in Supabase's redirect allow-list, so OAuth falls back to the
 * Site URL and the code is never exchanged. Serving exactly one host removes
 * both failure modes.
 *
 * localhost, *.vercel.app previews and any unrecognised host are left alone.
 */
export function canonicalRedirectHost(hostHeader: string | null | undefined): string | null {
    if (!hostHeader) return null;
    const host = hostHeader.split(":")[0].toLowerCase();

    if (host === ROOT_DOMAIN) return null;
    if (host.endsWith(`.${ROOT_DOMAIN}`)) return ROOT_DOMAIN;
    for (const legacy of LEGACY_DOMAINS) {
        if (host === legacy || host.endsWith(`.${legacy}`)) return ROOT_DOMAIN;
    }
    return null;
}
