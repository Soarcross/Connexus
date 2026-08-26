// The one place to change when the domain changes. Currently hsconnexus.com.
// Override per-environment via NEXT_PUBLIC_ROOT_DOMAIN in Vercel without
// touching code.
//
// (The chapter subdomain machinery that used to live here was retired when all
// chapters moved onto the single root domain; only the cookie scope needs the
// root domain now — see lib/supabase/cookie-domain.ts.)
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "hsconnexus.com"
