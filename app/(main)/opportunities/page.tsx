import { createSupabaseServerClient } from "@/lib/supabase/server"
import { OpportunitiesClient } from "@/app/components/opportunities/opportunities-client"

export default async function OpportunitiesPage() {
    const supabase = await createSupabaseServerClient()

    const { data: opportunities } = await supabase
        .from("opportunities")
        .select("*")
        .order("created_at", { ascending: false })

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight">Opportunities</h1>
                <p className="text-muted-foreground">
                    Browse internships, jobs, research positions and more curated for Stuyvesant students.
                </p>
            </div>
            <OpportunitiesClient opportunities={opportunities ?? []} />
        </div>
    )
}