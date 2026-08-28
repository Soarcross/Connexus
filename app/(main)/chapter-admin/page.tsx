import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ChapterAdminDashboard } from "@/app/components/chapter-admin/chapter-admin-dashboard"

export default async function ChapterAdminPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, chapter_role, chapter_id, chapters(name, logo_url)")
        .eq("id", user.id)
        .single()

    const isChapterAdmin = profile?.chapter_role === "chapter_admin"
    const isPlatformAdmin = profile?.is_admin === true
    if (!isChapterAdmin && !isPlatformAdmin) redirect("/home")

    const chapterId = profile?.chapter_id
    if (!chapterId) redirect("/home")

    const [
        { data: communityPosts },
        { data: extensionRequests },
        { data: members },
        { data: opportunities },
    ] = await Promise.all([
        supabase
            .from("community_posts")
            .select("*, profiles(id, full_name, avatar_url)")
            .eq("chapter_id", chapterId)
            .order("created_at", { ascending: false }),
        supabase
            .from("extension_requests")
            .select("*, community_posts!inner(title, chapter_id), profiles(full_name, avatar_url)")
            .eq("community_posts.chapter_id", chapterId)
            .order("created_at", { ascending: false }),
        supabase
            .from("profiles")
            .select("id, full_name, avatar_url, grad_year, chapter_role, is_admin, created_at")
            .eq("chapter_id", chapterId)
            .order("created_at", { ascending: false }),
        supabase
            .from("opportunities")
            .select("*")
            .eq("chapter_id", chapterId)
            .order("created_at", { ascending: false }),
    ])

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight">Chapter Admin</h1>
                <p className="text-muted-foreground">
                    Manage {profile?.chapters?.name ?? "your chapter"}&apos;s posts, members, opportunities and profile picture.
                </p>
            </div>
            <ChapterAdminDashboard
                chapterId={chapterId}
                chapterName={profile?.chapters?.name ?? null}
                chapterLogoUrl={profile?.chapters?.logo_url ?? null}
                communityPosts={communityPosts ?? []}
                extensionRequests={extensionRequests ?? []}
                members={(members ?? []).map(m => ({ ...m, is_admin: m.is_admin ?? false }))}
                currentUserId={user.id}
                opportunities={opportunities ?? []}
            />
        </div>
    )
}
