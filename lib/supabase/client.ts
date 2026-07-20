"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

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

    // see lib/supabase/server.ts for why this is set, and the constraint on
    // how broad it may safely be
    const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

    client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
    });
    return client;
}