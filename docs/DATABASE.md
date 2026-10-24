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
1. **Route Handlers / Server Components (primary):** every protected page starts with `getCurrentUser()` (`src/lib/auth.js`) — the session is verified with Supabase on the server, and the role is read from the `profiles` row of the verified user id. The browser is never trusted to state a role. Protected API routes will use the same helper (from Phase 4 onward).
2. **Row Level Security (backstop):** RLS enabled on all tables with **no policies** → the public anon key can read/write nothing (verified by the Phase 2 connectivity test: 0 rows visible).

### Why the server-only admin client exists (`src/lib/supabase/admin.js`)
With zero RLS policies, even a logged-in session cannot read its own `profiles` row. Rather than widening RLS just yet, role lookups go through a server-only privileged client that fetches exactly one row — the one whose id equals the verified user's id. It cannot be imported by browser code, and the build was scanned: the service-role key appears 0 times in `.next`.
If later phases want browser-direct reads (e.g. realtime), the cleaner alternative is narrow "own data" RLS policies — decide then, not now.

## Admin bootstrap (Phase 2)
First admin is created by the OWNER manually: Supabase Dashboard → Authentication → Add user (auto-confirm), then run [`supabase/bootstrap-admin.sql`](../supabase/bootstrap-admin.sql) once in the SQL Editor. No public sign-up endpoint exists by design — self-signup would let anyone grant themselves a role.

## Deliberately deferred
- `complete_setup()` transaction function — Phase 2
- "own data" RLS policies — added per feature only when needed, with approval
- `updated_at` triggers — application code sets timestamps (simpler to explain)
