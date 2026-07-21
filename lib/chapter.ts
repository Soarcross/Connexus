import { headers } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

export const CHAPTER_SLUG_HEADER = "x-chapter-slug"

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "highschoolconnections.org"
export const DEV_HOSTS = ["localhost", "lvh.me", "127.0.0.1"]
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/

// Builds a URL to `path` on the given chapter's own subdomain. In production
// that's `https://<slug>.${ROOT_DOMAIN}`; in dev (where subdomains of plain
// `localhost` don't resolve without /etc/hosts or lvh.me) it mirrors
// proxy.ts's own dev override and appends `?chapter=<slug>` to the current
// origin instead, so cross-chapter redirects work with no local DNS setup.
export function getChapterHomeUrl(slug: string, path: string, currentOrigin: string): string {
    if (process.env.NODE_ENV !== "production") {
        const url = new URL(path, currentOrigin)
        url.searchParams.set("chapter", slug)
        return url.toString()
    }
    return `https://${slug}.${ROOT_DOMAIN}${path}`
}

export async function getChapterSlug(): Promise<string | null> {
    const headerList = await headers()
    return headerList.get(CHAPTER_SLUG_HEADER)
}

export async function getCurrentChapter(supabase: SupabaseClient<Database>) {
    const slug = await getChapterSlug()
    if (!slug) return null

    const { data } = await supabase
        .from("chapters")
        .select("*")
        .eq("slug", slug)
        .eq("status", "Active")
        .maybeSingle()

    return data
}
