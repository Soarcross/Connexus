import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PostsFeed } from "@/app/components/community/posts-feed"

export default async function CommunityPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    // viewerProfile and myPosts are independent of each other — fetch
    // concurrently rather than paying for two sequential round-trips
    const [{ data: viewerProfile }, { data: myPosts }] = await Promise.all([
        supabase
            .from("profiles")
            .select("full_name, avatar_url, grad_year, chapter_id, chapters(name)")
            .eq("id", user?.id ?? "")
            .single(),
        supabase
            .from("community_posts")
            .select(`
                *,
                profiles (
                    id,
                    full_name,
                    avatar_url,
                    grad_year
                )
            `)
            .eq("user_id", user?.id ?? "")
            .order("created_at", { ascending: false }),
    ])

    const myChapterId = viewerProfile?.chapter_id ?? null

    // a user without a chapter yet has nothing chapter-scoped to see —
    // skip the query entirely rather than comparing a uuid column to ""
    const { data: posts } = myChapterId
        ? await supabase
            .from("community_posts")
            .select(`
                *,
                profiles (
                    id,
                    full_name,
                    avatar_url,
                    grad_year
                )
            `)
            .eq("status", "Approved")
            .eq("chapter_id", myChapterId)
            .order("created_at", { ascending: false })
        : { data: [] }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Community</h1>
                <p className="text-sm text-muted-foreground">
                    Opportunities shared by students and alumni in your chapter.
                </p>
            </div>
            <PostsFeed
                posts={(posts as any) ?? []}
                myPosts={(myPosts as any) ?? []}
                currentUserId={user?.id ?? ""}
                chapterId={myChapterId}
                viewer={{
                    fullName: viewerProfile?.full_name ?? null,
                    avatarUrl: viewerProfile?.avatar_url ?? null,
                    chapterName: viewerProfile?.chapters?.name ?? null,
                    gradYear: viewerProfile?.grad_year ?? null,
                }}
            />
        </div>
    )
}
