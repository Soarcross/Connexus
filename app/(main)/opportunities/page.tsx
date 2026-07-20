import { createSupabaseServerClient } from "@/lib/supabase/server"
import { OpportunitiesClient } from "@/app/components/opportunities/opportunities-client"

export default async function OpportunitiesPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id")
        .eq("id", user?.id ?? "")
        .single()

    const myChapterId = viewerProfile?.chapter_id ?? null

    // a user without a chapter yet only sees national (chapter_id null)
    // opportunities -- comparing a uuid column to "" would error, not just
    // match zero rows, so branch instead of interpolating a possibly-empty id
    const opportunitiesQuery = supabase.from("opportunities").select("*")
    const { data: opportunities } = await (myChapterId
        ? opportunitiesQuery.or(`chapter_id.eq.${myChapterId},chapter_id.is.null`)
        : opportunitiesQuery.is("chapter_id", null)
    ).order("created_at", { ascending: false })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
                <p className="text-sm text-muted-foreground">
                    Browse internships, jobs, research positions and more curated for your chapter.
                </p>
            </div>
            <OpportunitiesClient opportunities={opportunities ?? []} />
        </div>
    )
}
