import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { LockedPage } from "@/app/components/layout/locked-page"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { ArrowRight, Plus } from "lucide-react"

export default async function ChaptersPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
            <LockedPage
                variant="chapters"
                title="Chapter pages are for members"
                description="Create a free account to see what's happening at every chapter."
            />
        )
    }

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id")
        .eq("id", user.id)
        .single()

    const viewerChapterId = viewerProfile?.chapter_id ?? null

    // Only chapter_id is selected here, not names/bios/etc -- this is a
    // member count, not a directory read, so it should carry no PII.
    const [{ data: chapters }, { data: allProfiles }] = await Promise.all([
        supabase
            .from("chapters")
            .select("*")
            .eq("status", "Active")
            .order("name"),
        supabase
            .from("profiles")
            .select("chapter_id"),
    ])

    const memberCounts = new Map<string, number>()
    for (const { chapter_id } of allProfiles ?? []) {
        if (!chapter_id) continue
        memberCounts.set(chapter_id, (memberCounts.get(chapter_id) ?? 0) + 1)
    }

    // Viewer's home chapter first, then the rest (already sorted by name).
    const sortedChapters = [...(chapters ?? [])].sort((a, b) => {
        if (a.id === viewerChapterId) return -1
        if (b.id === viewerChapterId) return 1
        return 0
    })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Chapters</h1>
                <p className="text-sm text-muted-foreground">
                    Browse every Connexus chapter and see who&apos;s in each one.
                </p>
            </div>

            {!viewerChapterId && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">You&apos;re not in a chapter yet</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                            Join your school&apos;s chapter from your profile to get a &quot;Your chapter&quot; badge
                            below — or apply to open one if it&apos;s not listed yet.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild>
                                <Link href={`/profile/${user.id}`}>
                                    Join from your profile <ArrowRight className="size-4 ml-1" />
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedChapters.map(chapter => {
                    const memberCount = memberCounts.get(chapter.id) ?? 0
                    const isHome = chapter.id === viewerChapterId
                    const location = [chapter.city, chapter.state].filter(Boolean).join(", ")

                    return (
                        <Link key={chapter.id} href={`/chapters/${chapter.slug}`}>
                            <Card className="h-full transition-shadow hover:shadow-md">
                                <CardContent className="pt-6 flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="size-12">
                                            <AvatarImage src={chapter.logo_url ?? ""} />
                                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                                {chapter.name?.[0] ?? "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col min-w-0">
                                            <p className="font-semibold text-sm truncate">
                                                {chapter.school_name || chapter.name}
                                            </p>
                                            {location && (
                                                <p className="text-xs text-muted-foreground truncate">{location}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            {isHome && (
                                                <Badge variant="default" className="text-xs">Your chapter</Badge>
                                            )}
                                            <Badge variant="outline" className="text-xs">
                                                {memberCount} {memberCount === 1 ? "member" : "members"}
                                            </Badge>
                                        </div>
                                        <ArrowRight className="size-4 text-muted-foreground" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    )
                })}

                <Link href="/apply">
                    <Card className="h-full border-dashed transition-shadow hover:shadow-md">
                        <CardContent className="pt-6 h-full flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                            <Plus className="size-6" />
                            <p className="text-sm font-medium">Don&apos;t see your school?</p>
                            <p className="text-xs">Apply to start a new chapter</p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}
