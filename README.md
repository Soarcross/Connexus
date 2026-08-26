# Connexus

A multi-school networking platform organized into per-school "chapters": profiles, a people directory, opportunities, a moderated community board, direct messaging, and a public chapter-application flow for schools that want to join. Built with Next.js 16 (App Router) + React 19, Tailwind v4, shadcn/ui, and Supabase (auth, Postgres, storage, realtime), deployed on Vercel.

## Getting Started

```bash
npm install
npm run dev      # dev server on :3000
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, powers the privileged routes under `app/api/admin/`), and `SUPABASE_ACCESS_TOKEN` (an account-scoped Supabase CLI credential, broader than this one project — handle with care). The file is gitignored and has never been committed. There's no staging database — the Supabase project is production.

Other commands:

```bash
npm run build    # production build
npm run lint     # eslint (flat config)
npx tsc --noEmit # typecheck
```

There is no test framework in this project.

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for a full architecture and conventions reference: auth gating, the chapter-subdomain routing (`proxy.ts`), Supabase client usage, the community post and chapter-application lifecycles, and the database schema.

## Deploy

Deployed on [Vercel](https://vercel.com). Chapter subdomains are resolved per-request via `proxy.ts` and forwarded as an `x-chapter-slug` header.
