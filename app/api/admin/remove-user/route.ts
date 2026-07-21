import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
    userId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
    // verify the caller is an admin
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    let json: unknown
    try {
        json = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }
    const { userId } = parsed.data

    if (userId === user.id) {
        return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 })
    }

    // use service role to delete from auth (cascades to profiles)
    const supabaseAdmin = createSupabaseAdminClient()

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
        console.error("remove-user: failed to delete user", error)
        return NextResponse.json({ error: "Failed to remove user." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
