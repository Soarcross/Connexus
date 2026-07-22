import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase"; // adjust path if needed
import { ROOT_DOMAIN } from "@/lib/chapter-shared";

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
    // ".stuyconnections.com") so a session survives moving between chapters
    // -- set this no broader than the root domain itself, never a shared
    // parent domain outside this app's control, or it becomes a cross-host
    // "supercookie". Defaults to ROOT_DOMAIN (lib/chapter-shared.ts) in
    // production so it tracks the same domain automatically; never applied
    // in dev, since setting a cookie's Domain to anything other than the
    // exact host (localhost) makes the browser reject it outright. Override
    // with NEXT_PUBLIC_COOKIE_DOMAIN only if the cookie domain needs to
    // differ from the subdomain-routing root domain.
    const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN
        ?? (process.env.NODE_ENV === "production" ? ROOT_DOMAIN : undefined);

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