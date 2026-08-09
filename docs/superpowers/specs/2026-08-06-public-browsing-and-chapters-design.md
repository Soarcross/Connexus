# Public browsing, signup chapter picker, and the Chapters page

**Date:** 2026-08-06
**Status:** Approved by user (relaying CEO requirements), pending implementation

## Context

High School Connections currently hides everything behind login: `app/(main)/layout.tsx`
redirects logged-out visitors to `/login`, and chapters are resolved from subdomains
(`proxy.ts` → `x-chapter-slug`). The CEO wants the site browsable without an account,
signup to ask which school chapter you belong to, and a new per-chapter page — with all
chapters living on **one website** (no more chapter subdomains).

## Page access matrix (logged-out visitor)

| Route | Treatment |
|---|---|
| `/` (marketing landing) | Public; CTA row gains a **"Continue as guest"** button (next to Log in) linking to `/home` |
| `/home` | **Guest version**: "Welcome, guest" banner, the People carousel with public fields only, and the featured-opportunities section rendered as blurred placeholders with a sign-up prompt. Full app navbar in logged-out mode |
| `/people` | **Public with real data** — the member list renders for everyone; clicking a card leads to the blurred profile page |
| `/about`, `/contact` | Public real content (marketing info, no member data) |
| `/apply`, `/login`, `/signup`, password/verify pages | Public, unchanged |
| `/opportunities`, `/community`, `/chapters`, `/profile/[id]` | **Blur + login box**: generic placeholder cards under a CSS blur, centered card with Log in / Sign up buttons. **No real data is fetched or sent** — a blur over real data is trivially removable in dev tools |
| `/messages`, `/admin`, `/chapter-admin` | Redirect to `/login`, as today |

Note `/` no longer auto-serves only marketing: it keeps redirecting *logged-in*
visitors to `/home` as today, and `/home` no longer redirects logged-out
visitors away — it renders the guest variant instead.

Logged-in behavior is unchanged except where noted below.

### Accepted privacy trade-off

Making the People list public re-exposes member data that the 2026-07 audit locked
down. Scope it to exactly the fields the cards render: `id`, `full_name`,
`avatar_url`, `grad_year`, `interests`, `club_roles`. `bio`, `chapter_id`,
`is_admin`, `chapter_role` and everything else stay non-public, and the full
profile page remains login-only. The user confirmed this trade-off explicitly.

## 1. Logged-out browsing

- `app/(main)/layout.tsx` stops redirecting when there is no user. It renders the
  navbar in logged-out mode and lets pages decide their own treatment.
- New shared component `app/components/layout/locked-page.tsx`: takes a variant
  (`opportunities` | `community` | `chapters` | `profile`), renders that page's
  header plus a grid of hardcoded sample cards with `blur-sm pointer-events-none
  select-none`, overlaid by a centered card ("Create an account to see …") with
  Log in and Sign up buttons.
- Each blurred page short-circuits before any Supabase query when `user` is null
  and returns `<LockedPage variant="…"/>`.
- Truly private pages (`/messages`, `/admin`, `/chapter-admin`) keep an explicit
  `redirect("/login")` — the layout no longer provides it, so each of these pages
  must check (most already re-check `getUser()`; add where missing).
- `/home` guest variant: when `user` is null, skip the profile/recommendations
  queries; fetch only the public profile columns for the People carousel; render
  the featured-opportunities section as blurred placeholders with a sign-up
  prompt (no opportunities query — that data is login-only).
- Navbar logged-out mode: nav links (People, Opportunities, Community, Chapters,
  About, Contact) + **Log in** / **Sign up** buttons; no avatar, no messages icon,
  no unread-badge realtime subscription. Logo links to `/` when logged out,
  `/home` when logged in.
- `/people` when logged out: server component fetches **only** the public columns
  listed above (an explicit column list, not `*` — anon has no grant on the other
  columns and `*` would 42501). Chapter filter UI hidden (chapter scoping needs a
  session); search/filters over the fetched fields still work client-side.

## 2. Signup chapter picker

- The signup page (server component) fetches Active chapters (`id`, `name`,
  `school_name`) and passes them to `signup-form.tsx`.
- The form gains a required "Your school" select with:
  - each active chapter,
  - **"My school isn't listed — open a chapter"** → links to `/apply` (does not
    submit the form),
  - **"I'm not a student — continue without a chapter"** → `chapter_id: null`.
- Chosen `chapter_id` is passed in `signUp` `options.data`; the existing
  `handle_new_user` trigger already copies `chapter_id` (and only `chapter_id`)
  from metadata. No trigger change.
- **Join-later path** (Google OAuth users and "continue without chapter" users):
  the own-profile page shows a "School chapter" card when `chapter_id` is null —
  pick an active chapter (browser-client update of own `chapter_id`) or link to
  `/apply`. Setting is one-way: NULL → value only; changing chapters afterwards
  is an admin action. `auth/callback`'s subdomain backfill is removed.

## 3. Chapters page

- New route `app/(main)/chapters/page.tsx`, new navbar link.
- Data model: **reuses `opportunities`** with `chapter_id = viewer's chapter` —
  the rows chapter admins already create in `/chapter-admin`. Auto-expiry,
  archive window, extension requests, and moderation work unchanged.
- New event-flavored categories: **Meeting, Event, Trip, Fundraiser,
  Announcement**. Added to `lib/category-colors.tsx` (`CATEGORY_META`) and to the
  hand-maintained lists in the chapters page and `chapter-admin-dashboard.tsx`
  only — *not* to the main opportunities/home category lists (the documented
  multi-list gotcha; these categories are chapter-page-only).
- Page states:
  - member of a chapter → chapter name/school header + that chapter's active
    items grouped by category, with the standard lifecycle badges; archived items
    visible to their author and admins, as on `/opportunities`;
  - logged-in, no chapter → "You're not in a chapter yet": list of active
    chapters to join (same NULL → value write as §2) + "Open a chapter" → `/apply`;
  - logged out → `LockedPage`.
- **`/opportunities` becomes national-only** (`chapter_id IS NULL`); the
  chapter-scoped rows it used to merge in now appear on `/chapters` instead.
  `/home`'s featured section keeps merging both (it is the logged-in dashboard).

## 4. Retiring subdomains

- `proxy.ts`: remove `resolveSlug` and the `x-chapter-slug` header forwarding.
  **The session refresh, cookie-domain, and dead-cookie purge logic stay exactly
  as they are** — that path is load-bearing (its removal caused the 2026-07 login
  outage).
- `lib/chapter.ts` (`getChapterSlug` / `getCurrentChapter`) and the marketing
  page's per-chapter variant are removed; `lib/chapter-shared.ts` keeps only the
  constants still referenced (check `cookie-domain.ts` usage at implementation).
- DNS/wildcard-subdomain redirects on Vercel are an ops task, out of code scope.

## 5. Database changes (production DB, additive only, no new tables)

Applied via a new numbered file in `supabase/sql/`, pasted into the SQL editor
**before** the code deploys (grants are additive; old code never queries as anon
on these tables, so nothing breaks either way — but this order means the new
build never races missing grants).

1. `profiles`: RLS SELECT policy for `anon` (all rows) + column-level
   `GRANT SELECT (id, full_name, avatar_url, grad_year, interests, club_roles)`
   to `anon`. Per the audit lessons: verify no table-wide grant exists first
   (`information_schema.role_table_grants`), and name columns explicitly.
2. `chapters`: anon SELECT policy restricted to `status = 'Active'`, column
   grant on (`id`, `name`, `school_name`) — feeds the signup picker.
3. `about_content`, `team_members`, `partners`: verify anon SELECT; add
   policy/grant if missing (public About page).
4. `contact_submissions`: verify anon INSERT (the rate-limit trigger already
   guards it; the form does not chain `.select()`, so no SELECT policy needed).
5. `profiles.chapter_id` self-service join: `GRANT UPDATE (chapter_id)` to
   `authenticated` **plus** a `BEFORE UPDATE` trigger that rejects any
   `chapter_id` change where the old value was non-null and the caller is not a
   platform admin / service role — column grants cannot express "only when
   currently null", so the trigger enforces the one-way transition. The target
   chapter must be Active.

### Acceptance tests (the attack failing, not the DDL succeeding)

With the anon key over REST: the six public profile columns readable; `bio`
**not** readable; `community_posts`, `messages`, `conversations`,
`opportunities`, `extension_requests` **not** readable; non-Active chapters not
visible. With an authenticated test JWT (DO-block probe, rolled back): setting
own `chapter_id` from null succeeds; changing it again fails; setting someone
else's fails.

## Error handling & verification

- No test framework: `npm run lint` (against the documented red baseline),
  `npx tsc --noEmit`, then manual pass — browse every route in the matrix logged
  out and logged in, on desktop and mobile widths.
- RLS probes use the self-rolling-back DO-block pattern from CLAUDE.md; no live
  writes against production endpoints during QA.

## Out of scope

- Changing chapters after you have one (admin task), chapter discovery/browse
  pages for other chapters' content, email notifications, DNS cleanup for the
  old subdomains, migrating the old per-chapter marketing URLs.
