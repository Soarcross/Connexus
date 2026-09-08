# Motion — Connexus ("Cream & Black")

A small, flat motion layer. Short, crisp, keyline-based. Every effect is
`transform` / `opacity` / `grid-template-rows` only — nothing animates
`box-shadow`, `filter`, or a layout-triggering property.

Most of it is `tw-animate-css` / core Tailwind utility classes applied at the
call site (`tw-animate-css` is already imported in `app/globals.css`). The few
things a utility can't express live in `app/motion.css`:

| Class | What | Used by |
| --- | --- | --- |
| `.card-lift` | hover/focus: 2px rise + border → accent (no fill, no shadow) | every clickable Card that navigates |
| `.animate-enter` | fade + 6px rise | `useRevealOnScroll` |
| `.badge-pop` | one-shot scale bump | `<BadgeCount>` |
| `.shake` | form-error nudge (200ms translateX) | login / signup / apply error blocks |
| `.collapse` / `.collapse.open` | height reveal (`grid-template-rows` 0fr→1fr) | `<Collapse>` |

Plus the global `@media (prefers-reduced-motion: reduce)` kill switch, also in
`app/motion.css`.

## Files

- `app/motion.css` — tokens, the classes above, the reduced-motion block. Imported by `app/globals.css`.
- `app/components/motion/Collapse.tsx` — height-reveal wrapper.
- `app/components/motion/BadgeCount.tsx` — pop badge, re-fires on value change (`key={count}`).
- `app/components/motion/CountUp.tsx` — `<CountUp value={n} className="…" />` wrapper around `useCountUp`.
- `app/components/motion/useRevealOnScroll.ts` — IntersectionObserver reveal hook; returns `{ ref, className }`.
- `app/components/motion/useCountUp.ts` — single-RAF count-up hook.

## Wired

| Surface | File | Effect |
| --- | --- | --- |
| Community feed cards | `community/posts-feed.tsx` | entrance fade + rise, 40 ms stagger, cap 8 |
| People directory cards | `people/people-client.tsx` | entrance stagger + `.card-lift` |
| Opportunities cards | `opportunities/opportunities-client.tsx` | entrance stagger + `.card-lift` |
| Chapters grid | `(main)/chapters/page.tsx` | entrance stagger + `.card-lift` |
| Chapter detail — posts & opps | `(main)/chapters/[slug]/page.tsx` | entrance stagger + `.card-lift` |
| Home — featured opps (guest + member) | `(main)/home/page.tsx` | entrance stagger + `.card-lift` |
| Opportunities — featured strip | `(main)/opportunities/page.tsx` | entrance stagger + `.card-lift` |
| Home people carousel, composer card | `home/people-carousel.tsx`, `community/composer-card.tsx` | `.card-lift` |
| Conversations list | `messages/conversation-list.tsx` | entrance stagger (hover stays a fill — divided rows, not cards) |
| Chat messages | `messages/chat-window.tsx` | message-in fade + rise (mount + realtime INSERT) |
| Navbar unread badge (desktop + mobile) | `navbar.tsx` | `.badge-pop`, re-fired via `key={unreadCount}` |
| Admin Overview stat tiles ×4 | `admin/admin-dashboard.tsx` | `<CountUp>` |
| Admin opportunities & users lists | `admin/admin-dashboard.tsx` | entrance stagger (plays once on tab mount, not on row mutation) |
| Chapter-admin members & opps lists | `chapter-admin/chapter-admin-dashboard.tsx` | entrance stagger |
| All tab panels | `components/ui/tabs.tsx` (`TabsContent`) | 150 ms fade on `data-[state=active]` — covers admin, chapter-admin, chapter pages |
| Login / signup / apply errors | `login-form.tsx`, `signup-form.tsx`, `marketing/apply-form.tsx` | `.shake` wrapper (keyed on `error`) + `animate-in fade-in-0` on the message |
| Archive banner | `lifecycle/archive-banner.tsx` | slide-in-from-top on render |
| Dialog / Sheet | `components/ui/dialog.tsx`, `sheet.tsx` | already baked in (`data-open:` / `data-closed:` fade/zoom/slide) — untouched |
| Button press | `components/ui/button.tsx` | already has `active:translate-y-px` — untouched |

### Deliberately not wired

- **Admin moderation queues** (submissions, community-post review, extension requests, chapter applications, team/partners) — dense action lists where per-row motion on every approve/reject reads as flicker. Static by choice.
- **Scroll-reveal on long feeds** — `useRevealOnScroll` + `.animate-enter` exist and are demoed, but entrance-on-mount already covers the feeds in practice; add it only if a very long list feels heavy.
- **Toasts** — no toast system in the app yet. When one lands: `animate-in fade-in-0 slide-in-from-right-full duration-[180ms]` in, `animate-out …` out.
- **Typing indicator** — no presence/typing signal exists to drive it. CSS is ready (three `animate-bounce` dots, `[animation-delay:150ms]` / `300ms` on 2 & 3).

## Tokens (`app/motion.css`, `:root`)

`--motion-fast: 120ms` · `--motion: 180ms` · `--motion-slow: 260ms` · `--ease: cubic-bezier(0.2, 0, 0, 1)`

Use these inside arbitrary values when a utility's stock duration doesn't fit,
e.g. `[animation-duration:var(--motion-slow)]`.

## Utility class per surface

Tailwind v4's stock `duration-*` scale is 75 / 100 / 150 / 200 / 300 / 500 /
700 / 1000 — anything else must be an arbitrary value (`duration-[180ms]`).
Note `tw-animate-css` maps `duration-*` onto `animation-duration` too, so don't
put a `duration-*` meant for a hover transition on the same element as an
`animate-in` — they fight. That's why `.card-lift` is a CSS class, not a
utility string.

| Surface | Class string |
| --- | --- |
| Skeleton pulse | `animate-pulse [animation-duration:1.5s]` |
| Content entrance | `animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out` |
| Stagger | entrance string + `style={{ animationDelay: \`${Math.min(i, 8) * 40}ms\`, animationFillMode: "both" }}` on each child |
| Scroll reveal | `const { ref, className } = useRevealOnScroll()` → spread on the item |
| Card hover / focus | `className="card-lift"` (from `app/motion.css`) |
| Badge pop | `<BadgeCount count={n} />` |
| Tab / panel crossfade | built into `<TabsContent>` — nothing per call site |
| Height reveal | `<Collapse open={…}>…</Collapse>` |
| Form error | wrap the message in `<div key={error} className="shake">`, message gets `animate-in fade-in-0 duration-150` |
| Count-up | `<CountUp value={n} className="…" />` or `const n = useCountUp(target)` |

## Reduced motion

One `@media (prefers-reduced-motion: reduce)` block in `app/motion.css`
collapses every animation/transition duration to ~0 and disables smooth
scroll — this covers the `tw-animate-css` utilities too, since they compile to
plain `animation` / `transition`. No per-component opt-out. `useRevealOnScroll`
and `useCountUp` also check `matchMedia` directly, so content isn't left
invisible or stuck mid-count on a reduced-motion device.

## Out of scope

No Framer Motion or other animation library. No page-level route transitions —
those go through the View Transitions API separately. No color / radius / font
changes — this is motion only.
