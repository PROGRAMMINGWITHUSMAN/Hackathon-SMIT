# HCM Lite — AI Change Log

Disclosure of AI-assisted changes, kept per change. Human owner reviews and approves every phase before it lands.

## 2026-10-25 — Phase 7: Dashboard & analytics (IN REVIEW)

**New:** `src/lib/analytics-rules.mjs` (pure metric derivations: attendance trend with stored+derived statuses, department distribution, leave mix, own-summary), `src/lib/analytics.js` (server-only: `getOrgDashboard` for Admin/HR — headcount via a single profiles query reused for departments/absence expectations, 14-day trend via one ranged attendance + one ranged approved-leave query, current-year leave mix, latest payroll runs, Admin-only recent audit activity; `getEmployeeDashboard` — own today status, 30-day summary, leave balances, latest payslip; no other-employee data path exists), `src/components/dashboard/charts.js` (dependency-free CSS bar charts with exact-number tooltips), `tests/analytics-{rules,integration}.test.mjs`. **Modified:** `src/app/dashboard/page.js` fully rebuilt into role-specific dashboards (stat cards + charts + recent activity) using existing shell/tokens; payroll integration test fixture now picks FREE months dynamically (the owner's real locked October run caused a legitimate 409 — tests must coexist with real data, never delete it). Docs updated. **No schema change, no new dependencies, no new API endpoints.** Bugs caught by tests during build: reduce-without-initial-value in my own analytics unit test; stale leftover e2e account removed.

**Verification:** `npm test` **94/94 PASS** · lint PASS · build PASS · leak scan 0 · browser E2E with disposable accounts (HR: all widgets live incl. the owner's real locked run; employee: own data only — no other names/org metrics in rendered output) — accounts deleted after, real data untouched.

## 2026-10-25 — Phase 6: Payroll & payslips (IN REVIEW)

**New:** `src/lib/payroll-rules.mjs` (pure: formulas, period bounds/future check, unpaid-day intersection counting), `src/lib/payroll.js` (draft creation with snapshot payslips + skipped-with-reason reporting, CAS recalc/finalize/lock with **lib-level admin-only enforcement** on transitions, own finalized/locked payslips), routes `GET/POST /api/payroll/runs`, `GET /api/payroll/runs/[id]`, `POST .../{recalculate,finalize,lock}`, `GET /api/payroll/payslips`, page `/dashboard/payroll` + `src/components/payroll/{PayrollAdmin, PayrollEmployee, RunStatusBadge}`, `tests/payroll-{rules,integration}.test.mjs`. **Modified:** nav (Payroll live), dashboard (live payroll card; removed stale module placeholders), docs, `package.json` test script (`--test-concurrency=1` — DB-backed test files share one org and MUST be serial; parallel runs caused cross-file interference, caught live). **No schema migration, no RLS change, no dependencies.** Bugs fixed during build: JSX-in-try/catch lint errors; test fixture initially used November (a future month at build time — correctly rejected; moved to October); lib lacked its own admin check on finalize/lock (added as defense in depth).

**Verification:** `npm test` **81/81 PASS** · lint PASS · build PASS · leak scan 0 · browser E2E with disposable `e2e.py.*` accounts (HR draft UI with exact math + no finalize access; Admin finalize→lock via confirms; employee payslip visible after finalize with Locked badge) — accounts and runs cleaned afterward (payroll_runs/payslips back to 0).

## 2026-10-25 — Phase 5: Leave management (IN REVIEW)

**New:** `src/lib/leave-rules.mjs` (pure: working-day counting, overlap, balances w/ pending-reservation, validation), `src/lib/leave.js` (server data layer: submit with post-insert re-validation + **earliest-wins overlap arbitration**, approve/reject with compare-and-swap + audit + notifications, cancel policy), `src/lib/leave-review.js` (shared approve/reject HTTP handler — kept out of route files because Next routes may only export HTTP methods), routes `GET /api/leave-types`, `GET/POST /api/leaves`, `POST /api/leaves/[id]/{approve,reject,cancel}`, page `/dashboard/leave` + `src/components/leave/{LeaveEmployee, LeaveAdmin, LeaveDecisionDialog, LeaveStatusBadge}`, `tests/leave-rules.test.mjs`, `tests/leave-integration.test.mjs`. **Modified:** nav-items (Leave live), dashboard overview (live pending-leave card for all roles), docs. **No schema migration, no RLS change, no dependencies.** Reviewer comment stored in audit_logs + notifications (documented decision). Bugs found by tests during build: invalid-leave-type error was swallowed (unit test caught); concurrent submits could both self-delete → 0 survivors (integration test caught; fixed with earliest-created-wins arbitration → exactly one survivor); cancellation test initially used an HR-role stranger (test bug).

**Verification:** `npm test` **64/64 PASS** (21 attendance + 12 leave unit + 14 leave integration + attendance integration, real DB, disposable self-cleaning accounts) · lint PASS · build PASS · leak scan 0 · **browser E2E** with disposable `e2e.lv.*` accounts: employee form submit → Pending + balance reservation; HR dialog approve with comment → reviewer recorded; attendance view shows **On leave** (not Absent); rejection path → Rejected visible to employee, casual balance released 10/10, annual consumed 9/14; all accounts + notification noise cleaned (leave_requests and attendance back to 0 rows). Remaining: notification *viewer* UI is Phase 9 (rows verified in DB).

## 2026-10-25 — Simulated-Monday attendance test suite (Option B; no production changes)

**Approach:** the server functions already accept `nowUtc` as an internal parameter (HTTP routes hardcode `new Date()`), so the clock is injected at that dependency boundary ONLY in tests. `npm test` now runs `node --env-file-if-exists=.env.local --conditions=react-server --import ./tests/test-setup.mjs --test tests/` — the `react-server` condition resolves the `server-only` marker to its empty file for the test process only (the app itself never runs with the flag), and a tiny test-only loader (`tests/alias-loader.mjs` via `tests/test-setup.mjs`) maps the `@/` alias. **New files:** `tests/test-setup.mjs`, `tests/alias-loader.mjs`, `tests/attendance-integration.test.mjs` (13 integration tests vs the REAL database using a disposable `E2E Monday Test` employee — self-cleaning setup, cascade-verified teardown). **Modified:** `tests/attendance-rules.test.mjs` (+5 Monday unit tests), `package.json` (test script), docs. No app code, schema, RLS, or business-rule changes; no public parameter/env switch/UI control can influence time (proven live: a crafted browser request full of fake Monday fields was decided by the REAL clock).

**Results:** `npm test` **34/34 PASS** (21 unit + 13 DB integration). Fixed during the run: timestamp-format assertion (Postgres `+00:00` vs `.000Z` → compare instants), plus a one-off failed Write that silently didn't persist the integration file (re-written). Spoof-proof browser E2E executed (fake-Monday check-in/checkout → 409s based on real date/state); disposable spoof user deleted after. Lint PASS · build PASS. Remaining manual nice-to-have: clicking the real Check-in button on an actual weekday.

## 2026-10-25 — Phase 4: Attendance management (IN REVIEW)

**New files:** `src/lib/attendance-rules.mjs` (pure, dependency-free rules: fixed UTC+5 Karachi offset, 09:15 strict late rule, <5h half-day with documented precedence over Late, absent/missing-checkout derivation, correction validator, 23505 mapping, display converters — importable from server, client, and tests), `tests/attendance-rules.test.mjs` + `npm test` (Node built-in runner; **16/16 PASS**; caught one real bug — `isUniqueViolation(null)` returned null), `src/lib/attendance.js` (server-only: history, employee day, org day view with approved-leave + holiday + join-date-aware absent derivation, check-in/out with server timestamps, audited corrections), API routes `GET /api/attendance`, `POST /api/attendance/check-in|check-out` (bodies ignored — anti-spoof), `PATCH /api/attendance/[id]` (admin/hr; before/after to audit_logs), `src/app/dashboard/attendance/page.js` + `src/components/attendance/` (employee view, HR/Admin day view with summary/search/filters, correct dialog). **Modified:** nav-items (Attendance live), dashboard page (live attendance card: org summary for admin/hr, own status for employee), docs. **No schema migration** — existing `attendance` table + UNIQUE constraint + audit_logs suffice; RLS untouched (zero policies; all access server-side).

**Bugs found & fixed during build:** wrong `isUuid` import (caught by build), `react-hooks/purity` + JSX-in-try/catch lint errors (restructured page), `gte("work_date", null)` → PostgREST `"null"` date error in history default window (caught live by E2E), stale dev-server watcher served 404 for the new `[id]` route (server restart fixed; not a code bug).

**Verification:** lint PASS · build PASS · leak scan 0 · 16/16 unit tests · **live browser E2E** with dedicated labeled test accounts (employee + HR): dashboard card, employee page, weekend 409, checkout-without-checkin 409, spoofed employee_id ignored, employee PATCH → 403, HR weekend view (0 absent), HR Friday view (absent + missing-checkout derived), UI correction → DB row verified (09:20/17:35 PKT → late) + audit_logs entry verified, invalid correction → 400, all endpoints → 401 unauth. **Blocked (calendar):** weekday self check-in happy path — manual on Monday PKT. Test accounts and their data deleted afterward (cascades verified; user's real accounts untouched).

## 2026-10-25 — Replace email invitations with direct account creation (approved change)

**Why:** free-tier Supabase email limits kept blocking invites during testing; owner requested direct creation to proceed to Phase 4. **Changes:** `src/lib/employees.js` — `createEmployee` now uses `auth.admin.createUser({ email, password, email_confirm: true })` (Supabase hashes the password; nothing logged/echoed); duplicate → `{conflict}`, project password-policy errors → `{weakPassword}` → 400 field error, orphan-Auth-user compensation preserved; password validation added (required on create, min 8). `src/app/api/employees/route.js` — `password` added to create whitelist; `confirm_password` explicitly NOT accepted (400 unknown field); success message updated. `EmployeeFormDialog.js` — Password + Confirm Password fields (create mode only; min 8, match check client-side; confirm field never included in the request body). No public signup — endpoint still requires a verified Admin/HR session; all role/salary restrictions unchanged; `/auth/callback` + `/auth/set-password` untouched. **Checks run:** lint PASS · build PASS · unauthenticated POST → 401 · `/auth/callback` → 200. Full create/login flow needs manual verification (see TEST_CHECKLIST).

## 2026-10-25 — Bug fix: invite 500 was Supabase email rate limit (not /auth/callback)

**Evidence:** dev log showed `POST /api/employees failed: AuthApiError — status: 429, code: over_email_send_rate_limit` → generic 500 "Something went wrong"; `/auth/callback` and `/auth/set-password` both returned HTTP 200 throughout. **Fix (smallest root cause):** `src/lib/employees.js` — `createEmployee` now returns `{ rateLimited: true }` for 429/`over_email_send_rate_limit` (nothing is created, so it's a clean failure); `getEmployeeProfile` no longer 500s when a profile's Auth user is missing/deleted (returns the profile with `email: null`, error logged server-side). `src/app/api/employees/route.js` — POST maps rate-limiting to **HTTP 429** with an actionable message (wait ~1h or configure SMTP); no tokens/keys/internals exposed. No users/profiles/RLS/schema touched; admin login unchanged. **Checks:** lint PASS · build PASS · `/auth/callback` 200 · unauthenticated POST → 401. Rate-limit 429 message needs live verification when the limit next triggers (manual).

## 2026-10-25 — Fix: invitation links expired/rejected (otp_expired) — root cause + full flow verified

**Root cause (chain):** (1) `inviteUserByEmail` was called without `redirectTo`, so links redirected to the Site URL root; (2) the landing page consumed nothing — Supabase's implicit-flow tokens sat unconsumed in the URL hash, so the invite "looked broken"; (3) a second click (or email-scanner prefetch) hit the single-use token → `#error=access_denied&error_code=otp_expired`. Additionally the `@supabase/ssr` client does not auto-consume implicit `#access_token` hashes (it expects PKCE `?code=`), so even a correct redirect needed explicit handling.

**Fix (new files):** `src/app/auth/callback/page.js` — exchanges `?code=` (PKCE) or explicitly parses the hash and calls `setSession()` (implicit), then routes invited users to set-password; renders the real link errors with guidance (surfaced, never swallowed). `src/app/auth/set-password/page.js` — session-required password setup via `auth.updateUser` (can only change the CURRENT user's password). `src/components/AuthHashRedirect.js` — invisible hand-off on `/` and `/login` if auth credentials ever land there, so single-use tokens are never burned by a page that ignores them. **Modified:** `employees.js` + `POST /api/employees` — invite now sends `redirectTo: <origin>/auth/callback`; `page.js` + `login/page.js` mount the hash hand-off. Admin login, role checks, RLS, org scoping untouched.

**Verification (executed, real browser flow):** generated a fresh invite link via `admin.generateLink` for a throwaway email → link redirected to `/auth/callback#access_token=…` → (after the setSession fix) session established → `/auth/set-password` → set a password → success → dashboard shows the correct "no active profile" screen for a non-employee → signed out → **logged back in with the new password successfully** → test auth user deleted afterward (verified). Lint PASS · build PASS · leak scan 0.

## 2026-10-25 — Bug fix: Auth Admin API namespace (runtime crash)

**Bug:** `TypeError: admin.auth.listUsers is not a function` broke the dashboard employee count and the directory. **Root cause:** four calls used the session-facing Auth surface instead of the v2 Admin one. **Fix in `src/lib/employees.js`:** `auth.listUsers` → `auth.admin.listUsers`; `auth.getUser(id)` → `auth.admin.getUserById(id)` (the old call could never fetch an arbitrary user); `auth.inviteUserByEmail` → `auth.admin.inviteUserByEmail`; `auth.deleteUser` → `auth.admin.deleteUser`. Pagination no longer trusts `totalPages` (verified undefined in the live response) — a page shorter than requested ends the walk. Error handling unchanged: real Supabase errors still throw → directory error state, never an empty list. No other files touched; server-only guard, role checks, org scoping, RLS, and key security all preserved.

**Verification (executed):** lint PASS · build PASS · live read-only probe against the project: both admin methods exist and `listUsers` succeeded (1 auth user; ids/emails present). Also probed (read-only counts): bootstrap is COMPLETE — 1 organization, 1 active admin profile. Page-level logged-in verification pending owner login.

## 2026-10-25 — Phase 3: Employee management (IN REVIEW)

**New files:** `src/lib/employees.js` (server-only data layer: directory with Auth-email merge, invite-based create with orphan-auth-user compensation, org-scoped update, shared validation), `src/app/api/employees/route.js` (GET list / POST create), `src/app/api/employees/[id]/route.js` (GET one / PATCH with per-role field rules), `src/app/dashboard/employees/page.js`, `src/components/employees/` (EmployeesClient, EmployeeFormDialog, EmployeeDetailDialog, ConfirmDialog, shared Modal), `src/components/dashboard/NoProfileScreen.js` (deduped terminal screen). **Modified:** `src/lib/auth.js` (added `requireApiUser(roles)` guard for Route Handlers), `nav-items.js` (Employees link live), `dashboard/page.js` (real employee-count Live card, shared NoProfileScreen), `icons.js` (IconX, IconSearch), docs. **Auth model for creation:** Admin/HR create employees via `inviteUserByEmail` — no password is ever seen/set/displayed; if the profile insert fails afterward, the just-created Auth user is deleted as compensation (only that user). **Role rules enforced server-side:** salary + role changes are Admin-only; HR cannot create privileged roles; no self role/status changes; HR status changes limited to employee targets; last-active-Admin protection; org-scoped lookups (foreign IDs → 404); unexpected fields → 400; salary stripped from HR/employee responses. No schema changes, no new dependencies, RLS untouched (zero policies; all access stays server-side).

**Checks run (executed):** unauthenticated curl on all 4 endpoints → 401 JSON (first run caught a real syntax error — orphan brace in auth.js — fixed and re-verified); browser: logged-out `/dashboard/employees` → redirects to `/login`; `npm run lint` PASS; `npm run build` PASS (all routes registered); service-role key scan of `.next` → 0. **Not executed (need admin bootstrap + accounts):** all role-flow cases — see TEST_CHECKLIST Phase 3 manual list.

## 2026-10-25 — Visual audit & polish pass with browser verification (IN REVIEW)

**Process:** inspected every UI file; discovered the running dev server (PID 54077) was serving STALE pre-token CSS (0 `color-primary` occurrences) — Next.js refused a second dev server for the project, so it was killed and restarted; fresh server verified (10 token occurrences). Browser-verified landing + login at 1440px and 375px (screenshots + AI-vision audits before/after; DOM overflow metrics: no horizontal overflow anywhere; logged-out `/dashboard` → redirects to `/login` confirmed live). Post-fix audits: both key pages rated 7.5/10, "clean and shippable, no bugs or misalignment".

**Files changed:** `globals.css` (premium native `--font-sans` stack, applied on body), `ui/Button.js` + `ui/Input.js` (`rounded-xl` radius consistency with cards), **new** `ui/Alert.js` (shared error/success/warning/info banner; login error now uses it), `login/page.js` (heading "Welcome back" to kill button/heading duplication, brand-panel content vertically centered, footer contrast fixed, recovery fine print, under-card security line, mobile padding tuned), `page.js` (nav: ghost Sign in + Dashboard hidden below sm, hero type rhythm `leading-[1.12]` + spacing, feature tiles now real bordered cards with sage tiles + hover, mockup: shorter stat labels + `truncate`, visible icon contrast), `dashboard/page.js` (summary cards: phase badge replaces "Soon"+"· Phase N" duplication). Docs updated (DESIGN_SYSTEM.md typography/radius/Alert; this entry). No new dependencies, no logic changes.

**Checks run:** `npm run lint` → PASS · `npm run build` → PASS (routes unchanged) · service-role key scan of `.next` → 0 occurrences · computed-style check (body bg = token `rgb(247,248,245)`, font stack active). **Not visually verified:** logged-in dashboard (no account exists yet — admin bootstrap still pending).

## 2026-10-25 — Security hardening (two review findings; IN REVIEW)

1. **Build-time server-only guard** — installed `server-only@^0.0.1` (tiny React-team package; was not present) and added `import "server-only"` as the first line of `src/lib/supabase/admin.js`. Any Client Component import of that file (direct or transitive) now fails the build instead of risking the service-role key in the browser bundle. `src/lib/auth.js` is transitively guarded via its import of admin.js.
2. **Inactive-account rejection** — `getCurrentUser()` (`src/lib/auth.js`) now returns `profile: null` when `profiles.status !== 'active'` (schema allows exactly 'active'|'inactive'; verified in schema.sql line 71). Deactivated users can no longer pass any protected page that uses the helper; no redirect-loop risk because the dashboard renders its existing no-profile screen (copy updated to mention deactivation) instead of redirecting.

**Checks run:** `npm run lint` → PASS · `npm run build` → PASS · service-role key scan of `.next` → 0 occurrences. Manual login tests still pending admin bootstrap.

## 2026-10-25 — Official design system (IN REVIEW; visual tokens only, no logic changed)

Approved palette codified as semantic Tailwind v4 tokens in `src/app/globals.css` (`@theme`): primary/primary-hover/primary-tint/focus, page/surface/sidebar/sage, ink/muted, line, success/warning/danger/info pairs, shadow-card/shadow-pop. **Files changed:** `globals.css` (tokens + base body; old unused `:root` vars and dark-mode media query removed — system is light-only), `Button/Card/Badge/Input` (token classes; Badge tones renamed to primary/success/warning/danger/info/neutral), `Sidebar` (now uses the dedicated dark `bg-sidebar` token with sage text), `Topbar`, `DashboardShell`, `layout.js` body classes, and token-only color swaps in `page.js` (landing), `login/page.js`, `dashboard/page.js` — structure, copy, and all logic identical. New `docs/DESIGN_SYSTEM.md` (permanent reference). No new dependencies. **Checks run:** `npm run lint` → PASS · `npm run build` → PASS · service-role key scan of `.next` → 0 occurrences.

## 2026-10-25 — UI/UX redesign (IN REVIEW; visual only, no auth logic changed)

**Changed files** — new reusable UI (`src/components/ui/`: Button, Card, Badge, Input, inline-SVG icons; `src/components/dashboard/`: Sidebar, Topbar, DashboardShell, shared nav-items); redesigned landing (`src/app/page.js`), login split-layout with accessible show/hide password (`src/app/login/page.js` — Supabase sign-in logic untouched), dashboard shell with summary/module placeholder cards honestly marked "Soon" (`src/app/dashboard/page.js` — server-side identity/role logic untouched), restyled `signout-button.js` (behavior identical), `layout.js` body classes. No new dependencies (lucide-react NOT installed — inline SVGs used). Design system: zinc neutrals + indigo-600 primary, zinc-50 backgrounds, rounded-xl cards, restrained shadows, focus-visible rings, responsive at desktop/tablet/mobile.

**Checks run (actual results)**: `npm run lint` → PASS · `npm run build` → PASS (same routes: `/` `/login` static, `/dashboard` dynamic, middleware active) · service-role key scan of `.next` → **0 occurrences**. Login flow still untested (no account exists — admin bootstrap still pending from Phase 2).

## 2026-10-25 — Phase 2: Authentication & roles (IN REVIEW; login untested — admin bootstrap pending)

**Changed files**
| File | Action | Notes |
|---|---|---|
| `package.json`, `package-lock.json` | modified (npm) | added `@supabase/ssr@0.12.7` (official cookie-session package for Next.js App Router; old auth-helpers pattern is deprecated) |
| `src/lib/supabase.js` | modified | plain `createClient` → `createBrowserClient` (session-aware); same env guard; still anon-key only |
| `src/lib/supabase/server.js` | created | server client reading the session from Next.js cookies (async `cookies()`) |
| `src/lib/supabase/admin.js` | created | ⚠️ server-only privileged client (service-role key, bypasses RLS); usage rules documented in-file |
| `src/lib/auth.js` | created | `getCurrentUser()`: verifies session with Supabase, loads role from `profiles` via admin client keyed to the verified user id only |
| `src/middleware.js` | created | session refresh + gates `/dashboard` (login required) and `/login` (redirect if signed in); matcher limited to those paths |
| `src/app/login/page.js` | created | client-side sign-in form: loading + friendly error states; no sign-up (deliberate) |
| `src/app/dashboard/page.js`, `src/app/dashboard/signout-button.js` | created | server-component dashboard: identity from server, role chip, "no profile yet" bootstrap-pending state, sign-out |
| `src/app/page.js` | modified | landing links to /login and /dashboard; status note updated |
| `supabase/bootstrap-admin.sql` | created | REVIEW FILE — one-time admin bootstrap template; NOT executed by the app or the assistant |

**Checks run (actual results)**
- Connectivity: anon-key `select` on `organizations` → success, 0 rows, no error (connectivity + RLS default-deny both confirmed; script in /tmp, deleted after)
- `npm run lint` → PASS · `npm run build` → PASS (routes: `/login` static, `/dashboard` dynamic, middleware active)
- Service-role key leak scan of `.next` build output → **0 occurrences**
- NOT run: real login/logout/role tests — no user exists until the owner runs the admin bootstrap

## 2026-10-24 — Phase 1: Foundation (COMMITTED as 39c6eb7 "Phase-1")

**Changed files**
| File | Action | Notes |
|---|---|---|
| `package.json`, `package-lock.json` | modified (npm) | added `@supabase/supabase-js@2.118.0` |
| `.env.local` | created | variable NAMES + placeholders only; no real credentials anywhere |
| `supabase/schema.sql` | created | 10 tables, constraints, RLS enable, leave_types seed — REVIEW FILE, not applied to Supabase |
| `docs/` (8 files) | created | documentation skeleton |
| `src/app/page.js` | rewritten | scaffold welcome page → simple HCM Lite landing (old file was unmodified create-next-app default) |
| `src/app/layout.js` | edited | title/description → HCM Lite; removed `next/font/google` imports (build-time font download caused an intermittent build failure — now offline-safe); in-file comment explains |
| `src/app/globals.css` | edited | removed `--font-sans`/`--font-mono` overrides that pointed at the removed Geist font variables; Tailwind's default system font stack now applies |

**Explicitly NOT done**
- No SQL applied to Supabase · no credentials created or assumed · no auth, setup, or feature code · no files deleted or renamed

**Checks run (actual results)**
- `npm install @supabase/supabase-js` → ok, 0 vulnerabilities (one npm warning: transitive package `unrs-resolver` postinstall blocked by npm allowScripts policy)
- `npm run lint` → see TEST_CHECKLIST for the recorded result
- `npm run build` → see TEST_CHECKLIST for the recorded result
- `git check-ignore .env.local` → confirms env file cannot be committed
