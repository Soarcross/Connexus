import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")

    if (code) {
        const supabase = await createSupabaseServerClient()
        await supabase.auth.exchangeCodeForSession(code)

        // get the logged in user
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            // check if they have a profile with grad_year filled in
            // if not, they're a new user and need to complete onboarding
            const { data: profile } = await supabase
                .from("profiles")
                .select("grad_year")
                .eq("id", user.id)
                .single()

            if (!profile?.grad_year) {
                return NextResponse.redirect(`${origin}/onboarding`)
            }
        }
    }

    // existing users go straight to the feed
    return NextResponse.redirect(`${origin}/`)
}