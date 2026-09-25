import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { ARCHIVE_WINDOW_DAYS, getPurgeCutoff, ownedPostImagePath } from "@/lib/lifecycle"

export const dynamic = "force-dynamic"

/**
 * Permanently deletes posts and opportunities whose archive window has closed.
 *
 * Scheduled daily by `vercel.json`. Runs here rather than as a pure SQL function
 * because post images must be removed from the `post-images` bucket, which
 * Postgres cannot do. Deleting the rows cascades to their extension_requests.
 *
 * Guarded by CRON_SECRET, which Vercel Cron sends as a bearer token.
 */
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const cutoff = getPurgeCutoff()
    const errors: string[] = []

    // --- Community posts -----------------------------------------------------
    // Skip anything with a Pending extension request so an author who asked in
    // time is not purged while waiting on an admin.
    const { data: pendingRequests, error: pendingError } = await supabase
        .from("extension_requests")
        .select("post_id, opportunity_id")
        .eq("status", "Pending")
    if (pendingError) {
        // Without the reprieve list every expired item with a waiting request
        // would be hard-deleted. Purging a day late is harmless; this is not.
        console.error("purge-expired aborted: could not load pending requests", pendingError)
        return NextResponse.json(
            { cutoff, errors: [`pending requests: ${pendingError.message}`] },
            { status: 500 }
        )
    }

    const reprievedPosts = new Set(
        (pendingRequests ?? []).map(r => r.post_id).filter(Boolean) as string[]
    )
    const reprievedOpportunities = new Set(
        (pendingRequests ?? []).map(r => r.opportunity_id).filter(Boolean) as string[]
    )

    const { data: expiredPosts, error: postSelectError } = await supabase
        .from("community_posts")
        .select("id, user_id, image_url")
        .lt("expires_at", cutoff)
    if (postSelectError) errors.push(`select posts: ${postSelectError.message}`)

    const postsToPurge = (expiredPosts ?? []).filter(p => !reprievedPosts.has(p.id))

    if (postsToPurge.length > 0) {
        const imagePaths = postsToPurge
            .map(p => ownedPostImagePath(p.image_url, p.user_id))
            .filter((path): path is string => Boolean(path))

        if (imagePaths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from("post-images")
                .remove(imagePaths)
            // A failed image delete must not block the row delete — the record
            // is what the retention promise is about. Orphans are reported.
            if (storageError) errors.push(`storage: ${storageError.message}`)
        }

        const { error: postDeleteError } = await supabase
            .from("community_posts")
            .delete()
            .in("id", postsToPurge.map(p => p.id))
        if (postDeleteError) errors.push(`delete posts: ${postDeleteError.message}`)
    }

    // --- Opportunities -------------------------------------------------------
    const { data: expiredOpportunities, error: oppSelectError } = await supabase
        .from("opportunities")
        .select("id")
        .lt("expires_at", cutoff)
    if (oppSelectError) errors.push(`select opportunities: ${oppSelectError.message}`)

    const opportunitiesToPurge = (expiredOpportunities ?? [])
        .filter(o => !reprievedOpportunities.has(o.id))

    if (opportunitiesToPurge.length > 0) {
        const { error: oppDeleteError } = await supabase
            .from("opportunities")
            .delete()
            .in("id", opportunitiesToPurge.map(o => o.id))
        if (oppDeleteError) errors.push(`delete opportunities: ${oppDeleteError.message}`)
    }

    const result = {
        cutoff,
        archiveWindowDays: ARCHIVE_WINDOW_DAYS,
        postsPurged: postsToPurge.length,
        opportunitiesPurged: opportunitiesToPurge.length,
        reprieved: reprievedPosts.size + reprievedOpportunities.size,
        errors,
    }

    if (errors.length > 0) {
        console.error("purge-expired completed with errors", result)
        return NextResponse.json(result, { status: 500 })
    }

    return NextResponse.json(result)
}
