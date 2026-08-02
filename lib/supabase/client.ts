"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { resolveCookieDomain } from "@/lib/supabase/cookie-domain";

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

    // Derived from the real hostname, not NODE_ENV — see cookie-domain.ts.
    // A preview build is NODE_ENV=production but is not under ROOT_DOMAIN, and
    // a cookie scoped to a domain the host is not under is silently dropped.
    const cookieDomain = resolveCookieDomain(window.location.hostname);

    client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
    });
    return client;
}