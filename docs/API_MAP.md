# HCM Lite — API Map

All endpoints are Next.js Route Handlers under `src/app/api/`.
Authorization is enforced **in the handler on the server** (Phase 3 `requireUser`
guard). Frontend hiding is convenience, never security.

## Conventions
- JSON request/response bodies
- `401` not logged in · `403` logged in but wrong role / action not allowed ·
  `400` invalid input · `409` conflict (e.g. duplicate check-in) ·
  `422` business-rule violation (e.g. leave overlap / insufficient balance) ·
  `500` unexpected server error

## Endpoints

### Implemented — Payroll (Phase 6)

| Method & Path | Roles | Purpose | Errors |
|---|---|---|---|
| `GET /api/payroll/runs` | admin, hr | list runs with totals | 401, 403, 500 |
| `POST /api/payroll/runs` | admin, hr | create a DRAFT for `{year, month}`; computes all payslips (basic from profile; HRA 40%, medical 10%, gross = sum = 1.5×basic; unpaid deduction = basic/26 × approved-unpaid working days in the month); reports skipped employees with reasons | 400, 401, 403, 409 (duplicate period), 422 (future month), 500 |
| `GET /api/payroll/runs/[id]` | admin, hr | run detail: payslip breakdown + totals + deterministic skipped list | 400, 401, 403, 404, 500 |
| `POST /api/payroll/runs/[id]/recalculate` | admin, hr | DRAFT only — recompute payslips from current data (CAS-guarded against concurrent finalize) | 401, 403, 404, 409 |
| `POST /api/payroll/runs/[id]/finalize` | **admin only** | draft → finalized (CAS; double/racing finalize → 409); payslips become visible to employees | 400, 401, 403, 404, 409 |
| `POST /api/payroll/runs/[id]/lock` | **admin only** | finalized → locked (CAS); permanently immutable | 400, 401, 403, 404, 409 |
| `GET /api/payroll/payslips` | any active profile | caller's OWN payslips from finalized/locked runs only (drafts never visible) | 401, 500 |

Admin-only finalize/lock is enforced at the route AND in the data layer. Eligibility for payslips: active + salary set + joined on/before period end; everyone else is listed with a reason. Period = calendar month in Asia/Karachi; future months are rejected.

### Implemented — Leave (Phase 5)

| Method & Path | Roles | Purpose | Errors |
|---|---|---|---|
| `GET /api/leave-types` | any active profile | canonical leave types | 401, 500 |
| `GET /api/leaves` | employee (own + balances) · admin/hr (org-wide, validated `?status=&type=&employee_id=&from=&to=`) | requests with employee/reviewer names and computed working days | 400 invalid filters, 401, 403, 500 |
| `POST /api/leaves` | any active profile (self only) | submit own request; body `{leave_type, start_date, end_date, reason?}` — employee_id/org never accepted; overlap/balance/invalid-range → 422 with field errors | 400 unknown fields, 422, 401, 500 |
| `POST /api/leaves/[id]/approve` | admin, hr | approve a pending request (never your own); optional `{comment}`; re-validates overlap+balance; compare-and-swap → double review = 409 | 400, 401, 403 (self), 404, 409, 422 |
| `POST /api/leaves/[id]/reject` | admin, hr | same rules as approve, with optional comment | same |
| `POST /api/leaves/[id]/cancel` | owner (pending only) or admin/hr (pending only) | withdraw; approved/rejected are history → 409 | 401, 403, 404, 409 |

Side effects: submit notifies org reviewers (in-app `notifications`); approve/reject notify the employee (comment included) and write a `leave.approved`/`leave.rejected` audit-log entry with before/after; cancel is audited. Reviewer comments live in the audit log + notification (no schema change). Concurrency: submit re-validates after insert with earliest-wins overlap arbitration (exactly one survivor); review/cancel are compare-and-swap on `status='pending'`.

### Implemented — Attendance (Phase 4)
| Method & Path | Roles | Purpose | Errors |
|---|---|---|---|
| `GET /api/attendance` | employee (own history; validated `?from/&to`, default 60 days) · admin/hr (`?date=`, default today Karachi → org day view with derived statuses + summary) | read-only; **never writes** — absent/missing-checkout are derived on read | 400 invalid dates, 401, 403, 500 |
| `POST /api/attendance/check-in` | any active profile (self) | server-time check-in; body ignored entirely; weekend/holiday rejected; DB `UNIQUE(employee_id, work_date)` = 409 under concurrency | 401, 403, 409 (non-working day / already checked in), 500 |
| `POST /api/attendance/check-out` | any active profile (self) | server-time checkout; recalculates status (<5h = half_day, which beats late) | 401, 403, 409 (no check-in / already checked out / invalid time), 500 |
| `PATCH /api/attendance/[id]` | admin, hr | correct `check_in`/`check_out` only (ISO; check_out nullable); status recalculated server-side; **before/after written to audit_logs** | 400 (unknown fields/validation), 401, 403, 404 (missing or other org), 500 |

Timezone: Asia/Karachi (UTC+5, fixed) for all work dates and the 09:15 late rule. Employee/org ids always derive from the verified session — never from the request.

### Implemented — Employees (Phase 3)

| Method & Path | Roles | Purpose | Errors |
|---|---|---|---|
| `GET /api/employees` | admin, hr | full directory with emails (salary stripped for hr) | 401, 403, 500 |
| `POST /api/employees` | admin, hr | create employee + Auth account directly (Admin/HR-chosen password, `email_confirm: true` — hackathon testing setup; no invitation email). HR may only create role=employee and cannot send salary. `confirm_password` is client-side only — never accepted by the API | 400 (validation/unknown fields), 403, 409 (email already registered), 429 (Supabase throttling), 500 |
| `GET /api/employees/[id]` | admin, hr (anyone in org); employee (own only, no salary) | one employee | 400 (bad id), 401, 403, 404 (missing or other org), 500 |
| `PATCH /api/employees/[id]` | admin, hr | edit permitted fields. `full_name/department/designation/joined_at`: both. `basic_salary`, `role`: admin only (never your own role). `status`: admin/hr — never your own status; HR only on employee targets; the last active Admin can never be demoted/deactivated | 400, 401, 403, 404, 500 |

All employee endpoints derive `organization_id` from the verified caller's profile — never from the request — and scope every query to it. Unexpected request fields are rejected with 400.

**Account creation model (2026-10-25, replaced invitations):** Admin/HR set the employee's password directly; the server creates the Auth user (`email_confirm: true` — no email verification in this testing setup) and the profile in one flow, deleting the just-created Auth user if the profile insert fails. There is no public signup: the endpoint requires a verified Admin/HR session. `/auth/callback` and `/auth/set-password` remain for any outstanding invitation links and future password-reset flows.

### Planned

| Method & Path | Roles | Purpose | Status |
|---|---|---|---|
| `GET /api/setup/status` | public | has first-run setup been completed? | Planned (superseded by manual bootstrap) |
| `POST /api/setup` | public, once | create organization + first Admin; 403 after completion | Planned (superseded by manual bootstrap) |
| `POST /api/auth/login` / `logout` | public | session via Supabase Auth | Implemented as pages (`/login` + sign-out), no API routes needed |
| Attendance check-in / check-out / lists | employee (own), hr+admin (all) | 409 on duplicate same-day check-in | Planned (Phase 5) |
| Leave apply / approve / reject / balances | employee (own), hr+admin (all) | 422 on overlap / over-balance / invalid dates | Planned (Phase 6) |
| Payroll draft / finalize / lock / payslips | hr (draft), admin (finalize+lock), employee (own payslips) | | Planned (Phase 7) |
| Dashboard summaries | all (role-scoped) | | Planned (Phase 8) |
| AI assistant ask | all (role-scoped data) | | Planned (Phase 9) |

> Nothing in this table is implemented yet. Each implemented endpoint gets exact
> request/response examples added here in its phase.
