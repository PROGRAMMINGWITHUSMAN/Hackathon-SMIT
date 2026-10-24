# HCM Lite — Test Checklist

Rules: a box is ticked only after the check was **actually run** and the real
result recorded. "Expected to pass" is never enough.

## Phase 1 — Foundation (run 2026-10-24)

| # | Check | How | Result |
|---|---|---|---|
| 1.1 | Supabase SDK installed | `node -e "console.log(require('@supabase/supabase-js/package.json').version)"` | ✅ PASS — printed `2.118.0` |
| 1.2 | Lint passes | `npm run lint` | ✅ PASS — no warnings or errors |
| 1.3 | Production build passes | `npm run build` | ✅ PASS after one fix — first run failed on a transient Google Fonts fetch (`next/font/google` downloads at build time); removed the Google Fonts dependency (system font stack), rebuild passed twice |
| 1.4 | `.env.local` is git-ignored | `git check-ignore .env.local` | ✅ PASS — matched `.gitignore` rule `.env*` |
| 1.5 | No secret values in repo | `git status` — `.env.local` untracked/ignored; placeholders only | ✅ PASS — file ignored, values are `REPLACE_WITH_...` placeholders |
| 1.6 | Schema SQL applies cleanly | paste into Supabase SQL Editor | ⬜ NOT RUN — schema intentionally not applied yet (Phase 1 scope) |

## Phase 2 — Organization setup (not started)
- [ ] `GET /api/setup/status` → `{"setupCompleted": false}` on fresh DB
- [ ] `POST /api/setup` valid → 200; org + admin exist, `role='admin'`
- [ ] Repeat `POST /api/setup` → 403, nothing changed
- [ ] Invalid inputs (short name / bad email / weak password) → 400
- [ ] Forced failure mid-setup → no half-configured state (no orphan auth user)
- [ ] Two simultaneous POSTs → exactly one 200 + one 403

## Phase 3 — Auth & RBAC (not started)
- [ ] Login with valid/invalid credentials
- [ ] Employee calling an HR-only endpoint → 403 (server-enforced, verified with curl)
- [ ] Logged-out call to protected endpoint → 401

## Phase 5 — Attendance (not started)
- [ ] Check-in 09:05 → present; 09:20 → late; same day again → 409
- [ ] Checkout with <5h gap → half_day; no checkout → missing_checkout
- [ ] No record + approved leave → not absent; no record + no leave → absent

## Phase 6 — Leave (not started)
- [ ] Balance math 14/8/10; over-balance → 422; overlapping range → 422
- [ ] Weekend/holiday-only range → 422

## Phase 7 — Payroll (not started)
- [ ] hra=40%, medical=10%, gross=1.5× basic; deduction = basic/26 × unpaid days; net = gross − deduction
- [ ] HR cannot lock; Admin lock makes run immutable; employee sees own payslip only
