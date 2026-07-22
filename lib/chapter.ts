import { headers } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"
import { CHAPTER_SLUG_HEADER } from "@/lib/chapter-shared"

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
