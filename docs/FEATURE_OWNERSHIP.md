# HCM Lite — Feature Ownership

One row per feature: what phase builds it, which files own it, and its real status.
Statuses: `Not started` | `In progress` | `In review` | `Done (tests in TEST_CHECKLIST)`.
Never mark `Done` without recorded test results.

| # | Feature | Phase | Files | Status |
|---|---------|-------|-------|--------|
| 0 | Foundation: deps, env, schema, docs, app shell | 1 | `supabase/schema.sql`, `.env.local`, `docs/*`, `src/app/page.js`, `src/app/layout.js` | In review |
| 1 | Organization setup + Admin bootstrap (one-time `POST /api/setup`) | 2 | `src/app/api/setup/route.js`, `src/app/setup/page.js` (planned) | Not started |
| 2 | Login/logout, sessions, `requireUser()` RBAC guard | 3 | `src/lib/*` (planned) | Not started |
| 3 | Employee management (CRUD + deactivate) | 4 | planned | Not started |
| 4 | Attendance (check-in/out, statuses, 409) | 5 | planned | Not started |
| 5 | Leave (allowances, 422 validations, approval) | 6 | planned | Not started |
| 6 | Payroll (draft → finalize → lock, payslips) | 7 | planned | Not started |
| 7 | Dashboard / analytics per role | 8 | planned | Not started |
| 8 | AI assistant + notifications + audit viewer | 9 | planned | Not started |
| 9 | Test pass, docs completion, deploy | 10 | `docs/TEST_CHECKLIST.md` | Not started |

## Update rule
When a phase completes, update this table and [AI_CHANGELOG.md](./AI_CHANGELOG.md) together.
