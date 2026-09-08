import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { LockedPage } from "@/app/components/layout/locked-page"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { PeopleClient } from "@/app/components/people/people-client"
import { categoryChip, categoryIcon } from "@/lib/category-colors"
import { activeFilter } from "@/lib/lifecycle"

// Chapter-page display order: chapter-life categories first, then any career
// categories a chapter admin happens to use. Hand-maintained, like every
// other category list in this codebase (see CLAUDE.md).
const CHAPTER_CATEGORIES = [
    "Announcements", "Meetings", "Events", "Trips", "Fundraisers", "Clubs",
    "Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs",
]

export default async function ChapterDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)

    if (!user) {
        return (
            <LockedPage
                variant="chapters"
                title="Chapter pages are for members"
                description="Create a free account to see who's in this chapter and what's happening there."
            />
        )
    }

    const { data: chapter } = await supabase
        .from("chapters")
        .select("*")
        .eq("slug", slug)
        .eq("status", "Active")
        .maybeSingle()

    if (!chapter) {
        notFound()
    }

    const [{ data: profiles }, { data: items }, { data: posts }] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, full_name, avatar_url, grad_year, interests, looking_for, club_roles, bio, chapter_id, chapters(name)")
            .eq("chapter_id", chapter.id)
            .order("created_at", { ascending: false }),
        supabase
            .from("opportunities")
            .select("*")
            .eq("chapter_id", chapter.id)
            .or(activeFilter())
            .order("created_at", { ascending: false }),
        supabase
            .from("community_posts")
            .select("id, title, description, category, url, created_at, profiles(id, full_name, avatar_url, grad_year)")
            .eq("chapter_id", chapter.id)
            .eq("status", "Approved")
            .or(activeFilter())
            .order("created_at", { ascending: false }),
    ])

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

    const location = [chapter.city, chapter.state].filter(Boolean).join(", ")

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <Avatar className="size-14">
                    <AvatarImage src={chapter.logo_url ?? ""} />
                    <AvatarFallback className="bg-secondary text-foreground font-semibold text-lg">
                        {chapter.name?.[0] ?? "?"}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight truncate">
                        {chapter.name} chapter
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">
                        {chapter.school_name}{location ? ` · ${location}` : ""}
                    </p>
                </div>
            </div>

            <Tabs defaultValue="people">
                <TabsList>
                    <TabsTrigger value="people">People</TabsTrigger>
                    <TabsTrigger value="community">Community</TabsTrigger>
                </TabsList>

                <TabsContent value="people">
                    <PeopleClient
                        profiles={profiles ?? []}
                        initialSearch=""
                        viewerChapterId={null}
                    />
                </TabsContent>

                <TabsContent value="community">
                    {Object.keys(grouped).length === 0 && (posts ?? []).length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground text-sm">
                                Nothing here yet — no one in this chapter has posted to the community board.
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="flex flex-col gap-8">
                            {(posts ?? []).length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="size-7 rounded-none border border-border flex items-center justify-center text-foreground">
                                            {categoryIcon("Announcements")}
                                        </div>
                                        <h2 className="font-semibold text-base">Community board</h2>
                                        <span className="text-sm text-muted-foreground">({(posts ?? []).length})</span>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {(posts ?? []).map((post, i) => (
                                            <Card key={post.id} className="card-lift animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: "both" }}>
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <CardTitle className="text-sm font-semibold leading-snug">{post.title}</CardTitle>
                                                        <span className={`shrink-0 ${categoryChip(post.category)}`}>
                                                            {post.category}
                                                        </span>
                                                    </div>
                                                    <CardDescription className="text-xs">
                                                        {post.profiles?.full_name ?? "Anonymous"}
                                                        {post.profiles?.grad_year ? ` · ’${String(post.profiles.grad_year).slice(-2)}` : ""}
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="flex flex-col gap-3">
                                                    <p className="text-xs text-muted-foreground">{post.description}</p>
                                                    {post.url && (
                                                        <div className="flex justify-end">
                                                            <Button size="sm" variant="outline" className="text-xs h-7" asChild>
                                                                <a href={post.url} target="_blank" rel="noopener noreferrer">
                                                                    Details --&gt;
                                                                </a>
                                                            </Button>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {Object.entries(grouped).map(([category, opps]) => (
                                <div key={category} className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="size-7 rounded-none border border-border flex items-center justify-center text-foreground">
                                            {categoryIcon(category)}
                                        </div>
                                        <h2 className="font-semibold text-base">{category}</h2>
                                        <span className="text-sm text-muted-foreground">({opps.length})</span>
                                    </div>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {opps.map((opp, i) => (
                                            <Card key={opp.id} className="card-lift animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: "both" }}>
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <CardTitle className="text-sm font-semibold leading-snug">{opp.title}</CardTitle>
                                                        <span className={`shrink-0 ${categoryChip(opp.category)}`}>
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
                                                            <Button size="sm" variant="outline" className="text-xs h-7" asChild>
                                                                <a href={opp.url} target="_blank" rel="noopener noreferrer">
                                                                    Details --&gt;
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
                </TabsContent>
            </Tabs>
        </div>
    )
}
