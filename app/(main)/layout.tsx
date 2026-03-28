import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navbar } from "@/app/components/navbar"

export default async function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, is_admin")
        .eq("id", user.id)
        .single()

    return (
        <div className="min-h-svh bg-background">
            <Navbar
                userId={user.id}
                avatarUrl={(profile as any)?.avatar_url ?? null}
                fullName={(profile as any)?.full_name ?? null}
                isAdmin={(profile as any)?.is_admin ?? false}
            />
            <main className="max-w-6xl mx-auto px-4 py-8">
                {children}
            </main>
        </div>
    )
}