-- 008_audit_fixes.sql -- 2026-09 code audit, database half.
--
-- Written against the LIVE policy/trigger dump (pg_policies, pg_trigger,
-- pg_get_functiondef) taken the same day, not just 001-007. Safe to re-run.
--
-- Findings closed here (numbers match the audit table):
--   #1  community_posts INSERT left expires_at / image_url / chapter_id /
--       rejection_reason unguarded -> arbitrary storage deletion via the purge
--       cron, never-expiring posts, cross-chapter posting.
--   #2  authors could rewrite an Approved post (author UPDATE policy).
--   #3  handle_new_user aborted signup/invite when the name failed
--       full_name_sane or was null ("Li", digits, admin-created users).
--   #7  chapter admins could reassign community_posts.user_id and
--       opportunities.created_by.
--   #9  chapter admins could not see or act on opportunity extension requests.
--   #11 anyone could file an extension request against someone else's item.
--   #12 profile INSERT (and signup metadata) could set an Inactive chapter,
--       bypassing enforce_one_way_chapter_join, which is UPDATE-only.
--   #15/#16 storage had no DELETE policy for post-images / avatars, so the
--       author's own image/avatar deletes silently removed nothing.
--   #20 conversation participants could rewrite participant_1/participant_2
--       (UPDATE policy has no WITH CHECK and no column guard).

-- =========================================================================
-- #1  Guard the fields a client supplies on community_posts INSERT
-- =========================================================================
-- The INSERT policy only pins user_id and status. The moderation guard is
-- BEFORE UPDATE, so on insert expires_at / image_url / chapter_id /
-- rejection_reason were fully client-controlled. The purge cron deletes
-- whatever path follows /post-images/ in image_url with the service role, so
-- a post with expires_at in the past and a victim's image_url deleted the
-- victim's file within a day with no moderator ever seeing it.
create or replace function public.guard_post_insert_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_chapter uuid;
  caller_admin boolean;
begin
  -- Service-role / SQL-editor callers carry no JWT.
  if auth.uid() is null then
    return new;
  end if;

  select p.chapter_id, coalesce(p.is_admin, false)
    into caller_chapter, caller_admin
    from public.profiles p
   where p.id = auth.uid();

  new.rejection_reason := null;

  -- Matches lib/lifecycle.ts initialExpiry(): at most 30 days out. Clamped
  -- rather than rejected so client clock skew never fails a legitimate post.
  new.expires_at := least(
    greatest(coalesce(new.expires_at, now() + interval '30 days'), now()),
    now() + interval '30 days'
  );

  if not caller_admin and new.chapter_id is distinct from caller_chapter then
    raise exception 'A post can only be filed in your own chapter';
  end if;

  -- Must be a public URL for an object in the caller's own folder, exactly
  -- as create-post-button.tsx builds it (`${userId}/${Date.now()}.${ext}`).
  if new.image_url is not null
     and new.image_url !~ ('^https://[^/]+/storage/v1/object/public/post-images/'
                           || auth.uid()::text || '/[^/?#]+$') then
    raise exception 'image_url must point at your own post-images folder';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_post_insert_fields() from public, anon, authenticated;

drop trigger if exists guard_post_insert_fields_trigger on public.community_posts;
create trigger guard_post_insert_fields_trigger
  before insert on public.community_posts
  for each row execute function public.guard_post_insert_fields();

-- =========================================================================
-- #2  Authors can no longer edit a post after submission
-- =========================================================================
-- No app code performs an author UPDATE (moderation writes go through the
-- admin / chapter-admin policies, which stay). Editing would need a
-- re-moderation path; until one exists the policy is pure attack surface.
drop policy if exists "Users can update their own posts" on public.community_posts;

-- =========================================================================
-- #7  Authorship is immutable to JWT callers
-- =========================================================================
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

  if new.user_id is distinct from old.user_id then
    raise exception 'The author of a community post cannot be changed';
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

create or replace function public.guard_opportunity_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.created_by is distinct from old.created_by
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Only a platform admin may change created_by on an opportunity';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_opportunity_owner() from public, anon, authenticated;

drop trigger if exists guard_opportunity_owner_trigger on public.opportunities;
create trigger guard_opportunity_owner_trigger
  before update on public.opportunities
  for each row execute function public.guard_opportunity_owner();

-- =========================================================================
-- #3 + #12  handle_new_user never aborts a signup, and never trusts an
--           Inactive chapter from metadata
-- =========================================================================
-- raw_user_meta_data is caller-supplied (signup form, Google, invites). Since
-- 002 removed the exception swallow, a name failing full_name_sane (e.g. a
-- Google account named "Li") or a null name (NOT NULL) aborted the auth.users
-- insert itself: "Database error saving new user". Fall back to a placeholder
-- the user fixes on the profile page the onboarding gate sends them to.
-- chapter_id is looked up by text so a malformed value cannot raise a cast
-- error either. Still copies nothing privilege-bearing (see 001/002).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_name text := trim(new.raw_user_meta_data ->> 'full_name');
  meta_chapter uuid;
begin
  if meta_name is null
     or char_length(meta_name) not between 3 and 60
     or meta_name ~ '[0-9]' then
    meta_name := 'New Member';
  end if;

  select c.id into meta_chapter
    from public.chapters c
   where c.id::text = new.raw_user_meta_data ->> 'chapter_id'
     and c.status = 'Active';

  insert into public.profiles (id, full_name, chapter_id)
  values (new.id, meta_name, meta_chapter)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- #12: the self-heal INSERT path (a user whose profile row is missing) could
-- name any chapter, including an Inactive one. Mirror the UPDATE trigger.
create or replace function public.enforce_active_chapter_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.chapter_id is not null
     and not exists (select 1 from public.chapters c
                     where c.id = new.chapter_id and c.status = 'Active') then
    raise exception 'chapter must be an active chapter';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_active_chapter_on_insert() from public, anon, authenticated;

drop trigger if exists enforce_active_chapter_on_insert on public.profiles;
create trigger enforce_active_chapter_on_insert
  before insert on public.profiles
  for each row execute function public.enforce_active_chapter_on_insert();

-- =========================================================================
-- #11  Extension requests only for your own post / opportunity
-- =========================================================================
-- The subqueries run under the caller's RLS; both targets have an
-- owner-can-see-own SELECT policy, including once archived.
drop policy if exists "Users can submit their own extension requests" on public.extension_requests;
create policy "Users can submit their own extension requests" on public.extension_requests
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'Pending'
    and (
      exists (select 1 from public.community_posts cp
              where cp.id = extension_requests.post_id and cp.user_id = auth.uid())
      or exists (select 1 from public.opportunities o
                 where o.id = extension_requests.opportunity_id and o.created_by = auth.uid())
    )
  );

-- =========================================================================
-- #9  Chapter admins handle their chapter's opportunity extension requests
-- =========================================================================
drop policy if exists "extension_requests_select_chapter_admin" on public.extension_requests;
create policy "extension_requests_select_chapter_admin" on public.extension_requests
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and (
          exists (select 1 from public.community_posts cp
                  where cp.id = extension_requests.post_id and cp.chapter_id = p.chapter_id)
          or exists (select 1 from public.opportunities o
                     where o.id = extension_requests.opportunity_id and o.chapter_id = p.chapter_id)
        )
    )
  );

drop policy if exists "extension_requests_update_chapter_admin" on public.extension_requests;
create policy "extension_requests_update_chapter_admin" on public.extension_requests
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.chapter_role = 'chapter_admin'
        and (
          exists (select 1 from public.community_posts cp
                  where cp.id = extension_requests.post_id and cp.chapter_id = p.chapter_id)
          or exists (select 1 from public.opportunities o
                     where o.id = extension_requests.opportunity_id and o.chapter_id = p.chapter_id)
        )
    )
  );

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
          or (p.chapter_role = 'chapter_admin' and (
                exists (select 1 from public.community_posts cp
                        where cp.id = old.post_id and cp.chapter_id = p.chapter_id)
                or exists (select 1 from public.opportunities o
                           where o.id = old.opportunity_id and o.chapter_id = p.chapter_id)
              ))
        )
    ) then
      raise exception 'Only a platform admin or the target''s chapter_admin may change extension_requests.status';
    end if;
  end if;
  return new;
end;
$$;

-- =========================================================================
-- #15 / #16  Owners can delete their own storage objects
-- =========================================================================
-- Without these, posts-feed.tsx's image remove and profile-view.tsx's old
-- avatar cleanup were silent no-ops (storage returns success, deletes 0).
drop policy if exists "Users can delete their own post images" on storage.objects;
create policy "Users can delete their own post images" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'post-images' and (auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]);

-- =========================================================================
-- #20  Conversation participants are immutable
-- =========================================================================
-- The participant UPDATE policy exists for last_message_at (chat-window.tsx)
-- but has no WITH CHECK, so a participant could swap either participant
-- column and pull a third user into (or out of) a thread.
create or replace function public.guard_conversation_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.participant_1 is distinct from old.participant_1
     or new.participant_2 is distinct from old.participant_2 then
    raise exception 'Conversation participants cannot be changed';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_conversation_participants() from public, anon, authenticated;

drop trigger if exists guard_conversation_participants_trigger on public.conversations;
create trigger guard_conversation_participants_trigger
  before update on public.conversations
  for each row execute function public.guard_conversation_participants();
