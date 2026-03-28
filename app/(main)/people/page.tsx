import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PeopleClient } from "@/app/components/people/people-client"

export default async function PeoplePage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string }>
}) {
    const { search } = await searchParams
    const supabase = await createSupabaseServerClient()

    const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, grad_year, interests, looking_for, club_roles, bio")
        .order("created_at", { ascending: false })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight">People</h1>
                <p className="text-muted-foreground">
                    Find and connect with Stuyvesant students and alumni.
                </p>
            </div>
            <PeopleClient profiles={profiles ?? []} initialSearch={search ?? ""} />
        </div>
    )
}