import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")

    if (code) {
        const supabase = await createSupabaseServerClient()
        await supabase.auth.exchangeCodeForSession(code)

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("grad_year, interests")
                .eq("id", user.id)
                .single()

            // incomplete profile → go to profile page to fill it out
            if (!profile?.grad_year || !profile?.interests?.length) {
                return NextResponse.redirect(`${origin}/profile/${user.id}`)
            }

            // complete profile → go to home
            return NextResponse.redirect(`${origin}/`)
        }
    }

    // something went wrong → back to login
    return NextResponse.redirect(`${origin}/login`)
}