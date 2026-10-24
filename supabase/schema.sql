-- ============================================================================
-- HCM Lite — Database Schema (Phase 1)
-- ============================================================================
-- STATUS : REVIEW FILE ONLY. Not applied to any database yet.
-- APPLY  : (later, after your approval) paste into Supabase Dashboard ->
--          SQL Editor -> New query -> Run.
-- DATABASE: Supabase PostgreSQL. gen_random_uuid() is built in (PG 13+),
--          no extra extensions needed.
--
-- KEY DECISIONS RECORDED IN THIS FILE (approved 2026-10-24):
--   1. ONE organization per deployment -> enforced by a "singleton" unique
--      constraint on organizations (the database itself refuses a 2nd row).
--   2. Roles: admin, hr, employee (CHECK constraint — invalid roles are
--      rejected by the database, not just by app code).
--   3. Tenant isolation: every business table carries organization_id and
--      every server query must filter by it. With a single org this always
--      matches, but the isolation stays explicit and auditable.
--   4. Attendance duplicate rule -> UNIQUE(employee_id, work_date). A second
--      same-day check-in violates the constraint -> app returns HTTP 409.
--      The rule lives in the DATABASE so it holds even under race conditions.
--   5. Leave allowances are DATA (leave_types table), not hardcoded ifs:
--      annual 14, sick 8, casual 10, unpaid unlimited.
--   6. Payroll formulas live in Phase 7 code, but payslip columns are fixed
--      here: hra = 40% of basic, medical = 10% of basic, gross = 1.5 x basic,
--      unpaid deduction = (basic / 26) per unpaid day, net = gross - deduction.
--      Figures are COPIED onto payslips when generated, so a locked payroll
--      run never changes retroactively if a salary is edited later.
--   7. Timezone for all attendance logic: Asia/Karachi (app-side, Phase 5).
--      Configured weekends/holidays are NON-WORKING days — they are never
--      automatically marked Absent (holidays table below).
--   8. SECURITY: Row Level Security is ENABLED on every table with NO
--      policies. Meaning: any request using the public anon key can read/
--      write NOTHING. Only server code using the service-role key (which
--      bypasses RLS) may touch data. App-level role rules (admin/hr/employee)
--      are enforced in Route Handlers starting Phase 3.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. organizations — the single company this deployment serves
-- ----------------------------------------------------------------------------
create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(trim(name)) between 2 and 100),
  setup_completed_at  timestamptz not null default now(),
  created_at          timestamptz not null default now(),

  -- Singleton pattern: this column may only be TRUE, and TRUE may only
  -- appear once. A second INSERT fails at the database level, no matter
  -- how many concurrent "first setup" requests arrive.
  singleton           boolean not null default true check (singleton)
);
create unique index organizations_singleton on public.organizations (singleton);


-- ----------------------------------------------------------------------------
-- 2. profiles — one row per Supabase Auth user, holding app data
--    Supabase Auth stores emails + password hashes in its own auth.users
--    table. We NEVER store passwords here. profiles.id points at the auth
--    user, and everything app-specific (role, department, salary) lives here.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  full_name       text not null check (char_length(trim(full_name)) between 2 and 100),
  role            text not null check (role in ('admin', 'hr', 'employee')),
  department      text,
  designation     text,
  basic_salary    numeric(12,2) check (basic_salary is null or basic_salary >= 0),
  joined_at       date,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()  -- set by app code (Phase 4)
);
create index profiles_organization_idx on public.profiles (organization_id);


-- ----------------------------------------------------------------------------
-- 3. holidays — configured non-working days (e.g. national holidays)
--    Weekends are configured app-side (Phase 5 default: Saturday + Sunday,
--    adjustable); dated holidays live here. Neither is auto-Absent.
-- ----------------------------------------------------------------------------
create table public.holidays (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  holiday_date    date not null,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, holiday_date)   -- one holiday per org per date
);


-- ----------------------------------------------------------------------------
-- 4. attendance — one row per employee per working day at most
-- ----------------------------------------------------------------------------
create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  employee_id     uuid not null references public.profiles (id) on delete cascade,
  work_date       date not null,
  check_in        timestamptz,             -- null until first check-in
  check_out       timestamptz,             -- null until checkout
  -- Status is computed by Phase 5 handler logic from the rules below and
  -- stored here so lists/dashboards stay simple:
  --   present | late | half_day | absent | missing_checkout
  status          text not null default 'present'
                    check (status in ('present', 'late', 'half_day', 'absent', 'missing_checkout')),
  created_at      timestamptz not null default now(),

  -- THE duplicate-check-in rule: second insert for the same employee+date
  -- fails here -> handler maps the error to HTTP 409.
  unique (employee_id, work_date),
  check (check_out is null or check_in is not null)  -- no checkout before check-in
);
create index attendance_org_date_idx on public.attendance (organization_id, work_date);

-- BUSINESS RULES ENFORCED IN CODE (Phase 5), documented here for reviewers:
--   office start 09:00 Asia/Karachi | check-in after 09:15 = late
--   worked hours = check_out - check_in; under 5 hours = half_day
--   no check-in + no approved leave that day = absent
--   check-in without checkout at end of day = missing_checkout
--   precedence when several match (documented default, pending confirmation):
--     half_day beats late (under 5h is a half-day even if you arrived late)


-- ----------------------------------------------------------------------------
-- 5. leave_types — allowances as data, seeded once (system-level, no org_id)
-- ----------------------------------------------------------------------------
create table public.leave_types (
  code             text primary key,        -- 'annual' | 'sick' | 'casual' | 'unpaid'
  name             text not null,
  annual_allowance integer not null default 0,  -- days per year
  is_unlimited     boolean not null default false
);

insert into public.leave_types (code, name, annual_allowance, is_unlimited) values
  ('annual', 'Annual Leave', 14, false),
  ('sick',   'Sick Leave',    8, false),
  ('casual', 'Casual Leave', 10, false),
  ('unpaid', 'Unpaid Leave',  0, true);


-- ----------------------------------------------------------------------------
-- 6. leave_requests — applications, validations, approvals
--    Validation (Phase 6, HTTP 422 on failure): valid date range, no overlap
--    with the same employee's other leaves, not on weekends/holidays,
--    enough remaining balance. Approver: HR or Admin (approved decision).
-- ----------------------------------------------------------------------------
create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  employee_id     uuid not null references public.profiles (id) on delete cascade,
  leave_type      text not null references public.leave_types (code),
  start_date      date not null,
  end_date        date not null,
  reason          text,                     -- optional; brief does not mandate it
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by      uuid references public.profiles (id),  -- who approved/rejected
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),

  check (end_date >= start_date)
);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_org_status_idx on public.leave_requests (organization_id, status);


-- ----------------------------------------------------------------------------
-- 7. payroll_runs — one payroll cycle per month: HR drafts, Admin locks
-- ----------------------------------------------------------------------------
create table public.payroll_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  period_year     integer not null check (period_year between 2020 and 2100),
  period_month    integer not null check (period_month between 1 and 12),
  status          text not null default 'draft'
                    check (status in ('draft', 'finalized', 'locked')),
  -- draft     : HR is building it (HR can still edit)
  -- finalized : Admin has approved it (read-only for HR)
  -- locked    : Admin has locked it (immutable; payslips final)
  created_by      uuid references public.profiles (id),
  finalized_by    uuid references public.profiles (id),
  finalized_at    timestamptz,
  created_at      timestamptz not null default now(),

  unique (organization_id, period_year, period_month)  -- one run per month
);


-- ----------------------------------------------------------------------------
-- 8. payslips — snapshot figures copied at generation time
--    hra = round(basic * 0.40), medical = round(basic * 0.10),
--    gross = 1.5 x basic (= basic + hra + medical),
--    deduction = round(basic / 26 * unpaid_leave_days),
--    net_pay = gross - deduction.  (All computed in Phase 7 code.)
-- ----------------------------------------------------------------------------
create table public.payslips (
  id                uuid primary key default gen_random_uuid(),
  payroll_run_id    uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id       uuid not null references public.profiles (id) on delete cascade,
  basic             numeric(12,2) not null check (basic >= 0),
  hra               numeric(12,2) not null check (hra >= 0),
  medical           numeric(12,2) not null check (medical >= 0),
  gross             numeric(12,2) not null check (gross >= 0),
  unpaid_leave_days integer not null default 0 check (unpaid_leave_days >= 0),
  deduction         numeric(12,2) not null default 0 check (deduction >= 0),
  net_pay           numeric(12,2) not null check (net_pay >= 0),
  created_at        timestamptz not null default now(),

  unique (payroll_run_id, employee_id)      -- one payslip per employee per run
);


-- ----------------------------------------------------------------------------
-- 9. notifications — in-app only (approved scope)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  title           text not null,
  body            text not null,
  read_at         timestamptz,              -- null = unread
  created_at      timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at);


-- ----------------------------------------------------------------------------
-- 10. audit_logs — who did what, when (Admin-visible, Phase 9 viewer)
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  actor_id        uuid references public.profiles (id) on delete set null,
  action          text not null,            -- e.g. 'leave.approved'
  entity          text not null,            -- e.g. 'leave_requests'
  entity_id       text,                     -- id of the affected row
  details         jsonb,                    -- small JSON context snapshot
  created_at      timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at);


-- ============================================================================
-- ROW LEVEL SECURITY — enable on ALL tables, with NO policies.
-- Meaning: any request made with the public anon key (e.g. from a browser
-- console) can read and write NOTHING on these tables. Default deny.
-- Server Route Handlers use the service-role key, which bypasses RLS.
-- Narrow "own data" policies may be added later, per feature, with approval.
-- ============================================================================
alter table public.organizations  enable row level security;
alter table public.profiles       enable row level security;
alter table public.holidays       enable row level security;
alter table public.attendance     enable row level security;
alter table public.leave_types    enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll_runs   enable row level security;
alter table public.payslips       enable row level security;
alter table public.notifications  enable row level security;
alter table public.audit_logs     enable row level security;

-- ============================================================================
-- END OF SCHEMA — Phase 2 will add the one-time setup function
-- (complete_setup: creates organization + admin profile atomically).
-- ============================================================================
