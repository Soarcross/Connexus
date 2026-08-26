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

`npm run lint` is red on a clean checkout — roughly 49 errors / 11 warnings, most of them `@typescript-eslint/no-explicit-any` from the `as any` casts described in Conventions. Treat that as an approximate baseline, not an exact target.

**Regenerating database types** after any schema change:

```bash
# --linked does NOT work here (the CLI reports LegacyProjectNotLinkedError
# despite supabase/.temp/linked-project.json existing). Use --project-id.
# Generate to a temp file and copy in — never redirect straight onto the real
# file: the shell truncates the target the instant the redirect opens, so a
# failed run leaves types/supabase.ts at 0 bytes, which breaks every
# `import type { Database }` at once.
export SUPABASE_ACCESS_TOKEN=...           # from .env.local
npx supabase gen types typescript --project-id ezbnpauicgchhmjjmqxq > /tmp/types.ts
cp /tmp/types.ts types/supabase.ts
```

Write it from **Bash, not PowerShell** — PowerShell's `>` encodes UTF-16, which makes ESLint report `Parsing error: File appears to be binary` and makes `grep`/`Grep` silently match nothing in the file. If it does end up UTF-16, re-convert to UTF-8; the fix does not survive the next regeneration. When in doubt, read it with the Read tool.

## Architecture

Next.js 16 App Router + React 19, Tailwind v4, shadcn/ui (`radix-vega` style, components in `app/components/ui`), Supabase for auth/Postgres/storage/realtime, deployed on Vercel at `hsconnexus.com`. It's Connexus: a multi-school networking platform organized into per-school "chapters" (profiles, people directory, opportunities, a moderated community board, DMs, plus a public chapter-application flow). Originally single-tenant for Stuyvesant; rebuilt for multi-chapter in 2026-07, with the old data backfilled as the `stuy` chapter.

**Auth gating lives in `app/(main)/layout.tsx`, not `proxy.ts`.** `proxy.ts` is this project's Next 16.2+ `middleware.ts` replacement (renamed upstream — keep the export named `proxy`). It resolves the chapter subdomain into an `x-chapter-slug` header and **refreshes the Supabase session**, but it does **not** gate auth. The gate is `app/(main)/layout.tsx`, which calls `supabase.auth.getUser()` and redirects to `/login`, protecting everything in the `(main)` group.

**`proxy.ts` is the only place that can persist a rotated refresh token.** Server components cannot write cookies — `createSupabaseServerClient()`'s `setAll` throws there and is deliberately swallowed — so without the middleware refresh the access token expires and every subsequent refresh replays the same spent token. That is not theoretical: it ran for weeks, produced ~89 failed `/token` calls a day (`refresh_token_already_used`, `refresh_token_not_found`, plus 429s), and left the browser client in a state where `signInWithOAuth` never persisted the PKCE `code_verifier`, so every Google login died at `/auth/callback` with `pkce_code_verifier_not_found`. The refresh is skipped for requests carrying no `sb-*` cookie (no session to refresh) and for `/auth/callback` (which owns the jar mid-exchange).

**Deleting a Supabase auth cookie takes two `Set-Cookie` headers, not one.** A cookie's identity is `(name, domain, path)`, so sessions issued before the apex-domain move are host-only and survive any expiry written with `Domain=`. `lib/supabase/clear-auth-cookies.ts` emits both variants, appending to the `set-cookie` header directly because `NextResponse.cookies` is keyed by name alone and collapses the pair into one. It only fires on a 4xx from `getUser()` — clearing on a 5xx or a network error would log valid sessions out. Public routes are the ones deliberately outside it: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, and the `(marketing)` group (`/`, `/apply`). Adding a page under `(main)` makes it authed; outside it, public. The authed home is `/home` — `/` is the marketing landing, which redirects logged-in visitors to `/home`.

`lib/chapter.ts` reads that header (`getChapterSlug()`) and resolves it to a `chapters` row (`getCurrentChapter()`) — use these, not ad-hoc header reads.

`app/auth/callback/route.ts` exchanges the OAuth/email code for a session, backfills `profiles.chapter_id` from the subdomain when missing (covers Google OAuth, which can't carry signup metadata), and doubles as the onboarding gate: a user missing `grad_year` or `interests` goes to their own `/profile/[id]` instead of `/home`. Its `next` param is validated to same-origin absolute paths — `?next=//evil.com` was an open redirect on a post-login landing route.

**Three Supabase clients, and the choice is not interchangeable:**
- `lib/supabase/server.ts` → `createSupabaseServerClient()` — async, per-request cookies, for server components and route handlers.
- `lib/supabase/client.ts` → `getSupaBrowserClient()` — module-level singleton for `"use client"`.
- `lib/supabase/admin.ts` → `createSupabaseAdminClient()` — service-role, bypasses all RLS.

**Never construct a service-role client outside `app/api/`** (neither the factory nor a raw `createClient` with the key). `app/(main)/profile/[id]/page.tsx` used to call `auth.admin.getUserById()` inline on every profile view, leaking every user's private auth email to any authenticated viewer — the `isOwnProfile` check next to it was UI-only. The page now passes the *viewer's own* email (from their session, when `isOwnProfile`) and `null` otherwise; reaching another user goes through in-app DMs.

Both non-admin clients set `cookieOptions.domain` from `NEXT_PUBLIC_COOKIE_DOMAIN` so sessions survive moving between chapter subdomains — never set it broader than this app's root domain.

**Data flow:** server components under `app/(main)/` do the reads (including PostgREST embeds like `.select("*, profiles(...)")`) and pass plain data into sibling client components (`*-client.tsx`, `posts-feed.tsx`, `chat-window.tsx`, …), which own interactivity and write through the browser client. **RLS plus column-level grants are the real authorization boundary** — see the Database section, and the security-audit lessons for how those two interact.

**Admin** is `profiles.is_admin` (platform-wide), re-checked in `app/(main)/admin/page.tsx` and again in every route under `app/api/admin/`, all of which use `createSupabaseAdminClient()` behind a `getUser()` → `is_admin` gate:
- `remove-user/route.ts` — `auth.admin.deleteUser`, cascades to `profiles`.
- `approve-chapter/route.ts` — atomically claims the application (`UPDATE ... WHERE status='Pending'`, closing a double-approve race), creates the `chapters` row, invites the applicant, then elevates their `chapter_role`.
- `set-admin/route.ts` — the **only** path allowed to flip `is_admin`; the DB revokes that column from `authenticated`, so a browser-side write can no longer work.

**Chapter admin** is the narrower `profiles.chapter_role` ('member' | 'chapter_admin'), scoped to one chapter, with its own dashboard at `/chapter-admin`. It moderates only that chapter's posts/extension-requests/opportunities, gated by RLS.

**Privilege fields (`is_admin`, `chapter_role`) must never come from client-supplied data** — not from `raw_user_meta_data` (both signup and invites populate it, and any anon caller can forge it), and not from a browser write. The new-user trigger copies only `chapter_id` from metadata. Elevation happens exclusively in the admin-gated, service-role routes above.

**Realtime** uses `postgres_changes` in exactly two places: `chat-window.tsx` (INSERTs on `messages`, per-conversation) and `navbar.tsx` (INSERT/UPDATE on `messages`, unread badge). Both `removeChannel` on unmount.

**Community post lifecycle:** posts carry `status` (`"Pending" | "Approved" | "Rejected"` — plain text, not enums), `rejection_reason`, a required `chapter_id`, and `expires_at` (30 days). The feed shows only `Approved` posts in the viewer's chapter; authors see their own via a separate query. An author can file an `extension_requests` row; an approving admin bumps `expires_at` by 30 days. `delete_expired_posts()` cleans up DB-side. **Status and expiry are enforced in the database**, not just the UI: inserts are forced to `Pending`, and a `BEFORE UPDATE` trigger rejects changes to `status`/`expires_at`/`rejection_reason`/`chapter_id` from anyone who isn't a platform admin or that chapter's admin.

**Chapter application lifecycle:** a public visitor files a `chapter_applications` row via `/apply` → `app/api/apply/route.ts` (anon insert; RLS restricts it to `status='Pending', chapter_id=null, rejection_reason=null`, plus a honeypot field, DB length checks, and an IP rate limit). A platform admin reviews it in the admin dashboard's Chapters tab and approves via `approve-chapter/route.ts`.

### Database

The schema lives only in the remote Supabase project (id `ezbnpauicgchhmjjmqxq`), so `types/supabase.ts` is the de facto reference. Committed migrations: `supabase/sql/001_chapters.sql` (multi-chapter) and `002_security_hardening.sql` (the 2026-07 audit). Everything before 001 was applied by hand and never captured; anything new gets its own numbered file.

Tables: `profiles`, `community_posts`, `extension_requests`, `opportunities` (nullable `chapter_id` — null means national), `conversations`, `messages`, `contact_submissions`, `team_members`, `partners`, `about_content`, `chapters`, `chapter_applications`, `rate_limits`. Views feeding the admin graphs (`messages_per_day`, `users_per_day`) are SECURITY DEFINER and readable only by `service_role` — the dashboard reads them through the `admin_messages_per_day()` / `admin_users_per_day()` RPCs, which re-check `is_admin` inside the database. Storage buckets `avatars` and `post-images`, both keyed by `${userId}/...` and both path-scoped in their upload policies.

Rate limiting is Postgres-backed (`rate_limits` + `check_rate_limit()`), not Upstash: serverless-safe, no external dependency. `check_rate_limit` is granted to `service_role` only — `/api/apply` calls it via the admin client, and the `contact_submissions` trigger calls it as a SECURITY DEFINER. Exposing it to `anon` would make the limiter its own abuse vector (unbounded distinct keys bloat the table).

## Conventions

- Path alias is `@/*` from the repo root. Components live under `app/components/`, so imports read `@/app/components/...` — **not** the `@/components` alias `components.json` advertises. `shadcn add` output needs moving.
- Existing code casts Supabase results through `as any` liberally (heavily in `admin-dashboard.tsx`). The generated types are complete — prefer typed access in new code rather than propagating casts.
- Dynamic APIs are async in this Next version: `params`, `searchParams`, and `cookies()` are Promises and must be awaited.
- Theming is `next-themes` via `app/components/theme-provider.tsx`, with `suppressHydrationWarning` on `<html>`/`<body>` in the root layout — keep both.
- **Never fall back to `?? ""` for a value feeding a `uuid` column or filter** (`.eq("chapter_id", x ?? "")`). Postgres rejects an empty string as an invalid uuid — it *errors* rather than matching zero rows, and since most destructuring here reads only `{ data }` and ignores `error`, it just looks like an empty result. Branch on whether the id is known (see `app/(main)/opportunities/page.tsx`).
- **A "your chapter by default, all chapters on request" query must not fetch the unscoped version server-side "just in case."** The people directory used to ship every chapter's profiles to every browser and filter client-side for display. RLS allowed it, so it wasn't a policy bug — but every visitor received the whole platform's PII regardless. The scoped fetch is the default; the broader one is a separate fetch triggered by the user action (see `people-client.tsx`'s `handleToggleAllChapters`).
- **Category values have no single source.** `lib/category-colors.tsx`'s `CATEGORY_META` supplies only display (chip color/icon); `app/(main)/home/page.tsx`, `opportunities-client.tsx`, `create-post-button.tsx`, and `admin-dashboard.tsx` each hand-maintain their own `CATEGORIES` allowlist. Adding to `CATEGORY_META` makes a category appear nowhere, and one missing from a page's own list silently never shows there — the 2026-07 rebrand added `"Programs"` everywhere except the home page, so featured Programs opportunities never appeared there. Adding a category means editing every list — **including `opportunities_category_check` in the database**, a CHECK constraint allowlist that silently rejected every "Programs" insert for a month after the rebrand added it to the UI only (see `supabase/sql/004_opportunity_category_field_checks.sql`).
- The 2026-07 rebrand deleted the decorative full-bleed canvas components (`particle-background`, `symbol-rain`, `aurora-background`, `constellation-background`, `geo-background`) for a flatter, content-first look. `wireframe-globe` survives on the public `/login` page only.

## Working against this database

**There is exactly one Supabase project and it is production — no staging, no branches.** That constrains everything below.

- **Probe RLS/grants safely with a self-rolling-back `DO $$` block:** `EXECUTE 'SET LOCAL ROLE authenticated'`, `SET LOCAL request.jwt.claims`, attempt the write, then `RAISE EXCEPTION` with the result interpolated into the message. The exception aborts the transaction, so nothing persists, and the error text carries the answer back. This works for DDL too (`CREATE` inside a `DO` block via `EXECUTE`, then raise) — useful for compile-testing a function before applying it. A plain multi-statement `BEGIN; SET LOCAL ROLE x; …; ROLLBACK;` through the MCP `execute_sql` tool does **not** reliably preserve session state and has produced false positives.
- **Query `pg_policies` / `information_schema` directly rather than trusting the committed SQL.** The live DB has drifted from the migration files before.
- **Start database security work with `get_advisors`.** It immediately surfaces SECURITY DEFINER views, mutable `search_path`, anon-executable functions, and public-bucket listing — all things that take a while to find by hand.
- **Automated testing (QA subagents included) must never fire real requests at endpoints that write rows or send invite emails.** Scope it to pure logic.
- **Announce test rows immediately** if live verification creates any. Silent cleanup once left the user thinking their own submission had been deleted.
- **The admin dashboards fetch once, server-side, on page load** — no polling or realtime except the two `messages` channels. Data "missing" from the admin panel right after a write is usually a stale open tab; ask about reload timing first.
- **"Still doesn't work" usually means the deployed URL, not `localhost`.** Uncommitted work never reaches Vercel. Ask which URL was tested before re-diagnosing.

## Lessons from the security audit (2026-07)

The audit found three exploitable issues — any user could self-promote to platform admin, all 54 profiles were readable unauthenticated, and post authors could self-approve — plus an email leak, an open redirect, and a `handle_new_user` trigger broken since the multi-chapter rebuild (it named three columns, supplied two values, and swallowed the error, so signups silently created no profile row).

**Postgres grant traps — both fail silently, and both bit this repo:**

- **A column-level `REVOKE` cannot narrow a table-level grant.** `anon`/`authenticated` held table-wide `INSERT`/`UPDATE` on `profiles` (Supabase's default), which implicitly covers every column, so `revoke update (is_admin, chapter_role) …` succeeded, changed nothing, and left the escalation fully live. Fix: revoke the table-wide grant, then re-grant column by column. **Check `information_schema.role_table_grants` first** — `column_privileges` alone will happily show the privilege still present with no hint as to why.
- **Function `EXECUTE` defaults to `PUBLIC`, which `anon` inherits.** Revoking from `anon, authenticated` left `delete_expired_posts` callable via `/rest/v1/rpc/`. `PUBLIC` must be named explicitly. In `pg_proc.proacl`, an entry with an empty grantee (`=X/postgres`) *is* the PUBLIC grant.

**The meta-lesson: a migration that returns no error has not been verified.** Both bugs above ran clean and reported success. What caught them was re-running the original exploit afterward and checking it now fails — and, for the second, a live `curl` against the REST API with the anon key. For any security fix, the acceptance test is the attack failing, not the DDL succeeding.

**Sequencing a DB change against a deployed app.** Revoking a privilege the deployed frontend still uses breaks it until the new code ships. Push first, confirm the deploy is actually live, then apply the SQL. Vercel exposes no ready signal here, but **probing a route that only exists in the new build works well** — `POST /api/admin/set-admin` returning 404 means the old build, 401 means the new one is live. Also `git fetch` before pushing long-running work: a large rebrand PR landed on `main` mid-audit and rewrote several of the same files. It rebased cleanly, but "clean rebase" is not "still correct" — every assumption the migration depended on (posts still insert `status: 'Pending'`, mark-read still filters `sender_id`, no public page reads the newly-restricted tables) had to be re-checked against the merged code.

**Parallel subagents work well with strictly disjoint file ownership.** Three agents (SQL / API routes / app layer) each given an explicit allow-list of files produced zero merge conflicts. Two declined part of their instructions for good reasons — one refused to revoke a view grant that would have 500'd the admin dashboard, the other refused to ship an untested CSP — and both were right. Their reports still needed independent verification: the work was sound, but conclusions like "no regression here" had to be confirmed by reading the merged code.

**What would have been faster.** Running `get_advisors` and dumping `pg_policies` in the *first* batch, before reading any repo SQL — the committed migration covered only 2 of 12 tables, so the code-first pass built a picture that the database immediately corrected. And when applying a large migration, verifying the grant *semantics* (not just that statements executed) in the same batch as the apply would have caught both no-ops in one round trip instead of three.

## Lessons from the multi-chapter build-out (2026-07)

- **Copy-pasting a handler copies its bugs.** `.eq("id", req.post_id ?? "")` — silently no-op-ing while reporting success — was copied from the platform-admin dashboard into the new chapter-admin one and needed fixing in both.
- **`INSERT ... RETURNING` is checked against the table's `SELECT` policies, not just the `INSERT` policy's `WITH CHECK`.** `chapter_applications` allows anon INSERT but has no anon SELECT, so `.insert({...}).select()` raised `42501` and rolled back the *entire* insert — a hard failure, not an empty result. Don't chain `.select()` after an insert unless the calling role has a matching SELECT policy.
- **Verify a subagent's finding against ground truth before acting.** A reviewer working from too narrow a file list flagged "no `middleware.ts` exists, so subdomain resolution may be a no-op" — `proxy.ts` existed and worked. The finding was discarded after checking, not "fixed."

## Lessons from the visual rebrand (2026-07)

- **A visual rewrite silently drops behavior, not just styles.** Restyling the People/Opportunities mobile filters from scratch — rather than diffing the old JSX — lost the active-filter badge and one-tap clear. When rebuilding a working component for looks, audit the old version's *behavior* before deleting it.
- **Wrapping arbitrary JSX in `<div onClick>` drops keyboard accessibility.** `CreatePostButton`'s new `trigger` prop replaced a real `<Button>` with a bare `<div onClick>` — no `role`, `tabIndex`, or key handler — making the post composer unreachable by keyboard once it became the only entry point. A component taking a trigger node needs the same focus contract as what it replaced (`<SheetTrigger asChild>`, used correctly elsewhere in the same rebrand, is the model).
- **Swapping a component's underlying primitive changes the blast radius of existing bugs.** The mobile nav's search never closed the menu on submit — harmless as a plain `md:hidden` block, but once it became a Radix `Sheet`, that same oversight left a screen-blocking modal open after every search. Re-check every path that mutates toggle state after that kind of swap.
- **Hunt for *removed* behavior, not just bugs in the new code.** A structured multi-angle `/code-review` (with an explicit "removed-behavior auditor" comparing old vs. new) caught all three regressions above; an earlier ad-hoc "spawn 4 agents split by file area" pass missed them entirely.
- **Check `git diff HEAD -- <file>` before trusting a finder agent's flag.** Two of ten candidates were real smells but provably pre-existing — the lines sat outside every diff hunk. That check separates "in scope" from "real but unrelated."
- **Front-load scope into large-diff review prompts.** An unscoped Explore agent asked to read a ~3000-line diff hit a stream idle timeout; retrying with an explicit priority order ("these 3 highest-risk files first") succeeded.
- **Show, don't describe, for design decisions.** An ASCII-sketch logo pitch was rejected; three real rendered SVG tiles at multiple sizes got a fast, clean decision. Same for color: run a palette through the dataviz skill's `validate_palette.js` *before* committing — a first-draft violet ramp failed lightness, chroma, and contrast checks outright.
