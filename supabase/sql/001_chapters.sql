-- Phase 0 of the High School Connections rebrand: chapters + chapter applications.
-- Run this whole file once in the Supabase SQL Editor (dashboard), in order.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP...CREATE /
-- ON CONFLICT DO NOTHING), and the whole file runs as one transaction so a
-- mid-script failure leaves the database exactly as it was before.
-- After it succeeds, regenerate types:
--   npx supabase gen types --linked > types/supabase.ts

begin;

-- =========================================================================
-- 1. New tables
-- =========================================================================

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  school_name text not null,
  city text,
  state text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  logo_url text,
  primary_color text,
  created_at timestamptz not null default now(),
  constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}$')
);

create table if not exists public.chapter_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_name text not null check (char_length(applicant_name) between 1 and 200),
  applicant_email text not null check (char_length(applicant_email) between 1 and 200),
  applicant_role text not null default 'Student',
  school_name text not null check (char_length(school_name) between 1 and 200),
  city text,
  state text,
  motivation text not null check (char_length(motivation) between 1 and 2000),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  rejection_reason text,
  chapter_id uuid references public.chapters(id),
  status_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Defense-in-depth: these length checks mirror app/api/apply/route.ts's
-- validation at the DB level, in case that route is ever bypassed (e.g. a
-- direct anon PostgREST call). Guarded for re-running against a table that
-- may already exist from an earlier version of this script.
do $$
begin
  begin
    alter table public.chapter_applications
      add constraint chapter_applications_applicant_name_len check (char_length(applicant_name) between 1 and 200);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.chapter_applications
      add constraint chapter_applications_applicant_email_len check (char_length(applicant_email) between 1 and 200);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.chapter_applications
      add constraint chapter_applications_school_name_len check (char_length(school_name) between 1 and 200);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.chapter_applications
      add constraint chapter_applications_motivation_len check (char_length(motivation) between 1 and 2000);
  exception when duplicate_object then null;
  end;
end $$;

-- Prevent duplicate pending applications from the same email.
create unique index if not exists chapter_applications_pending_email_idx
  on public.chapter_applications (lower(applicant_email))
  where status = 'Pending';

-- =========================================================================
-- 2. Column additions to existing tables
-- =========================================================================

alter table public.profiles
  add column if not exists chapter_id uuid references public.chapters(id),
  add column if not exists chapter_role text not null default 'member'
    check (chapter_role in ('member', 'chapter_admin'));

alter table public.community_posts
  add column if not exists chapter_id uuid references public.chapters(id);

alter table public.opportunities
  add column if not exists chapter_id uuid references public.chapters(id); -- NULL = national

-- =========================================================================
-- 3. Backfill: existing data becomes the Stuyvesant chapter
-- =========================================================================

insert into public.chapters (slug, name, school_name, city, state)
values ('stuy', 'Stuyvesant', 'Stuyvesant High School', 'New York', 'NY')
on conflict (slug) do nothing;

update public.profiles
  set chapter_id = (select id from public.chapters where slug = 'stuy')
  where chapter_id is null;

update public.community_posts
  set chapter_id = (select id from public.chapters where slug = 'stuy')
  where chapter_id is null;

update public.opportunities
  set chapter_id = (select id from public.chapters where slug = 'stuy')
  where chapter_id is null;

update public.profiles
  set chapter_role = 'chapter_admin'
  where is_admin = true;

-- Every community post must belong to a chapter going forward. Safe because
-- the backfill above just guaranteed every existing row has one; run this
-- file in one shot (not statement-by-statement) so app code that always
-- supplies chapter_id on insert is deployed against a DB that already
-- requires it, not before.
alter table public.community_posts
  alter column chapter_id set not null;

-- =========================================================================
-- 4. New-user trigger: stamp chapter_id from auth metadata
-- =========================================================================
-- This assumes the existing handle_new_user()-style trigger function inserts
-- into public.profiles from auth.users. Find it in the dashboard under
-- Database > Functions (it fires on auth.users insert) and add chapter_id
-- to the insert, reading from new.raw_user_meta_data, e.g.:
--
--   insert into public.profiles (id, full_name, chapter_id)
--   values (
--     new.id,
--     new.raw_user_meta_data ->> 'full_name',
--     nullif(new.raw_user_meta_data ->> 'chapter_id', '')::uuid
--   );
--
-- SECURITY: do NOT also copy chapter_role from raw_user_meta_data here.
-- raw_user_meta_data is caller-supplied at signup (app/components/signup-form.tsx
-- passes chapter_id through Supabase's normal, unprivileged signUp() call) --
-- trusting a client-supplied chapter_role would let anyone self-signup as
-- 'chapter_admin' of any chapter simply by setting that field. chapter_role
-- must stay at its default ('member') here; the only path that elevates a
-- profile to chapter_admin is the explicit, service-role-authenticated
-- UPDATE in app/api/admin/approve-chapter/route.ts, run *after* a platform
-- admin has approved a chapter application -- never trust the invite's
-- metadata for this either, for the same reason.
--
-- The exact statement depends on the current function body; this file
-- cannot safely CREATE OR REPLACE it blind without seeing that body first.

-- =========================================================================
-- 5. Row Level Security
-- =========================================================================

alter table public.chapters enable row level security;
alter table public.chapter_applications enable row level security;

-- chapters: readable by everyone (needed for public landing/apply/subdomain
-- resolution); writable only by platform admins.
drop policy if exists "chapters_select_all" on public.chapters;
create policy "chapters_select_all" on public.chapters
  for select
  using (true);

drop policy if exists "chapters_write_platform_admin" on public.chapters;
create policy "chapters_write_platform_admin" on public.chapters
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- chapter_applications: anyone can file a pending, unassigned application
-- with no rejection reason set; only platform admins can read/update them.
-- (rejection_reason/status/chapter_id are all excluded from a legitimate
-- anon insert -- this closes the gap where a direct PostgREST call could
-- otherwise set rejection_reason on its own "pending" application.)
drop policy if exists "chapter_applications_insert_anon" on public.chapter_applications;
create policy "chapter_applications_insert_anon" on public.chapter_applications
  for insert
  with check (status = 'Pending' and chapter_id is null and rejection_reason is null);

drop policy if exists "chapter_applications_select_platform_admin" on public.chapter_applications;
create policy "chapter_applications_select_platform_admin" on public.chapter_applications
  for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "chapter_applications_update_platform_admin" on public.chapter_applications;
create policy "chapter_applications_update_platform_admin" on public.chapter_applications
  for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- community_posts: chapter admins may see and moderate every post (incl.
-- Pending/Rejected) that belongs to their own chapter. This is additive to
-- whatever SELECT/UPDATE policies already exist for authors and platform
-- admins -- verify no existing policy already grants this before running.
drop policy if exists "community_posts_select_chapter_admin" on public.community_posts;
create policy "community_posts_select_chapter_admin" on public.community_posts
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = community_posts.chapter_id
    )
  );

drop policy if exists "community_posts_update_chapter_admin" on public.community_posts;
create policy "community_posts_update_chapter_admin" on public.community_posts
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = community_posts.chapter_id
    )
  );

-- extension_requests: chapter admins may see/update requests filed against
-- their own chapter's posts.
drop policy if exists "extension_requests_select_chapter_admin" on public.extension_requests;
create policy "extension_requests_select_chapter_admin" on public.extension_requests
  for select
  using (
    exists (
      select 1
      from public.community_posts cp
      join public.profiles p on p.id = auth.uid()
      where cp.id = extension_requests.post_id
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = cp.chapter_id
    )
  );

drop policy if exists "extension_requests_update_chapter_admin" on public.extension_requests;
create policy "extension_requests_update_chapter_admin" on public.extension_requests
  for update
  using (
    exists (
      select 1
      from public.community_posts cp
      join public.profiles p on p.id = auth.uid()
      where cp.id = extension_requests.post_id
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = cp.chapter_id
    )
  );

-- opportunities: chapter admins may manage opportunities within their own
-- chapter (platform admins are assumed already covered by an existing
-- is_admin policy -- verify before running).
drop policy if exists "opportunities_insert_chapter_admin" on public.opportunities;
create policy "opportunities_insert_chapter_admin" on public.opportunities
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = opportunities.chapter_id
    )
  );

drop policy if exists "opportunities_update_chapter_admin" on public.opportunities;
create policy "opportunities_update_chapter_admin" on public.opportunities
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = opportunities.chapter_id
    )
  );

drop policy if exists "opportunities_delete_chapter_admin" on public.opportunities;
create policy "opportunities_delete_chapter_admin" on public.opportunities
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and p.chapter_id = opportunities.chapter_id
    )
  );

commit;
