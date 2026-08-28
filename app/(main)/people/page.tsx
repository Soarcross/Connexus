import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { PeopleClient } from "@/app/components/people/people-client"

export default async function PeoplePage({
    searchParams,
}: {
    searchParams: Promise<{ search?: string }>
}) {
    const { search } = await searchParams
    const supabase = await createSupabaseServerClient()

    const user = await getServerUser(supabase)

    if (!user) {
        // Guests see the whole directory, but only the anon-granted columns.
        // Selecting anything else (bio, chapter_id, *) would 42501 as anon.
        const { data: publicProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, grad_year, interests, club_roles")
            .not("full_name", "is", null)
            .order("grad_year", { ascending: false })

        const profiles = (publicProfiles ?? []).map(p => ({
            ...p,
            looking_for: null,
            bio: null,
            chapter_id: null,
            chapters: null,
        }))

        return (
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">People</h1>
                    <p className="text-sm text-muted-foreground">
                        Students and alumni on Connexus. Sign up to see full profiles and connect.
                    </p>
                </div>
                <PeopleClient
                    profiles={profiles}
                    initialSearch={search ?? ""}
                    viewerChapterId={null}
                    isGuest
                />
            </div>
        )
    }

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id")
        .eq("id", user.id)
        .single()

    const viewerChapterId = viewerProfile?.chapter_id ?? null

    // Default to the viewer's own chapter only -- the full cross-chapter
    // roster (every school's users) is fetched client-side on demand, only
    // when "All chapters" is actually toggled on (see people-client.tsx).
    // Shipping every chapter's profiles on every page load regardless of
    // the toggle would leak the whole platform's user PII to any visitor.
    const { data: profiles } = viewerChapterId
        ? await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, grad_year, interests, looking_for, club_roles, bio, chapter_id, chapters(name)")
            .eq("chapter_id", viewerChapterId)
            .order("created_at", { ascending: false })
        : { data: [] }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">People</h1>
                <p className="text-sm text-muted-foreground">
                    Find and connect with students and alumni from your chapter.
                </p>
            </div>
            <PeopleClient
                profiles={profiles ?? []}
                initialSearch={search ?? ""}
                viewerChapterId={viewerChapterId}
            />
        </div>
    )
}