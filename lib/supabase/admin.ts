import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Service-role client for privileged server-only operations (admin routes).
// SUPABASE_SERVICE_ROLE_KEY is never exposed to the browser -- only present
// in Vercel's environment, not in .env.local (see CLAUDE.md).
export function createSupabaseAdminClient() {
    return createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}
