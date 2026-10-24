# HCM Lite — Database Design

Source of truth for SQL: [`supabase/schema.sql`](../supabase/schema.sql)
**Status: written for review. NOT applied to any database yet.**

## Tables (10)

| Table | Purpose | Key constraint / decision |
|-------|---------|---------------------------|
| `organizations` | the single company | `singleton` unique column — the DB refuses a 2nd row (one-time setup enforced by PostgreSQL itself) |
| `profiles` | one row per auth user: role, department, salary | `id` references `auth.users(id)` — Supabase Auth owns emails/password hashes; we store none |
| `holidays` | configured non-working dates | unique per org per date |
| `attendance` | daily check-in/out + status | `unique(employee_id, work_date)` — duplicate same-day check-in fails here → HTTP 409 |
| `leave_types` | allowances as data | seeded: annual 14, sick 8, casual 10, unpaid (unlimited) |
| `leave_requests` | leave applications + approval | `check (end_date >= start_date)`; overlap/balance validated in Phase 6 code → HTTP 422 |
| `payroll_runs` | monthly cycle: draft → finalized → locked | unique per org/year/month |
| `payslips` | snapshot pay figures per employee per run | figures copied at generation; a locked run never recomputes |
| `notifications` | in-app messages | `read_at` null = unread |
| `audit_logs` | who did what, when | written by server handlers |

## Relationships
```
auth.users (Supabase) ──1:1── profiles ──N:1── organizations (singleton)
profiles ──1:N── attendance        (unique per work_date)
profiles ──1:N── leave_requests    (type → leave_types.code)
organizations ──1:N── payroll_runs ──1:N── payslips ──N:1── profiles
profiles ──1:N── notifications / audit_logs(actor)
```

## Tenant isolation
Every business table carries `organization_id`; every server query filters by the
requester's organization. One-org deployment today; multi-tenant-ready design.

## Security model (two layers)
1. **Route Handlers (primary):** every protected endpoint calls a `requireUser(roles)`
   guard (Phase 3) — session verified server-side, role checked before any data access.
2. **Row Level Security (backstop):** RLS enabled on all tables with **no policies** →
   the public anon key can read/write nothing. Only server code with the service-role
   key (never shipped to the browser) can touch data.

## Deliberately deferred
- `complete_setup()` transaction function — Phase 2
- "own data" RLS policies — added per feature only when needed, with approval
- `updated_at` triggers — application code sets timestamps (simpler to explain)
