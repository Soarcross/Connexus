import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PostsFeed } from "@/app/components/community/posts-feed"
import { CreatePostButton } from "@/app/components/community/create-post-button"
import Link from "next/link"

export default async function CommunityPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id")
        .eq("id", user?.id ?? "")
        .single()

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

    const { data: myPosts } = await supabase
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
        .order("created_at", { ascending: false })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold tracking-tight">Community</h1>
                    <p className="text-muted-foreground">
                        Opportunities shared by students and alumni in your chapter.
                    </p>
                </div>
                {myChapterId ? (
                    <CreatePostButton userId={user?.id ?? ""} chapterId={myChapterId} />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        <Link href={`/profile/${user?.id ?? ""}`} className="text-primary hover:underline">
                            Pick a chapter on your profile
                        </Link>{" "}
                        to post here.
                    </p>
                )}
            </div>
            <PostsFeed
                posts={(posts as any) ?? []}
                myPosts={(myPosts as any) ?? []}
                currentUserId={user?.id ?? ""}
            />
        </div>
    )
}