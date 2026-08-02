import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/types/supabase"; // adjust path if needed
import { resolveCookieDomain } from "@/lib/supabase/cookie-domain";

function getEnvironmentVariables() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
        );
    }

    return { supabaseUrl, supabaseAnonKey };
}

export async function createSupabaseServerClient() {
    const { supabaseUrl, supabaseAnonKey } = getEnvironmentVariables();
    const cookieStore = await cookies();
    // Deliberately shared across every chapter subdomain (e.g.
    // ".stuyconnections.com") so a session survives moving between chapters.
    // Resolved from the request's own Host header rather than NODE_ENV, so
    // that hosts outside the root domain -- preview deployments, localhost --
    // get a host-only cookie instead of one the browser will discard. See
    // lib/supabase/cookie-domain.ts.
    const cookieDomain = resolveCookieDomain((await headers()).get("host"));

    return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookieOptions: cookieDomain ? { domain: cookieDomain } : undefined,
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    );
                } catch (error) {
                    // Expected here: cookies can only be modified in a Server
                    // Action or Route Handler, and setAll() is also invoked
                    // from plain Server Component renders where writes are a
                    // no-op. Session refresh is handled by proxy.ts, so this
                    // is safe to ignore; only log in development to avoid
                    // spamming production logs with a benign, expected error.
                    if (process.env.NODE_ENV === "development") {
                        console.log(error);
                    }
                }
            },
        },
    });
}