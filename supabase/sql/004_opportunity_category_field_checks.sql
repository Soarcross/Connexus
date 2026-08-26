-- 004_opportunity_category_field_checks.sql
-- Applied 2026-08-25 via MCP (migration name: widen_opportunity_category_and_field_checks).
--
-- Root cause of "Something went wrong" on the admin Add Opportunity form:
-- opportunities_category_check still held the ORIGINAL six categories, so
-- every insert with "Programs" (added to the UI in the 2026-07 rebrand) has
-- violated it since then. The new chapter-life categories would have hit the
-- same wall. The DB constraint is one more hand-maintained category list --
-- see the category convention in CLAUDE.md.
--
-- Verified after apply (DO-block probes, rolled back): inserts with
-- 'Programs', 'Meetings', and a custom field value succeed; a garbage
-- category is still rejected.

alter table public.opportunities drop constraint opportunities_category_check;
alter table public.opportunities add constraint opportunities_category_check
    check (category = any (array[
        'Internships', 'Jobs', 'Research', 'Scholarships', 'Competitions',
        'Volunteering', 'Programs',
        'Clubs', 'Events', 'Meetings', 'Trips', 'Fundraisers', 'Announcements'
    ]));

-- The field column becomes free text (the form's "Other -> specify" feature
-- writes custom values), so the allowlist is replaced by a length sanity
-- check. Display code already falls back to a neutral chip for unknown values.
alter table public.opportunities drop constraint opportunities_field_check;
alter table public.opportunities add constraint opportunities_field_check
    check (field is null or char_length(field) between 1 and 60);
