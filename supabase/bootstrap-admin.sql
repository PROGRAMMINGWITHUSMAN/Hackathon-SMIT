-- ============================================================================
-- HCM Lite — ONE-TIME Admin Bootstrap (Phase 2)
-- ============================================================================
-- PURPOSE: creates the organization row and the FIRST admin profile.
-- Run this YOURSELF in the Supabase Dashboard (SQL Editor). It is never run
-- by the app, and there is deliberately NO public sign-up endpoint — anyone
-- who could sign up could give themselves the admin role.
--
-- BEFORE RUNNING — two manual steps in the Supabase Dashboard:
--   1. Authentication → Users → "Add user" → create user
--      → enter the admin's email + a strong password
--      → TICK "Auto Confirm User" (otherwise login will be blocked by the
--        unconfirmed-email check).
--   2. Copy that user's UID (the uuid shown in the users table).
--
-- THEN: replace the THREE placeholders below and run this once.
-- ============================================================================

-- 1) The organization (single row — the singleton constraint refuses a second).
--    "on conflict do nothing" keeps the existing row if setup already ran.
insert into public.organizations (name)
values ('HCM Lite Demo Company')
on conflict (singleton) do nothing;

-- 2) The first admin profile, linked to the auth user you created above.
--    Only inserts if no admin exists yet, so re-running is harmless.
insert into public.profiles (id, organization_id, full_name, role)
select
  '679b0709-b416-418c-8adf-d787843366da',   -- TODO: paste the auth user's UID here
  (select id from public.organizations limit 1),
  'Usman',      -- TODO: e.g. 'Muhammad Usman Ghani'
  'admin'
where not exists (select 1 from public.profiles where role = 'admin');

-- 3) Sanity check — should show exactly one organization and one admin row.
select (select count(*) from public.organizations) as orgs,
       (select count(*) from public.profiles where role = 'admin') as admins;
