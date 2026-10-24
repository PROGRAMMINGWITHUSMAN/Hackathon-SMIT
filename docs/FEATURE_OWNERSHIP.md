# HCM Lite — Feature Ownership

One row per feature: what phase builds it, which files own it, and its real status.
Statuses: `Not started` | `In progress` | `In review` | `Done (tests in TEST_CHECKLIST)`.
Never mark `Done` without recorded test results.

| # | Feature | Phase | Files | Status |
|---|---------|-------|-------|--------|
| 0 | Foundation: deps, env, schema, docs, app shell | 1 | `supabase/schema.sql`, `.env.local`, `docs/*`, `src/app/page.js`, `src/app/layout.js` | Done (commit 39c6eb7) |
| 1 | Organization setup + Admin bootstrap | 2 | `supabase/bootstrap-admin.sql` (manual, one-time); programmatic setup endpoint deferred | In progress — template ready, owner must run it |
| 2 | Login/logout, sessions, `getCurrentUser()` role guard | 2/3 | `src/lib/auth.js`, `src/lib/supabase/{server,admin}.js`, `src/middleware.js`, `src/app/login`, `src/app/dashboard` | In review — built; login testing blocked on bootstrap |
| 3 | Employee management (directory, create via invite, edit, deactivate) | 3 | `src/app/api/employees/**`, `src/lib/employees.js`, `src/app/dashboard/employees/`, `src/components/employees/` | In review — built, API 401s + redirect verified; role-flow tests pending admin bootstrap |
| 4 | Attendance (check-in/out, statuses, corrections, org day view) | 4 | `src/lib/attendance*.mjs/js`, `src/app/api/attendance/**`, `src/app/dashboard/attendance/`, `src/components/attendance/` | In review — 16 unit tests PASS + live E2E (see TEST_CHECKLIST); weekday self check-in blocked by calendar (Sunday) |
| 5 | Leave management (balances, requests, review, cancel, notifications, audit) | 5 | `src/lib/leave*.mjs/js`, `src/app/api/leaves/**`, `src/app/dashboard/leave/`, `src/components/leave/` | In review — 64 tests PASS incl. real-DB integration + browser E2E (see TEST_CHECKLIST) |
| 6 | Payroll (drafts, finalize/lock, payslips, deductions) | 6 | `src/lib/payroll*.mjs/js`, `src/app/api/payroll/**`, `src/app/dashboard/payroll/`, `src/components/payroll/` | In review — 81 tests PASS incl. real-DB integration + browser E2E |
| 7 | Dashboard / analytics per role | 7 | `src/lib/analytics*.mjs/js`, `src/components/dashboard/charts.js`, `src/app/dashboard/page.js` | In review — 94 tests PASS incl. real-DB integration + browser E2E |
| 8 | AI assistant + notifications + audit viewer | 9 | planned | Not started |
| 9 | Test pass, docs completion, deploy | 10 | `docs/TEST_CHECKLIST.md` | Not started |

## Update rule
When a phase completes, update this table and [AI_CHANGELOG.md](./AI_CHANGELOG.md) together.
