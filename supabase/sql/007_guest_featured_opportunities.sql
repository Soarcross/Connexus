-- 007_guest_featured_opportunities.sql
-- Applied 2026-08-28 via MCP (migration name: guest_featured_opportunities).
-- (Numbered 007: 005_chapter_logos_bucket and 006_stuy_site_admins landed
-- upstream while this was in flight.)
--
-- Guests may read FEATURED, NATIONAL, UNEXPIRED opportunities only -- the
-- /opportunities page shows them as a teaser to logged-out visitors.
-- Everything else (non-featured, chapter-scoped, expired/archived) stays
-- invisible to anon at the policy level, not just in the page query.
--
-- anon held a table-wide SELECT grant on opportunities (Supabase default,
-- harmless while no anon policy existed). Narrow it column-by-column while
-- we're here so created_by (a profile uuid) is never anon-readable: the
-- audit lesson says revoke the wide grant first, then re-grant columns.
--
-- Verified after apply (anon REST probes): featured national rows readable;
-- created_by 42501; is_featured=false filter returns no rows.

revoke select on public.opportunities from anon;
grant select (id, title, description, category, field, organization,
              location, url, deadline, is_featured, created_at, expires_at, chapter_id)
    on public.opportunities to anon;

drop policy if exists "Public can read featured national opportunities" on public.opportunities;
create policy "Public can read featured national opportunities"
    on public.opportunities for select to anon
    using (
        is_featured
        and chapter_id is null
        and (expires_at is null or expires_at > now())
    );
