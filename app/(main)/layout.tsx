import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Navbar } from "@/app/components/navbar"

export default async function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    // Guests are allowed through: each page under (main) decides its own
    // treatment (blur-gate, public content, or its own redirect to /login).
    const { data: profile } = user
        ? await supabase
            .from("profiles")
            .select("full_name, avatar_url, is_admin, chapter_role, chapters(name)")
            .eq("id", user.id)
            .single()
        : { data: null }

    return (
        <div className="min-h-svh bg-background">
            <Navbar
                userId={user?.id ?? null}
                avatarUrl={profile?.avatar_url ?? null}
                fullName={profile?.full_name ?? null}
                isAdmin={profile?.is_admin ?? false}
                chapterName={profile?.chapters?.name ?? null}
                isChapterAdmin={profile?.chapter_role === "chapter_admin"}
            />
            <main className="max-w-[1128px] mx-auto px-4 py-6">
                {children}
            </main>
        </div>
    )
}
