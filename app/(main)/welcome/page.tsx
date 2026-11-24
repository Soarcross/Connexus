import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/supabase/user"
import { WelcomeFlow } from "@/app/components/welcome/welcome-flow"

// The first-run flow: class year, interests, photo, then a celebration.
// New users land here from auth/callback and the login form when their
// profile is missing a class year or interests. It is safe to revisit: every
// step is prefilled from the profile and only writes the field it asks about.
export default async function WelcomePage() {
    const supabase = await createSupabaseServerClient()
    const user = await getServerUser(supabase)

    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, grad_year, interests, chapter_id")
        .eq("id", user.id)
        .maybeSingle()

    // No profiles row yet: the profile page knows how to self-heal that, so
    // send them there rather than duplicating the repair here.
    if (!profile) redirect(`/profile/${user.id}`)

    // Chapterless members (Google sign-ups can't carry the signup form's
    // school choice) get a school step, since suggestions are per chapter.
    const { data: chapters } = profile.chapter_id
        ? { data: [] }
        : await supabase
            .from("chapters")
            .select("id, name, school_name")
            .eq("status", "Active")
            .order("name")

    return (
        <div className="max-w-xl mx-auto sm:py-6">
            <WelcomeFlow
                profile={{
                    id: profile.id,
                    fullName: profile.full_name,
                    avatarUrl: profile.avatar_url,
                    gradYear: profile.grad_year,
                    interests: profile.interests ?? [],
                    chapterId: profile.chapter_id,
                }}
                chapters={chapters ?? []}
            />
        </div>
    )
}
