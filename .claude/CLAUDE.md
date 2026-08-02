# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server on :3000
npm run build    # production build
npm run lint     # eslint (flat config; bare `eslint`, no target args)
npx tsc --noEmit # typecheck — nothing else runs it
```

`npm run lint` is red on a clean checkout: **53 errors / 14 warnings**, almost all `@typescript-eslint/no-explicit-any` from the `as any` casts described below, plus `Parsing error: File appears to be binary` on `types/supabase.ts`. Judge your changes against that baseline rather than expecting a clean run. (Was 57 before the lifecycle work removed four casts — if you delete more, update this number.)

### Verifying without a test framework

There is no test runner, but Node 24 executes the repo's TypeScript directly, which is enough to exercise anything pure (`lib/lifecycle.ts`, `lib/name-validation.ts`). Use it — writing a throwaway table of expected inputs/outputs for `lib/name-validation.ts` caught three real bugs that reading the code did not.

```bash
# file must be .mts; the import specifier must keep the .ts extension
node --experimental-strip-types scratch.test.mts
```

Delete the scratch file afterwards.

### Build and typecheck gotchas

- **`next build` fails spuriously on this checkout.** The repo lives under OneDrive, so Turbopack hits un-hydrated cloud files in `node_modules` and dies with `TurbopackInternalError … os error 426` or `UNKNOWN: unknown error, read` (errno -4094). This is not a code error. Just run it again — OneDrive hydrates the file and the second run passes. Do not go debugging it.
- **`npx tsc --noEmit` reports phantom errors after moving a route file**, e.g. `.next/dev/types/validator.ts … Cannot find module '../../../app/(main)/page.js'`. That is a stale generated route type. `rm -rf .next/dev/types` and re-run.
- Both commands are slow here (several minutes); run them in the background rather than burning a foreground timeout.

### Editing `types/supabase.ts`

Regenerate after any schema change in the Supabase dashboard:

```bash
npx supabase gen types --linked > types/supabase.ts
```

That redirect writes **UTF-16 with CRLF**, which is why ESLint calls the file binary and why `grep`/`Grep` silently match nothing inside it. Read it with the Read tool, or search it from PowerShell (`Get-Content -Raw` + `-match`).

If a migration has not been applied yet but you need the new columns to typecheck, hand-patch this file to match the migration. From PowerShell, and this is the part that will waste your time otherwise:

- The file content uses `\r\n`. Here-strings and multi-line literals written by the tool use `\n`, so `.Replace()` and `(?m)^…$` regexes **fail silently** against it. Build every search/replace string with an explicit `` $nl = "`r`n" `` and concatenate, or anchor with `\r$`.
- Round-trip with `Set-Content -Encoding Unicode -NoNewline`. Anything else corrupts the encoding.
- A column name like `description` appears in several tables. Slice the substring between two table markers (`$t.IndexOf('      opportunities: {')` … `$t.IndexOf('      profiles: {')`) and patch inside that slice, or you will edit the wrong table.
- Row / Insert / Update blocks differ (`x: T`, `x: T` but siblings optional, `x?: T`). Patching two of the three and assuming the third matched is the easy mistake — count the replacements and verify.

## Architecture

Next.js 16 App Router + React 19, Tailwind v4, shadcn/ui (`radix-vega` style, components in `app/components/ui`), Supabase for auth/Postgres/storage/realtime, deployed on Vercel. It's a Stuyvesant student/alumni network: profiles, a people directory, opportunities, a moderated community board, and direct messaging.

**Auth gating lives in `app/(main)/layout.tsx`, not middleware.** There is no `middleware.ts`. That layout calls `supabase.auth.getUser()` server-side and redirects to `/login`, which is what protects every route inside the `(main)` group. Public routes are the ones deliberately placed outside it: `/` (landing), `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, and `/auth/callback`. Adding a page under `(main)` makes it authed; adding one at `app/` root makes it public — so place new routes accordingly rather than adding per-page auth checks.

**`/` is the public landing page (`app/page.tsx`, branded "Highschool Connections"); the signed-in dashboard is `/home` (`app/(main)/home/page.tsx`).** Anything sending a logged-in user "home" must target `/home`, not `/` — there are six such call sites (`login-form.tsx`, `navbar.tsx` logo, `reset-password/page.tsx`, `profile-view.tsx`, `auth/callback/route.ts`, the non-admin redirect in `admin/page.tsx`). Grep for `"/"` before adding a seventh.

`app/auth/callback/route.ts` exchanges the OAuth/email code for a session and doubles as the onboarding gate: a user missing `grad_year` or `interests` is redirected to their own `/profile/[id]` instead of `/home`.

**Two Supabase clients, and the choice is not interchangeable:**
- `lib/supabase/server.ts` → `createSupabaseServerClient()` is async, reads cookies per request, for server components and route handlers.
- `lib/supabase/client.ts` → `getSupaBrowserClient()` is a module-level singleton for `"use client"` components.

**Data flow:** server component pages under `app/(main)/` do the reads (including PostgREST embeds like `.select("*, profiles(...)")`) and pass plain data as props into a sibling client component (`*-client.tsx`, `posts-feed.tsx`, `chat-window.tsx`, …), which owns interactivity and does its own writes through the browser client. Row-level security is the real authorization boundary; the client-side writes rely on it.

**Admin** is a `profiles.is_admin` boolean, re-checked server-side in `app/(main)/admin/page.tsx` (redirects to `/home`) and again in `app/api/admin/remove-user/route.ts`.

There are two privileged surfaces, both using the shared service-role client from `lib/supabase/admin.ts` (`createSupabaseAdminClient()` — bypasses RLS, never import it from a `"use client"` file):
- `app/api/admin/remove-user/route.ts` — verifies the caller is an admin, then calls `auth.admin.deleteUser` (cascades to `profiles`).
- `app/api/cron/purge-expired/route.ts` — the lifecycle purge, guarded by a `CRON_SECRET` bearer token and scheduled daily in `vercel.json`.

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are server-only and live in the Vercel environment, not `.env.local` — both routes fail locally unless you add them. `.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Realtime** uses `postgres_changes` channels in exactly two places: `chat-window.tsx` (INSERTs on `messages`, per-conversation channel) and `navbar.tsx` (INSERT/UPDATE on `messages`, driving the unread badge). Both clean up with `removeChannel` on unmount.

**Moderation** applies to community posts only: `status` of `"Pending" | "Approved" | "Rejected"` (plain text, not a Postgres enum) plus `rejection_reason`. The feed shows only `Approved` posts; authors see their own at any status via a separate query.

**The expiration lifecycle is the one non-obvious domain rule, and `lib/lifecycle.ts` is its single source of truth.** Every state derives from one `expires_at` timestamp — there is deliberately no `archived_at`, no `purge_at`, and no `"Archived"` status, so granting an extension automatically un-archives an item and resets its purge clock with nothing to drift:

| Condition | State | Visible to |
|---|---|---|
| `expires_at IS NULL` or `now < expires_at` | active | everyone |
| `expires_at ≤ now < expires_at + 10d` | **archived** | author + admins |
| `now ≥ expires_at + 10d` | purgeable | nobody; hard-deleted by cron |

Applies to **both** `community_posts` and `opportunities`. To extend it to another table: add `expires_at`, filter reads with `activeFilter()` / `notPurgedFilter()`, reuse `app/components/lifecycle/` (`ArchiveBanner`, `ExpiryBadge`, `ExtensionRequestDialog`), and add the table to the purge route. Do not reimplement the date math — `getLifecycleState`, `extendedExpiry`, and `initialExpiry` exist for this.

Two traps that were live bugs before:
- Extension approval must use `extendedExpiry(current)`, which counts from `max(now, expires_at)`. A naive `now + 30d` *shortens* an item that was already more than 30 days out.
- Do not recompute `expires_at` when an admin edits an item's deadline — that silently revokes an extension a human already granted. It is set on insert only (`initialExpiry`, which honours an author deadline falling inside the 30-day window).

`extension_requests` rows target either entity via `post_id` **or** `opportunity_id`, with a DB CHECK that exactly one is set; `getExtensionTarget()` in `admin-dashboard.tsx` resolves which. The purge route skips items with a `Pending` request so a waiting author is not deleted out from under the admin queue.

The legacy `delete_expired_posts` Postgres function predates the archive window and would delete on expiry, skipping the grace period. It is superseded by the cron route and should be unscheduled if it is running under pg_cron.

### Database

The schema lives only in the remote Supabase project and the CLI does not drive it, so `types/supabase.ts` is the de facto schema reference. `supabase/migrations/` holds SQL kept **for the record only** — it is written by hand and applied by pasting into the Supabase SQL editor. Nothing runs it automatically; assume a migration in that folder may or may not have been applied.

Tables: `profiles`, `community_posts`, `extension_requests`, `opportunities`, `conversations`, `messages`, `contact_submissions`, `team_members`, `partners`, `about_content`. Views (read-only, feeding the admin Recharts graphs): `messages_per_day`, `users_per_day`. Storage buckets: `avatars` and `post-images`, both keyed by `${userId}/...` paths.

**RLS is the authorization boundary, not the page queries.** Client components read and write directly, so any visibility rule (e.g. archived items being author-only) has to be enforced in the SELECT policy as well as in the server-component query. Adding the filter to the query alone looks correct in the UI and is not actually enforced.

## Conventions

- Path alias is `@/*` from the repo root. Components live under `app/components/`, so imports read `@/app/components/...` — **not** the `@/components` alias that `components.json` advertises. Follow the existing imports; `shadcn add` will need its output moved.
- Existing code casts Supabase results and mutation payloads through `as any` liberally (heavily in `admin-dashboard.tsx`, and in the layout/page files). The generated types are complete and current, so prefer typed access in new code rather than propagating the casts.
- Several pages pair a server page with a decorative full-bleed canvas/animation client component (`particle-background`, `symbol-rain`, `aurora-background`, `constellation-background`, `wireframe-globe`, `geo-background`). These are per-page visual identity, not shared infrastructure.
- Theming is `next-themes` via `app/components/theme-provider.tsx`, with `suppressHydrationWarning` on `<html>`/`<body>` in the root layout — keep both when touching that file.
- Dynamic APIs are async in this Next.js version: `params` and `searchParams` are Promises and must be awaited, as must `cookies()`.
- **Check whether a handler is shared before adding a guard to it.** `profile-view.tsx`'s `handleSave` backs every editable section, so validating the name unconditionally would have blocked a user with a legacy bad name from editing their bio. It now validates only when the name actually changed. The same shape recurs in `admin-dashboard.tsx`, where one submit handler serves both create and edit.
- Name entry goes through `lib/name-validation.ts` (`validateFullName` to gate, `formatFullName` for `onBlur` normalization) on both signup and the profile editor. Persist the returned `value`, never the raw input. Google OAuth names bypass it entirely — they are set by the provider, and no app code touches them.
