import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

/**
 * Service-role client — bypasses RLS. Server-only: never import this from a
 * `"use client"` component. `SUPABASE_SERVICE_ROLE_KEY` lives in the Vercel
 * environment and is absent from `.env.local`, so callers fail locally unless
 * it is added.
 */
export function createSupabaseAdminClient() {
    return createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )
}
