import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { OnboardingForm } from "@/app/components/onboarding-form"

export default async function OnboardingPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

    return (
        <div className="min-h-svh bg-background">
            <div className="max-w-2xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="flex flex-col items-center gap-2 text-center mb-10">
                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                        <div className="size-6 rounded-md bg-primary" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Welcome to Stuy Connections
                    </h1>
                    <p className="text-muted-foreground text-sm max-w-sm">
                        Let&apos;s set up your profile so others can find and connect with you.
                    </p>
                </div>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2 mb-10">
                    <div className="h-1.5 w-16 rounded-full bg-primary" />
                    <div className="h-1.5 w-16 rounded-full bg-muted" />
                    <div className="h-1.5 w-16 rounded-full bg-muted" />
                </div>

                <OnboardingForm user={user} profile={profile} />
            </div>
        </div>
    )
}