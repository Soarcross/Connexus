import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const next = searchParams.get("next")

    if (code) {
        const supabase = await createSupabaseServerClient()
        await supabase.auth.exchangeCodeForSession(code)

        // if there's a next param (e.g. password reset) redirect there
        if (next) {
            return NextResponse.redirect(`${origin}${next}`)
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("grad_year, interests")
                .eq("id", user.id)
                .single()

            if (!profile?.grad_year || !(profile as any)?.interests?.length) {
                return NextResponse.redirect(`${origin}/profile/${user.id}`)
            }

            return NextResponse.redirect(`${origin}/`)
        }
    }

    return NextResponse.redirect(`${origin}/login`)
}