-- Security hardening pass following an audit of the multi-chapter rebuild.
-- Run this whole file once in the Supabase SQL Editor (dashboard), in order.
-- Safe to re-run: every statement is idempotent (DROP POLICY/TRIGGER IF EXISTS
-- before CREATE, CREATE OR REPLACE FUNCTION, guarded DO $$ ... EXCEPTION WHEN
-- duplicate_object blocks for constraints), and the whole file runs as one
-- transaction so a mid-script failure leaves the database exactly as it was
-- before.
--
-- After it succeeds, regenerate types (and re-convert to UTF-8, see CLAUDE.md):
--   npx supabase gen types --linked > types/supabase.ts
--
-- =============================================================================
-- DEPLOYMENT ORDER -- READ BEFORE RUNNING
-- =============================================================================
-- Section 1 (profiles privilege-escalation fix) REVOKES the ability of any
-- authenticated/anon caller to write profiles.is_admin / profiles.chapter_role
-- directly. app/components/admin/admin-dashboard.tsx's handleToggleAdmin()
-- currently does exactly that (a direct browser-client
-- `.from("profiles").update({ is_admin: ... })` call) -- once this section is
-- applied, that button will start failing with a permission-denied error until
-- the app is redeployed with the replacement service-role route
-- app/api/admin/set-admin/route.ts (owned by a different agent in this same
-- remediation) wired up to call it instead. Ship this SQL file and that route
-- together, not this file alone -- there will be a window where "Make Admin /
-- Remove Admin" is broken in the UI if they land separately, though no data
-- can be corrupted either way.
--
-- Section 12 has the SAME coupling: it revokes `authenticated` SELECT on
-- messages_per_day / users_per_day and moves the admin dashboard's graphs onto
-- two new admin-gated RPC functions. app/(main)/admin/page.tsx must be
-- deployed calling .rpc("admin_messages_per_day") / .rpc("admin_users_per_day")
-- in the same release, or the dashboard's two charts will come back empty.
--
-- Summary: ship this SQL file and the accompanying app deploy TOGETHER.
-- Nothing here corrupts data in either order -- the only risk is a temporarily
-- broken admin UI.
-- =============================================================================

begin;

-- =========================================================================
-- 1. Privilege escalation fix: profiles.is_admin / profiles.chapter_role
-- =========================================================================
-- CONFIRMED EXPLOITABLE (audit + verified live via pg_policies/column_privileges):
-- the "Users can update their own profile" policy is `USING (auth.uid() = id)
-- WITH CHECK (auth.uid() = id)` with NO column scoping, and both `anon` and
-- `authenticated` hold UPDATE + INSERT grants on every column of profiles,
-- including is_admin and chapter_role. Any logged-in user could run
-- `update profiles set is_admin = true where id = auth.uid()` themselves and
-- become a platform admin; the same gap lets a user self-assign
-- chapter_role = 'chapter_admin' on their own row.
--
-- Column privileges are layered UNDER row-level security: Postgres checks
-- them first, so this blocks the write before RLS is even consulted, for
-- every role except service_role (which bypasses grants entirely).
--
-- GOTCHA, learned the hard way when this migration was first applied: a
-- column-level REVOKE CANNOT narrow a table-level grant. anon/authenticated
-- held table-wide INSERT/UPDATE on profiles (Supabase's default grant), which
-- implicitly covers every column, so
--   revoke update (is_admin, chapter_role) on public.profiles from ...
-- silently succeeded and changed NOTHING -- information_schema still showed
-- the privileges and the escalation was still live. The table-wide grant has
-- to be dropped first, then re-granted column by column. Verify with:
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'profiles' and grantee in ('anon','authenticated');
-- If INSERT/UPDATE appear there at all, the column grants below are moot.
--
-- anon deliberately gets nothing back: profile rows are created by the
-- handle_new_user trigger (SECURITY DEFINER, runs as the owner), and every
-- app-side profile write happens as authenticated.
--
-- This deliberately breaks the browser-side toggle at
-- app/components/admin/admin-dashboard.tsx's handleToggleAdmin(), which does
-- a direct `.from("profiles").update({ is_admin: ... })` from the browser
-- client (role `authenticated`). Admin promotion must now go exclusively
-- through the new service-role route app/api/admin/set-admin/route.ts (built
-- by another agent in this remediation), which uses
-- createSupabaseAdminClient() and is therefore unaffected by this revoke.
-- See "DEPLOYMENT ORDER" above.
revoke insert, update on public.profiles from anon, authenticated;

grant update (
  full_name, avatar_url, bio, grad_year, interests, looking_for, club_roles, chapter_id
) on public.profiles to authenticated;

grant insert (
  id, full_name, avatar_url, bio, grad_year, interests, looking_for, club_roles, chapter_id
) on public.profiles to authenticated;

-- =========================================================================
-- 2. Anon PII leak fix: profiles readable without authentication
-- =========================================================================
-- CONFIRMED: "Profiles are publicly viewable" is `USING (true)` for role
-- `public` (which in Postgres RLS includes `anon`), and `anon` holds a SELECT
-- grant on profiles. All 54 students' names, bios, interests, grad years,
-- club roles, and avatar URLs are readable by anyone hitting
-- /rest/v1/profiles with only the publishable anon key -- no login required.
--
-- The people directory (app/components/people/people-client.tsx) has a
-- cross-chapter "All chapters" toggle whose handleToggleAllChapters() does a
-- direct browser-client `.from("profiles").select(...)` with no chapter_id
-- filter, expecting to read every chapter's profiles once toggled -- so the
-- fix here must remain "authenticated users may read any chapter's profiles"
-- (chapter scoping for the default view is a query-layer choice made by the
-- server page, not an RLS boundary -- see the Conventions note in CLAUDE.md
-- on that same pattern for opportunities/people). The security boundary being
-- restored here is authentication, not chapter isolation: a signed-in user
-- from any chapter could already see other chapters' directories via that
-- toggle before this change, and still can after it. What changes is that an
-- anonymous caller with no session can no longer read any of it.
drop policy if exists "Profiles are publicly viewable" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select
  to authenticated
  using (true);

-- =========================================================================
-- 3. Post moderation bypass fix
-- =========================================================================
-- CONFIRMED: "Logged in users can submit posts" only checks
-- `auth.uid() = user_id` -- an author can INSERT a post with
-- status = 'Approved' directly, skipping moderation entirely. Separately,
-- "Users can update their own posts" (`USING/WITH CHECK auth.uid() = user_id`)
-- lets an author later flip status back to 'Approved' after a rejection, or
-- set an arbitrary expires_at, or reassign chapter_id, on their own post.
--
-- Fix has two parts:
--   a) INSERT must additionally require status = 'Pending', so a new post can
--      never be self-published.
--   b) A BEFORE UPDATE trigger (not just a tighter policy) blocks any change
--      to status / expires_at / rejection_reason / chapter_id unless the
--      caller is a platform admin or the chapter_admin of that post's chapter.
--      A trigger is used instead of only narrowing the policy's WITH CHECK
--      because there are multiple permissive UPDATE policies on this table
--      (the author's own-post policy, the admin policy, and the
--      chapter-admin policy from 001_chapters.sql) -- Postgres ORs permissive
--      policies together, so tightening only one of them would not close the
--      gap. A single trigger enforces the column-level rule regardless of
--      which policy admitted the row.
drop policy if exists "Logged in users can submit posts" on public.community_posts;
create policy "Logged in users can submit posts" on public.community_posts
  for insert
  with check (auth.uid() = user_id and status = 'Pending');

-- SECURITY: this function is SECURITY DEFINER so it can read public.profiles
-- to check the caller's is_admin / chapter_role regardless of the caller's
-- own RLS visibility, and sets a fixed search_path so it cannot be tricked by
-- a session-local search_path pointing at an attacker-controlled schema.
--
-- auth.uid() is NULL for any call made with the service-role key (it carries
-- no user JWT) -- e.g. the delete_expired_posts() cleanup job, or a future
-- admin API route using createSupabaseAdminClient(). Those calls are let
-- through untouched; RLS/grants are the gate for service-role callers, not
-- this trigger.
create or replace function public.guard_post_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.status is distinct from old.status)
     or (new.expires_at is distinct from old.expires_at)
     or (new.rejection_reason is distinct from old.rejection_reason)
     or (new.chapter_id is distinct from old.chapter_id) then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin
          or (p.chapter_role = 'chapter_admin' and p.chapter_id = old.chapter_id)
        )
    ) then
      raise exception 'Only a platform admin or the chapter''s chapter_admin may change status, expires_at, rejection_reason, or chapter_id on a community post';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_post_moderation_fields_trigger on public.community_posts;
create trigger guard_post_moderation_fields_trigger
  before update on public.community_posts
  for each row execute function public.guard_post_moderation_fields();

-- =========================================================================
-- 4. Extension request self-approval fix
-- =========================================================================
-- CONFIRMED: "Users can submit their own extension requests" only checks
-- `auth.uid() = user_id` -- a user could INSERT a request with
-- status = 'Approved' directly instead of 'Pending'. Same pattern and same
-- reasoning as section 3: force status='Pending' on insert, then guard any
-- later status change with a trigger restricted to admins/chapter-admins.
-- (Today the only UPDATE policies on this table are already admin/
-- chapter-admin-gated, so no ordinary user can currently reach an UPDATE at
-- all -- this trigger is added anyway as defense-in-depth matching the
-- community_posts pattern, and to guard against a future looser UPDATE
-- policy being added without this file being revisited.)
drop policy if exists "Users can submit their own extension requests" on public.extension_requests;
create policy "Users can submit their own extension requests" on public.extension_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'Pending');

create or replace function public.guard_extension_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.is_admin
          or exists (
            select 1 from public.community_posts cp
            where cp.id = old.post_id
              and p.chapter_role = 'chapter_admin'
              and p.chapter_id = cp.chapter_id
          )
        )
    ) then
      raise exception 'Only a platform admin or the linked post''s chapter_admin may change extension_requests.status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_extension_request_status_trigger on public.extension_requests;
create trigger guard_extension_request_status_trigger
  before update on public.extension_requests
  for each row execute function public.guard_extension_request_status();

-- =========================================================================
-- 5. Storage upload scoping: post-images
-- =========================================================================
-- CONFIRMED: "Authenticated users can upload post images" only checks
-- `bucket_id = 'post-images'` -- no path scoping at all, so any authenticated
-- user could upload to (or overwrite) any other user's post-images path.
-- Compare the existing, correctly-scoped avatars policy, which additionally
-- requires the first path segment to equal the caller's own uid via
-- storage.foldername(name). App code already uploads post images under
-- `${userId}/...` (same convention as avatars -- see CLAUDE.md's Database
-- section), so this tightens the policy to match actual usage without
-- changing upload paths.
drop policy if exists "Authenticated users can upload post images" on storage.objects;
create policy "Authenticated users can upload post images" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- NOTE: the bucket-level MIME allowlist and size limit are Supabase Dashboard
-- config (Storage -> post-images -> bucket settings), not something this SQL
-- file can set. Set: allowed MIME types image/jpeg, image/png, image/webp,
-- image/gif; file size limit 5MB -- to match the avatars bucket's existing
-- limits and close the gap where post-images currently accepts arbitrary
-- file types/sizes.

-- =========================================================================
-- 6. Fix handle_new_user()
-- =========================================================================
-- CONFIRMED via pg_proc: the live function is
--   insert into public.profiles (id, full_name, chapter_id)
--   values (new.id, new.raw_user_meta_data->>'full_name')
-- -- three columns declared, only two values supplied, which is a syntax-level
-- column/value count mismatch that fails on every single signup. The
-- `exception when others then return new` swallows that failure silently, so
-- every new signup returns success to the client while leaving no profiles
-- row behind (confirmed: 55 auth.users vs 54 profiles at time of audit).
--
-- Fix: supply chapter_id (from raw_user_meta_data, same as
-- 001_chapters.sql's Section 4 comment intended), add search_path pinning,
-- keep on conflict (id) do nothing, and remove the blanket exception swallow
-- so a real failure surfaces instead of silently discarding the row.
--
-- SECURITY (restated from 001_chapters.sql): do NOT add chapter_role here.
-- raw_user_meta_data is caller-supplied at signup (and by Supabase invites) --
-- trusting a client-supplied chapter_role would let anyone self-signup as
-- 'chapter_admin' of any chapter just by setting that field. chapter_role
-- must stay at its column default ('member'); the only path that elevates a
-- profile to chapter_admin is the explicit, already-admin-gated,
-- service-role UPDATE in app/api/admin/approve-chapter/route.ts, run only
-- after a platform admin approves a chapter application.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, chapter_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    nullif(new.raw_user_meta_data ->> 'chapter_id', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- =========================================================================
-- 7. Revoke SECURITY DEFINER view grants: messages_per_day / users_per_day
-- =========================================================================
-- CONFIRMED: both views are SECURITY DEFINER (so they run with the view
-- owner's privileges, bypassing the underlying tables' RLS), and `anon` +
-- `authenticated` both hold full SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants
-- on them. These views feed the admin dashboard's Recharts graphs
-- (app/(main)/admin/page.tsx) and are read-only aggregates by design --
-- INSERT/UPDATE/DELETE/TRUNCATE on a view with no INSTEAD OF rule just errors
-- at the client, but there's no reason to grant it in the first place.
--
-- `anon` has no legitimate reason to read these at all -- revoke everything.
revoke all on public.messages_per_day from anon;
revoke all on public.users_per_day from anon;

-- `authenticated`: revoke the write privileges outright (a view with no
-- INSTEAD OF trigger can't sensibly be written to). SELECT is intentionally
-- LEFT IN PLACE for `authenticated`, not revoked, as an explicit, narrower
-- fix than the audit's literal wording -- app/(main)/admin/page.tsx currently
-- fetches both views using the request's own authenticated session via
-- createSupabaseServerClient() (NOT the service-role admin client), even
-- though the page itself is already gated by an is_admin check earlier in
-- that same file. Revoking authenticated SELECT here would 500 that page for
-- every real platform admin the moment this migration lands, with no
-- accompanying code change in this PR to fix it (the code fix is out of
-- scope for this SQL-only file, and no other agent's task in this
-- remediation touches admin/page.tsx).
--
-- This leaves one narrow gap this migration does not close: because these
-- views carry no row-level filtering of their own, any authenticated
-- non-admin user could still call GET /rest/v1/messages_per_day or
-- /rest/v1/users_per_day directly (bypassing the page's is_admin check
-- entirely) and see platform-wide daily message/signup counts -- a small
-- aggregate-only leak (day + count, no PII), not the row-level PII exposure
-- fixed in section 2. Closing it fully requires moving this fetch behind a
-- service-role-gated route (mirroring app/api/admin/remove-user/route.ts),
-- which is a .ts change outside this file's ownership -- flagging it here so
-- it can be picked up as a fast follow.
-- Revoke everything from authenticated too, then grant back only SELECT --
-- cleaner than individually revoking INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER one at a time, and leaves no doubt about what remains.
revoke all on public.messages_per_day from authenticated;
revoke all on public.users_per_day from authenticated;
grant select on public.messages_per_day to authenticated;
grant select on public.users_per_day to authenticated;

-- =========================================================================
-- 8. Revoke execute on delete_expired_posts()
-- =========================================================================
-- CONFIRMED: delete_expired_posts() is SECURITY DEFINER, has no search_path
-- pin, and is executable by `anon` (and `authenticated`) via
-- POST /rest/v1/rpc/delete_expired_posts -- meaning anyone, logged in or not,
-- could trigger a bulk delete of every expired post (and its storage image)
-- on demand, ahead of whatever schedule is intended to run it. No client
-- code in this repo calls this RPC (verified: no `delete_expired_posts`
-- reference anywhere under app/) -- it's meant to run from a scheduled job
-- (pg_cron / Supabase's scheduled functions) as `postgres`/`service_role`,
-- neither of which is affected by this revoke.
--
-- CREATE OR REPLACE preserves the existing function body exactly (read from
-- pg_proc before writing this), only adding the search_path pin so a
-- session-local search_path can't redirect its unqualified table references
-- (community_posts, storage.objects -- already schema-qualified, but
-- community_posts is not) to an attacker-controlled schema.
create or replace function public.delete_expired_posts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  post record;
begin
  for post in
    select id, image_url from community_posts where expires_at < now()
  loop
    if post.image_url is not null then
      delete from storage.objects
      where bucket_id = 'post-images'
      and name = split_part(post.image_url, '/post-images/', 2);
    end if;

    delete from community_posts where id = post.id;
  end loop;
end;
$$;

-- GOTCHA (same family as the section 1 table-vs-column grant trap): Postgres
-- grants EXECUTE on every new function to PUBLIC by default. Revoking from
-- anon/authenticated alone leaves that PUBLIC grant in place and anon still
-- inherits it -- on the first application of this file, delete_expired_posts
-- remained callable via POST /rest/v1/rpc/delete_expired_posts. PUBLIC must be
-- named explicitly. Check with `\df+` or:
--   select proname, proacl from pg_proc where proname = 'delete_expired_posts';
-- An entry of the form `=X/postgres` (empty grantee) IS the PUBLIC grant.
revoke all on function public.delete_expired_posts() from public, anon, authenticated;

-- Same treatment for every other non-user-facing function. The trigger
-- functions do not need caller EXECUTE (the trigger mechanism invokes them as
-- the definer), so revoking here does not affect any trigger.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.guard_post_moderation_fields() from public, anon, authenticated;
revoke all on function public.guard_extension_request_status() from public, anon, authenticated;
revoke all on function public.guard_message_edit_fields() from public, anon, authenticated;
revoke all on function public.rate_limit_contact_submissions() from public, anon, authenticated;

-- =========================================================================
-- 9. messages UPDATE tightening
-- =========================================================================
-- CONFIRMED: "Participants can mark messages as read" has a USING clause
-- (caller is a participant in the message's conversation) but NO WITH CHECK
-- -- for an UPDATE policy, omitting WITH CHECK makes Postgres reuse the
-- USING clause as the check on the new row, which only re-verifies
-- conversation participancy, not which columns changed. Either participant
-- could therefore update ANY column of ANY message in their conversation,
-- including rewriting the other person's message content or reassigning
-- sender_id.
--
-- app/components/messages/chat-window.tsx's only UPDATE usage is
--   .from("messages").update({ read: true }).eq("id", newMessage.id)
-- fired when a realtime INSERT arrives from the *other* participant -- the
-- sender never marks their own message read. The fix narrows this on two
-- independent layers:
--   a) the policy: USING now also excludes the message's own sender (a
--      participant may only touch messages they did not send), and
--      WITH CHECK requires the new row's `read` to be true (so a request
--      can't flip a message back to unread).
--   b) a BEFORE UPDATE trigger, because RLS's WITH CHECK can only constrain
--      the *new* row's values, not compare them against the old row -- it
--      cannot by itself stop a single UPDATE from setting both
--      content = '...hijacked...' AND read = true in the same statement
--      (that would still satisfy WITH CHECK's `read = true`). The trigger
--      independently blocks any change to content/sender_id/
--      conversation_id/created_at, regardless of what the policy allowed.
drop policy if exists "Participants can mark messages as read" on public.messages;
create policy "messages_update_mark_read" on public.messages
  for update
  to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.participant_1 = auth.uid() or c.participant_2 = auth.uid())
    )
  )
  with check (read = true);

create or replace function public.guard_message_edit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.content is distinct from old.content)
     or (new.sender_id is distinct from old.sender_id)
     or (new.conversation_id is distinct from old.conversation_id)
     or (new.created_at is distinct from old.created_at) then
    raise exception 'messages: only the read flag may be changed after a message is sent';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_message_edit_fields_trigger on public.messages;
create trigger guard_message_edit_fields_trigger
  before update on public.messages
  for each row execute function public.guard_message_edit_fields();

-- =========================================================================
-- 10. chapter_applications insert policy drift
-- =========================================================================
-- CONFIRMED via pg_policies: the deployed policy is
--   with check (status = 'Pending' and chapter_id is null)
-- which has drifted from 001_chapters.sql:182's intent, which also requires
-- rejection_reason is null. Without that third condition, a direct anon
-- PostgREST call could INSERT a "pending" application that already carries a
-- rejection_reason -- harmless on its own today (nothing reads
-- rejection_reason before an admin acts on the row), but closing it restores
-- the originally-designed invariant and matches what the one committed
-- migration file says should be running.
drop policy if exists "chapter_applications_insert_anon" on public.chapter_applications;
create policy "chapter_applications_insert_anon" on public.chapter_applications
  for insert
  with check (status = 'Pending' and chapter_id is null and rejection_reason is null);

-- =========================================================================
-- 11. contact_submissions length CHECKs
-- =========================================================================
-- CONFIRMED: contact_submissions has no length constraints at all.
-- app/(main)/contact/page.tsx's form (ContactForm) inserts { name, email,
-- category, message } from the browser client with only a client-side
-- maxLength={1000} on the message textarea -- no enforcement server-side, so
-- a direct PostgREST call bypassing the UI could insert arbitrarily large
-- values. Mirrors the guarded `do $$ ... exception when duplicate_object`
-- style used for chapter_applications in 001_chapters.sql so this file stays
-- safe to re-run against a table that may already have these constraints
-- from an earlier run.
do $$
begin
  begin
    alter table public.contact_submissions
      add constraint contact_submissions_name_len check (char_length(name) between 1 and 200);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.contact_submissions
      add constraint contact_submissions_email_len check (char_length(email) between 1 and 200);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.contact_submissions
      add constraint contact_submissions_category_len check (char_length(category) between 1 and 100);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.contact_submissions
      add constraint contact_submissions_message_len check (char_length(message) between 1 and 2000);
  exception when duplicate_object then null;
  end;
end $$;

-- =========================================================================
-- 12. Close the analytics-view gap left open by section 7
-- =========================================================================
-- Section 7 deliberately left `authenticated` holding SELECT on
-- messages_per_day / users_per_day, because app/(main)/admin/page.tsx read
-- those views through the request's own user session -- revoking would have
-- 500'd the admin dashboard. That left any authenticated non-admin able to
-- GET /rest/v1/users_per_day directly and read platform-wide daily signup and
-- message counts, bypassing the page's is_admin gate entirely (aggregate only,
-- no PII -- but no reason to expose it).
--
-- Closed here by replacing direct view access with two SECURITY DEFINER
-- functions that re-check is_admin *inside the database*, so the gate travels
-- with the data instead of living only in the page component. admin/page.tsx
-- now calls these via .rpc() instead of .from(<view>).
--
-- `#variable_conflict use_column` is required: the RETURNS TABLE column named
-- `count` would otherwise shadow the count() aggregate inside the body. The
-- output shape (day timestamptz, count bigint) is unchanged from the views, so
-- the Recharts DayCount props in admin-dashboard.tsx need no change.
create or replace function public.admin_messages_per_day()
returns table (day timestamptz, count bigint)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Forbidden: platform admin required';
  end if;

  return query
    select date_trunc('day', m.created_at) as day, count(*) as count
    from public.messages m
    where m.created_at >= now() - interval '30 days'
    group by 1
    order by 1;
end;
$$;

create or replace function public.admin_users_per_day()
returns table (day timestamptz, count bigint)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Forbidden: platform admin required';
  end if;

  return query
    select date_trunc('day', pr.created_at) as day, count(*) as count
    from public.profiles pr
    where pr.created_at >= now() - interval '30 days'
    group by 1
    order by 1;
end;
$$;

revoke all on function public.admin_messages_per_day() from public, anon;
revoke all on function public.admin_users_per_day() from public, anon;
grant execute on function public.admin_messages_per_day() to authenticated;
grant execute on function public.admin_users_per_day() to authenticated;

-- Now that nothing reads the views through a user session, finish section 7's
-- job: authenticated loses SELECT too. The views themselves are left in place
-- (harmless, and still readable by service_role / the SQL editor) rather than
-- dropped, so any dashboard query or saved report that references them keeps
-- working for privileged callers.
revoke all on public.messages_per_day from authenticated;
revoke all on public.users_per_day from authenticated;

-- =========================================================================
-- 13. Rate limiting (Postgres-backed -- no external service required)
-- =========================================================================
-- The audit found no rate limiting anywhere. The two endpoints that matter
-- are both effectively unauthenticated write paths:
--   a) POST /api/apply -- public chapter-application form (anon insert)
--   b) contact_submissions -- inserted DIRECTLY from the browser via
--      PostgREST (app/(main)/contact/page.tsx), so there is no route handler
--      to put a check in; it has to be enforced in the database.
--
-- Implemented as a fixed-window counter table plus a SECURITY DEFINER
-- function. Deliberately NOT Upstash/Redis: this app already has exactly one
-- piece of stateful infrastructure (this database), it is serverless-safe
-- (unlike in-memory counters, which reset on every cold start), and at this
-- app's scale a single upsert per request is cheaper than a network hop to a
-- third-party service.
--
-- NOTE on auth endpoints (login/signup/password reset): those are handled by
-- Supabase Auth itself (GoTrue), which applies its own built-in rate limits --
-- they never reach this app's code, so they are not covered here. Tune them in
-- Dashboard -> Authentication -> Rate Limits.
create table if not exists public.rate_limits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket_key, window_start)
);

-- RLS on with NO policies: this table is reachable *only* through the
-- SECURITY DEFINER function below, never directly from PostgREST. (An
-- RLS-enabled table with no policies denies everything to anon/authenticated,
-- which is exactly what we want here -- the usual "silently returns empty"
-- trap is the desired behaviour for a table clients must never touch.)
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true if the caller is still within budget, false if they have
-- exceeded it. Counts the current attempt.
create or replace function public.check_rate_limit(
  p_key            text,
  p_max_hits       integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_key is null or p_max_hits is null or p_window_seconds is null
     or p_window_seconds <= 0 or p_max_hits <= 0 then
    raise exception 'check_rate_limit: invalid arguments';
  end if;

  -- Floor now() to the start of the current fixed window.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (bucket_key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (bucket_key, window_start)
    do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Opportunistic cleanup of old windows, ~1% of calls, so the table cannot
  -- grow without bound and no scheduled job is required.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max_hits;
end;
$$;

-- Deliberately NOT executable by anon or authenticated. Exposing a limiter
-- that writes a row on every call as a public RPC would itself be an abuse
-- vector: a caller could invoke it with unbounded distinct keys and bloat
-- rate_limits faster than the cleanup above reclaims it. The only two callers
-- both reach it privileged:
--   * /api/apply calls it with createSupabaseAdminClient() (service_role) --
--     legitimate there, since it is a route handler under app/api/.
--   * the contact_submissions trigger below is itself SECURITY DEFINER, so its
--     internal call runs as the function owner and needs no caller grant.
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Enforce the contact-form limit in the database, since that insert bypasses
-- the app's route handlers entirely. 5 submissions per user per hour.
-- Service-role callers (auth.uid() is null) are exempt.
create or replace function public.rate_limit_contact_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.check_rate_limit('contact:' || auth.uid()::text, 5, 3600) then
    raise exception 'Rate limit exceeded: please wait before sending another message.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists rate_limit_contact_submissions_trigger on public.contact_submissions;
create trigger rate_limit_contact_submissions_trigger
  before insert on public.contact_submissions
  for each row execute function public.rate_limit_contact_submissions();

-- =========================================================================
-- 14. Remove anonymous read access to community posts and opportunities
-- =========================================================================
-- Found during post-remediation verification, same class as section 2 but a
-- lower severity: `anon` holds a SELECT grant on both tables, and their SELECT
-- policies are written for role `public`, so an anonymous caller with only the
-- publishable anon key could read every Approved community post and every
-- opportunity without logging in. That is student-authored content on a
-- platform for minors -- less sensitive than the profile PII fixed in section
-- 2, but there is no reason for it to be world-readable.
--
-- Verified safe: EVERY reader of both tables lives under the authenticated
-- app/(main)/ route group (community, home, opportunities, admin and
-- chapter-admin pages and their client components). The public marketing
-- landing and /apply page query neither table. Restricting to `authenticated`
-- therefore changes nothing a real user can see.
--
-- REVERT NOTE: if a public, logged-out opportunities board is ever built, the
-- opportunities policy below is the single thing to widen back to `public`.
drop policy if exists "Community posts select policy" on public.community_posts;
create policy "Community posts select policy" on public.community_posts
  for select
  to authenticated
  using (
    status = 'Approved'
    or auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

drop policy if exists "Opportunities are publicly viewable" on public.opportunities;
create policy "Opportunities are authenticated-viewable" on public.opportunities
  for select
  to authenticated
  using (true);

commit;

-- =============================================================================
-- POST-MIGRATION VERIFICATION
-- =============================================================================
-- Run these read-only queries after applying the migration to confirm each
-- fix landed. None of them modify data.

-- 1. profiles: check the TABLE-level grant first -- this is the one that
--    matters. If INSERT/UPDATE show up here, a column-level revoke did
--    nothing and is_admin is still writable regardless of what
--    column_privileges reports. Expect ZERO rows.
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'profiles'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type in ('INSERT', 'UPDATE');
--
--    Then confirm the column grants are the intended set (is_admin and
--    chapter_role must NOT appear; anon must not appear at all):
-- select grantee, privilege_type, column_name
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'profiles'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type in ('INSERT', 'UPDATE')
-- order by grantee, privilege_type, column_name;
--
--    Strongest check -- actually attempt the exploit as a real user (this
--    rolls itself back and writes nothing):
-- do $$
-- declare victim uuid; result text;
-- begin
--   select id into victim from public.profiles where is_admin is not true limit 1;
--   execute 'set local role authenticated';
--   execute format('set local request.jwt.claims = %L',
--     json_build_object('sub', victim, 'role', 'authenticated')::text);
--   begin
--     update public.profiles set is_admin = true where id = victim;
--     result := 'STILL VULNERABLE';
--   exception when others then result := 'blocked: ' || sqlerrm;
--   end;
--   raise exception 'escalation=[%] -- rolled back', result;
-- end $$;

-- 2. profiles: the public/anon SELECT policy must be gone, replaced by an
--    authenticated-only one. Expect no policy with roles containing "public"
--    or "anon" for cmd = SELECT.
-- select policyname, cmd, roles, qual
-- from pg_policies
-- where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT';

-- 3. community_posts: INSERT policy must require status = 'Pending', and the
--    moderation-guard trigger must exist.
-- select policyname, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'community_posts' and cmd = 'INSERT';
-- select tgname, tgrelid::regclass from pg_trigger
-- where tgname = 'guard_post_moderation_fields_trigger';

-- 4. extension_requests: same shape as (3).
-- select policyname, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'extension_requests' and cmd = 'INSERT';
-- select tgname, tgrelid::regclass from pg_trigger
-- where tgname = 'guard_extension_request_status_trigger';

-- 5. storage.objects: post-images upload policy must now path-scope to the
--    caller's own uid, matching the avatars policy's shape.
-- select policyname, with_check from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and policyname = 'Authenticated users can upload post images';
-- (Bucket MIME/size limits must be checked in the Dashboard -- not queryable
-- via SQL in the same way.)

-- 6. handle_new_user: confirm the corrected body, then verify no auth.users
--    row is missing a profiles row going forward (this count will still show
--    the pre-existing 55-vs-54 drift for OLD rows -- this migration does not
--    backfill missing profiles for users who signed up before the fix).
-- select pg_get_functiondef(oid) from pg_proc
-- where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace;
-- select (select count(*) from auth.users) as auth_users,
--        (select count(*) from public.profiles) as profile_rows;

-- 7. messages_per_day / users_per_day: anon should hold nothing; authenticated
--    should hold SELECT only (see section 7's comment for why SELECT stays).
-- select table_name, grantee, privilege_type
-- from information_schema.table_privileges
-- where table_schema = 'public' and table_name in ('messages_per_day', 'users_per_day')
--   and grantee in ('anon', 'authenticated')
-- order by table_name, grantee, privilege_type;

-- 8. delete_expired_posts: anon/authenticated should hold no EXECUTE grant.
-- select routine_name, grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public' and routine_name = 'delete_expired_posts'
--   and grantee in ('anon', 'authenticated');

-- 9. messages: confirm the new policy + trigger both exist.
-- select policyname, qual, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'messages' and cmd = 'UPDATE';
-- select tgname, tgrelid::regclass from pg_trigger
-- where tgname = 'guard_message_edit_fields_trigger';

-- 10. chapter_applications: with_check must now include rejection_reason is null.
-- select policyname, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'chapter_applications' and cmd = 'INSERT';

-- 11. contact_submissions: confirm all four length constraints exist.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.contact_submissions'::regclass and contype = 'c';

-- 12. analytics: anon AND authenticated should now hold NOTHING on either
--     view; the two RPCs should be executable by authenticated only.
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('messages_per_day', 'users_per_day')
--   and grantee in ('anon', 'authenticated');   -- expect ZERO rows
-- select routine_name, grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name in ('admin_messages_per_day', 'admin_users_per_day');

-- 13. rate limiting: table exists with RLS on and no policies; function is
--     executable by anon + authenticated.
-- select relname, relrowsecurity,
--        (select count(*) from pg_policy where polrelid = c.oid) as policies
-- from pg_class c where relname = 'rate_limits';   -- expect rls=t, policies=0
-- select routine_name, grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public' and routine_name = 'check_rate_limit';
--
--     Smoke-test the limiter without writing app data (rolls itself back):
-- do $$
-- declare ok boolean; i int;
-- begin
--   for i in 1..4 loop
--     ok := public.check_rate_limit('verify:probe', 3, 60);
--     raise notice 'attempt % -> allowed=%', i, ok;   -- expect t,t,t,f
--   end loop;
--   raise exception 'probe complete -- rolled back';
-- end $$;

-- 14. community_posts / opportunities: SELECT policies must now be scoped to
--     the `authenticated` role, not `public`.
-- select tablename, policyname, roles, qual from pg_policies
-- where schemaname = 'public'
--   and tablename in ('community_posts', 'opportunities') and cmd = 'SELECT';
