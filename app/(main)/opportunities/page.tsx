import { createSupabaseServerClient } from "@/lib/supabase/server"
import { OpportunitiesClient } from "@/app/components/opportunities/opportunities-client"
import { LockedPage } from "@/app/components/layout/locked-page"
import { activeFilter, getPurgeCutoff } from "@/lib/lifecycle"

export default async function OpportunitiesPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
            <LockedPage
                variant="opportunities"
                title="Opportunities are for members"
                description="Create a free account to browse internships, research programs, scholarships and more."
            />
        )
    }

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id, is_admin")
        .eq("id", user?.id ?? "")
        .single()

    const myChapterId = viewerProfile?.chapter_id ?? null
    const isAdmin = Boolean(viewerProfile?.is_admin)

    // a user without a chapter yet only sees national (chapter_id null)
    // opportunities -- comparing a uuid column to "" would error, not just
    // match zero rows, so branch instead of interpolating a possibly-empty id
    const chapterFilter = myChapterId
        ? `chapter_id.eq.${myChapterId},chapter_id.is.null`
        : null

    // Public list: in scope and not yet expired. Archived opportunities drop out
    // here. Chained .or() groups are ANDed by PostgREST.
    const listQuery = supabase.from("opportunities").select("*")
    const { data: opportunities } = await (chapterFilter
        ? listQuery.or(chapterFilter)
        : listQuery.is("chapter_id", null)
    ).or(activeFilter()).order("created_at", { ascending: false })

    // Archived opportunities the viewer is allowed to see: their own, or all of
    // them for admins. Rows already past the purge cutoff are excluded.
    const archivedBase = supabase.from("opportunities").select("*")
    let archivedQuery = (chapterFilter
        ? archivedBase.or(chapterFilter)
        : archivedBase.is("chapter_id", null)
    )
        .lte("expires_at", new Date().toISOString())
        .gt("expires_at", getPurgeCutoff())
        .order("expires_at", { ascending: true })

    if (!isAdmin) {
        archivedQuery = archivedQuery.eq("created_by", user?.id ?? "")
    }

    const { data: archived } = await archivedQuery

    const { data: pendingExtensions } = await supabase
        .from("extension_requests")
        .select("opportunity_id")
        .eq("user_id", user?.id ?? "")
        .eq("status", "Pending")

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
                <p className="text-sm text-muted-foreground">
                    Browse internships, jobs, research positions and more curated for your chapter.
                </p>
            </div>
            <OpportunitiesClient
                opportunities={opportunities ?? []}
                archivedOpportunities={archived ?? []}
                currentUserId={user?.id ?? ""}
                pendingExtensionOpportunityIds={
                    (pendingExtensions ?? [])
                        .map(r => r.opportunity_id)
                        .filter((id): id is string => Boolean(id))
                }
            />
        </div>
    )
}
