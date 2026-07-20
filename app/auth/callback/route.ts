import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getChapterSlug } from "@/lib/chapter"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const next = searchParams.get("next")

    if (code) {
        const supabase = await createSupabaseServerClient()
        await supabase.auth.exchangeCodeForSession(code)

        // if there's a next param (e.g. password reset) redirect there
        if (next) {
            return NextResponse.redirect(`${origin}${next}`)
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("grad_year, interests, chapter_id")
                .eq("id", user.id)
                .single()

            // OAuth signups (e.g. Google) don't carry our custom chapter metadata,
            // so backfill from the subdomain here if the profile has no chapter yet.
            if (!profile?.chapter_id) {
                const slug = await getChapterSlug()
                if (slug) {
                    const { data: chapter } = await supabase
                        .from("chapters")
                        .select("id")
                        .eq("slug", slug)
                        .eq("status", "Active")
                        .maybeSingle()
                    if (chapter) {
                        await supabase.from("profiles").update({ chapter_id: chapter.id }).eq("id", user.id)
                    }
                }
            }

            if (!profile?.grad_year || !profile?.interests?.length) {
                return NextResponse.redirect(`${origin}/profile/${user.id}`)
            }

            return NextResponse.redirect(`${origin}/home`)
        }
    }

    return NextResponse.redirect(`${origin}/login`)
}