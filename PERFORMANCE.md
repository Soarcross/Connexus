# Connexus — Navigation Performance Research

**Status:** Run 1 complete (investigation only — no application code modified).
**Primary objective:** minimise `p95_navigation_ms` — 95th percentile elapsed time from
initiating an internal navigation to the destination page being *usable*.
**Hard constraint:** zero intentional visual or UX change. Performance must come from the
implementation, never from what the user sees.

---

## 1. Environment (as measured, 2026-08-27)

| Fact | Value |
|---|---|
| Framework | Next.js **16.2.11**, App Router, React 19.2.4, Turbopack build |
| Node | v24.15.0 |
| Router mode | App Router only. No `pages/` directory. |
| Middleware | `proxy.ts` (Next 16.2+ rename of `middleware.ts`), matcher excludes `_next/static`, `_next/image`, `favicon.ico` and any path with a dot |
| Backend | Supabase project `ezbnpauicgchhmjjmqxq` — **production, and the only project.** `list_branches` returned `[]`. No staging, no dev branch. |
| Postgres | 17.6 |
| Auth JWT | **ES256 asymmetric**, JWKS live at `/auth/v1/.well-known/jwks.json` (verified HTTP 200) |
| supabase-js / ssr / auth-js | 2.100.1 / 0.9.0 / 2.100.1 (`getClaims()` present in auth-js) |
| Deploy target | Vercel, `hsconnexus.com` |
| Build | `npm run build` succeeds (exit 0). 27 routes; **every content route is `ƒ` dynamic** |
| Client JS emitted | 1,751,933 bytes total across `.next/static/chunks` (pre-gzip, all routes combined) |
| Test framework | none. `@playwright/test@1.62.1` is installed (uncommitted `package.json` change) |

### Measured Supabase round-trip latency from this machine

```
/auth/v1/health        cold-ish 265 ms, then 81 / 144 / 68 / 79 ms
/rest/v1 new TCP+TLS each:   607 / 344 / 116 ms
/rest/v1 keep-alive, 5 sequential: 120 / 82 / 58 / 74 / 74 ms
```

**Warm, connection-reused Supabase round trip ≈ 60–85 ms; cold ≈ 120–600 ms.**
This is the unit of currency for everything below: the app's latency is essentially
*(number of sequential Supabase round trips) × 60–85 ms*, with the tail driven by cold
connections — which is exactly why p95, not mean, is the right objective.

### Dataset size (production, read-only counts)

| table | rows |
|---|---|
| profiles | 55 |
| auth.users | 57 |
| opportunities | 4 |
| community_posts | 0 |
| conversations | 22 |
| messages | 33 |
| chapters | 3 |
| extension_requests | 0 |

**Query *execution* time is negligible.** At these row counts every query is sub-millisecond
in Postgres. The latency is round-trip *count*, not database work. Any hypothesis of the
form "add an index" is unsupported by evidence at this scale and is explicitly
deprioritised (§4).

---

## 2. Architecture relevant to performance

### Request path for one authenticated navigation

```
browser
  └─ proxy.ts                              ← RUNS FIRST, BLOCKING
       └─ supabase.auth.getUser()          ── network round trip
  └─ RSC render (layout and page render concurrently)
       ├─ app/(main)/layout.tsx
       │    ├─ supabase.auth.getUser()     ── network round trip
       │    └─ profiles + chapters(name)   ── network round trip (sequential after it)
       └─ app/(main)/<route>/page.tsx
            └─ its own getUser() -> chain  ── see §3
```

Three facts compound here:

1. **`auth.getUser()` is a network call.** auth-js always issues `GET /auth/v1/user`
   against the Supabase Auth server. It is called in `proxy.ts`, again in
   `app/(main)/layout.tsx`, and again in **every single page** — three round trips per
   navigation to validate one identical JWT.
2. **Nothing is deduplicated.** No `React.cache()` / `unstable_cache` anywhere in `app/`
   or `lib/`, so the layout's `getUser()` and the page's `getUser()` are two distinct
   HTTP requests inside the same render.
3. **Nothing is cached or streamed.** No `export const revalidate`, no `export const
   dynamic`, no `use cache`, and — critically — **zero `loading.tsx` files in the entire
   app** (`find app -name loading.tsx` returns nothing; same for `error.tsx`,
   `template.tsx`).

### The `loading.tsx` consequence — this is the perceived-lag mechanism

With no loading boundary anywhere:

- Next.js cannot stream. The RSC payload is sent only once the *entire* page chain,
  including every sequential Supabase call, has resolved.
- The browser therefore keeps showing the **old page, frozen**, for the full duration of
  the server chain. That is precisely the reported symptom.
- `<Link>` prefetch is effectively inert. For a dynamic route, Next's default
  (`prefetch={null}`, "auto") prefetches only down to the nearest loading boundary. With
  no boundary there is nothing reusable to prefetch, so the navbar's `<Link>` prefetching
  currently buys nothing.

### Server / client boundary

Data fetching is correctly server-side; this part of the architecture is sound. The only
client-side fetch-on-mount is:

- `app/components/navbar.tsx:58` — unread message count, plus a `postgres_changes`
  subscription on **all** INSERT/UPDATE on `messages` (unfiltered), refetching the count
  on any message anywhere in the platform. Navbar lives in the persisted layout, so this
  runs once per hard load, not per client-side navigation.
- `app/components/messages/chat-window.tsx:46` — per-conversation realtime INSERT channel.
- `app/components/people/people-client.tsx:63` — lazy "All chapters" roster, only on an
  explicit user toggle. Correct as written.

35 files carry `"use client"`. Largest client components: `admin-dashboard.tsx` (1829
lines), `profile-view.tsx` (627), `chapter-admin-dashboard.tsx` (528), `posts-feed.tsx`
(491), `ui/chart.tsx` (373).

### Navigation mechanism

Nav tabs use `<Link>`. But several primary navigations are `<div onClick={() =>
router.push(...)}>`:

| file:line | navigation |
|---|---|
| `messages/conversation-list.tsx:53` | messages → conversation |
| `home/people-carousel.tsx:52` | home → profile |
| `community/posts-feed.tsx:372,382` | community → profile |
| `navbar.tsx:211` | menu → profile / about / contact / admin |
| `admin/admin-dashboard.tsx:1139` | admin → profile |

`router.push` performs no prefetch and is not eligible for the prefetching a `<Link>`
would do. These are exactly the paths the brief names as important (*messages →
conversation*, *home → profile*).

---

## 3. Sequential Supabase round trips per route — the core evidence

Counted by reading each page. "Stages" = round trips that are **strictly sequential**
(each awaits the previous). "Reqs" = total HTTP requests issued.

| Route | Page-level chain | Stages | Reqs | +proxy | Floor @70 ms |
|---|---|---|---|---|---|
| `/opportunities` | getUser → viewerProfile → opportunities → archived → pendingExtensions | **5** | 5 | 6 | **~420 ms** |
| `/messages` | getUser → conversations → *(per conv: profile → lastMessage → unreadCount)* | **5** | 2+3N | 6 | ~420 ms |
| `/messages/[id]` | getUser → conversation → otherProfile → messages → UPDATE read | **5** | 5 | 6 | ~420 ms |
| `/home` | getUser → currentProfile → allProfiles → 7 parallel featured queries | **4** | 10 | 5 | ~350 ms |
| `/profile/[id]` | getUser → profile → viewer interests *(→ chapters if own+chapterless)* | **3–4** | 3–4 | 4–5 | ~280 ms |
| `/people` | getUser → viewerProfile → profiles | **3** | 3 | 4 | ~280 ms |
| `/community` | getUser → Promise.all[viewerProfile, myPosts, pendingExt] → posts | **3** | 5 | 4 | ~280 ms |
| `/chapters` | getUser → viewerProfile → Promise.all[chapters, allProfiles] | **3** | 4 | 4 | ~280 ms |
| `/chapters/[slug]` | getUser → chapter → Promise.all[profiles, items] | **3** | 4 | 4 | ~280 ms |
| *(layout, concurrent)* | getUser → profiles+chapters | 2 | 2 | — | ~140 ms |

The floors assume every round trip is warm and that Node reuses the TLS connection. p95 is
by definition the tail, where the measured cold connections (120–600 ms) dominate.

### Specific findings, with file:line

1. **`app/(main)/opportunities/page.tsx:11,22,33,52`** — five strictly sequential awaits.
   `opportunities`, `archived` and `pendingExtensions` are mutually independent;
   `archived` only branches on `isAdmin` derived from `viewerProfile`.
2. **`app/(main)/messages/page.tsx:23-56`** — N+1. For each conversation, three
   *sequential* queries (`profiles`, last `message`, unread `count`). `Promise.all` fans
   out across conversations, so it is 3 sequential stages but **2+3N total requests**.
   Collapsible to one embedded query or one RPC.
3. **`app/(main)/home/page.tsx:138-153`** — seven separate `opportunities` queries, one
   per category, against a table containing **4 rows in total**. One query plus in-memory
   grouping is exactly equivalent.
4. **`app/(main)/messages/[conversationId]/page.tsx:46-52`** — the `UPDATE messages SET
   read = true` is `await`ed *inside the render*, blocking HTML on a write whose result
   the page never reads.
5. **`app/(main)/profile/[id]/page.tsx:74-81`** — the viewer's own `interests` are fetched
   in a second round trip after the profile; the two are independent.
6. **`app/(main)/chapters/page.tsx:39-41`** — `select("chapter_id")` over **all** profiles
   to compute member counts in JS; an aggregate would return 3 rows.
7. **`proxy.ts:60`** — `getUser()` on every matched request, including every RSC
   navigation fetch, unconditionally, even when the access token is nowhere near expiry.
   The refresh here is genuinely load-bearing (documented at length in CLAUDE.md and in
   the file itself) — but *refreshing* and *validating on every hop* are separable concerns.
8. **`app/(main)/layout.tsx:9,13`** — a third `getUser()` plus a profile read, duplicating
   what most pages then fetch again themselves.

---

## 4. Ranked hypotheses / proposed experiments

Ordered by expected effect ÷ risk. **One hypothesis per experiment.** None of these
changes a pixel of rendered output; each will be pixel-verified before acceptance.

| # | Hypothesis | Expected saving | Risk | Visual risk |
|---|---|---|---|---|
| **E1** | The three `auth.getUser()` calls per navigation are three network round trips validating one JWT. Wrapping the server-side user lookup in React `cache()` collapses layout+page into one. | −1 RT everywhere (~70–150 ms) | low | none |
| **E2** | `getUser()` hits `/auth/v1/user` over the network; this project signs with **ES256** and publishes JWKS, so `getClaims()` verifies the same token **locally** with zero round trips. Replacing server-side `getUser()` where only `id`/`email` are needed removes the auth RT entirely. | −1 to −2 RT (~70–300 ms) | medium — **security-relevant**, needs explicit reasoning and sign-off | none |
| **E3** | `/opportunities`' five sequential awaits are independent; `Promise.all` collapses them to two stages. | −2 to −3 RT on the slowest route | low | none |
| **E4** | `/messages` N+1 (2+3N requests) collapses to one query with PostgREST embeds, or one RPC. | −2 stages, −3N requests | low–med (must preserve identical ordering and fields) | none |
| **E5** | `/home`'s seven per-category queries against a 4-row table collapse to one query plus grouping. | −6 requests | low | none |
| **E6** | `messages/[id]`'s awaited read-receipt UPDATE blocks the render for a value never used. | −1 RT on a slowest path | med (must not lose the write or break the unread badge) | none |
| **E7** | `router.push` card-clicks get no prefetch. Converting to `<Link>` with identical markup and classes enables prefetch and native navigation. | large on *messages → conversation* and *home → profile* | med (must preserve exact DOM/CSS and click behaviour) | **must be pixel-verified** |
| **E8** | `proxy.ts` refreshes on every request; decoding `exp` locally and skipping the refresh when the token is not near expiry removes the blocking pre-render RT from most navigations. | −1 RT on nearly all navigations | **high** — this refresh is load-bearing (the 89-failed-`/token`-per-day incident). Needs very careful treatment. | none |
| **E9** | `/chapters` ships all 55 `chapter_id`s to count members; an aggregate returns 3 rows. | small | low | none |
| **E10** | `recharts` sits in the 434 KB chunk and is admin-only; confirm it is not in a shared chunk pulled by ordinary routes. | bundle only | low | none |
| **E11** | *(Deferred — requires explicit developer approval.)* Adding `loading.tsx` would let Next stream and make `<Link>` prefetch effective. **But it introduces a visible loading state where today the old page stays put** — a UX change under the brief's hard constraint, and one that would flatter the benchmark rather than make the app faster. **Not to be done unilaterally.** | potentially the largest | — | **yes — rejected by default** |

Deliberately **not** on the list: adding indexes (no evidence — see the dataset in §1),
any schema change, any layout/spacing/typography change, removing the guest blur-gate,
lowering image quality, deferring visible content.

---

## 5. Benchmark design (to be built in run 2)

**Harness:** `@playwright/test`, Chromium, `workers: 1`, `fullyParallel: false`, viewport
1440×900, deterministic waits only — no `waitForTimeout`.

**Environment:** local **production** build (`next build` then `next start`), not `next
dev` — dev-mode compilation would swamp the signal. Points at the real Supabase project so
auth/DB round-trip cost is realistic. This isolates *application* changes while keeping the
round-trip cost that is the actual bottleneck.

**Auth:** log the benchmark account in **once**, persist `storageState`, reuse it. Login
time is excluded from the metric.

**What is measured:** in-page `performance.now()` deltas, captured by injecting a resolver
before the click that settles when the destination's usable condition is met
(MutationObserver + rAF, not polling sleeps). This measures the client-side navigation a
user actually performs: click a real in-app link, wait until the destination is usable.

**Usable conditions** — each is real content, never merely "URL changed":

| navigation | usable when |
|---|---|
| home → opportunities | `h1` "Opportunities" visible **and** the first opportunity card (or the real empty-state card) present |
| home → people | `h1` "People" **and** the first profile card rendered |
| home → messages | `h1` "Messages" **and** the conversation list (or its real empty state) rendered |
| home → profile (own) | profile name heading rendered **and** the edit affordance present |
| home → community | `h1` "Community" **and** the feed container populated |
| home → chapters | `h1` "Chapters" **and** the first chapter card |
| messages → conversation | thread container rendered **and** the composer input enabled |
| chapters → chapter detail | chapter name heading **and** the tabs interactive |
| people → profile | the target profile's name heading rendered |

**Protocol:** paths are **interleaved round-robin**, not run in blocks, so ambient network
drift spreads evenly across paths instead of biasing one. 30 repetitions per path. Each
repetition: settle on the origin route, arm the timer, click, await usable, record; then an
unmeasured return navigation that also waits on the origin's usable condition.

**Recorded per run:** raw per-navigation ms; median / p90 / **p95** / p99 per path and
overall; request count, transferred bytes, failed requests, console errors, page errors
(via CDP); JS bytes per route.

**Outputs:** `perf/results/<timestamp>.json` (machine-readable) plus a human-readable
summary table. Once baselined, **the benchmark does not change** for the rest of the
research.

**Noise discipline:** the baseline is run **twice** before any code change, to establish
run-to-run variance. An experiment is KEEP only if its p95 improvement exceeds that
variance.

---

## 6. Open question blocking run 2 — the benchmark account

The brief requires a dedicated temporary student-level benchmark account, and requires
that no user or data be created in a production project without explicit approval.

**`ezbnpauicgchhmjjmqxq` is production and is the only Supabase project.**
`list_branches` returned `[]`; CLAUDE.md states "there is exactly one Supabase project and
it is production — no staging, no branches."

Options:

- **A** — approve creating one temporary non-admin user (`is_admin=false`,
  `chapter_role='member'`) in production, plus the minimum rows the messages paths need.
  Credentials in `.env.benchmark.local` (gitignored), never in source, never printed.
  Deleted at the end of the research after verifying nothing pre-existing is touched.
- **B** — run the benchmark as the developer's own existing account, credentials supplied
  via `.env.benchmark.local`. No writes to production at all.
- **C** — stand up a separate free Supabase project as staging and seed it. Cleanest, but
  requires replicating the schema, which lives only in the remote project (committed
  migrations cover a subset).

**No Supabase write of any kind has been performed.** Every query so far was read-only:
`count(*)`, `pg_indexes`, `list_branches`.

---

## 7. Experiment log

*(empty — no application code has been modified)*

### Current best

| metric | value |
|---|---|
| baseline p95 | **not yet measured** |
