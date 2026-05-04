import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PostsFeed } from "@/app/components/community/posts-feed"
import { CreatePostButton } from "@/app/components/community/create-post-button"

export default async function CommunityPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    console.log("USER:", user?.id)
    console.log("USER ERROR:", userError)

    const { data: posts, error: postsError } = await supabase
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
        .order("created_at", { ascending: false })

    console.log("POSTS:", JSON.stringify(posts))
    console.log("POSTS ERROR:", JSON.stringify(postsError))

    const { data: myPosts, error: myPostsError } = await supabase
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

    console.log("MY POSTS:", JSON.stringify(myPosts))
    console.log("MY POSTS ERROR:", JSON.stringify(myPostsError))

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold tracking-tight">Community</h1>
                    <p className="text-muted-foreground">
                        Opportunities shared by Stuyvesant students and alumni.
                    </p>
                </div>
                <CreatePostButton userId={user?.id ?? ""} />
            </div>
            <PostsFeed
                posts={(posts as any) ?? []}
                myPosts={(myPosts as any) ?? []}
                currentUserId={user?.id ?? ""}
            />
        </div>
    )
}