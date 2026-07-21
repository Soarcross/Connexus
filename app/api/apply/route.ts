import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const ROLES = ["Student", "Teacher", "Alum", "Parent"]
const MAX_LEN = 2000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The four required fields: zod enforces they're present, are strings, and
// non-empty after trimming -- a single source of truth for the same
// "required field" bucket the hand-rolled checks used to guard one by one.
const requiredFieldsSchema = z.object({
    applicant_name: z.string().trim().min(1),
    applicant_email: z.string().trim().min(1),
    school_name: z.string().trim().min(1),
    motivation: z.string().trim().min(1),
})

export async function POST(req: NextRequest) {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
    const { applicant_role, city, state, website } = record // website is a honeypot — real users never see or fill this field

    // Bots that fill hidden fields get a fake success with no insert. This is
    // checked before any other validation so a bot that also mangles the
    // other fields still gets the same fake success, not a validation error
    // that would reveal the honeypot's existence.
    if (typeof website === "string" && website.trim().length > 0) {
        return NextResponse.json({ success: true })
    }

    const supabase = await createSupabaseServerClient()

    // Rate limit before doing any real work. This endpoint is unauthenticated
    // and writes a row, so without a limit anyone can flood chapter_applications
    // (and the admin review queue) indefinitely. Keyed by client IP: 3 attempts
    // per hour is far above what a genuine applicant needs and far below what a
    // script needs to be useful.
    //
    // Placed AFTER the honeypot so a caught bot still gets the same fake
    // success and learns nothing, but BEFORE validation so malformed spam
    // costs us nothing. Fails OPEN: if the limiter itself errors we would
    // rather accept a legitimate application than hard-fail the public form.
    //
    // The RPC runs through the service-role client, not the anon one:
    // check_rate_limit writes a row on every call, so it is deliberately not
    // granted to anon/authenticated (a public limiter is its own abuse vector
    // -- unbounded distinct keys would bloat the table). This is a route
    // handler under app/api/, which is the one place the admin client belongs.
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const { data: withinLimit, error: rateLimitError } = await createSupabaseAdminClient().rpc("check_rate_limit", {
        p_key: `apply:${clientIp}`,
        p_max_hits: 3,
        p_window_seconds: 3600,
    })
    if (rateLimitError) {
        console.error("apply: rate limit check failed, allowing request", rateLimitError)
    } else if (withinLimit === false) {
        return NextResponse.json(
            { error: "Too many applications from this network. Please try again later." },
            { status: 429 }
        )
    }

    const parsed = requiredFieldsSchema.safeParse(record)
    if (!parsed.success) {
        return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 })
    }

    const {
        applicant_name: trimmedName,
        applicant_email: trimmedEmail,
        school_name: trimmedSchool,
        motivation: trimmedMotivation,
    } = parsed.data

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
        return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
    }

    // check the trimmed lengths — these are what actually get stored, so a
    // whitespace-padded field shouldn't be rejected as "too long" when the
    // real, saved value fits comfortably under the cap.
    if (
        trimmedName.length > 200 ||
        trimmedEmail.length > 200 ||
        trimmedSchool.length > 200 ||
        trimmedMotivation.length > MAX_LEN
    ) {
        return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 })
    }

    const role = ROLES.includes(applicant_role as string) ? applicant_role as string : "Student"

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
        console.error("apply: failed to insert chapter application", error)
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
