-- Expiration lifecycle for posts + opportunities, and a floor on profile names.
--
-- This project has no local Supabase stack; the schema lives in the remote
-- project. Run this in the Supabase SQL editor, then regenerate types:
--   npx supabase gen types --linked > types/supabase.ts
--
-- Lifecycle model (see lib/lifecycle.ts — this is the single source of truth):
--   expires_at IS NULL                        -> active,  publicly visible
--   now() <  expires_at                       -> active,  publicly visible
--   expires_at <= now() < expires_at + 10d    -> archived, author + admins only
--   now() >= expires_at + 10d                 -> purged by /api/cron/purge-expired

begin;

-- 1. Opportunities join the lifecycle -----------------------------------------

alter table public.opportunities
  add column if not exists expires_at timestamptz;

-- Backfill: an existing deadline is the natural expiry; otherwise 30 days out.
update public.opportunities
set expires_at = coalesce(deadline::timestamptz, created_at + interval '30 days')
where expires_at is null;

alter table public.opportunities
  alter column expires_at set default (now() + interval '30 days');

-- 2. Posts: guarantee expires_at is always populated ---------------------------

alter table public.community_posts
  alter column expires_at set default (now() + interval '30 days');

update public.community_posts
set expires_at = coalesce(created_at, now()) + interval '30 days'
where expires_at is null;

-- 3. extension_requests targets either entity ----------------------------------

alter table public.extension_requests
  add column if not exists opportunity_id uuid
    references public.opportunities(id) on delete cascade;

alter table public.extension_requests
  drop constraint if exists extension_target_exactly_one;

alter table public.extension_requests
  add constraint extension_target_exactly_one
    check (num_nonnulls(post_id, opportunity_id) = 1);

-- 4. Name floor ----------------------------------------------------------------
-- Client-side heuristics live in lib/name-validation.ts; this is the enforceable
-- minimum, since the auth trigger — not app code — is the real write path.
--
-- NOTE: this will fail if any existing profile violates it. Audit first:
--   select id, full_name from public.profiles
--   where full_name ~ '[0-9]' or char_length(trim(full_name)) not between 3 and 60;

alter table public.profiles
  drop constraint if exists full_name_sane;

alter table public.profiles
  add constraint full_name_sane
    check (
      char_length(trim(full_name)) between 3 and 60
      and full_name !~ '[0-9]'
    );

-- 5. Indexes for the lifecycle queries -----------------------------------------

create index if not exists community_posts_expires_at_idx
  on public.community_posts (expires_at);
create index if not exists opportunities_expires_at_idx
  on public.opportunities (expires_at);
create index if not exists extension_requests_opportunity_id_idx
  on public.extension_requests (opportunity_id);

commit;


-- 6. Row-level security --------------------------------------------------------
-- RLS is the real authorization boundary in this app (client components read and
-- write directly), so archived-item visibility must be enforced here, not only in
-- the page queries.
--
-- RUN THIS ONLY AFTER sections 1-5 have committed — it references
-- opportunities.expires_at, which section 1 creates.
--
-- Written against the policies actually present on 2026-08-01:
--
--   community_posts SELECT x3:
--     "Community posts select policy"          status='Approved' OR own OR is_admin
--     "Users can view their own posts"         own
--     "community_posts_select_chapter_admin"   chapter_admin of same chapter
--   opportunities SELECT x1:
--     "Opportunities are authenticated-viewable"   USING (true)
--
-- Postgres ORs permissive policies together, so the expiry condition only has to
-- be added to the *public* branch of each. The author / admin / chapter-admin
-- policies are left alone precisely so they keep seeing archived items.
--
-- ALTER POLICY is used rather than DROP + CREATE: it rewrites only the USING
-- expression and preserves each policy's role grants, which a recreate would
-- silently reset to PUBLIC.

begin;

-- Community posts: the public branch gains the expiry test. The `own` and
-- `is_admin` branches are unchanged, so authors and admins still see archived
-- posts. "Users can view their own posts" and the chapter-admin policy are not
-- touched.
alter policy "Community posts select policy" on public.community_posts
  using (
    (status = 'Approved' and (expires_at is null or expires_at > now()))
    or auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- Opportunities: this is the only SELECT policy and it is currently USING (true),
-- so every branch that should retain archived visibility has to be spelled out
-- here or it is lost. The chapter-admin branch has no counterpart policy of its
-- own -- chapter admins can update and delete opportunities in their chapter, so
-- they must still be able to read the archived ones.
alter policy "Opportunities are authenticated-viewable" on public.opportunities
  using (
    (expires_at is null or expires_at > now())
    or created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = opportunities.chapter_id
    )
  );

commit;

-- Verify: as a non-author, non-admin account, an expired row must not come back.
--   select id, expires_at from public.opportunities where expires_at < now();


-- 7. Retire the old cleanup function -------------------------------------------
-- delete_expired_posts() predates the archive window and would delete posts the
-- moment they expire, skipping the 10-day grace period. If it is scheduled via
-- pg_cron, unschedule it — /api/cron/purge-expired replaces it:
--
--   select jobid, jobname, schedule, command from cron.job;
--   select cron.unschedule(<jobid>);
