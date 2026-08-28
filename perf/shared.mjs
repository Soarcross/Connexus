/**
 * Shared definitions for the navigation benchmarks.
 *
 * perf/bench.mjs (single variant, absolute numbers) and perf/bench-ab.mjs
 * (paired A/B against two servers) both import from here, so the routes and
 * the "usable" conditions cannot drift apart between the two tools. Changing a
 * usable condition changes both, which is the point: the conditions define what
 * the metric means and must stay identical across every comparison.
 */
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

export const fixture = JSON.parse(readFileSync(join(ROOT, "perf", "bench-fixture.json"), "utf8"))
export const VIEWER_ID = fixture.users.find((u) => u.role === "viewer").id
export const CONV_ID = fixture.conversations[0].id
// partner emails are perf-bench-partner-N@...; the profile names are spelled out
// because profiles.full_name_sane forbids digits.
export const CONV_PARTNER_NAME = ["Perf Bench Partner One", "Perf Bench Partner Two", "Perf Bench Partner Three"][
    Number(fixture.conversations[0].with.match(/partner-(\d)/)[1]) - 1
]

// --- "usable" conditions ---------------------------------------------------
// Each is plain data so it can be evaluated inside the page. `sel` selectors are
// checked for existence, minimum count, visibility, and (where relevant) that
// the control is enabled.

export const READY = {
    home: {
        pathname: "/home",
        selectors: [
            { sel: "main h1", text: "Welcome back" },
            { sel: "main h2", text: "Opportunities of the Month" },
            { sel: 'main [data-slot="card"]', min: 3 },
        ],
    },
    opportunities: {
        pathname: "/opportunities",
        selectors: [
            { sel: "main h1", text: "Opportunities" },
            { sel: 'main [data-slot="card"]', min: 2 },
            { sel: 'main input[placeholder="Search opportunities..."]', enabled: true },
        ],
    },
    people: {
        pathname: "/people",
        selectors: [
            { sel: "main h1", text: "People" },
            // 52 chapter-mates + the 4 benchmark accounts render as cards; 10 is
            // a floor that proves the real list rendered, not a lucky first row.
            { sel: 'main [data-slot="card"]', min: 10 },
            { sel: "main input[placeholder^='Search by name']", enabled: true },
        ],
    },
    community: {
        pathname: "/community",
        selectors: [
            { sel: "main h1", text: "Community" },
            { sel: 'main [data-slot="card"]', min: 2 },
        ],
    },
    chapters: {
        pathname: "/chapters",
        selectors: [
            { sel: "main h1", text: "Chapters" },
            { sel: 'main a[href="/chapters/stuy"]' },
            { sel: 'main [data-slot="card"]', min: 3 },
        ],
    },
    chapterDetail: {
        pathname: "/chapters/stuy",
        selectors: [
            { sel: "main h1", text: "chapter" },
            { sel: 'main [role="tab"]', min: 2 },
            { sel: 'main [data-slot="card"]', min: 5 },
        ],
    },
    messages: {
        pathname: "/messages",
        selectors: [
            { sel: "main h1", text: "Messages" },
            // The three fixture conversations, each a clickable row.
            { sel: "main .cursor-pointer", min: 3 },
        ],
    },
    conversation: {
        pathname: `/messages/${CONV_ID}`,
        selectors: [
            { sel: 'main input[placeholder="Type a message..."]', enabled: true },
            // The thread itself must have rendered, not just the composer.
            // Message bubbles are the .rounded-2xl divs in chat-window.tsx.
            { sel: "main div.rounded-2xl", min: 4 },
        ],
    },
    ownProfile: {
        pathname: `/profile/${VIEWER_ID}`,
        selectors: [
            { sel: "main h1", text: "Perf Bench Viewer" },
            { sel: 'main [data-slot="card"]', min: 1 },
        ],
    },
    anyProfile: {
        pathnamePrefix: "/profile/",
        selectors: [
            { sel: "main h1", min: 1 },
            { sel: 'main [data-slot="card"]', min: 1 },
        ],
    },
}

// --- the navigation paths under test ---------------------------------------
// `click` is a CSS selector resolved on the origin page. Every one of these is a
// control a real user actually clicks.

export const ROUTES = [
    { id: "home->opportunities", from: "home", ready: READY.opportunities, click: 'header a[href="/opportunities"]' },
    { id: "home->people",        from: "home", ready: READY.people,        click: 'header a[href="/people"]' },
    { id: "home->community",     from: "home", ready: READY.community,     click: 'header a[href="/community"]' },
    { id: "home->chapters",      from: "home", ready: READY.chapters,      click: 'header a[href="/chapters"]' },
    { id: "home->messages",      from: "home", ready: READY.messages,      click: 'header a[href="/messages"]' },
    // The People carousel card — a <div onClick={router.push}>, not a <Link>.
    { id: "home->profile",       from: "home", ready: READY.anyProfile,    click: 'main section:last-of-type [data-slot="card"].cursor-pointer' },
    // Rows are ordered by last_message_at, so an nth-index would not be stable;
    // target the row by the partner's name instead.
    { id: "messages->conversation", from: "messages", ready: READY.conversation, click: `main .cursor-pointer:has-text("${CONV_PARTNER_NAME}")` },
    { id: "chapters->detail",    from: "chapters", ready: READY.chapterDetail, click: 'main a[href="/chapters/stuy"]' },
    { id: "people->profile",     from: "people", ready: READY.anyProfile,  click: 'main [data-slot="card"].cursor-pointer' },
    // Added after E5 measured INCONCLUSIVE for a change to /home, when it became
    // clear /home was never a measured *destination*: every other route starts
    // there, so the /home render happened during settle, outside the measurement
    // window. This is a coverage gap being closed, not a threshold being moved —
    // the usable condition for /home is the same READY.home already used to
    // settle on it, and no existing route's definition changed, so per-route
    // results from earlier experiments remain directly comparable. Pooled
    // "overall" figures shift simply because there are now ten routes, not nine.
    { id: "opportunities->home", from: "opportunities", ready: READY.home,  click: 'header a[href="/home"]' },
]

export const ORIGIN_READY = { home: READY.home, messages: READY.messages, chapters: READY.chapters, people: READY.people, opportunities: READY.opportunities }
export const ORIGIN_PATH = { home: "/home", messages: "/messages", chapters: "/chapters", people: "/people", opportunities: "/opportunities" }

// --- in-page instrumentation ----------------------------------------------
// Stringified and injected; must be self-contained.

export const PAGE_HELPERS = `
window.__bench = {
  isReady(spec) {
    if (spec.pathname && location.pathname !== spec.pathname) return false
    if (spec.pathnamePrefix && !location.pathname.startsWith(spec.pathnamePrefix)) return false
    for (const s of spec.selectors) {
      const els = Array.from(document.querySelectorAll(s.sel))
      if (els.length < (s.min ?? 1)) return false
      let candidates = els
      if (s.text) {
        candidates = els.filter(e => (e.textContent || '').includes(s.text))
        if (candidates.length === 0) return false
      }
      // At least one match must be laid out (non-zero box) — proves it painted,
      // not merely that it exists in a hidden subtree.
      const visible = candidates.some(e => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      if (!visible) return false
      if (s.enabled) {
        const usable = candidates.some(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true')
        if (!usable) return false
      }
    }
    return true
  },
  arm(spec) {
    // The resource-timing buffer is capped (250 entries) and this page never
    // reloads during a run, so without clearing it the buffer fills with stale
    // prefetch entries and result() can no longer find the RSC fetch belonging
    // to the current navigation. Clearing per measurement keeps the phase
    // breakdown correct and the lookup cheap. It cannot affect t0/t1.
    try { performance.clearResourceTimings() } catch (e) { /* diagnostics only */ }
    const state = { t0: null, t1: null, spec }
    window.__benchState = state
    state.onClick = () => { if (state.t0 === null) state.t0 = performance.now() }
    document.addEventListener('click', state.onClick, true)
    const check = () => {
      if (state.t1 !== null) return true
      if (state.t0 === null) return false
      if (window.__bench.isReady(state.spec)) { state.t1 = performance.now(); return true }
      return false
    }
    const stop = () => {
      document.removeEventListener('click', state.onClick, true)
      if (state.obs) state.obs.disconnect()
    }
    state.obs = new MutationObserver(() => { if (check()) stop() })
    state.obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
    const tick = () => {
      if (check()) { stop(); return }
      state.raf = requestAnimationFrame(tick)
    }
    state.raf = requestAnimationFrame(tick)
  },
  result() {
    const s = window.__benchState
    if (!s || s.t0 === null || s.t1 === null) return null
    // Phase breakdown, on the same performance.now() clock as t0/t1, from the
    // RSC fetch this navigation actually issued. Purely diagnostic: it never
    // feeds the primary metric, which stays t1 - t0.
    //   dispatch  click -> the browser put the RSC request on the wire
    //   ttfb      request sent -> first byte. Next flushes early, so this is
    //             NOT the data-fetching cost.
    //   stream    first byte -> last byte. The RSC response is STREAMED, so
    //             this is where the page's sequential Supabase awaits are
    //             actually paid. ttfb + stream = server think-time.
    //   client    last byte -> destination usable (React render + paint)
    let phases = null
    try {
      const entry = performance.getEntriesByType('resource')
        .filter(e => e.name.includes('_rsc=') && e.startTime >= s.t0 && e.responseEnd > 0 && e.responseEnd <= s.t1)
        .sort((a, b) => b.responseEnd - a.responseEnd)[0]
      if (entry) {
        phases = {
          dispatch: +(entry.startTime - s.t0).toFixed(1),
          ttfb: +(entry.responseStart - entry.startTime).toFixed(1),
          stream: +(entry.responseEnd - entry.responseStart).toFixed(1),
          serverTotal: +(entry.responseEnd - entry.startTime).toFixed(1),
          client: +(s.t1 - entry.responseEnd).toFixed(1),
          bytes: entry.transferSize || 0,
        }
      }
    } catch (e) { /* diagnostics only */ }
    return { t0: s.t0, t1: s.t1, ms: s.t1 - s.t0, phases }
  }
}
`

// --- stats -----------------------------------------------------------------

export function percentile(sorted, p) {
    if (sorted.length === 0) return null
    // Linear interpolation between closest ranks (NIST/Excel PERCENTILE.INC).
    const rank = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(rank)
    const hi = Math.ceil(rank)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo])
}

export function summarise(samples) {
    const s = [...samples].sort((a, b) => a - b)
    const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1)
    return {
        n: s.length,
        min: s[0] ?? null,
        mean: +mean.toFixed(1),
        median: s.length ? +percentile(s, 50).toFixed(1) : null,
        p90: s.length ? +percentile(s, 90).toFixed(1) : null,
        p95: s.length ? +percentile(s, 95).toFixed(1) : null,
        p99: s.length ? +percentile(s, 99).toFixed(1) : null,
        max: s[s.length - 1] ?? null,
    }
}
