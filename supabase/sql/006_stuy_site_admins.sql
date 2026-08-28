-- 006_stuy_site_admins.sql
--
-- Splits the admin population into the two tiers the UI now names:
--
--   * SITE ADMIN   -- profiles.is_admin, platform-wide. Every chapter's posts,
--                     users, opportunities and chapter applications.
--   * CHAPTER ADMIN -- profiles.chapter_role = 'chapter_admin', scoped to one
--                     chapter via profiles.chapter_id.
--
-- Stuyvesant is the founding chapter (the platform was single-tenant for it
-- before the 2026-07 multi-chapter rebuild backfilled it as `stuy`), so its
-- chapter admins run the site. This promotes exactly those people and leaves
-- every other chapter's admins chapter-scoped.
--
-- Scope note, because the difference is large and irreversible-in-practice:
-- this promotes stuy members whose chapter_role is ALREADY 'chapter_admin'.
-- It does NOT promote ordinary stuy members. Site admin can delete any user
-- and grant is_admin to anyone, so the grant stays with the people who
-- already hold a moderation role.
--
-- The promoted users KEEP chapter_role = 'chapter_admin'. The two tiers are
-- independent columns, and /chapter-admin still resolves a site admin's
-- chapter through profiles.chapter_id -- clearing chapter_role would drop them
-- out of their own chapter's Members-tab admin list for no gain.
--
-- Idempotent: re-running promotes nobody new.

begin;

-- Guard: if the slug is not `stuy` in this project, fail loudly rather than
-- silently promoting nobody. `001_chapters.sql` backfilled the old data under
-- this slug; a rename would make the UPDATE below a no-op that still reports
-- success (the failure mode CLAUDE.md warns about -- a migration that returns
-- no error has not been verified).
do $$
begin
    if not exists (select 1 from public.chapters where slug = 'stuy') then
        raise exception 'No chapter with slug `stuy` -- check the slug before running 006';
    end if;
end $$;

update public.profiles p
set is_admin = true
from public.chapters c
where p.chapter_id = c.id
  and c.slug = 'stuy'
  and p.chapter_role = 'chapter_admin'
  and p.is_admin is distinct from true;

commit;

-- ---------------------------------------------------------------------------
-- Verification. Run this AFTER the commit above and read the result -- the
-- acceptance test is the tier split looking right, not the UPDATE succeeding.
--
-- Expect: every `stuy` row with chapter_role='chapter_admin' shows
-- tier = 'site admin'; no other chapter's admins do.
-- ---------------------------------------------------------------------------
-- select c.slug,
--        p.full_name,
--        p.chapter_role,
--        p.is_admin,
--        case when p.is_admin then 'site admin' else 'chapter admin' end as tier
-- from public.profiles p
-- join public.chapters c on c.id = p.chapter_id
-- where p.is_admin or p.chapter_role = 'chapter_admin'
-- order by c.slug, p.is_admin desc, p.full_name;
