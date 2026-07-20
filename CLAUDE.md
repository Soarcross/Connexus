# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server on :3000
npm run build    # production build
npm run lint     # eslint (flat config; bare `eslint`, no target args)
npx tsc --noEmit # typecheck — nothing else runs it
```

There is no test framework in this project.

`npm run lint` is red on a clean checkout: 57 errors / 14 warnings, of which 49 are `@typescript-eslint/no-explicit-any` from the `as any` casts described below, plus `Parsing error: File appears to be binary` on `types/supabase.ts`. Judge your changes against that baseline rather than expecting a clean run.

Regenerate database types after any schema change in the Supabase dashboard:

```bash
npx supabase gen types --linked > types/supabase.ts
```

That redirect writes UTF-16 under PowerShell, which is why ESLint calls the file binary and why `grep`/`Grep` silently match nothing inside it. Read it with the Read tool, or search it from PowerShell (`Get-Content -Raw` + `-match`).

## Architecture

Next.js 16 App Router + React 19, Tailwind v4, shadcn/ui (`radix-vega` style, components in `app/components/ui`), Supabase for auth/Postgres/storage/realtime, deployed on Vercel. It's High School Connections: a multi-school networking platform organized into per-school "chapters" (profiles, a people directory, opportunities, a moderated community board, direct messaging, plus a public chapter-application flow), originally built single-tenant for Stuyvesant only and rebuilt for multi-chapter in 2026-07 — the backfilled Stuyvesant data now just lives as the `stuy` chapter like any other.

**Auth gating lives in `app/(main)/layout.tsx`, not `proxy.ts`.** `proxy.ts` (this project's Next 16.2+ `middleware.ts` replacement — the file convention was renamed upstream; keep the export named `proxy`, not `middleware`) only resolves which chapter subdomain a request came from and forwards it as an `x-chapter-slug` header; it does **not** gate auth. The actual gate is `app/(main)/layout.tsx`, which calls `supabase.auth.getUser()` server-side and redirects to `/login`, protecting every route inside the `(main)` group. Public routes are the ones deliberately placed outside it: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, and the `(marketing)` route group (public landing at `/`, `/apply`). Adding a page under `(main)` makes it authed; adding one outside it makes it public. The authed home page lives at `/home`, not `/` — `/` is the public marketing landing (`app/(marketing)/page.tsx`), which redirects an already-logged-in visitor to `/home`.

`lib/chapter.ts` reads that `x-chapter-slug` header (`getChapterSlug()`) and resolves it to a `chapters` row (`getCurrentChapter()`) — use this, not ad-hoc header reads, anywhere server code needs "which chapter is this request for."

`app/auth/callback/route.ts` exchanges the OAuth/email code for a session, backfills `profiles.chapter_id` from the request's chapter subdomain if the profile doesn't have one yet (covers Google OAuth, which can't carry the custom signup metadata email/password signup uses), and doubles as the onboarding gate: a user missing `grad_year` or `interests` is redirected to their own `/profile/[id]` instead of `/home`.

**Two Supabase clients, and the choice is not interchangeable:**
- `lib/supabase/server.ts` → `createSupabaseServerClient()` is async, reads cookies per request, for server components and route handlers.
- `lib/supabase/client.ts` → `getSupaBrowserClient()` is a module-level singleton for `"use client"` components.
- `lib/supabase/admin.ts` → `createSupabaseAdminClient()` is the shared service-role factory for privileged route handlers only (never import this outside `app/api/`).

Both the server and browser clients set `cookieOptions.domain` from `NEXT_PUBLIC_COOKIE_DOMAIN` so a session survives moving between chapter subdomains — never set that env var broader than this app's own root domain, or it becomes a cross-host cookie.

**Data flow:** server component pages under `app/(main)/` do the reads (including PostgREST embeds like `.select("*, profiles(...)")`) and pass plain data as props into a sibling client component (`*-client.tsx`, `posts-feed.tsx`, `chat-window.tsx`, …), which owns interactivity and does its own writes through the browser client. Row-level security is the real authorization boundary; the client-side writes rely on it — this matters even more now that RLS also enforces chapter scoping (see Conventions).

**Admin** is a `profiles.is_admin` boolean (platform-wide), re-checked server-side in `app/(main)/admin/page.tsx` (redirects to `/home`) and again in the two privileged API routes under `app/api/admin/`: `remove-user/route.ts` (deletes a user via `auth.admin.deleteUser`, cascades to `profiles`) and `approve-chapter/route.ts` (creates a `chapters` row from an approved `chapter_applications` row, invites the applicant by email, then explicitly elevates their `profiles.chapter_role` to `'chapter_admin'` — see the chapter-admin note below on why that elevation must never come from signup metadata). Both routes use `createSupabaseAdminClient()`. `SUPABASE_SERVICE_ROLE_KEY` is server-only and is not in `.env.local` — it lives in the Vercel environment, so these routes fail locally unless you add it. `.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Chapter admin** is a separate, narrower `profiles.chapter_role` ('member' | 'chapter_admin') scoped to one chapter, with its own smaller dashboard at `/chapter-admin` (`app/components/chapter-admin/chapter-admin-dashboard.tsx`) — moderates only that chapter's posts/extension-requests/opportunities, gated by RLS rather than by re-fetching everything the platform-admin dashboard fetches. **`chapter_role` must never be trusted from client-supplied signup/invite metadata** (`raw_user_meta_data`) — both the signup form and the invite call can be forged by any anon caller, so the DB's new-user trigger only ever copies `chapter_id` from metadata, never `chapter_role`; the only path that elevates a profile to `chapter_admin` is the explicit, already-admin-gated service-role `UPDATE` in `approve-chapter/route.ts`, run after the invite succeeds.

**Realtime** uses `postgres_changes` channels in exactly two places: `chat-window.tsx` (INSERTs on `messages`, per-conversation channel) and `navbar.tsx` (INSERT/UPDATE on `messages`, driving the unread badge). Both clean up with `removeChannel` on unmount.

**Community post lifecycle** is the one non-obvious domain rule. Posts carry `status` of `"Pending" | "Approved" | "Rejected"` (plain text columns, not Postgres enums) plus `rejection_reason`, and a required `chapter_id`; the community feed shows only `Approved` posts within the viewer's own chapter, though authors always see their own via a separate query. Posts also carry `expires_at` (30 days out). An author can file an `extension_requests` row against a post; when an admin (platform or chapter) approves it, the dashboard bumps the post's `expires_at` by another 30 days. A `delete_expired_posts` Postgres function handles cleanup DB-side.

**Chapter application lifecycle:** a public visitor files a `chapter_applications` row via `/apply` → `app/api/apply/route.ts` (anon insert, RLS restricts it to `status='Pending', chapter_id=null, rejection_reason=null`, plus a honeypot field and DB-level length checks). A platform admin reviews it in the admin dashboard's Chapters tab; approving calls `approve-chapter/route.ts`, which atomically claims the application (`UPDATE ... WHERE status='Pending'`, closing a double-approve race), creates the `chapters` row, and invites the applicant as that chapter's `chapter_admin`.

### Database

The schema lives only in the remote Supabase project — `supabase/sql/001_chapters.sql` is the one committed migration (everything before it was applied by hand and was never captured; anything after it should get its own numbered file in that directory) — so `types/supabase.ts` is the de facto schema reference for anything not in that file.

Tables: `profiles` (now with `chapter_id`, `chapter_role`), `community_posts` (now with required `chapter_id`), `extension_requests`, `opportunities` (now with nullable `chapter_id` — null means national, visible to every chapter), `conversations`, `messages`, `contact_submissions`, `team_members`, `partners`, `about_content`, `chapters`, `chapter_applications`. Views (read-only, feeding the admin Recharts graphs): `messages_per_day`, `users_per_day`. Storage buckets: `avatars` and `post-images`, both keyed by `${userId}/...` paths.

## Conventions

- Path alias is `@/*` from the repo root. Components live under `app/components/`, so imports read `@/app/components/...` — **not** the `@/components` alias that `components.json` advertises. Follow the existing imports; `shadcn add` will need its output moved.
- Existing code casts Supabase results and mutation payloads through `as any` liberally (heavily in `admin-dashboard.tsx`, and in the layout/page files). The generated types are complete and current, so prefer typed access in new code rather than propagating the casts.
- Several pages pair a server page with a decorative full-bleed canvas/animation client component (`particle-background`, `symbol-rain`, `aurora-background`, `constellation-background`, `wireframe-globe`, `geo-background`). These are per-page visual identity, not shared infrastructure.
- Theming is `next-themes` via `app/components/theme-provider.tsx`, with `suppressHydrationWarning` on `<html>`/`<body>` in the root layout — keep both when touching that file.
- Dynamic APIs are async in this Next.js version: `params` and `searchParams` are Promises and must be awaited, as must `cookies()`.
- **Never fall back to `?? ""` when a value feeds a `uuid`-typed column or filter** (e.g. `.eq("chapter_id", x ?? "")`, `.or(\`chapter_id.eq.${x ?? ""}\`)`). PostgREST/Postgres reject an empty string as an invalid uuid literal — this doesn't quietly match zero rows, it errors, and since most query destructuring here only reads `{ data }` and ignores `error`, the failure just looks like an empty result. Branch on whether the id is known instead (see `app/(main)/opportunities/page.tsx` or `app/(main)/home/page.tsx` for the pattern).
- **A query that scopes data to "your chapter by default, all chapters on request" must not fetch the unscoped version server-side "just in case."** The people directory used to fetch every chapter's full profile list on every page load and filter client-side for display only — RLS allowed it, so it wasn't a policy bug, but it meant every visitor's browser received the whole platform's user PII regardless of whether they ever touched the toggle. The scoped fetch is the default; the broader one is a separate, explicit fetch triggered by the user action that needs it (see `people-client.tsx`'s `handleToggleAllChapters`).

## Lessons from the multi-chapter build-out (2026-07)

- **Never let signup/invite metadata (`raw_user_meta_data`) set a privilege field.** `chapter_role` almost shipped as something the DB trigger copied straight from client-supplied metadata — since both real signups and Supabase invites populate that same metadata, any anon caller could have self-assigned `chapter_admin` on any chapter. Privilege elevation must always go through an already-privileged, server-verified code path (here: a service-role `UPDATE` inside an admin-gated route), never a value the requester supplied.
- **Copy-pasting a handler into a new file copies its bugs too.** `.eq("id", req.post_id ?? "")` (silently no-op-ing and still reporting success when `post_id` is null) was copied from the pre-existing platform-admin dashboard into the new chapter-admin dashboard without re-auditing it — turned out to need fixing in both places.
- **`types/supabase.ts` reverts to UTF-16 every time `npx supabase gen types` runs under PowerShell** (see Commands above) — re-convert it to UTF-8 after every regeneration; a previous fix does not stick.
- **Verify a subagent's finding against ground truth before acting on it.** A review agent, working from a narrower file list than it needed, flagged "no `middleware.ts` exists, so subdomain resolution may be a no-op" — `proxy.ts` (the renamed equivalent) did exist and did work; the finding was discarded after checking, not "fixed."
- Running parallel code-reviewer + QA subagents across a large feature's different areas (data/security layer, admin UI, user-facing scoping) caught real high-severity issues — the privilege-escalation path and the people-directory data leak above — that a single linear read-through missed. Worth the overhead specifically for security-sensitive, multi-file changes.
- This app has exactly one Supabase project and it's production — there is no staging DB. Any automated testing (QA subagents included) needs to be scoped to pure/isolated logic, never allowed to fire real requests at endpoints that write rows or send real invite emails.

## Lessons from debugging the chapter-application insert (2026-07)

- **`INSERT ... RETURNING` is checked against the table's `SELECT` policies, not just the `INSERT` policy's `WITH CHECK`.** `chapter_applications` has an anon `INSERT` policy but no `SELECT` policy for anon, so `app/api/apply/route.ts`'s `.insert({...}).select(...).single()` raised `42501: new row violates row-level security policy` and rolled back the *entire* insert — not a quiet empty result, a hard failure that undoes the write. Don't chain `.select()` after an insert unless the calling role actually has a matching `SELECT` policy; the fix here was simply dropping `.select()` since the returned value (`status_token`) wasn't consumed anywhere in the frontend.
- **The live DB's RLS policy can drift from the committed migration file.** `supabase/sql/001_chapters.sql`'s `chapter_applications` insert policy checks `rejection_reason is null`; the deployed policy (read via `pg_policy`) doesn't. Even the one numbered migration this repo has isn't guaranteed to match what's running — when debugging RLS, query `pg_policy`/`pg_policies` directly rather than trusting the SQL file.
- **To probe RLS as a specific role against the prod DB without writing real data**, wrap the attempt in one `DO $$ ... EXCEPTION WHEN raise_exception THEN ... END $$` block (`EXECUTE 'SET LOCAL ROLE anon'`, do the write, `RAISE EXCEPTION` to force a rollback via the exception handler, all in one statement). A plain multi-statement `BEGIN; SET LOCAL ROLE x; ...; ROLLBACK;` string sent through the Supabase MCP `execute_sql` tool does **not** reliably preserve role/session state across statements — it produced a false-positive RLS violation on an insert that actually succeeds, costing several wasted round trips before the DO-block version gave a trustworthy answer.
- **"Still doesn't work" after a local fix often means the user tested the deployed URL, not `localhost`.** This repo has no staging environment and large in-progress features sit uncommitted — a fix in the working tree never reaches Vercel until committed and deployed. Ask which URL was actually tested before re-diagnosing from scratch.
- **The admin/chapter-admin dashboards fetch once, server-side, on page load** (no polling or realtime for `chapter_applications`, `opportunities`, etc. — see Realtime above for the two tables that *do* have it). A user reporting data missing from the admin panel right after a DB write may just have a stale already-open tab; ask about reload timing before assuming the write failed.
- **Announce it when deleting test rows created during live verification**, immediately and explicitly. Silent cleanup after a successful test left the user briefly suspecting their own separate submission had been deleted, when the real cause was that they were testing against an unfixed environment (see above) and nothing of theirs was ever written.
- Live, empirical proof (a real browser via the chrome-devtools MCP + a real DB read) resolved a "does this actually work" doubt faster than further rounds of reasoning about Postgres/PostgREST `RETURNING` semantics from documentation recall alone — reach for a real end-to-end test earlier when a fix's correctness isn't obvious from reading code.
