import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { ArrowRight, Plus } from "lucide-react"

export default async function ChaptersPage() {
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)

    // The directory itself is public: chapter names/locations are marketing
    // info, and the anon chapters policy only exposes Active rows. Member
    // counts and the join prompt are member-only (the count query reads
    // profiles.chapter_id, which anon has no grant on); the per-chapter
    // detail page stays login-gated.
    const [{ data: viewerProfile }, { data: chapters }, { data: allProfiles }] = await Promise.all([
        user
            ? supabase.from("profiles").select("chapter_id").eq("id", user.id).single()
            : Promise.resolve({ data: null }),
        supabase
            .from("chapters")
            .select("*")
            .eq("status", "Active")
            .order("name"),
        // Only chapter_id is selected here, not names/bios/etc -- this is a
        // member count, not a directory read, so it should carry no PII.
        user
            ? supabase.from("profiles").select("chapter_id")
            : Promise.resolve({ data: null }),
    ])

    const viewerChapterId = viewerProfile?.chapter_id ?? null

    const memberCounts = user ? new Map<string, number>() : null
    if (memberCounts) {
        for (const { chapter_id } of allProfiles ?? []) {
            if (!chapter_id) continue
            memberCounts.set(chapter_id, (memberCounts.get(chapter_id) ?? 0) + 1)
        }
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
                    {user
                        ? "Browse every Connexus chapter and see who's in each one."
                        : "Every school on Connexus. Sign up to see who's in each chapter."}
                </p>
            </div>

            {!user && (
                <Card className="border-2 border-border">
                    <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            Is your school here? Create a free account to join its chapter and see what&apos;s happening inside.
                        </p>
                        <div className="flex gap-2 shrink-0">
                            <Button size="sm" asChild><Link href="/signup">Sign up</Link></Button>
                            <Button size="sm" variant="outline" asChild><Link href="/login">Log in</Link></Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {user && !viewerChapterId && (
                <Card className="border-2 border-border">
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
                    const memberCount = memberCounts?.get(chapter.id) ?? 0
                    const isHome = chapter.id === viewerChapterId
                    const location = [chapter.city, chapter.state].filter(Boolean).join(", ")

                    return (
                        <Link key={chapter.id} href={`/chapters/${chapter.slug}`}>
                            <Card className="h-full transition-colors hover:bg-secondary">
                                <CardContent className="pt-6 flex flex-col gap-4">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="size-12">
                                            <AvatarImage src={chapter.logo_url ?? ""} />
                                            <AvatarFallback className="bg-secondary text-foreground font-semibold">
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
                                            {memberCounts ? (
                                                <Badge variant="outline" className="text-xs">
                                                    {memberCount} {memberCount === 1 ? "member" : "members"}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs">Sign up to see members</Badge>
                                            )}
                                        </div>
                                        <ArrowRight className="size-4 text-muted-foreground" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    )
                })}

                <Link href="/apply">
                    <Card className="h-full border-dashed transition-colors hover:bg-secondary">
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
