# Follow-ups — everything flagged and not fixed

Every item flagged during the 2026-08 navigation-performance work that was
**deliberately not fixed**, categorised and ordered so it can be picked up cold.

Nothing here is speculative: each item states the evidence, where to look, and
what "fixed" would mean. Where something was *considered and rejected*, the
reason is recorded so it is not re-litigated from scratch.

Background: `PERFORMANCE.md` (investigation + every experiment),
`docs/PERFORMANCE-RETROSPECTIVE.md` (what worked and what didn't), `perf/`
(harness + raw results).

**Legend —** Impact: what it costs today. Confidence: how sure the diagnosis is.
Effort: rough.

---

## A. Correctness bugs — production

### A1. Chapter approval can half-complete on a valid-looking applicant name
**Impact: high · Confidence: verified · Effort: small**

`profiles.full_name_sane` requires `char_length(trim(...)) BETWEEN 3 AND 60 AND
full_name !~ '[0-9]'`, but `app/api/apply/route.ts:14` validates
`applicant_name` as only `z.string().trim().min(1)`, and the apply form does no
client-side validation at all.

When an admin approves the application, `approve-chapter/route.ts:90` invites the
user with `full_name: application.applicant_name`. The `handle_new_user` trigger
then violates the CHECK and **the entire invite fails**. Because the route creates
the chapter *before* inviting — its own comment says *"the chapter was still
created successfully — surface the invite failure separately"* — you are left with
the application approved, the chapter created, and the applicant never invited.
Recoverable only by hand.

Verified against the live constraint: `J`, `Li`, `Blink 182 Fan`, `X AE A-12`,
`Robert Downey Jr 3rd` all fail; `Maria Rodriguez`, `Jean-Luc Picard` pass.

**Fix:** run `applicant_name` through `validateFullName` (`lib/name-validation.ts`,
which already enforces exactly these rules) in `/api/apply` *and* the apply form,
so a bad name is rejected at submission with a real message.

### A2. `handle_new_user` lets a profiles failure destroy auth-user creation
**Impact: medium · Confidence: verified · Effort: small**

The trigger is `AFTER INSERT` on `auth.users` with no exception handling; its
`on conflict (id) do nothing` catches only duplicate ids. Any other failure
propagates and rolls back the whole `auth.users` insert, surfacing as the opaque
`Database error creating new user` with no indication of the cause. This is the
root cause of A1 and A3, and it cost real debugging time during this project.

**Fix:** wrap the insert in `EXCEPTION WHEN others THEN RAISE WARNING ...` so a
profile problem degrades to a missing profile row — which
`profile/[id]/page.tsx` already self-heals — instead of blocking signup entirely.

### A3. `profiles.full_name` is NOT NULL but fed from optional metadata
**Impact: low (latent) · Confidence: verified · Effort: small**

The trigger writes `raw_user_meta_data ->> 'full_name'` into a `NOT NULL` column.
All 61 existing users have the key and both current creation paths supply it, so
this is **not currently reachable**. The exposure is a future OAuth provider that
populates `name` but not `full_name` — a path CLAUDE.md notes bypasses app-side
validation entirely.

**Fix:** fall back to `->> 'name'`, then email local-part, before inserting.
Subsumed by A2 either way.

### A4. Clickable cards are not keyboard reachable
**Impact: medium (accessibility) · Confidence: verified · Effort: small**

`<Card className="cursor-pointer" onClick={() => router.push(...)}>` with no
`role`, `tabIndex`, or key handler — `Card` renders a plain `div`, so these
navigations are mouse-only:

| file | line | navigation |
|---|---|---|
| `people/people-client.tsx` | 299 | people → profile |
| `home/people-carousel.tsx` | 52 | home → profile |
| `messages/conversation-list.tsx` | 53 | messages → conversation |
| `community/posts-feed.tsx` | 372, 382 | community → profile |

CLAUDE.md already records this exact class of bug from the visual rebrand
(`CreatePostButton`'s `trigger` prop). It is the same mistake in five more places.

**Fix:** wrap the card in a `<Link>` (or give it `role="link"`, `tabIndex={0}` and
an Enter/Space handler). **Bonus:** `<Link>` also restores prefetching, which
`router.push` never gets — so this is an accessibility fix *and* a latency fix.

---

## B. Performance — remaining opportunities

### B1. A `viewerProfile` lookup gates the real query on four pages
**Impact: ~45 ms × 4 routes · Confidence: high · Effort: medium**

`/home`, `/chapters`, `/community` and `/people` each fetch the viewer's profile
and then use a field from it (usually `chapter_id`) to build the real query, so
the two cannot be parallelised as written.

**This is the largest remaining structural win.** A request-scoped
`getViewerProfile()` wrapped in React `cache()` would let the layout and the page
share one lookup, collapsing a stage on four routes. Note the layout already
fetches a profile (`app/(main)/layout.tsx`) — so the data is often being fetched
twice per navigation already.

### B2. The `/home` optimisation is reverted and unresolved
**Impact: −73 ms on `/home` if resolved · Confidence: medium · Effort: medium**

Collapsing `/home`'s seven per-category queries into one and parallelising the
remaining pair measured **−73.5 / −71.0 ms on `/home` across two runs** — but a
reproducible **+30.5 / +46.6 ms on `home→messages`**, a page it never touched.
Reverting only `/home` dropped that to a non-significant +15.9 ms, so the cost
tracks the change.

Leading hypothesis: a benchmark artifact — a faster origin page means settle
completes sooner, leaving more in-flight prefetch competing with the measured
click (see C4). If that is right, real users never see it and this is a free win.

**To resolve:** fix C4 first, then re-measure. The change is in git history.

### B3. `loading.tsx` costs 222.8 ms of measured time-to-content
**Impact: +222.8 ms measured · Confidence: high (measured), medium (cause) · Effort: medium**

Shipped deliberately (perceived speed), but the cost is uniform across every route
(+216…242 ms) while *server* time improved — so it is client-side.

Leading hypothesis: without a loading boundary, prefetch can populate the router
cache with the full dynamic payload; with one, only the shell is cached, so the
real payload is fetched at click time.

**To investigate:** whether `prefetch={true}` on the nav `<Link>`s restores full
payload prefetching alongside the loading boundary, recovering both the instant
paint and the cached content. Measure before concluding.

### B4. Navbar unread badge subscribes to every message platform-wide
**Impact: low now, poor scaling · Confidence: high · Effort: small**

`app/components/navbar.tsx:58` subscribes to **all** INSERT and UPDATE on
`messages` with no filter, and refetches the unread count on *any* message
anywhere in the platform. At 33 messages this is free; at scale every user
re-queries on every message any two other users exchange.

**Fix:** filter the subscription server-side to the user's own conversations, or
debounce the refetch.

### B5. `/chapters` counts members by fetching every profile's `chapter_id`
**Impact: negligible now · Confidence: high · Effort: small**

Ships all 55 `chapter_id` values (~2 KB) to count in JS.

**Explicitly rejected for now:** the obvious fix (one count query per chapter)
trades 1 request for N, which at three chapters is *worse*. Revisit with a view or
RPC when profiles reach the low thousands — not before.

### B6. Missing indexes — deliberately not added
**Impact: none measured · Confidence: high · Effort: small**

`messages(conversation_id)`, `profiles(chapter_id)` and
`opportunities(chapter_id, category)` have no index.

**Skipping was correct:** at 33 messages and 55 profiles, sequential scans are
microseconds and query execution never appeared in any measurement. Revisit only
when profiling shows database time — not on principle.

---

## C. Benchmark and tooling debt

Read this section before trusting `perf/` for a new experiment.

### C1. One usable condition is satisfied by its own skeleton
**Must fix before measuring loading states again**

`home→community`'s condition is `h1` + ≥2 `[data-slot="card"]`, and the community
skeleton renders three real `Card` components — so the skeleton satisfies it and
that route measures the skeleton, not content (it read −97.7 ms while every other
route read +220).

**Left unfixed on purpose:** changing a usable condition after seeing a result is
the manipulation the original brief prohibits. Fix it *before* the next run, by
asserting real text content that a skeleton cannot produce.

### C2. Per-route effects below ~15 ms are not credible on this rig
The A/A run (identical code on both ports) produced per-route paired medians from
**−12.2 to +10.4 ms**. The bootstrap CI understates this because it resamples
within a run and cannot see run-level offsets. Correct for multiple comparisons
(10 routes at 95% throws false positives by construction) and require reproduction
across runs for anything marginal.

### C3. End-to-end p95/p99/max are not decidable on this machine
Only ~25% of samples over 1000 ms hit both variants in the same repetition (one
repetition: 1667 ms control vs 9584 ms treatment, same route, seconds apart), so
the extreme tail is partly idiosyncratic and pairing cannot cancel it. **Use the
server think-time percentiles** — they exclude browser-side stalls and read the
tail cleanly.

### C4. Settle duration depends on how fast the origin page is
`settleOn()` waits for the origin's usable condition plus a bounded network-quiet
period. A change that makes the *origin* faster shortens settle, leaving more
in-flight prefetch overlapping the measured click. This is the suspected cause of
B2's phantom regression.

**Fix:** a fixed dwell after the origin is ready, so settle duration no longer
varies with page speed. Outside the measurement window, so it does not affect what
is measured — only what precedes it.

### C5. The visual check is bistable on one page
`chapter-detail` alternates between exactly two byte sizes (desktop
500436/500481, mobile 503422/503441) because one of ~56 Supabase-hosted avatars
intermittently 404s. Both states occur on **both** servers, so a difference there
alone is environmental. The other routes are byte-stable. Awaiting image
`load`/`error` plus `document.fonts.ready` fixed the ordinary races but cannot fix
an image that genuinely fails half the time.

**When a page differs, re-capture the same build twice before believing it** —
`perf/people-stability.mjs` is the tool for that.

### C6. All numbers are localhost, not Vercel
Measured against a local production build talking to production Supabase.
Vercel's regional placement and connection reuse differ. **Re-verify after
deploying** before treating any figure as production truth.

### C7. Running the harness again needs a fixture
`perf/setup-account.mjs` recreates it (temporary non-admin users + conversations);
`perf/teardown-account.mjs --apply` removes it. The current fixture **has been torn
down** — verified against pre-work counts (auth.users 57, profiles 55,
conversations 22, messages 33). `perf/bench-fixture.json` is kept as the audit
record of what existed.

Note the harness needs two servers: the repo on `:3100` and a git worktree of the
comparison commit on `:3101`, each with its own `node_modules` (Turbopack rejects
a directory junction — *"points out of the filesystem root"*).

---

## D. Product decisions — need a human call

### D1. Guests briefly see a member-shaped skeleton
`loading.tsx` renders before the page determines the visitor is signed out, so a
guest sees a member skeleton for a moment before the locked-page treatment.
Inherent to route-level loading boundaries.

**Options:** move the guest check into the layout, or make the skeletons neutral
enough to suit both states.

### D2. Keep or revert `loading.tsx`
It improves perceived speed and regresses measured time-to-content by 222.8 ms
(B3). Worth a decision once it has been *felt* on a real connection rather than
argued from numbers. Revert is a single `git revert`.

### D3. The proxy refresh-skip trade-off
Approved during this work: a session revoked elsewhere is not noticed on a skipped
request, and is caught at the next refresh instead — bounded by the access-token
lifetime (measured: 1 hour). Authorization is unaffected, since RLS remains the
boundary and every read still carries the JWT to PostgREST.

**Revisit if** the product ever needs immediate revocation (a ban/kick feature, or
compliance). Lower `REFRESH_MARGIN_SECONDS` in `proxy.ts`, or reinstate the
unconditional refresh, at ~45 ms per navigation.
