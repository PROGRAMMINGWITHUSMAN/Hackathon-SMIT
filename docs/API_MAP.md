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

| Method & Path | Roles | Purpose | Status |
|---|---|---|---|
| `GET /api/setup/status` | public | has first-run setup been completed? | Planned (Phase 2) |
| `POST /api/setup` | public, once | create organization + first Admin; 403 after completion | Planned (Phase 2) |
| `POST /api/auth/login` / `logout` | public | session via Supabase Auth | Planned (Phase 3) |
| Employees CRUD | admin, hr | employee records | Planned (Phase 4) |
| Attendance check-in / check-out / lists | employee (own), hr+admin (all) | 409 on duplicate same-day check-in | Planned (Phase 5) |
| Leave apply / approve / reject / balances | employee (own), hr+admin (all) | 422 on overlap / over-balance / invalid dates | Planned (Phase 6) |
| Payroll draft / finalize / lock / payslips | hr (draft), admin (finalize+lock), employee (own payslips) | | Planned (Phase 7) |
| Dashboard summaries | all (role-scoped) | | Planned (Phase 8) |
| AI assistant ask | all (role-scoped data) | | Planned (Phase 9) |

> Nothing in this table is implemented yet. Each implemented endpoint gets exact
> request/response examples added here in its phase.
