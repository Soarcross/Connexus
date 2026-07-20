import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const ROLES = ["Student", "Teacher", "Alum", "Parent"]
const MAX_LEN = 2000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const {
        applicant_name,
        applicant_email,
        applicant_role,
        school_name,
        city,
        state,
        motivation,
        website, // honeypot — real users never see or fill this field
    } = body ?? {}

    // Bots that fill hidden fields get a fake success with no insert.
    if (typeof website === "string" && website.trim().length > 0) {
        return NextResponse.json({ success: true })
    }

    if (
        typeof applicant_name !== "string" || !applicant_name.trim() ||
        typeof applicant_email !== "string" || !applicant_email.trim() ||
        typeof school_name !== "string" || !school_name.trim() ||
        typeof motivation !== "string" || !motivation.trim()
    ) {
        return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 })
    }

    if (!EMAIL_PATTERN.test(applicant_email.trim())) {
        return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
    }

    // check the trimmed lengths — these are what actually get stored, so a
    // whitespace-padded field shouldn't be rejected as "too long" when the
    // real, saved value fits comfortably under the cap.
    const trimmedName = applicant_name.trim()
    const trimmedEmail = applicant_email.trim()
    const trimmedSchool = school_name.trim()
    const trimmedMotivation = motivation.trim()

    if (
        trimmedName.length > 200 ||
        trimmedEmail.length > 200 ||
        trimmedSchool.length > 200 ||
        trimmedMotivation.length > MAX_LEN
    ) {
        return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 })
    }

    const role = ROLES.includes(applicant_role as string) ? applicant_role as string : "Student"

    const supabase = await createSupabaseServerClient()

    const { error } = await supabase
        .from("chapter_applications")
        .insert({
            applicant_name: trimmedName,
            applicant_email: trimmedEmail,
            applicant_role: role,
            school_name: trimmedSchool,
            city: typeof city === "string" && city.trim() ? city.trim() : null,
            state: typeof state === "string" && state.trim() ? state.trim() : null,
            motivation: trimmedMotivation,
        })
    // No .select() here: chapter_applications has no SELECT policy for anon,
    // and PostgREST's RETURNING (added by .select()) is checked against SELECT
    // policies even on INSERT, so requesting it back would reject the whole
    // insert with an RLS violation instead of just omitting the response body.

    if (error) {
        // the unique index on (lower(applicant_email)) where status='Pending' surfaces as a conflict
        if (error.code === "23505") {
            return NextResponse.json(
                { error: "You already have a pending application with this email." },
                { status: 409 }
            )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
