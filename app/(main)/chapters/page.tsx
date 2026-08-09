import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { LockedPage } from "@/app/components/layout/locked-page"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { ExternalLink, ArrowRight } from "lucide-react"
import { categoryChip, categoryIcon } from "@/lib/category-colors"
import { activeFilter } from "@/lib/lifecycle"

// Chapter-page display order: chapter-life categories first, then any career
// categories a chapter admin happens to use. Hand-maintained, like every
// other category list in this codebase (see CLAUDE.md).
const CHAPTER_CATEGORIES = [
    "Announcements", "Meetings", "Events", "Trips", "Fundraisers", "Clubs",
    "Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs",
]

export default async function ChaptersPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
            <LockedPage
                variant="chapters"
                title="Chapter pages are for members"
                description="Create a free account to see what's happening at your school's chapter."
            />
        )
    }

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id, chapters(id, name, school_name)")
        .eq("id", user.id)
        .single()

    const chapter = viewerProfile?.chapters ?? null

    if (!chapter) {
        return (
            <div className="max-w-xl mx-auto flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Chapters</h1>
                    <p className="text-sm text-muted-foreground">
                        Chapters are per-school hubs for meetings, events, trips and local opportunities.
                    </p>
                </div>
                <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">You&apos;re not in a chapter yet</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                            Join your school&apos;s chapter from your profile to see its page — or apply to open a
                            chapter at your school.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild>
                                <Link href={`/profile/${user.id}`}>
                                    Join from your profile <ArrowRight className="size-4 ml-1" />
                                </Link>
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/apply">Open a chapter</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const { data: items } = await supabase
        .from("opportunities")
        .select("*")
        .eq("chapter_id", chapter.id)
        .or(activeFilter())
        .order("created_at", { ascending: false })

    type Item = NonNullable<typeof items>[number]
    const grouped: Record<string, Item[]> = {}
    for (const cat of CHAPTER_CATEGORIES) {
        const inCat = (items ?? []).filter(i => i.category === cat)
        if (inCat.length > 0) grouped[cat] = inCat
    }
    // categories outside the display list still render, at the end
    const known = new Set<string>(CHAPTER_CATEGORIES)
    const leftovers = (items ?? []).filter(i => !known.has(i.category))
    if (leftovers.length > 0) grouped["Other"] = leftovers

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{chapter.name} chapter</h1>
                <p className="text-sm text-muted-foreground">
                    What&apos;s happening at {chapter.school_name}.
                </p>
            </div>

            {Object.keys(grouped).length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground text-sm">
                        Nothing here yet — your chapter admins haven&apos;t posted any chapter events or opportunities.
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-8">
                    {Object.entries(grouped).map(([category, opps]) => (
                        <div key={category} className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <div className={`size-7 rounded-md flex items-center justify-center ${categoryChip(category)}`}>
                                    {categoryIcon(category)}
                                </div>
                                <h2 className="font-semibold text-base">{category}</h2>
                                <span className="text-sm text-muted-foreground">({opps.length})</span>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {opps.map(opp => (
                                    <Card key={opp.id} className="transition-shadow hover:shadow-md">
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <CardTitle className="text-sm font-semibold leading-snug">{opp.title}</CardTitle>
                                                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${categoryChip(opp.category)}`}>
                                                    {opp.category}
                                                </span>
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
                                                        {new Date(opp.deadline).toLocaleDateString()}
                                                    </span>
                                                ) : <span />}
                                                {opp.url && (
                                                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" asChild>
                                                        <a href={opp.url} target="_blank" rel="noopener noreferrer">
                                                            Details <ExternalLink className="size-3" />
                                                        </a>
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
