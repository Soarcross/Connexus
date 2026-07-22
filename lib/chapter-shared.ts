// Client-safe chapter constants/helpers — no "next/headers" import here.
// Anything reachable from a "use client" file or from proxy.ts (Edge
// middleware) must live in this file, not lib/chapter.ts, or bundling it
// into the client pulls in lib/chapter.ts's next/headers import and fails
// the build ("You're importing a module that depends on next/headers...").

export const CHAPTER_SLUG_HEADER = "x-chapter-slug"

// The one place to change when the domain changes. Currently stuyconnections.com
// (temporary -- highschoolconnections.com hasn't been purchased yet). Swap this
// literal to highschoolconnections.com once it's bought, or override per-environment
// via NEXT_PUBLIC_ROOT_DOMAIN in Vercel without touching code.
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "stuyconnections.com"
export const DEV_HOSTS = ["localhost", "lvh.me", "127.0.0.1"]
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/

// Stuyvesant is the original, flagship chapter -- it lives at the bare root
// domain (stuyconnections.com), not its own subdomain (stuy.stuyconnections.com).
// proxy.ts resolves the apex/www host to this slug instead of "no chapter".
// Override via NEXT_PUBLIC_DEFAULT_CHAPTER_SLUG if that ever needs to change.
export const DEFAULT_CHAPTER_SLUG = process.env.NEXT_PUBLIC_DEFAULT_CHAPTER_SLUG ?? "stuy"

// Builds a URL to `path` on the given chapter's own subdomain. In production
// that's `https://<slug>.${ROOT_DOMAIN}`, except the default chapter (see
// DEFAULT_CHAPTER_SLUG above), which uses the bare root domain with no
// subdomain. In dev (where subdomains of plain `localhost` don't resolve
// without /etc/hosts or lvh.me) it mirrors proxy.ts's own dev override and
// appends `?chapter=<slug>` to the current origin instead, so cross-chapter
// redirects work with no local DNS setup.
export function getChapterHomeUrl(slug: string, path: string, currentOrigin: string): string {
    if (process.env.NODE_ENV !== "production") {
        const url = new URL(path, currentOrigin)
        url.searchParams.set("chapter", slug)
        return url.toString()
    }
    if (slug === DEFAULT_CHAPTER_SLUG) {
        return `https://${ROOT_DOMAIN}${path}`
    }
    return `https://${slug}.${ROOT_DOMAIN}${path}`
}
