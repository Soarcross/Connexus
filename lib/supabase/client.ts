"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { ROOT_DOMAIN } from "@/lib/chapter-shared";

let client: SupabaseClient<Database> | null = null;

export function getSupaBrowserClient(): SupabaseClient<Database> {
    if (client) {
        return client;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
        );
    }

    // see lib/supabase/server.ts for why this is set, the constraint on how
    // broad it may safely be, and why the ROOT_DOMAIN default is production-only
    const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN
        ?? (process.env.NODE_ENV === "production" ? ROOT_DOMAIN : undefined);

    client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
    });
    return client;
}