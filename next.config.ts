import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent this app from being framed by other origins (clickjacking).
  // DENY is intentionally stricter than SAMEORIGIN -- no legitimate flow
  // here embeds the app in an iframe, including from our own subdomains.
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // Stop browsers from MIME-sniffing a response away from its declared
  // Content-Type (e.g. treating an uploaded avatar/post-image as script).
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Send the full referrer only to our own origin; cross-origin navigations
  // (e.g. clicking an opportunity link) get origin-only, and downgrades
  // (https -> http) get nothing.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Disable browser features this app never uses.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },

  // --- Content-Security-Policy: deliberately NOT enabled yet. ---
  // This app combines several things a CSP must account for correctly, and
  // shipping a wrong one silently breaks the app (blank pages, no auth,
  // no realtime) rather than failing loudly:
  //   - Supabase JS client: fetches to NEXT_PUBLIC_SUPABASE_URL (https:) AND
  //     a websocket to the same host over wss: for Realtime
  //     (chat-window.tsx, navbar.tsx unread badge).
  //   - next-themes: injects an inline <script> before hydration to set the
  //     theme class and avoid a flash-of-wrong-theme; needs either
  //     'unsafe-inline' or a nonce/hash in script-src.
  //   - Tailwind v4 / shadcn/ui: relies on inline style attributes in
  //     places; a strict style-src without 'unsafe-inline' (or per-style
  //     nonces, which Tailwind's runtime output doesn't support out of the
  //     box) can break styling.
  //   - Vercel Analytics + Speed Insights: load a script from the app's own
  //     origin (/_vercel/insights/script.js, /_vercel/speed-insights/script.js)
  //     and beacon collected data back to Vercel's collection endpoints.
  //
  // The template below is a reasonable starting point once each of these
  // has been verified against the live app (dev server + browser console
  // for CSP violation reports) -- do not enable it on faith. Replace
  // <YOUR_SUPABASE_PROJECT>.supabase.co with the actual project ref from
  // NEXT_PUBLIC_SUPABASE_URL.
  //
  // {
  //   key: "Content-Security-Policy",
  //   value: [
  //     "default-src 'self'",
  //     "script-src 'self' 'unsafe-inline'", // next-themes inline bootstrap script
  //     "style-src 'self' 'unsafe-inline'",  // Tailwind/shadcn inline styles
  //     "img-src 'self' data: blob: https://*.supabase.co", // avatars/post-images buckets
  //     "font-src 'self' data:",
  //     "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
  //     "frame-ancestors 'none'",
  //     "base-uri 'self'",
  //     "form-action 'self'",
  //   ].join("; "),
  // },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
