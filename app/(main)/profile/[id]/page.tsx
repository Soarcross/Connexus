import { createSupabaseServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { ProfileView } from "@/app/components/profile/profile-view"

type Props = {
    params: Promise<{ id: string }>
}

export default async function ProfilePage({ params }: Props) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    // get the logged in user so we know if this is their own profile
    const { data: { user } } = await supabase.auth.getUser()

    // get the profile being viewed
    const { data: profile, error } = await supabase
        .from("profiles")
        .select("*, chapters(name, school_name)")
        .eq("id", id)
        .single()

    // if profile doesn't exist show 404
    if (error || !profile) {
        notFound()
    }

    const isOwnProfile = user?.id === profile.id

    // Only ever expose the viewer's own auth email, taken from their own
    // session -- never look up another user's email. This used to go
    // through an inline service-role client (auth.admin.getUserById), which
    // leaked every profile's private auth email to any authenticated
    // viewer regardless of isOwnProfile. Other people's profiles get null;
    // the in-app DM feature is the intended way to reach them.
    const email = isOwnProfile ? (user?.email ?? null) : null

    // fetch the current viewer's interests to compute overlap
    let currentUserInterests: string[] = []
    if (user && !isOwnProfile) {
        const { data: myProfile } = await supabase
            .from("profiles")
            .select("interests")
            .eq("id", user.id)
            .single()
        currentUserInterests = myProfile?.interests ?? []
    }

    let availableChapters: { id: string; name: string; school_name: string }[] = []
    if (isOwnProfile && !profile.chapter_id) {
        const { data: chapters } = await supabase
            .from("chapters")
            .select("id, name, school_name")
            .eq("status", "Active")
            .order("name")
        availableChapters = chapters ?? []
    }

    return (
        // No min-h-svh/bg-background here — (main)/layout.tsx already sets both,
        // and its px-4 py-6 is the gutter. Extra padding only at sm+.
        <div className="max-w-2xl mx-auto sm:px-2 sm:py-6">
            <ProfileView
                profile={{ ...profile, email }}
                isOwnProfile={isOwnProfile}
                userId={user?.id ?? null}
                currentUserInterests={currentUserInterests}
                availableChapters={availableChapters}
            />
        </div>
    )
}