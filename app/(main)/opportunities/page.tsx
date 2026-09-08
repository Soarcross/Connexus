import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { OpportunitiesClient } from "@/app/components/opportunities/opportunities-client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { categoryChip } from "@/lib/category-colors"
import { activeFilter, getPurgeCutoff } from "@/lib/lifecycle"

export default async function OpportunitiesPage() {
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)

    if (!user) {
        // Guests get the real FEATURED national listings (the anon RLS policy
        // is scoped to exactly those rows) plus a blurred placeholder teaser
        // for the rest. Explicit column list: anon has no grant on created_by.
        const { data: featured } = await supabase
            .from("opportunities")
            .select("id, title, description, category, field, organization, location, url, deadline, is_featured, created_at")
            .eq("is_featured", true)
            .is("chapter_id", null)
            .or(activeFilter())
            .order("created_at", { ascending: false })

        return (
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
                    <p className="text-sm text-muted-foreground">
                        A taste of this month&apos;s featured opportunities — sign up free to browse everything.
                    </p>
                </div>

                {(featured?.length ?? 0) > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {(featured ?? []).map((opp, i) => (
                            <Card key={opp.id} className="card-lift animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: "both" }}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="text-sm font-semibold leading-snug">{opp.title}</CardTitle>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <Badge className="text-xs">Featured</Badge>
                                            <span className={categoryChip(opp.category)}>
                                                {opp.category}
                                            </span>
                                        </div>
                                    </div>
                                    {opp.organization && (
                                        <CardDescription className="text-xs">
                                            {opp.organization}
                                            {opp.location ? ` · ${opp.location}` : ""}
                                        </CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <p className="text-xs text-muted-foreground">{opp.description}</p>
                                    <div className="flex items-center justify-between gap-2">
                                        {opp.deadline ? (
                                            <span className="text-xs text-muted-foreground">
                                                Due {new Date(opp.deadline).toLocaleDateString()}
                                            </span>
                                        ) : <span />}
                                        {opp.url && (
                                            <Button size="sm" variant="outline" className="text-xs h-7" asChild>
                                                <a href={opp.url} target="_blank" rel="noopener noreferrer">
                                                    Apply --&gt;
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Blurred teaser for the non-featured listings. Placeholder
                    cards, never real rows — a CSS blur is removable in dev tools. */}
                <section className="relative">
                    <div className="blur-[6px] pointer-events-none select-none opacity-70" aria-hidden="true">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {["Summer Research Assistant", "Hospital Volunteer Program", "City Coding Bootcamp", "Museum Education Internship"].map(title => (
                                <Card key={title}>
                                    <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
                                    <CardContent className="flex flex-col gap-2">
                                        <div className="h-3.5 w-full rounded bg-muted" />
                                        <div className="h-3.5 w-2/3 rounded bg-muted" />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Card className="w-full max-w-sm mx-4 border-2 border-border">
                            <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                                <p className="font-semibold">There&apos;s more where that came from</p>
                                <p className="text-sm text-muted-foreground">
                                    Create a free account to browse every internship, scholarship, research program and more.
                                </p>
                                <div className="flex gap-2">
                                    <Button asChild><Link href="/signup">Sign up</Link></Button>
                                    <Button variant="outline" asChild><Link href="/login">Log in</Link></Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </div>
        )
    }

    // These three are independent of each other, so they go out together rather
    // than as three sequential round trips. Only `archived` below genuinely
    // depends on an earlier result (it needs isAdmin to decide its scope), so
    // the page costs two round-trip stages instead of four.
    //
    // The opportunities query is national-only (chapter_id IS NULL):
    // chapter-scoped rows live on /chapters now. Chained .or() groups are ANDed
    // by PostgREST.
    const [{ data: viewerProfile }, { data: opportunities }, { data: pendingExtensions }] =
        await Promise.all([
            supabase
                .from("profiles")
                .select("is_admin")
                .eq("id", user.id)
                .single(),
            supabase
                .from("opportunities")
                .select("*")
                .is("chapter_id", null)
                .or(activeFilter())
                .order("created_at", { ascending: false }),
            supabase
                .from("extension_requests")
                .select("opportunity_id")
                // `user` is non-null past the guard above, so this is a real id
                // rather than the `?? ""` fallback that Postgres rejects as an
                // invalid uuid (it errors rather than matching zero rows).
                .eq("user_id", user.id)
                .eq("status", "Pending"),
        ])

    const isAdmin = Boolean(viewerProfile?.is_admin)

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

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
                <p className="text-sm text-muted-foreground">
                    Browse internships, jobs, research positions and more, open to every chapter.
                    {" "}Looking for your school&apos;s events?{" "}
                    <Link href="/chapters" className="text-accent hover:underline">Visit your chapter page</Link>.
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
