import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminDashboard } from "@/app/components/admin/admin-dashboard"

export default async function AdminPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single()

    if (!(profile as any)?.is_admin) redirect("/")

    const [
        { data: opportunities },
        { data: users },
        { data: submissions },
        { data: messagesPerDay },
        { data: usersPerDay },
        { count: totalUsers },
        { count: totalOpportunities },
        { count: totalMessages },
        { count: totalConversations },
        { data: teamMembers },
        { data: partners },
        { data: aboutContent },
        { data: communityPosts },
    ] = await Promise.all([
        supabase
            .from("opportunities")
            .select("*")
            .order("created_at", { ascending: false }),
        supabase
            .from("profiles")
            .select("id, full_name, avatar_url, grad_year, is_admin, created_at")
            .order("created_at", { ascending: false }),
        supabase
            .from("contact_submissions")
            .select("*")
            .order("created_at", { ascending: false }),
        supabase
            .from("messages_per_day")
            .select("*"),
        supabase
            .from("users_per_day")
            .select("*"),
        supabase
            .from("profiles")
            .select("id", { count: "exact", head: true }),
        supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true }),
        supabase
            .from("messages")
            .select("id", { count: "exact", head: true }),
        supabase
            .from("conversations")
            .select("id", { count: "exact", head: true }),
        supabase
            .from("team_members")
            .select("*")
            .order("order_index"),
        supabase
            .from("partners")
            .select("*")
            .order("order_index"),
        supabase
            .from("about_content")
            .select("*")
            .single(),
        supabase
            .from("community_posts")
            .select("*, profiles!community_posts_user_id_fkey(id, full_name, avatar_url)")
            .order("created_at", { ascending: false }),
    ])

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-muted-foreground">Manage opportunities, users and monitor activity.</p>
            </div>
            <AdminDashboard
                opportunities={(opportunities ?? []) as any}
                users={(users ?? []).map(u => ({ ...u, is_admin: u.is_admin ?? false })) as any}
                submissions={(submissions ?? []) as any}
                messagesPerDay={(messagesPerDay ?? []) as any}
                usersPerDay={(usersPerDay ?? []) as any}
                stats={{
                    totalUsers: totalUsers ?? 0,
                    totalOpportunities: totalOpportunities ?? 0,
                    totalMessages: totalMessages ?? 0,
                    totalConversations: totalConversations ?? 0,
                }}
                teamMembers={(teamMembers ?? []) as any}
                partners={(partners ?? []) as any}
                aboutContent={aboutContent as any}
                communityPosts={(communityPosts ?? []) as any}
            />
        </div>
    )
}