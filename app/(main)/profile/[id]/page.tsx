import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { notFound } from "next/navigation"
import { ProfileView } from "@/app/components/profile/profile-view"

type Props = {
    params: Promise<{ id: string }>
}

export default async function ProfilePage({ params }: Props) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // get the logged in user so we know if this is their own profile
    const { data: { user } } = await supabase.auth.getUser()

    // get the profile being viewed
    const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single()

    // if profile doesn't exist show 404
    if (error || !profile) {
        notFound()
    }

    // fetch the email of the profile being viewed from auth.users
    const { data: { user: profileUser } } = await supabaseAdmin.auth.admin.getUserById(id)

    const isOwnProfile = user?.id === profile.id

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

    return (
        <div className="min-h-svh bg-background">
            <div className="max-w-2xl mx-auto px-6 py-12">
                <ProfileView
                    profile={{ ...profile, email: profileUser?.email ?? null }}
                    isOwnProfile={isOwnProfile}
                    userId={user?.id ?? null}
                    currentUserInterests={currentUserInterests}
                />
            </div>
        </div>
    )
}