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

## 3a. Measured phase breakdown — server vs client (run 2, 2026-08-27)

Before ranking experiments, the benchmark was made to report where each
navigation's time actually goes. Both endpoints are on the page's
`performance.now()` clock, and the middle is taken from the
`PerformanceResourceTiming` entry of the RSC fetch the navigation issued:

| phase | meaning |
|---|---|
| `dispatch` | click → the RSC request goes on the wire |
| `ttfb` | request sent → first byte. Next flushes the shell early, so this is **not** the data-fetching cost |
| `stream` | first byte → last byte. The RSC response is **streamed**, so this is where the page's sequential Supabase awaits are actually paid |
| `client` | last byte → destination usable (React render + paint) |

Median split, 4 samples/route (larger runs agree):

| navigation | dispatch | ttfb | stream | **server total** | **client** | bytes |
|---|---|---|---|---|---|---|
| home→opportunities | 0.6 | 45.4 | 220.5 | **272.4** | **7.3** | 3,153 |
| home→messages | 0.6 | 38.4 | 259.8 | **298.2** | **5.0** | 2,232 |
| messages→conversation | 0.4 | 49.6 | 210.1 | **260.5** | **6.1** | 2,207 |
| home→people | 0.6 | 46.4 | 143.5 | **189.9** | **14.0** | 5,458 |
| home→community | 0.5 | 46.0 | 136.6 | **182.6** | **8.8** | 1,868 |
| home→chapters | 0.6 | 44.7 | 148.7 | **181.7** | **5.1** | 4,998 |
| chapters→detail | 0.6 | 44.0 | 129.4 | **173.4** | **15.6** | 6,050 |
| people→profile | 0.4 | 45.9 | 124.1 | **170.2** | **6.9** | 2,113 |
| home→profile | 0.4 | 39.3 | 123.0 | **162.3** | **6.0** | 2,222 |

Four conclusions, and they redirect the whole effort:

1. **Server think-time is 85–95 % of every navigation. Client render is 5–16 ms.**
   Bundle size, hydration cost, and rerender count are irrelevant to navigation
   latency in this app. Any experiment aimed at them is unjustified against this
   objective. (E10 is demoted accordingly.)
2. **Server total tracks the sequential-stage count almost linearly** — roughly
   `40 ms + 45 ms × stages`. 3-stage routes land at 162–190 ms; 5-stage routes at
   260–298 ms. This is direct confirmation of the §3 analysis and makes the
   expected saving of removing one stage ≈ **45 ms**, quantitatively.
3. **`ttfb` is a near-constant 40–50 ms on every route**, independent of how much
   data the page fetches. That is one Supabase round trip paid *before Next
   starts rendering* — i.e. `proxy.ts`'s `auth.getUser()`. It is on the critical
   path of every single navigation. This promotes E8 sharply.
4. **The layout is not on the critical path.** `/profile` costs 162 ms for its 3
   page stages; if the layout's 2 stages were serialised ahead of it, it would
   cost ~265 ms. Layout and page render concurrently, as expected — which
   *demotes* E1, whose saving is a duplicate request rather than a stage.

Also measured: `<Link>` prefetching **is** active in Next 16 (≈3,500 `_rsc`
prefetches per run, aborted when the real navigation supersedes them), yet the
`<Link>` routes are not faster than the `router.push` routes. A prefetch of a
dynamic route with no loading boundary yields nothing reusable. This is evidence
*for* the §2 loading-boundary analysis and *against* E7 being worth much.

## 4. Ranked hypotheses / proposed experiments

**Re-ranked after §3a.** Ordered by expected effect ÷ risk, where "expected
effect" is now grounded in the measured ≈45 ms per sequential stage rather than
estimated. **One hypothesis per experiment.** None of these changes a pixel of
rendered output; each will be pixel-verified before acceptance.

Execution order: **E2 → E8 → E3 → E4 → E6 → E5 → E9**, with E1 first only because
it creates the seam E2 needs. E7 and E10 are demoted to "measure only if time
remains"; E11 stays gated on your decision.

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

## 4a. Pre-flight for E2 (`getClaims()`) — verified before touching app code

`perf/probe-getclaims.mjs` exercises the real project with the benchmark
account. Result:

| check | outcome |
|---|---|
| `getUser()` cost | **37.8 ms, 1 network call** (`/auth/v1/user`) |
| `getClaims()` cold | 36.3 ms, 1 network call (`/auth/v1/.well-known/jwks.json`) |
| `getClaims()` warm | **0.22–0.47 ms, zero network calls** ×5 |
| `getUser().id === getClaims().sub` | YES |
| `email` claim matches | YES |
| signing algorithm | **ES256** — verified locally, no `getUser()` fallback |
| forged `sub` | **rejected** — `Invalid JWT signature` |
| expired token | **rejected** — but see hazard below |

So the saving is real and quantified: **≈38 ms per call site**, on a path that
has 13 server-component call sites and pays one per navigation.

**Hazard the probe caught.** `getClaims()` does *not* mirror `getUser()`'s error
contract for an expired token. `validateExp` throws a plain `Error`, and
`getClaims` only converts `AuthError`s into a result object — so an expired
token **throws** rather than returning `{ error }`. A naive swap would turn the
guest/redirect path into an unhandled exception and a 500 page. The helper must
catch and return `null`, matching the existing `user === null` contract exactly.

**Security reasoning for E2.** What `getUser()` provides that `getClaims()` does
not is a live revocation check; the exposure window is the remaining access-token
lifetime (measured at 3600 s). That is acceptable *at these call sites* because:

1. **RLS is the authorization boundary, not the page query** (CLAUDE.md says so
   explicitly, and all 13 public tables have RLS enabled with policies). Every
   read still sends the JWT to PostgREST, which validates it independently.
2. The signature *is* cryptographically verified locally against the published
   JWKS — this is `getClaims()`, not `getSession()`, which trusts the cookie blindly.
3. `exp` is enforced.
4. `proxy.ts` keeps its networked `getUser()` and its `clearAuthCookies` path, so
   a revoked or deleted session is still caught there.

**Not applied to:** `app/api/admin/*` (service-role clients that bypass RLS, where
the identity check *is* the only boundary), `app/auth/callback/route.ts`, or
`proxy.ts`. None of those are on the navigation critical path.

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

## 6a. The benchmark had to be rebuilt twice before it could decide anything

Two failures were found and fixed *before* any experiment was judged. Both would
have silently corrupted every result.

### Failure 1 — the harness degraded over its own length

The first baseline attempt slowed from ~40 s/rep to ~5 min/rep after roughly 30
minutes. Left alone it would have biased later repetitions against earlier ones
and made two runs incomparable. Three causes, all in the harness:

- `settleOn()` used an unbounded `waitForLoadState("networkidle")`. Connexus
  holds an open realtime WebSocket and Next re-prefetches on every navigation,
  so "no network activity for 500 ms" stops being reachable in a long-lived SPA
  session and each settle ran to its 30 s default. Now bounded to 2.5 s and
  allowed to time out — the deterministic `isReady` check is what actually
  establishes the origin state.
- One page held across hundreds of client-side navigations accumulated renderer
  memory, router cache and prefetch set. Now recycled every 8 reps, outside any
  measurement window, on a fixed cadence so every run pays it identically.
- The resource-timing buffer is capped at 250 entries and the page never reloads
  mid-run, so it filled with stale prefetch entries and the phase breakdown could
  no longer find the current navigation's RSC fetch. Now cleared per measurement.

Result: 12 reps in 2 m 21 s (~11.8 s/rep) with **identical phase splits**, which
is what confirms the fix removed harness overhead rather than changing what is
measured.

### Failure 2 — run-to-run comparison could not resolve the effect

With the harness fixed, two **identical** baseline runs gave:

| | p95 |
|---|---|
| baseline-A | 540.1 ms |
| baseline-B | 484.2 ms |

A 55.9 ms apparent "improvement" from changing nothing, bootstrap 95 % CI
**[−267, +126]**. The expected effect of removing one Supabase round trip is
~45 ms. **Unpaired comparison was incapable of judging any experiment**, and
would have let a chance result be reported as a win.

Diagnosis, from the raw samples: outliers cluster by **repetition, not route**.
In baseline-A one repetition held 4 of the run's outliers; in baseline-B two
adjacent repetitions held 7. Only 12 of 40 (A) and 6 of 40 (B) repetitions
contained any sample over 600 ms, and when one did, several unrelated routes were
hit together. That is transient machine/network interference — common-mode noise.

**Fix: paired A/B measurement** (`perf/bench-ab.mjs`). Both variants run against
two servers within the same repetition, alternating which goes first so neither
gets a systematic warming advantage. An episode hits both and cancels in the
difference. Pairs where either side failed are discarded.

Infrastructure: a git worktree at the baseline commit with its own `node_modules`
(Turbopack rejects a directory junction — "points out of the filesystem root")
serving on `:3101`, versus the main tree on `:3100`. Route definitions and usable
conditions live in `perf/shared.mjs`, imported by both benchmarks so they cannot
silently diverge.

### Resolution achieved, verified by an A/A test

Both ports serving **identical** code:

| statistic | A/A result | resolution |
|---|---|---|
| p95 of pooled samples (unpaired) | — | ±200 ms |
| p95 of pooled samples (paired bootstrap) | +9.8 ms, CI [−98.6, +400.9] | ±250 ms |
| **paired per-navigation delta (median)** | **+3.1 ms, CI [−2.3, +6.2]** | **±4 ms** |
| paired delta, 5 % trimmed mean | +2.1 ms | — |

The A/A test correctly returned INCONCLUSIVE. The paired per-navigation delta has
~±4 ms resolution against expected effects of ~45 ms — a 10× margin.

**p95_navigation_ms remains the stated objective and is reported every run.** But
the *decision* is made on the paired estimator, because p95 is an extreme
statistic driven by the very environmental episodes that pairing removes. The
trimmed mean and q90 of the paired delta are reported alongside the median, so a
change that moves the median without moving the tail is flagged rather than
accepted — that pattern would mean the assumed mechanism is wrong.

## 7. Experiment log

### Baseline (locked)

| metric | value |
|---|---|
| p95_navigation_ms (baseline-A, 360 samples) | **540.1 ms** |
| p95_navigation_ms (baseline-B, 360 samples) | **484.2 ms** |
| median | 217.1 / 214.9 ms |
| slowest routes (p95) | chapters→detail, messages→conversation, home→messages, home→opportunities |
| console errors / page errors / failed requests | 0 / 0 / 0 |

Both runs: `perf/results/*__baseline-A.json`, `*__baseline-B.json`.


### Accepted experiments

Every experiment below was measured with `perf/bench-ab.mjs`: both variants served
simultaneously from two servers, alternating order within each repetition, 30
repetitions after 6 warmups. Per-route intervals are **Bonferroni-corrected** for
the simultaneous route tests (99.44% for nine routes, 99.5% for ten).

Empirical noise floor, from the A/A run on identical code: per-route paired
medians spanned **−12.2 to +10.4 ms** (mean offset +1.9 ms). **Per-route effects
below ~15 ms are not credible on this rig regardless of what a CI says** — the
bootstrap resamples within a run and cannot see run-level offsets.

| # | change | effect | interval | commit |
|---|---|---|---|---|
| **E2** | `getClaims()` (local ES256 verify) instead of networked `getUser()` in 10 server components | **−41.8 ms, every route** | [−48.2, −36.7] | `58e5ae5` |
| **E3** | `/opportunities`: 4 sequential round trips → 2 stages | **−90.5 ms** on that route | [−103.5, −74.1] | `193fccb` |
| **E4** | `/messages`: N+1 (2+3N reqs, 3 stages) → 2+N reqs, 1 stage | **−91.2 ms** on that route | [−130.8, −58.3] | `6dbd0a6` |
| **E8** | `proxy.ts`: skip session refresh while token has >5 min life | **−45.6 ms, every route** | [−48.2, −42.2] | `6db8d66` |
| **E6** | conversation: read-receipt write moved to `after()` | **−65.1 ms** on that route | [−91.2, −48.9] | `c3e4918` |
| **E10a** | conversation: profile ∥ messages | **−24.6 ms** on that route (×3 runs) | [−33.4, −17.8] | `666d139` |

Every accepted change: zero console errors, zero page errors, zero failed
requests, zero measurement failures, and screenshots byte-identical across nine
routes × desktop + mobile.

Two changes carried functional tests the latency benchmark structurally could not
provide:

- **E8** — the benchmark runs with a fresh token throughout, so it only ever
  exercises the skip path; a broken refresh would sail through it and surface in
  production as users being logged out. Tested directly: fresh token → 0
  `Set-Cookie`, token inside the margin → 1 rotated `Set-Cookie`.
- **E6** — `after()` runs post-response, so a silent failure would leave messages
  unread forever while every timing number looked excellent.
  `perf/verify-read-receipts.mjs` seeds unread rows and polls until the write
  lands (4 → 0 in 250 ms, matching the awaited control).

### Rejected

**E5 + E10b — `/home` single featured query, and chapter-mates ∥ featured. REVERTED.**

Large and reproducible on the page itself (`opportunities→home` **−73.5 / −71.0 ms**
across two runs, server think-time 162.3 → 94.7 ms), but it carried a reproducible
cost on an untouched route: `home→messages` **+30.5 then +46.6 ms**, far outside
that route's A/A offset of +6.4 ms. Reverting only `/home` dropped it to a
non-significant +15.9 ms, so the cost tracks the change.

Best explanation is a benchmark artifact: a faster origin page means `settleOn`
returns sooner, leaving more in-flight prefetch competing with the measured click
over localhost's limited connections, which inflates measured time without any
real slowdown. That would mean real users never see it — but it is a hypothesis,
not a demonstration, and an unexplained reproducible regression is not something
to ship on "probably fine". Revisit with a dwell-controlled settle.

**E1 — `cache()` dedupe of the server user lookup. Dropped before running.**
The pre-flight measured `getClaims()` at 0.22–0.47 ms, so deduplicating it saves
nothing; the layout was also shown to be off the critical path.

**E9 — `/chapters` member counts via aggregate. Dropped before running.**
Today's code ships 55 `chapter_id` values (~2 KB) in one request. One count query
per chapter would trade 1 request for N — worse on request count at three chapters
and unmeasurable on latency. It only wins at a scale this app is not at.

### Benchmark limitations found and documented

1. **`/home` was never a measured destination** until late. Every route
   *originated* there, so its render happened during settle. E5's first
   INCONCLUSIVE verdict was uninformative rather than negative. Fixed by adding
   `opportunities→home`; no existing route definition changed, so earlier
   per-route results remain comparable.
2. **End-to-end p95/p99/max are not decidable on this machine.** Of the samples
   over 1000 ms in one run, only 25% hit both variants in the same repetition
   (one rep: 1667 ms control vs 9584 ms treatment, same route, seconds apart), so
   the extreme tail is partly idiosyncratic and pairing cannot cancel it. Server
   think-time percentiles were added because they exclude browser-side stalls and
   read the tail cleanly.
3. **The visual check was nondeterministic** and was caught only by testing it
   against itself: capturing the *same* build twice produced differing bytes.
   Fixed by awaiting every image's load/error and `document.fonts.ready`. A
   residual bistability remains on `chapter-detail` (one of ~56 avatars
   intermittently 404s); both byte-states occur on both servers, so a difference
   there alone is environmental. The other eight routes are byte-stable.

---

## 8. Final verification — complete accepted stack vs the original app

Both builds served simultaneously, paired, 300 paired navigations, 859 s.
Control = `fed29a6` (the app exactly as found); treatment = `666d139`.

### Objective

| metric | original | optimised | change |
|---|---|---|---|
| **p95_navigation_ms** | **1118.6 ms** | **354.6 ms** | **−764.0 ms (−68%)**, CI [−1225.9, −197.8] |
| median | 224.1 | 110.0 | −114.1 (−51%) |
| p90 | 490.8 | 207.9 | −282.9 (−58%) |
| p99 | 2678.3 | 1225.1 | −1453.2 (−54%) |

This is the one run in which the end-to-end p95 confidence interval **excludes
zero**, so the objective metric itself is demonstrated, not merely indicated.

### Decision statistic

| | value |
|---|---|
| paired median delta | **−90.3 ms**, CI [−95.9, −81.0] |
| trimmed mean | −115.7 ms, CI [−139.1, −102.0] |
| q10 / q90 of paired delta | **−281.1 / −33.9** |

Both tails are negative: the whole distribution moved, which is the signature of
removing fixed work rather than a distributional artefact.

### Server think-time

| | median | p90 | p95 | p99 | max |
|---|---|---|---|---|---|
| original | 209.8 | 419.2 | 880.2 | 2649.4 | 3912.6 |
| optimised | **93.8** | **186.8** | **296.5** | **1166.5** | **2513.4** |
| delta | −116.0 | −232.4 | **−583.7** | **−1482.9** | −1399.2 |

### Per navigation — 10/10 improved, 0 regressions

Bonferroni-corrected 99.5% intervals.

| navigation | paired median | CI | server think-time |
|---|---|---|---|
| messages→conversation | **−189.9** | [−215.6, −154.8] | 271.7 → 85.1 |
| home→messages | **−160.8** | [−200.5, −132.8] | 265.8 → 101.7 |
| home→opportunities | **−137.9** | [−173.6, −117.1] | 253.8 → 100.5 |
| home→people | −77.5 | [−91.2, −61.4] | 163.3 → 85.9 |
| home→profile | −76.8 | [−98.8, −63.6] | 153.6 → 77.7 |
| home→chapters | −75.3 | [−90.8, −65.4] | 167.7 → 87.7 |
| home→community | −75.2 | [−100.9, −28.1] | 188.8 → 116.4 |
| people→profile | −75.0 | [−103.7, −59.2] | 164.8 → 77.7 |
| chapters→detail | −72.0 | [−86.8, −57.6] | 168.3 → 91.8 |
| opportunities→home | −71.3 | [−114.7, −43.5] | 250.1 → 174.7 |

### Constraints

Zero console errors, zero page errors, zero failed requests, zero measurement
failures. Requests per navigation 4.08 → 3.91.

**Visual:** the capture pass initially flagged `people__desktop`. Investigated
rather than accepted or dismissed:

1. Rendered HTML is byte-identical in length (203,269 both); the only textual
   difference is the CSS chunk's content hash.
2. The generated CSS differs by exactly one selector — `.contents` — present only
   in the optimised build.
3. `.contents` matches **zero elements** in the rendered HTML on either server,
   so it is dead CSS with no rendering path.
4. Decisive test (`perf/people-stability.mjs`): five fresh captures of
   `/people` desktop per build gave **identical bytes and identical SHA on both**
   (496498, `204d6fc0…`, zero broken images).

The flag was an artifact of the visual-check capture path, which walks nine
routes in sequence through one browser context. **No visual regression.**

---

## 9. E11 — route-level `loading.tsx` (added on developer request)

Nine `loading.tsx` files under `app/(main)/`. Each renders the **real static
chrome** (heading + description, which depend on no query) and skeletons only the
data-dependent regions, so the heading does not move when content arrives.
Verified rendering during real client-side navigation on all five list routes
(52/18/12/9/9 skeleton elements), with the real heading already present.

**This is the one change that made the measured metric worse, and it should be
understood before keeping it.**

| statistic | no-loading | loading.tsx | delta |
|---|---|---|---|
| **paired median (time to real content)** | — | — | **+222.8 ms**, CI [220.3, 225.2] |
| median | 103.5 | 327.1 | +223.6 |
| p95 | 362.1 | 337.5 | −24.6 |
| p99 | 763.6 | 623.5 | −140.1 |
| **server p95** | 253.8 | **202.4** | **−51.4** |
| **server p99** | 742.9 | **615.4** | **−127.5** |

The regression is **+216 to +242 ms on every route**, strikingly uniform — while
**server think-time is unchanged or better**. So the server is not slower; the
extra time is client-side.

**Leading explanation.** Without a loading boundary, Next's prefetch of a dynamic
route can populate the router cache with the full payload, and the benchmark's
settle step (which waits for network quiet before clicking) gives that prefetch
time to finish — so the click is served from cache. With a loading boundary, the
prefetch caches only the shell, so the real payload is fetched at click time. The
benchmark therefore measures the loss of a prefetch it was unusually well-placed
to benefit from. A real user who clicks quickly never had that cached payload
either.

**What the metric does not capture.** Before: the old page stays frozen for the
whole server chain. After: the destination's real heading and a correctly-shaped
skeleton paint immediately. Time-to-first-meaningful-paint improves
dramatically; time-to-real-data regresses by ~223 ms. `p95_navigation_ms` as
defined measures only the latter.

**Benchmark validity note.** `home→community` reads −97.7 ms because its usable
condition is `h1` + ≥2 `[data-slot="card"]`, and the community skeleton renders
three real `Card` components — so the skeleton itself satisfies it. That route is
measuring the skeleton, not content. **The condition was deliberately left
unchanged:** adjusting a usable condition after seeing a result is exactly the
manipulation the brief prohibits. Any future measurement of loading states needs
conditions that skeletons provably cannot satisfy (e.g. asserting real text
content), decided *before* the run.

**Status: kept at the developer's explicit request**, with the trade-off recorded
here. It is a perceived-performance improvement that costs measured
time-to-content. Reverting is `git revert` of the `loading.tsx` commit.
