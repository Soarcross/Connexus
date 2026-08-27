import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { OpportunitiesClient } from "@/app/components/opportunities/opportunities-client"
import { LockedPage } from "@/app/components/layout/locked-page"
import { activeFilter, getPurgeCutoff } from "@/lib/lifecycle"

export default async function OpportunitiesPage() {
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)

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
        .select("is_admin")
        .eq("id", user.id)
        .single()

    const isAdmin = Boolean(viewerProfile?.is_admin)

    // This page is national-only (chapter_id IS NULL): chapter-scoped rows
    // live on /chapters now. Chained .or() groups are ANDed by PostgREST.
    const { data: opportunities } = await supabase
        .from("opportunities")
        .select("*")
        .is("chapter_id", null)
        .or(activeFilter())
        .order("created_at", { ascending: false })

    // Archived opportunities the viewer is allowed to see: their own, or all of
    // them for admins. Rows already past the purge cutoff are excluded.
    let archivedQuery = supabase
        .from("opportunities")
        .select("*")
        .is("chapter_id", null)
        .lte("expires_at", new Date().toISOString())
        .gt("expires_at", getPurgeCutoff())
        .order("expires_at", { ascending: true })

    if (!isAdmin) {
        archivedQuery = archivedQuery.eq("created_by", user.id)
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
                    Browse internships, jobs, research positions and more, open to every chapter.
                    {" "}Looking for your school&apos;s events?{" "}
                    <Link href="/chapters" className="text-primary hover:underline">Visit your chapter page</Link>.
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
