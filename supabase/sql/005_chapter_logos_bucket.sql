-- 005_chapter_logos_bucket.sql
--
-- Creates the `chapter-logos` storage bucket backing the chapter-picture
-- controls in /chapter-admin.
--
-- No storage.objects policies are created here, deliberately:
--
--   * Writes happen only in app/api/chapter-admin/logo/route.ts, which uses
--     the service-role client and therefore bypasses RLS. Chapter admins have
--     no direct write path to this bucket, which is the point -- `chapters`
--     itself is platform-admin-only (001_chapters.sql's
--     chapters_write_platform_admin), so the route is the authorization
--     boundary and it re-checks chapter_role/chapter_id on every call.
--   * Reads are served from /storage/v1/object/public/chapter-logos/... ,
--     which a public bucket serves without a SELECT policy.
--
-- Unlike `avatars` and `post-images`, objects here are keyed by CHAPTER id
-- (`${chapterId}/logo-<ts>.<ext>`), not by `auth.uid()`. The object belongs to
-- the chapter, not to whichever admin happened to upload it, so a
-- storage.foldername(name)[1] = auth.uid() scoping would be wrong here.
--
-- The MIME allowlist and size limit are set in SQL rather than left to the
-- Dashboard so they travel with the repo -- 002_security_hardening.sql notes
-- that post-images' equivalent limits are Dashboard-only and unverifiable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chapter-logos',
  'chapter-logos',
  true,
  2097152, -- 2 MB, matching the avatars bucket
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
