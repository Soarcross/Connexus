# Navigation performance work — retrospective

What worked, what didn't, and what still needs attention. Written after the
2026-08-27 navigation-latency project.

Companion documents:

- **`PERFORMANCE.md`** (repo root) — the full investigation, benchmark design,
  every experiment with its numbers, and the final verification.
- **`perf/`** — the benchmark harness, raw results, and fixture scripts.

**Headline:** `p95_navigation_ms` **1118.6 → 354.6 ms (−68%)**, median
**224.1 → 110.0 ms (−51%)**, all ten measured navigations improved, none
regressed, and every accepted change was verified pixel-identical.

---

## 1. What went well

### The bottleneck was measured, not guessed

The instinct on a "laggy" Next.js app is to blame bundle size, hydration or
rerenders. Instrumenting the navigation into phases killed that theory in one
run: **server think-time was 85–95% of every navigation; client render was
5–16 ms.** Every subsequent hour went into the half that mattered. Without that
measurement the obvious first move — code-splitting and bundle trimming — would
have been days of work for nothing.

### Server time tracked round-trip count almost linearly

Roughly `40 ms + 45 ms × (sequential Supabase round trips)`. That turned every
later decision into arithmetic: count the sequential awaits on a page, multiply,
and know the prize before writing code. Predicted effects matched measured ones
closely (E2 predicted ~38 ms, measured 41.8; E3 predicted ~90, measured 90.5).

### Paired A/B measurement made small effects decidable

Comparing separate runs could not resolve anything: two **identical** baselines
differed by 55.9 ms in p95 with a CI of [−267, +126], against expected effects of
~45 ms. Running both variants against two servers within the same repetition,
alternating order, dropped the resolution to **±4 ms**. That single change is
what made the whole project possible.

### Cheap pre-flight tests caught real hazards before they shipped

- `getClaims()` was probed against the live project before any app code changed.
  It revealed that an **expired token throws** rather than returning `{ error }`
  like `getUser()` — a naive swap would have turned every guest path into a 500.
- The proxy refresh-skip was tested on both paths directly, because the benchmark
  runs with a fresh token and would never exercise the refresh. Fresh → no
  refresh; near-expiry → rotated cookie.
- The deferred read-receipt write was verified to actually land (4 → 0 unread in
  250 ms), because `after()` failing silently would look *perfect* to a latency
  benchmark while quietly breaking unread counts.

The pattern worth keeping: **ask what a green benchmark would fail to notice, and
test that separately.**

### Per-route attribution caught changes that only looked global

Overall medians dilute a route-specific change by the number of routes. E6 read
as −5.7 ms overall but −65.1 ms on the one route it touched. Reporting per-route
intervals — Bonferroni-corrected for the simultaneous tests — kept that legible
and stopped real wins being dismissed as noise.

---

## 2. What didn't go well

### The benchmark had to be rebuilt twice mid-project

1. **It degraded over its own length** — 40 s/rep to 5 min/rep after ~30 minutes.
   Unbounded `networkidle` (unreachable in an app holding a realtime WebSocket),
   an ever-growing single page, and a full resource-timing buffer. Roughly an
   hour lost, plus one discarded baseline.
2. **Run-to-run comparison couldn't resolve the effect sizes** — required the
   paired redesign, a git worktree, a second `node_modules`, and an A/A
   validation run.

**Lesson:** validate the measuring instrument against *itself* (A/A) before
trusting a single result from it. Both flaws would have produced confident,
wrong conclusions.

### The benchmark had a coverage hole for most of the project

Every route *originated* from `/home`, so `/home` was never a measured
**destination** — its render happened during settle, outside the measurement
window. A change to the authed landing page measured INCONCLUSIVE for reasons
that had nothing to do with the change. Fixed late by adding
`opportunities→home`.

**Lesson:** enumerate destinations, not just journeys. A route set can look
comprehensive and still never measure a page.

### The visual-regression check was itself unreliable

It flagged a page as changed; capturing the **same build twice** reproduced the
difference. Byte-comparing screenshots raced image decode. Fixed by awaiting
every image's `load`/`error` plus `document.fonts.ready` — and even then one page
stays bistable because an avatar intermittently 404s.

**Lesson:** a checker that has never been tested against itself is not evidence.

### End-to-end p95 was undecidable for most of the project

Only ~25% of samples over 1000 ms hit both variants in the same repetition (one
repetition: 1667 ms control vs 9584 ms treatment, same route, seconds apart), so
the extreme tail is partly idiosyncratic and pairing cannot cancel it. Server
think-time percentiles were added late and read the tail far better. The final
run is the only one where the end-to-end p95 interval excluded zero.

### Time lost to environment rather than engineering

A treatment server died silently mid-run (223 measurement failures, run
discarded). Stopped background tasks left `next start` processes holding ports,
so a comparison briefly ran against a **stale build** — caught, but it could
have silently invalidated a result. Ports are now explicitly freed before every
restart.

---

## 3. Flagged — needs attention

### 3.1 Two production signup bugs (found incidentally, NOT fixed)

Found while creating benchmark accounts: two creations failed with nothing but
`Database error creating new user`.

**Shared mechanism.** `handle_new_user` is an `AFTER INSERT` trigger on
`auth.users` with no exception handling. Its `on conflict (id) do nothing` catches
only duplicate ids; any other failure propagates and **rolls back the entire
`auth.users` insert**, surfacing as that opaque message with no indication of the
cause.

**Neither has bitten an existing user.** All 61 `auth.users` rows carry a
`full_name`, none null, none containing a digit, none under 3 characters. These
are latent, and the second is the one actually reachable.

**Bug 1 — `NOT NULL` on `profiles.full_name` (latent).** The trigger writes
`raw_user_meta_data ->> 'full_name'`; if the key is absent that is SQL `NULL` and
the signup fails. Both real creation paths currently supply it
(`signup-form.tsx:83`, `approve-chapter/route.ts:95`). The exposure is a future
OAuth provider that populates `name` but not `full_name` — a path CLAUDE.md
already notes bypasses app-side validation entirely.

**Bug 2 — `full_name_sane` CHECK (reachable today).** The constraint is
`char_length(trim(full_name)) BETWEEN 3 AND 60 AND full_name !~ '[0-9]'`. The
signup form is protected, because `lib/name-validation.ts` enforces the same rules
client-side. **The chapter-application path is not:**

| step | validation |
|---|---|
| `/apply` form | none — no `validateFullName` |
| `/api/apply` | `z.string().trim().min(1)` — 1 char minimum, no digit check |
| admin approves | `inviteUserByEmail(..., { full_name: applicant_name })` |
| trigger fires | CHECK violated → the whole invite fails |

Verified against the live constraint: `J`, `Li`, `Blink 182 Fan`, `X AE A-12` and
`Robert Downey Jr 3rd` all fail; `Maria Rodriguez` and `Jean-Luc Picard` pass.

The failure mode is what makes it costly: `approve-chapter` creates the chapter
*before* inviting, and its own comment acknowledges the split — *"the chapter was
still created successfully — surface the invite failure separately."* So an
applicant named `Li` leaves the application approved, the chapter created, and the
applicant never invited, recoverable only by hand.

**Suggested fix (not applied):** run `applicant_name` through `validateFullName`
in `/api/apply` and the apply form, so a bad name is rejected at submission with a
real message rather than detonating an admin's approval later. Optionally give the
trigger an `EXCEPTION WHEN others` log-and-continue, so a profile problem cannot
destroy auth-user creation.

### 3.2 `/home` optimisation reverted — unresolved

Making `/home` faster measured **−73 ms on `/home` itself** but a reproducible
**+30…47 ms on `home→messages`**, on a page the change never touched. Reverted
rather than shipped.

Leading hypothesis: a benchmark artifact — a faster origin page means settle
completes sooner, leaving more in-flight prefetch competing with the measured
click. If so, real users never see it and the change is a straight win. **To
resolve:** re-measure with a fixed dwell after the origin page is ready, so
settle duration no longer depends on how fast that page renders. The change is
recoverable from git history.

### 3.3 Remaining server-side round trips

| page | remaining sequential stages |
|---|---|
| `/home` | profile → (chapter-mates, featured) — the reverted change |
| `/chapters` | viewerProfile → (chapters, all profiles) |
| `/community` | viewerProfile → posts |
| `/people` | viewerProfile → profiles |

Each is one `viewerProfile` lookup that gates the real query. A per-request
cached profile read (React `cache()` around a single `getViewerProfile()`) would
collapse one stage on four pages — worth roughly 45 ms each, and it is the
largest remaining structural win.

### 3.4 `/chapters` member counts

Ships all 55 `chapter_id` values to count members in JS. Fine at this size,
quadratic-ish in attention as the platform grows. Revisit with a view or RPC
when profiles reach the low thousands — not before, since the alternative today
trades one request for N.

### 3.5 Missing indexes — deliberately not added

`messages(conversation_id)`, `profiles(chapter_id)` and
`opportunities(chapter_id, category)` have no index. **This was correct to skip:**
at 33 messages and 55 profiles, sequential scans are microseconds and query
execution never appeared in any measurement. Revisit only when profiling shows
database time, not on principle.

### 3.6 Guests briefly see a member skeleton

`loading.tsx` renders before the page decides whether the visitor is a guest, so
a signed-out visitor sees a member-shaped skeleton for a moment before the
locked-page treatment appears. Inherent to route-level loading boundaries.
Fixable by moving the guest check into the layout, or by making the skeletons
neutral enough to suit both.

### 3.7 The benchmark measures localhost, not Vercel

Every number here was measured against a local production build talking to
production Supabase. Vercel's regional placement and connection reuse differ.
**Re-verify after deploying** before treating these figures as production truth.

### 3.8 Benchmark rig caveats for whoever picks this up

- **Per-route effects below ~15 ms are not credible on this rig.** The A/A run
  produced per-route offsets from −12.2 to +10.4 ms with identical code.
- **Correct for multiple comparisons.** Ten simultaneous route tests at 95%
  produce false positives by construction; three of four "regressions" in one run
  failed to reproduce.
- **Require reproduction for anything marginal.** The one regression that
  mattered reproduced across two runs; the noise did not.
