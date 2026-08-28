import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { PostsFeed } from "@/app/components/community/posts-feed"
import { LockedPage } from "@/app/components/layout/locked-page"
import { activeFilter, notPurgedFilter } from "@/lib/lifecycle"

export default async function CommunityPage() {
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)

    if (!user) {
        return (
            <LockedPage
                variant="community"
                title="Join the community"
                description="Create a free account to see what students and alumni in your chapter are sharing."
            />
        )
    }

    const POST_SELECT = `
        *,
        profiles (
            id,
            full_name,
            avatar_url,
            grad_year
        )
    `

    // viewerProfile, myPosts and pendingExtensions are independent of each other
    // — fetch concurrently rather than paying for sequential round-trips.
    //
    // myPosts: the author sees every status, including their archived posts, but
    // never one already past the purge cutoff awaiting the next cron run.
    const [{ data: viewerProfile }, { data: myPosts }, { data: pendingExtensions }] = await Promise.all([
        supabase
            .from("profiles")
            .select("full_name, avatar_url, grad_year, chapter_id, chapters(name)")
            .eq("id", user?.id ?? "")
            .single(),
        supabase
            .from("community_posts")
            .select(POST_SELECT)
            .eq("user_id", user?.id ?? "")
            .or(notPurgedFilter())
            .order("created_at", { ascending: false }),
        // So an archived post shows "Extension requested" rather than offering
        // the button again.
        supabase
            .from("extension_requests")
            .select("post_id")
            .eq("user_id", user?.id ?? "")
            .eq("status", "Pending"),
    ])

    const myChapterId = viewerProfile?.chapter_id ?? null

    // Public feed: approved, in this chapter, and not yet expired — archived
    // posts drop out here. A user without a chapter yet has nothing
    // chapter-scoped to see, so skip the query rather than comparing a uuid
    // column to "".
    const { data: posts } = myChapterId
        ? await supabase
            .from("community_posts")
            .select(POST_SELECT)
            .eq("status", "Approved")
            .eq("chapter_id", myChapterId)
            .or(activeFilter())
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
                posts={posts ?? []}
                myPosts={myPosts ?? []}
                currentUserId={user?.id ?? ""}
                chapterId={myChapterId}
                viewer={{
                    fullName: viewerProfile?.full_name ?? null,
                    avatarUrl: viewerProfile?.avatar_url ?? null,
                    chapterName: viewerProfile?.chapters?.name ?? null,
                    gradYear: viewerProfile?.grad_year ?? null,
                }}
                pendingExtensionPostIds={
                    (pendingExtensions ?? [])
                        .map(r => r.post_id)
                        .filter((id): id is string => Boolean(id))
                }
            />
        </div>
    )
}
