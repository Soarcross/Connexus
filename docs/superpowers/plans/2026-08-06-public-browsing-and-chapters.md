# Public Browsing + Chapters Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HSC browsable without an account (blur-gated pages, guest home, public People list), add a signup chapter picker with escape hatches, add a per-chapter page, and retire subdomain routing.

**Architecture:** Per-page gating replaces the layout-level login redirect: pages that stay private redirect themselves; blur-gated pages short-circuit to a shared `LockedPage` with fake placeholder data; public pages fetch only anon-granted columns. The Chapters page reuses the existing `opportunities` rows with `chapter_id` set. All DB changes are additive grants/policies on the production Supabase project.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase (`@supabase/ssr`), existing shadcn-style components in `app/components/ui`.

**Spec:** `docs/superpowers/specs/2026-08-06-public-browsing-and-chapters-design.md`

## Global Constraints

- No test framework. Verification = `npm run lint` (baseline: ~53 errors/14 warnings — judge deltas, not absolutes), `npx tsc --noEmit`, and the dev server at localhost:3000 (already running, hot-reloads).
- Imports use `@/app/components/...`, never `@/components`.
- `params`, `searchParams`, `cookies()` are Promises — always `await`.
- **Never** feed `?? ""` into a uuid column/filter — branch on whether the id exists.
- **Do not touch** the session-refresh / cookie-purge logic in `proxy.ts` (only the slug-resolution part is removed, Task 11).
- The Supabase project is production. DB changes are additive only; verify each grant by testing that the *attack fails* (anon curl), not that DDL succeeded.
- Commit after each task; never push without the user's say-so.
- Copy: the product name is "High School Connections"; guest CTA copy is "Continue as guest".

---

### Task 1: `LockedPage` component

**Files:**
- Create: `app/components/layout/locked-page.tsx`

**Interfaces:**
- Produces: `LockedPage({ variant, title, description }: { variant: "opportunities" | "community" | "chapters" | "profile"; title: string; description: string })` — a server-renderable component (no `"use client"`; it has no interactivity beyond `<Link>`).

- [ ] **Step 1: Create the component**

```tsx
import Link from "next/link"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar"
import { Badge } from "@/app/components/ui/badge"
import { Lock } from "lucide-react"

type Variant = "opportunities" | "community" | "chapters" | "profile"

// Hardcoded sample data. Never real rows: a CSS blur over real data can be
// removed in dev tools, so nothing member-related is ever fetched here.
const SAMPLE_PEOPLE = ["Alex Rivera", "Jordan Lee", "Sam Patel", "Taylor Chen"]
const SAMPLE_ITEMS = [
    { title: "Summer Research Program", org: "University Lab", cat: "Research" },
    { title: "Software Engineering Internship", org: "Tech Startup", cat: "Internships" },
    { title: "Community Volunteering Day", org: "Local Nonprofit", cat: "Volunteering" },
    { title: "National Math Competition", org: "Math Society", cat: "Competitions" },
    { title: "Weekend Coding Workshop", org: "CS Club", cat: "Events" },
    { title: "College Essay Bootcamp", org: "Writing Center", cat: "Programs" },
]

function SampleGrid({ variant }: { variant: Variant }) {
    if (variant === "profile") {
        return (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <Card>
                    <CardContent className="pt-6 flex items-center gap-5">
                        <Avatar className="size-24"><AvatarFallback className="text-2xl">?</AvatarFallback></Avatar>
                        <div className="flex flex-col gap-2">
                            <div className="h-6 w-48 rounded bg-muted" />
                            <div className="h-4 w-32 rounded bg-muted" />
                        </div>
                    </CardContent>
                </Card>
                {["About", "Career Interests", "Looking For"].map(section => (
                    <Card key={section}>
                        <CardHeader><CardTitle className="text-base">{section}</CardTitle></CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            <div className="h-4 w-full rounded bg-muted" />
                            <div className="h-4 w-2/3 rounded bg-muted" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }
    if (variant === "community") {
        return (
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                {SAMPLE_ITEMS.slice(0, 4).map((item, i) => (
                    <Card key={item.title}>
                        <CardContent className="pt-6 flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <Avatar className="size-9"><AvatarFallback>{SAMPLE_PEOPLE[i][0]}</AvatarFallback></Avatar>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold">{SAMPLE_PEOPLE[i]}</span>
                                    <span className="text-xs text-muted-foreground">Class of 2027</span>
                                </div>
                            </div>
                            <p className="font-semibold text-sm">{item.title}</p>
                            <div className="h-4 w-full rounded bg-muted" />
                            <div className="h-4 w-3/4 rounded bg-muted" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }
    // opportunities + chapters share the card-grid look
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLE_ITEMS.map(item => (
                <Card key={item.title}>
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-snug">{item.title}</CardTitle>
                            <Badge variant="secondary" className="shrink-0 text-xs">{item.cat}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.org}</p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <div className="h-3.5 w-full rounded bg-muted" />
                        <div className="h-3.5 w-2/3 rounded bg-muted" />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function LockedPage({ variant, title, description }: {
    variant: Variant
    title: string
    description: string
}) {
    return (
        <div className="relative">
            <div className="blur-[6px] pointer-events-none select-none opacity-70" aria-hidden="true">
                <SampleGrid variant={variant} />
            </div>
            <div className="absolute inset-0 flex items-start justify-center pt-16 sm:pt-24">
                <Card className="w-full max-w-sm mx-4 shadow-lg">
                    <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
                        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <Lock className="size-6" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <p className="font-semibold text-lg">{title}</p>
                            <p className="text-sm text-muted-foreground">{description}</p>
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                            <Button asChild><Link href="/signup">Sign up</Link></Button>
                            <Button variant="outline" asChild><Link href="/login">Log in</Link></Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (background; several minutes). Expected: no NEW errors versus baseline.

- [ ] **Step 3: Commit** — `git add app/components/layout/locked-page.tsx && git commit -m "Add LockedPage blur-gate component"`

---

### Task 2: Logged-out navbar + remove the layout login-redirect

**Files:**
- Modify: `app/components/navbar.tsx`
- Modify: `app/(main)/layout.tsx`
- Modify: `app/(main)/messages/page.tsx`, `app/(main)/messages/[conversationId]/page.tsx`, `app/(main)/admin/page.tsx`, `app/(main)/chapter-admin/page.tsx` — confirm each still has its own `getUser()` + `redirect("/login")`; add it where missing (admin currently redirects non-admins to `/home`; keep that, but logged-out → `/login`).

**Interfaces:**
- Produces: `Navbar` accepts `userId: string | null` (null = guest). When null: no unread subscription, no avatar dropdown; instead Log in (`variant="ghost"`) + Sign up buttons linking `/login` and `/signup`. Logo href becomes `/home` when logged in, `/` when guest.
- Consumes: nothing new.

- [ ] **Step 1: Navbar guest mode**

In `app/components/navbar.tsx`: change `Props.userId` to `string | null`. Guard the unread effect:

```tsx
useEffect(() => {
    if (!userId) return
    // ...existing body unchanged...
}, [userId])
```

Logo: `<Link href={userId ? "/home" : "/"} ...>`. In the right-side cluster, wrap the account dropdown in `{userId ? ( <DropdownMenu>…existing…</DropdownMenu> ) : ( guest buttons )}` where guest buttons are:

```tsx
<div className="hidden sm:flex items-center gap-1.5">
    <Button variant="ghost" size="sm" asChild><Link href="/login">Log in</Link></Button>
    <Button size="sm" asChild><Link href="/signup">Sign up</Link></Button>
</div>
```

(import `Button` from `@/app/components/ui/button`). In the desktop tabs, hide the Messages tab when guest: `{userId && ( <Link href="/messages" ...>…</Link> )}`. In the mobile Sheet, likewise hide the Messages link when guest and append Log in / Sign up links at the bottom of the sheet for guests:

```tsx
{!userId && (
    <div className="mt-2 flex flex-col gap-2">
        <Button asChild onClick={() => setMobileOpen(false)}><Link href="/signup">Sign up</Link></Button>
        <Button variant="outline" asChild onClick={() => setMobileOpen(false)}><Link href="/login">Log in</Link></Button>
    </div>
)}
```

Sheet title falls back: `{fullName ?? (userId ? "Menu" : "Welcome, guest")}`.

- [ ] **Step 2: Layout stops redirecting**

`app/(main)/layout.tsx` becomes:

```tsx
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { Navbar } from "@/app/components/navbar"

export default async function MainLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    // Guests are allowed through: each page under (main) now decides its own
    // treatment (blur-gate, public, or its own redirect to /login).
    const { data: profile } = user
        ? await supabase
            .from("profiles")
            .select("full_name, avatar_url, is_admin, chapter_role, chapters(name)")
            .eq("id", user.id)
            .single()
        : { data: null }

    return (
        <div className="min-h-svh bg-background">
            <Navbar
                userId={user?.id ?? null}
                avatarUrl={profile?.avatar_url ?? null}
                fullName={profile?.full_name ?? null}
                isAdmin={profile?.is_admin ?? false}
                chapterName={profile?.chapters?.name ?? null}
                isChapterAdmin={profile?.chapter_role === "chapter_admin"}
            />
            <main className="max-w-[1128px] mx-auto px-4 py-6">
                {children}
            </main>
        </div>
    )
}
```

- [ ] **Step 3: Private pages self-redirect**

Read each of the four files listed above. `messages/page.tsx` and `[conversationId]/page.tsx` already `redirect("/login")` when `!user` — leave them. `admin/page.tsx` and `chapter-admin/page.tsx`: ensure the first check is `if (!user) redirect("/login")` before any admin-role check.

- [ ] **Step 4: Verify in the browser** — logged out, localhost:3000/people should render (navbar in guest mode, no crash; the list may be empty until Task 5). No redirect loop.

- [ ] **Step 5: Commit** — `git commit -am "Allow guests through (main) layout; navbar guest mode"`

---

### Task 3: Blur-gate Opportunities, Community, and Profile pages

**Files:**
- Modify: `app/(main)/opportunities/page.tsx`
- Modify: `app/(main)/community/page.tsx`
- Modify: `app/(main)/profile/[id]/page.tsx`

**Interfaces:**
- Consumes: `LockedPage` from Task 1.

- [ ] **Step 1: Opportunities** — in `app/(main)/opportunities/page.tsx`, immediately after `getUser()`:

```tsx
if (!user) {
    return (
        <LockedPage
            variant="opportunities"
            title="Opportunities are for members"
            description="Create a free account to browse internships, research programs, scholarships and more."
        />
    )
}
```

(import: `import { LockedPage } from "@/app/components/layout/locked-page"`). All existing queries stay below the guard, so guests trigger zero data fetches.

- [ ] **Step 2: Community** — same pattern after `getUser()` in `app/(main)/community/page.tsx`:

```tsx
if (!user) {
    return (
        <LockedPage
            variant="community"
            title="Join the community"
            description="Create a free account to see what students and alumni in your chapter are sharing."
        />
    )
}
```

- [ ] **Step 3: Profile** — in `app/(main)/profile/[id]/page.tsx`, after resolving `user` (before fetching the viewed profile):

```tsx
if (!user) {
    return (
        <LockedPage
            variant="profile"
            title="This profile is for members"
            description="Create a free account to view member profiles and connect."
        />
    )
}
```

- [ ] **Step 4: Verify** — logged out, visit `/opportunities`, `/community`, and any `/profile/<uuid>`: blurred sample cards + centered lock card, Network tab shows **no** Supabase data requests for these pages. Logged in: pages unchanged.

- [ ] **Step 5: Commit** — `git commit -am "Blur-gate opportunities, community and profile pages for guests"`

---

### Task 4: Guest home + "Continue as guest" button

**Files:**
- Modify: `app/(main)/home/page.tsx`
- Modify: `app/(marketing)/page.tsx`

**Interfaces:**
- Consumes: `LockedPage` is NOT used here — the guest home is a custom layout (real page frame, blurred opportunities section only).

- [ ] **Step 1: Guest branch in home**

In `app/(main)/home/page.tsx`, after `getUser()`, add a guest branch that renders: the welcome banner with "Welcome, guest", a blurred placeholder opportunities section with an inline sign-up card, and **no** profile/recommendation queries. The People carousel is omitted until Task 5 wires public columns (then revisit — see Task 6 Step 3). Guest branch JSX:

```tsx
if (!user) {
    return (
        <div className="flex flex-col gap-8">
            <Card className="bg-primary/5 border-primary/15">
                <CardContent className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Welcome, guest</h1>
                    <p className="text-sm text-muted-foreground">
                        You&apos;re browsing High School Connections as a guest. Sign up to unlock opportunities, community posts and messaging.
                    </p>
                </CardContent>
            </Card>

            <section className="relative">
                <div className="blur-[6px] pointer-events-none select-none opacity-70" aria-hidden="true">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {["Summer Research Program", "Software Engineering Internship", "Community Volunteering Day", "National Math Competition"].map(title => (
                            <Card key={title}>
                                <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
                                <CardContent className="flex flex-col gap-2">
                                    <div className="h-3.5 w-full rounded bg-muted" />
                                    <div className="h-3.5 w-2/3 rounded bg-muted" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <Card className="w-full max-w-sm mx-4 shadow-lg">
                        <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
                            <p className="font-semibold">Featured opportunities are for members</p>
                            <p className="text-sm text-muted-foreground">Sign up free to see this month&apos;s picks.</p>
                            <div className="flex gap-2">
                                <Button asChild><Link href="/signup">Sign up</Link></Button>
                                <Button variant="outline" asChild><Link href="/login">Log in</Link></Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    )
}
```

(`Button` is already imported in this file; add `Link` import if missing — it is already there.)

- [ ] **Step 2: "Continue as guest" on the landing page**

In `app/(marketing)/page.tsx`, in the **no-chapter** hero CTA row (the `flex flex-col sm:flex-row items-center gap-3 w-full` div), add after the Log in button:

```tsx
<Button size="lg" variant="ghost" className="w-full sm:w-auto" asChild>
    <Link href="/home">Continue as guest</Link>
</Button>
```

Add the same button to the chapter-variant hero (it is removed anyway in Task 11, but the button keeps the interim state consistent).

- [ ] **Step 3: Verify** — logged out: `/` shows "Continue as guest"; clicking lands on `/home` guest view with navbar. Logged in: `/` still redirects to `/home`, which is unchanged.

- [ ] **Step 4: Commit** — `git commit -am "Add guest home dashboard and Continue-as-guest CTA"`

---

### Task 5: DB migration — public grants + one-way chapter join

**Files:**
- Create: `supabase/sql/003_public_browsing.sql`

**Interfaces:**
- Produces: anon can `select` exactly `(id, full_name, avatar_url, grad_year, interests, club_roles)` from `profiles`, `(id, name, school_name)` from Active `chapters`, and the About tables; `authenticated` can set own `chapter_id` only from NULL, target chapter must be Active.

- [ ] **Step 1: Survey current state BEFORE writing final SQL.** Via the Supabase MCP (or SQL editor), run:

```sql
select tablename, policyname, roles, cmd, qual from pg_policies
where tablename in ('profiles','chapters','about_content','team_members','partners','contact_submissions');
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_name in ('profiles','chapters','about_content','team_members','partners','contact_submissions')
  and grantee in ('anon','authenticated');
select grantee, table_name, column_name, privilege_type from information_schema.column_privileges
where grantee = 'anon' and table_name in ('profiles','chapters');
```

Record which policies/grants already exist (the signup page already queries `chapters` as anon — if that works today, chapters may already be open). Adjust the migration to add only what is missing; never duplicate policy names.

- [ ] **Step 2: Write `supabase/sql/003_public_browsing.sql`** (adjusting per Step 1 findings):

```sql
-- 003_public_browsing.sql
-- Public browsing: anon may read the people-directory card fields and the
-- marketing tables; members may join a chapter once (NULL -> value only).
-- All changes are additive. Apply via the Supabase SQL editor.

-- 1. profiles: public directory columns -------------------------------------
-- Audit lesson: column grants only narrow if no table-wide grant exists.
-- Verified in step 1 that anon holds no table-wide SELECT on profiles.
grant select (id, full_name, avatar_url, grad_year, interests, club_roles)
    on public.profiles to anon;

drop policy if exists "Public can read directory fields" on public.profiles;
create policy "Public can read directory fields"
    on public.profiles for select to anon
    using (true);

-- 2. chapters: signup picker ------------------------------------------------
grant select (id, name, school_name, slug, status) on public.chapters to anon;

drop policy if exists "Public can read active chapters" on public.chapters;
create policy "Public can read active chapters"
    on public.chapters for select to anon
    using (status = 'Active');

-- 3. about tables (skip any already open per step 1) ------------------------
grant select on public.about_content, public.team_members, public.partners to anon;

drop policy if exists "Public can read about content" on public.about_content;
create policy "Public can read about content"
    on public.about_content for select to anon using (true);

drop policy if exists "Public can read team members" on public.team_members;
create policy "Public can read team members"
    on public.team_members for select to anon using (true);

drop policy if exists "Public can read partners" on public.partners;
create policy "Public can read partners"
    on public.partners for select to anon using (true);

-- 4. one-way self-service chapter join --------------------------------------
grant update (chapter_id) on public.profiles to authenticated;

create or replace function public.enforce_one_way_chapter_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- service_role bypasses RLS but not triggers; let it and platform admins
    -- change chapters freely. Everyone else: only NULL -> Active chapter.
    if current_setting('request.jwt.claim.role', true) = 'service_role' then
        return new;
    end if;
    if new.chapter_id is distinct from old.chapter_id then
        if old.chapter_id is not null
           and not exists (select 1 from public.profiles p
                           where p.id = auth.uid() and p.is_admin) then
            raise exception 'chapter can only be set once; ask an admin to change it';
        end if;
        if new.chapter_id is not null
           and not exists (select 1 from public.chapters c
                           where c.id = new.chapter_id and c.status = 'Active') then
            raise exception 'chapter must be an active chapter';
        end if;
    end if;
    return new;
end;
$$;

revoke execute on function public.enforce_one_way_chapter_join() from public, anon, authenticated;

drop trigger if exists enforce_one_way_chapter_join on public.profiles;
create trigger enforce_one_way_chapter_join
    before update of chapter_id on public.profiles
    for each row execute function public.enforce_one_way_chapter_join();
```

Note: `contact_submissions` anon INSERT is **verified**, not added — the contact page currently lives under `(main)`; after Task 2 it renders for guests, and its client insert runs as anon. If Step 1 shows no anon INSERT policy, add one restricted to the columns the form sends (`name, email, category, message`) in this same file.

- [ ] **Step 3: Apply** via Supabase SQL editor / MCP `execute_sql`.

- [ ] **Step 4: Acceptance probes (the attack must fail).** With the anon key from `.env.local` against `https://<project>.supabase.co/rest/v1/`:

```bash
# should return rows with ONLY the public columns
curl -s "$URL/rest/v1/profiles?select=id,full_name,grad_year,interests,club_roles,avatar_url&limit=2" -H "apikey: $ANON"
# should 401/400 (column not granted)
curl -s "$URL/rest/v1/profiles?select=bio&limit=1" -H "apikey: $ANON"
curl -s "$URL/rest/v1/profiles?select=chapter_id&limit=1" -H "apikey: $ANON"
# should return [] or 401 — NOT rows
curl -s "$URL/rest/v1/community_posts?select=id&limit=1" -H "apikey: $ANON"
curl -s "$URL/rest/v1/messages?select=id&limit=1" -H "apikey: $ANON"
curl -s "$URL/rest/v1/opportunities?select=id&limit=1" -H "apikey: $ANON"
# active chapters visible, non-active invisible
curl -s "$URL/rest/v1/chapters?select=id,name,school_name" -H "apikey: $ANON"
```

Then probe the one-way join with the self-rolling-back DO-block pattern from CLAUDE.md (SET LOCAL ROLE authenticated + jwt claims for a real test user id): NULL→chapter succeeds, changing again raises, updating another user's row updates 0 rows.

- [ ] **Step 5: Commit** — `git add supabase/sql/003_public_browsing.sql && git commit -m "Add public-browsing grants and one-way chapter join (003)"`

---

### Task 6: Public People page (+ guest home carousel)

**Files:**
- Modify: `app/(main)/people/page.tsx`
- Modify: `app/components/people/people-client.tsx` (guest tweaks)
- Modify: `app/(main)/home/page.tsx` (guest carousel, revisiting Task 4)

**Interfaces:**
- Consumes: anon grants from Task 5.
- Produces: guests see the full member list (public columns only).

- [ ] **Step 1: Guest branch in the people page.** In `app/(main)/people/page.tsx`, when `user` is null skip the viewer-profile query and fetch **exactly the granted columns** (selecting `*` or `bio` would 42501 as anon):

```tsx
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
    const { data: publicProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, grad_year, interests, club_roles")
        .not("full_name", "is", null)
        .order("grad_year", { ascending: false })

    const profiles = (publicProfiles ?? []).map(p => ({
        ...p,
        looking_for: null,
        bio: null,
        chapter_id: null,
        chapters: null,
    }))

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">People</h1>
                <p className="text-sm text-muted-foreground">
                    Students and alumni on High School Connections. Sign up to see full profiles and connect.
                </p>
            </div>
            <PeopleClient profiles={profiles} initialSearch={search ?? ""} viewerChapterId={null} isGuest />
        </div>
    )
}
```

The existing logged-in path is untouched.

- [ ] **Step 2: `people-client.tsx` guest tweaks.** Add optional prop `isGuest?: boolean` (default false). When `isGuest`: hide the "All chapters" toggle and the Looking-For filter section (guests have no `looking_for` data). Card clicks keep navigating to `/profile/[id]` — that page shows the lock card (Task 3).

- [ ] **Step 3: Guest home carousel.** In the Task 4 guest branch of `home/page.tsx`, before the `return`, fetch the same public columns (limit 12, newest grads first) and render the existing `PeopleCarousel` between the welcome banner and the blurred section:

```tsx
const { data: guestPeople } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, grad_year, interests, club_roles")
    .not("full_name", "is", null)
    .limit(12)
```

```tsx
{(guestPeople?.length ?? 0) > 0 && (
    <PeopleCarousel
        people={(guestPeople ?? []).map(p => ({ ...p, looking_for: null, bio: null }))}
        currentUserId=""
    />
)}
```

Check `PeopleCarousel`'s prop type first and match it exactly (add nullable fields the same way as Step 1 if it requires them).

- [ ] **Step 4: Verify** — logged out `/people` shows real members; the DevTools network request selects only the public columns; `/home` guest shows the carousel. Logged-in views unchanged.

- [ ] **Step 5: Commit** — `git commit -am "Public People directory and guest home carousel"`

---

### Task 7: Signup picker escape hatches

**Files:**
- Modify: `app/components/signup-form.tsx`
- Modify: `app/signup/page.tsx` (Task 11 also touches it; here only if needed)

**Interfaces:**
- Consumes: `chapters` prop already passed by `app/signup/page.tsx`.
- Produces: signup metadata `chapter_id` may be null (no-chapter signup).

- [ ] **Step 1: Extend the select.** In `signup-form.tsx`, add two sentinel options and handle them:

```tsx
const OPEN_A_CHAPTER = "__open__"
const NO_CHAPTER = "__none__"
```

```tsx
<select
    id="chapter"
    required
    value={chapterId}
    onChange={(e) => {
        if (e.target.value === OPEN_A_CHAPTER) {
            router.push("/apply")
            return
        }
        setChapterId(e.target.value)
    }}
    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
>
    <option value="">Select your school&hellip;</option>
    {chapters.map((c) => (
        <option key={c.id} value={c.id}>{c.school_name}</option>
    ))}
    <option value={OPEN_A_CHAPTER}>My school isn&apos;t listed — open a chapter</option>
    <option value={NO_CHAPTER}>I&apos;m not a student — continue without a chapter</option>
</select>
```

- [ ] **Step 2: Submit handling.** Replace the `if (!chapterId)` block's error with allowing `NO_CHAPTER`, and send null:

```tsx
if (!chapterId) {
    setError("Please select your school, or choose to continue without a chapter.")
    return
}
```

```tsx
data: {
    full_name: nameResult.value,
    // chapter_role is intentionally never sent here — see 001_chapters.sql §4.
    chapter_id: chapterId === NO_CHAPTER ? null : chapterId,
},
```

- [ ] **Step 3: Verify** — on `/signup` logged out the select lists real chapters (anon read, works after Task 5) plus both new options; choosing "open a chapter" navigates to `/apply` without submitting. Do NOT create a real test account.

- [ ] **Step 4: Commit** — `git commit -am "Add open-a-chapter and no-chapter options to signup"`

---

### Task 8: Join-a-chapter card on own profile

**Files:**
- Create: `app/components/profile/join-chapter-card.tsx`
- Modify: `app/components/profile/profile-view.tsx`
- Modify: `app/(main)/profile/[id]/page.tsx` (pass `chapterId`)

**Interfaces:**
- Consumes: Task 5's `authenticated` UPDATE grant on `profiles.chapter_id` + one-way trigger.
- Produces: `JoinChapterCard({ userId }: { userId: string })` — self-contained client component; fetches active chapters itself and writes `chapter_id`, then `router.refresh()`.

- [ ] **Step 1: Create the card**

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

type ChapterOption = { id: string; school_name: string }

export function JoinChapterCard({ userId }: { userId: string }) {
    const router = useRouter()
    const [chapters, setChapters] = useState<ChapterOption[]>([])
    const [selected, setSelected] = useState("")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const supabase = getSupaBrowserClient()
        supabase
            .from("chapters")
            .select("id, school_name")
            .eq("status", "Active")
            .order("school_name")
            .then(({ data }) => setChapters(data ?? []))
    }, [])

    async function handleJoin() {
        if (!selected) return
        setSaving(true)
        setError(null)
        const supabase = getSupaBrowserClient()
        const { error } = await supabase
            .from("profiles")
            .update({ chapter_id: selected })
            .eq("id", userId)
        setSaving(false)
        if (error) {
            setError("Could not join the chapter. Please try again.")
            return
        }
        router.refresh()
    }

    return (
        <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Join your school&apos;s chapter</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                    You&apos;re not part of a chapter yet. Pick your school to see its people, posts and events.
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                    <select
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        <option value="">Select your school&hellip;</option>
                        {chapters.map((c) => (
                            <option key={c.id} value={c.id}>{c.school_name}</option>
                        ))}
                    </select>
                    <Button onClick={handleJoin} disabled={!selected || saving}>
                        {saving ? "Joining…" : "Join"}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    School not listed? <Link href="/apply" className="text-primary hover:underline">Open a chapter</Link>.
                    Joining is one-time — contact an admin to change it later.
                </p>
            </CardContent>
        </Card>
    )
}
```

- [ ] **Step 2: Wire it in.** Read `app/(main)/profile/[id]/page.tsx` and `profile-view.tsx` first: the page selects `*` from profiles so `chapter_id` is present. Add `chapter_id?: string | null` to `profile-view.tsx`'s `Profile` type, and render at the top of the view (right under the error/success banners):

```tsx
{isOwnProfile && !profile.chapter_id && userId && (
    <JoinChapterCard userId={userId} />
)}
```

- [ ] **Step 3: Verify with a DO-block probe** (no live account mutation): confirmed already in Task 5 Step 4. In the browser, a chapterless account (if one exists) shows the card; accounts with chapters don't. Don't create accounts just to test — the DB probe covers the write path.

- [ ] **Step 4: Commit** — `git commit -am "Add join-a-chapter card for chapterless members"`

---

### Task 9: Chapters page + nav link + event categories

**Files:**
- Modify: `lib/category-colors.tsx`
- Create: `app/(main)/chapters/page.tsx`
- Modify: `app/components/navbar.tsx` (add tab)
- Modify: `app/components/chapter-admin/chapter-admin-dashboard.tsx` (CATEGORIES list)

**Interfaces:**
- Consumes: `LockedPage` (Task 1), `categoryChip`/`categoryIcon` from `lib/category-colors.tsx`, `activeFilter` from `lib/lifecycle`, `JoinChapterCard` (Task 8).
- Produces: route `/chapters`; category strings `"Meetings" | "Trips" | "Fundraisers" | "Announcements"` valid alongside existing `"Clubs"`/`"Events"`.

- [ ] **Step 1: Categories.** `CATEGORY_META` already has `Clubs` and `Events`. Add four entries (icons from lucide: `CalendarClock` for Meetings, `Bus` for Trips, `PiggyBank` for Fundraisers, `Megaphone` for Announcements) following the existing chip-class pattern, e.g.:

```tsx
Meetings: {
    icon: <CalendarClock className="size-4" />,
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
},
Trips: {
    icon: <Bus className="size-4" />,
    chip: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300",
},
Fundraisers: {
    icon: <PiggyBank className="size-4" />,
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
},
Announcements: {
    icon: <Megaphone className="size-4" />,
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
},
```

In `chapter-admin-dashboard.tsx`, find the hand-maintained `CATEGORIES` array and append `"Clubs", "Events", "Meetings", "Trips", "Fundraisers", "Announcements"` (skip any already present). **Do not** add them to the main opportunities/home lists — chapter-only categories (documented multi-list gotcha).

- [ ] **Step 2: The page.** Create `app/(main)/chapters/page.tsx`:

```tsx
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { LockedPage } from "@/app/components/layout/locked-page"
import { JoinChapterCard } from "@/app/components/profile/join-chapter-card"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { ExternalLink } from "lucide-react"
import { categoryChip, categoryIcon } from "@/lib/category-colors"
import { activeFilter } from "@/lib/lifecycle"

// Chapter-page display order: chapter-life categories first, then any
// career categories a chapter admin happens to use. Hand-maintained, like
// every other category list in this codebase.
const CHAPTER_CATEGORIES = [
    "Announcements", "Meetings", "Events", "Trips", "Fundraisers", "Clubs",
    "Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering", "Programs",
]

export default async function ChaptersPage() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
            <LockedPage
                variant="chapters"
                title="Chapter pages are for members"
                description="Create a free account to see what's happening at your school's chapter."
            />
        )
    }

    const { data: viewerProfile } = await supabase
        .from("profiles")
        .select("chapter_id, chapters(id, name, school_name)")
        .eq("id", user.id)
        .single()

    const chapter = viewerProfile?.chapters ?? null

    if (!chapter) {
        return (
            <div className="max-w-xl mx-auto flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Chapters</h1>
                    <p className="text-sm text-muted-foreground">
                        Chapters are per-school hubs for meetings, events, trips and local opportunities.
                    </p>
                </div>
                <JoinChapterCard userId={user.id} />
            </div>
        )
    }

    const { data: items } = await supabase
        .from("opportunities")
        .select("*")
        .eq("chapter_id", chapter.id)
        .or(activeFilter())
        .order("created_at", { ascending: false })

    const grouped: Record<string, NonNullable<typeof items>> = {}
    for (const cat of CHAPTER_CATEGORIES) {
        const inCat = (items ?? []).filter(i => i.category === cat)
        if (inCat.length > 0) grouped[cat] = inCat
    }
    // categories not in the display list still render, at the end
    const known = new Set(CHAPTER_CATEGORIES)
    const leftovers = (items ?? []).filter(i => !known.has(i.category))
    if (leftovers.length > 0) grouped["Other"] = leftovers

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">{chapter.name} chapter</h1>
                <p className="text-sm text-muted-foreground">
                    What&apos;s happening at {chapter.school_name}.
                </p>
            </div>

            {Object.keys(grouped).length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground text-sm">
                        Nothing here yet — your chapter admins haven&apos;t posted any chapter events or opportunities.
                    </CardContent>
                </Card>
            ) : (
                <div className="flex flex-col gap-8">
                    {Object.entries(grouped).map(([category, opps]) => (
                        <div key={category} className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <div className={`size-7 rounded-md flex items-center justify-center ${categoryChip(category)}`}>
                                    {categoryIcon(category)}
                                </div>
                                <h2 className="font-semibold text-base">{category}</h2>
                                <span className="text-sm text-muted-foreground">({opps.length})</span>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {opps.map(opp => (
                                    <Card key={opp.id}>
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <CardTitle className="text-sm font-semibold leading-snug">{opp.title}</CardTitle>
                                                <Badge variant="secondary" className={`shrink-0 text-xs ${categoryChip(opp.category)}`}>
                                                    {opp.category}
                                                </Badge>
                                            </div>
                                            {opp.organization && (
                                                <CardDescription className="text-xs">
                                                    {opp.organization}
                                                    {opp.location ? ` · ${opp.location}` : ""}
                                                </CardDescription>
                                            )}
                                        </CardHeader>
                                        <CardContent className="flex flex-col gap-3">
                                            <p className="text-xs text-muted-foreground">{opp.description}</p>
                                            <div className="flex items-center justify-between gap-2">
                                                {opp.deadline ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(opp.deadline).toLocaleDateString()}
                                                    </span>
                                                ) : <span />}
                                                {opp.url && (
                                                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" asChild>
                                                        <a href={opp.url} target="_blank" rel="noopener noreferrer">
                                                            Details <ExternalLink className="size-3" />
                                                        </a>
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 3: Nav tab.** In `navbar.tsx` `NAV_TABS`, insert between Opportunities and Community:

```tsx
{ label: "Chapters", href: "/chapters", icon: School },
```

(import `School` from lucide-react).

- [ ] **Step 4: Verify** — logged out: `/chapters` shows lock. Logged in with the stuy chapter: chapter header + existing chapter-scoped opportunities appear grouped. Chapter-admin dashboard's category dropdown offers the new event categories.

- [ ] **Step 5: Commit** — `git commit -am "Add Chapters page, nav tab and chapter-life categories"`

---

### Task 10: Opportunities page becomes national-only

**Files:**
- Modify: `app/(main)/opportunities/page.tsx`

- [ ] **Step 1:** Remove the `chapterFilter` merge: both the list query and the archived query use `.is("chapter_id", null)` unconditionally. Delete the now-unused `viewerProfile.chapter_id` read (keep `is_admin`). Update the page description copy to "Browse internships, jobs, research positions and more, open to every chapter." Add a small link under the header for members with a chapter: `Looking for your school's events? → /chapters`.

- [ ] **Step 2: Verify** — logged in: `/opportunities` no longer shows chapter-scoped rows (they're on `/chapters` now); archived section behaves; home page featured section (which still merges both) unchanged.

- [ ] **Step 3: Commit** — `git commit -am "Scope /opportunities to national listings only"`

---

### Task 11: Retire subdomain routing

**Files:**
- Modify: `proxy.ts`
- Modify: `app/auth/callback/route.ts`
- Modify: `app/signup/page.tsx`
- Modify: `app/(marketing)/page.tsx`
- Delete: `lib/chapter.ts`
- Modify: `lib/chapter-shared.ts`

**Interfaces:**
- Consumes: nothing new. **The proxy session-refresh block is untouchable.**

- [ ] **Step 1: proxy.ts** — delete `resolveSlug()` and the header block (lines importing `CHAPTER_SLUG_HEADER`/`SLUG_PATTERN`/`DEV_HOSTS`/`DEFAULT_CHAPTER_SLUG` and the `requestHeaders` slug set/delete). Keep forwarding `request.headers` untouched: `let response = NextResponse.next()` (and the same in `setAll`). Everything from the `authCookies` filter down stays byte-identical.
- [ ] **Step 2: auth callback** — remove the `getChapterSlug` import/backfill block and the `getChapterHomeUrl` cross-subdomain redirect; keep self-heal, onboarding gate, and `destinationPath` redirect on the same origin.
- [ ] **Step 3: signup page** — drop `getCurrentChapter` usage; pass `chapterId={null} chapterName={null}` (or remove those props from `SignupForm` entirely — remove them, they're now dead).
- [ ] **Step 4: marketing page** — delete the `chapter` variant branch and the `getCurrentChapter` import; keep the generic hero (with its guest button from Task 4).
- [ ] **Step 5: lib cleanup** — delete `lib/chapter.ts`. In `lib/chapter-shared.ts`, check remaining consumers with Grep (`CHAPTER_SLUG_HEADER|ROOT_DOMAIN|DEV_HOSTS|SLUG_PATTERN|DEFAULT_CHAPTER_SLUG|getChapterHomeUrl`); `lib/supabase/cookie-domain.ts` likely uses `ROOT_DOMAIN`/`DEV_HOSTS` — keep what's used, delete the rest.
- [ ] **Step 6:** `rm -rf .next/dev/types` (stale route types after deleting files), then `npx tsc --noEmit` in background. Expected: no new errors.
- [ ] **Step 7: Verify** — log in on localhost (no `?chapter=` param): everything works; Google/email login lands on `/home`. `.env` `NEXT_PUBLIC_COOKIE_DOMAIN` behavior unchanged.
- [ ] **Step 8: Commit** — `git commit -am "Retire chapter subdomain routing; chapter identity comes from profiles"`

---

### Task 12: Full verification pass

- [ ] **Step 1:** `npm run lint` (background). Expected: error/warning count ≤ baseline (~53/14); no new rules tripped by new files.
- [ ] **Step 2:** `npx tsc --noEmit` (background). Expected: clean or baseline-only.
- [ ] **Step 3:** `npm run build` (background; if OneDrive `os error 426`/`errno -4094`, rerun once). Expected: success.
- [ ] **Step 4: Manual matrix, logged out** — `/` (guest button), `/home` (guest view), `/people` (real list, only public columns in network tab), `/about` + `/contact` (render; submit path exists), `/opportunities` `/community` `/chapters` `/profile/<id>` (lock cards, zero data requests), `/messages` `/admin` (redirect to login).
- [ ] **Step 5: Manual matrix, logged in** — everything as before plus `/chapters` shows chapter items; `/opportunities` national-only; navbar has Chapters tab.
- [ ] **Step 6:** Final commit of any stragglers. Do not push until the user says to.
