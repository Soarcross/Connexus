import { createSupabaseServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { ProfileView } from "@/app/components/profile/profile-view"
import { LockedPage } from "@/app/components/layout/locked-page"
import { formatFullName } from "@/lib/name-validation"

type Props = {
    params: Promise<{ id: string }>
}

export default async function ProfilePage({ params }: Props) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    // get the logged in user so we know if this is their own profile
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
            <LockedPage
                variant="profile"
                title="This profile is for members"
                description="Create a free account to view member profiles and connect."
            />
        )
    }

    // get the profile being viewed
    let { data: profile, error } = await supabase
        .from("profiles")
        .select("*, chapters(name, school_name)")
        .eq("id", id)
        .single()

    // A signed-in user with no profiles row (the on-signup trigger should
    // always create one, but see auth/callback/route.ts for why it sometimes
    // doesn't) used to hard-404 here with no way back in. Self-heal only for
    // the viewer's own missing profile -- another user's missing row still
    // 404s, since that's a real "doesn't exist" case, not a recoverable one.
    if ((error || !profile) && user?.id === id) {
        const rawName = user.user_metadata?.full_name ?? user.email ?? "New User"
        const { data: created } = await supabase
            .from("profiles")
            .insert({
                id: user.id,
                // OAuth-provided names bypass the signup form's
                // validateFullName/formatFullName step entirely, so this is
                // the only normalization they ever get.
                full_name: formatFullName(rawName) || rawName,
            })
            .select("*, chapters(name, school_name)")
            .single()
        profile = created
        error = null
    }

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