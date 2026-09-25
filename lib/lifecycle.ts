/**
 * Shared expiration lifecycle for community posts and opportunities.
 *
 * The entire state machine is derived from a single `expires_at` timestamp, so
 * there is no second column to drift out of sync and granting an extension
 * automatically un-archives the item and resets its purge clock.
 *
 *   expires_at IS NULL                              -> active   (never expires)
 *   now <  expires_at                               -> active   (publicly visible)
 *   expires_at <= now < expires_at + 10 days        -> archived (author + admins only)
 *   now >= expires_at + 10 days                     -> purgeable (hard-deleted by cron)
 *
 * To extend the lifecycle to another table, give it an `expires_at` column and
 * reuse these helpers plus the components in `app/components/lifecycle/`.
 */

export const ARCHIVE_WINDOW_DAYS = 10
export const EXTENSION_DAYS = 30

/** Show an "expiring soon" badge once an active item is inside this window. */
export const EXPIRING_SOON_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export type LifecycleState = "active" | "archived" | "purgeable"

/** Tables participating in the lifecycle. */
export type LifecycleEntity = "post" | "opportunity"

export function getLifecycleState(
    expiresAt: string | null,
    now: number = Date.now()
): LifecycleState {
    if (!expiresAt) return "active"
    const expiry = new Date(expiresAt).getTime()
    if (Number.isNaN(expiry)) return "active"
    if (now < expiry) return "active"
    if (now < expiry + ARCHIVE_WINDOW_DAYS * DAY_MS) return "archived"
    return "purgeable"
}

/** Whole days until the item leaves the public feed. Null when it never expires. */
export function getDaysLeft(expiresAt: string | null): number | null {
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / DAY_MS))
}

/** The moment an archived item becomes eligible for permanent deletion. */
export function getPurgeDate(expiresAt: string | null): Date | null {
    if (!expiresAt) return null
    return new Date(new Date(expiresAt).getTime() + ARCHIVE_WINDOW_DAYS * DAY_MS)
}

/** Whole days until permanent deletion. Null when the item never expires. */
export function getDaysUntilPurge(expiresAt: string | null): number | null {
    const purgeDate = getPurgeDate(expiresAt)
    if (!purgeDate) return null
    return Math.max(0, Math.ceil((purgeDate.getTime() - Date.now()) / DAY_MS))
}

/**
 * The new `expires_at` after granting an extension.
 *
 * Counts from whichever is later — now or the current expiry — so extending an
 * archived item revives it for a full month, while extending an item that is
 * still weeks out adds to it rather than shortening it.
 */
export function extendedExpiry(expiresAt: string | null): string {
    const base = expiresAt ? new Date(expiresAt).getTime() : Date.now()
    const from = Math.max(Date.now(), Number.isNaN(base) ? Date.now() : base)
    return new Date(from + EXTENSION_DAYS * DAY_MS).toISOString()
}

/**
 * `expires_at` for a newly created post or opportunity.
 *
 * An author-supplied deadline wins when it falls inside the default window, so
 * an item stops being public the moment it is no longer actionable. Without a
 * deadline (or with one further out) the standard 30-day window applies.
 */
export function initialExpiry(deadline: string | null | undefined): string {
    const standard = Date.now() + EXTENSION_DAYS * DAY_MS
    if (!deadline) return new Date(standard).toISOString()

    const parsed = new Date(deadline).getTime()
    if (Number.isNaN(parsed)) return new Date(standard).toISOString()

    return new Date(Math.min(parsed, standard)).toISOString()
}

/** Timestamp before which an item is eligible for permanent deletion. */
export function getPurgeCutoff(now: number = Date.now()): string {
    return new Date(now - ARCHIVE_WINDOW_DAYS * DAY_MS).toISOString()
}

/**
 * Storage path of a post's image inside the `post-images` bucket, or null
 * unless that path sits in the author's own `${userId}/` folder.
 *
 * `image_url` was client-supplied on insert, so a post could name another
 * user's image; the purge cron removes paths with the service role, which no
 * bucket policy restrains. Only ever delete what the author could have uploaded.
 */
export function ownedPostImagePath(imageUrl: string | null, userId: string | null): string | null {
    if (!imageUrl || !userId) return null
    const parts = imageUrl.split("/post-images/")
    if (parts.length !== 2) return null
    const path = parts[1]
    const segments = path.split("/")
    if (segments.length !== 2 || segments[0] !== userId || !segments[1]) return null
    if (/[?#]|\.\./.test(segments[1])) return null
    return path
}

/** The embeds an extension request row carries, whichever dashboard loaded it. */
export type ExtensionRequestTargetRow = {
    post_id: string | null
    opportunity_id: string | null
    community_posts: { title: string; expires_at?: string | null } | null
    opportunities: { title: string; expires_at?: string | null } | null
}

/** Resolves which table an extension request points at, plus its current expiry. */
export function getExtensionTarget(req: ExtensionRequestTargetRow):
    | { entity: LifecycleEntity; id: string; title: string; expiresAt: string | null }
    | null {
    if (req.post_id) {
        return {
            entity: "post",
            id: req.post_id,
            title: req.community_posts?.title ?? "Untitled post",
            expiresAt: req.community_posts?.expires_at ?? null,
        }
    }
    if (req.opportunity_id) {
        return {
            entity: "opportunity",
            id: req.opportunity_id,
            title: req.opportunities?.title ?? "Untitled opportunity",
            expiresAt: req.opportunities?.expires_at ?? null,
        }
    }
    return null
}

/**
 * PostgREST `.or()` filter matching publicly visible (non-archived) rows.
 * Usage: `query.or(activeFilter())`
 */
export function activeFilter(): string {
    return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
}

/**
 * PostgREST `.or()` filter excluding rows already past the purge cutoff, so a
 * row awaiting the next cron run is never rendered.
 */
export function notPurgedFilter(): string {
    return `expires_at.is.null,expires_at.gt.${getPurgeCutoff()}`
}
