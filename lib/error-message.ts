/**
 * Human-readable message for anything a `catch` receives.
 *
 * Supabase/PostgREST errors are plain objects carrying `message`, not `Error`
 * instances, so the common `err instanceof Error ? err.message : fallback`
 * pattern swallowed every RLS, trigger and CHECK rejection into the fallback.
 */
export function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message
    if (err && typeof err === "object" && "message" in err) {
        const message = (err as { message?: unknown }).message
        if (typeof message === "string" && message) return message
    }
    return fallback
}
