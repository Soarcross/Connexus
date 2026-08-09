-- 003_public_browsing.sql
-- Applied 2026-08-06 via MCP (migration name: public_browsing).
--
-- Public browsing: anon may read the people-directory card fields; guests may
-- submit the contact form (rate-limited by the existing trigger); members may
-- join a chapter once (NULL -> value only, Active chapters only).
--
-- Survey findings this is written against (2026-08-06):
--   * anon held a TABLE-WIDE SELECT grant on profiles (Supabase default) with
--     no anon SELECT policy. A column grant cannot narrow a table-wide grant
--     (2026-07 audit lesson), so the wide grant is revoked and re-granted
--     column by column.
--   * chapters / about_content / team_members / partners already have public
--     SELECT policies -- no changes needed there.
--   * contact_submissions INSERT policy required auth.uid() IS NOT NULL; the
--     contact page is public now, so anon gets its own INSERT policy. The
--     rate_limit_contact_submissions_trigger already guards abuse.
--   * authenticated already holds UPDATE (chapter_id) with an own-row policy
--     and NO one-way restriction; the trigger below adds it.
--
-- Verified after apply (attack-must-fail probes):
--   * anon SELECT of the six public columns returns rows; bio / chapter_id /
--     is_admin return 42501; community_posts, messages, conversations,
--     opportunities, extension_requests return no rows or 42501.
--   * As an authenticated non-admin (DO-block, rolled back): switching to a
--     different chapter and un-setting the chapter both raise; joining from
--     NULL succeeds.

-- 1. profiles: anon reads exactly the directory-card columns ----------------
revoke select on public.profiles from anon;
grant select (id, full_name, avatar_url, grad_year, interests, club_roles)
    on public.profiles to anon;

drop policy if exists "Public can read directory fields" on public.profiles;
create policy "Public can read directory fields"
    on public.profiles for select to anon
    using (true);

-- 2. contact form open to guests --------------------------------------------
drop policy if exists "Anyone can submit contact forms" on public.contact_submissions;
create policy "Anyone can submit contact forms"
    on public.contact_submissions for insert to anon
    with check (true);

-- 3. one-way self-service chapter join --------------------------------------
create or replace function public.enforce_one_way_chapter_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Server-side callers (service role, SQL editor) carry no auth.uid();
    -- let them manage chapters freely. Platform admins may too.
    if auth.uid() is null then
        return new;
    end if;

    if new.chapter_id is distinct from old.chapter_id then
        if exists (select 1 from public.profiles p
                   where p.id = auth.uid() and p.is_admin) then
            return new;
        end if;
        if old.chapter_id is not null then
            raise exception 'chapter can only be set once; ask an admin to change it';
        end if;
        if new.chapter_id is not null
           and not exists (select 1 from public.chapters c
                           where c.id = new.chapter_id and c.status = 'Active') then
            raise exception 'chapter must be an active chapter';
        end if;
    end if;
    return new;
end;
$$;

revoke execute on function public.enforce_one_way_chapter_join() from public, anon, authenticated;

drop trigger if exists enforce_one_way_chapter_join on public.profiles;
create trigger enforce_one_way_chapter_join
    before update of chapter_id on public.profiles
    for each row execute function public.enforce_one_way_chapter_join();
