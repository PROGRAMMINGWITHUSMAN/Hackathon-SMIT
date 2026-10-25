# HCM Lite — Test Checklist

Rules: a box is ticked only after the check was **actually run** and the real result recorded. "Expected to pass" is never enough.

## Phase 9 — Notifications, announcements & audit (in review)

**Automated (this pass):** 6 database-free tests for announcement validation, audit metadata allowlisting/sanitization, and fixed internal notification destinations. Lint/build and safe unit-suite results are recorded in the delivery report for this pass.

**Not yet verified:** database-backed recipient/deduplication/read-state behavior, cross-organization isolation, announcement publishing/read state, audit generation/access, and browser UI flows. The communications migration is additive and has not been applied. Do not apply it to a live database without owner approval.

## Phase 8 — AI assistant (built 2026-10-25)

**Automated — `npm test` (13 AI tests within 114/114 PASS):** 8 unit (intent registry role-gating: org intents denied to employees, audit admin-only, own-* for all roles, policy for all, gibberish/SQL → null; message/history bounds incl. history trimming to 6; rate limiter window/retry-hint/isolation; live 401 on /api/ai/chat) + 5 integration vs the REAL DB with disposable accounts and NO Gemini calls (policy context static + personal-data-free; org builders aggregate for HR while audit returns null; own contexts contain no other person's name/id and no org aggregates; employee denied audit at builder level; unknown intent → null).

**Browser E2E (executed 2026-10-25, disposable `e2e.chat.*` account — deleted after):** assistant page renders with role-appropriate suggestion chips; **real Gemini policy Q&A answered correctly** ("Only the Admin can finalize payroll.", half-day definition); own-leave question with the privacy flag OFF → `intent=own_leave, data_disabled=true` privacy notice, no HR data sent; org question as employee → `intent=unsupported` (no org intent, no model call); 501-char message → 400 field error; off-topic → unsupported; full UI send flow (textarea → submit → assistant bubble).

**Blocked/pending (deliberate):**
- [ ] **Data-intent path with `AI_ALLOW_HR_CONTEXT=true`** — BLOCKED pending the owner's privacy decision (paid-tier terms). When enabled, ask an org/own question as each role and confirm replies quote the aggregates from the dashboard.
- [ ] Rate-limit 429 via UI — covered by unit tests + implementation; not re-driven through the browser (would burn the model quota).

## Phase 7 — Dashboard & analytics (built 2026-10-25)

**Automated — `npm test` (13 analytics tests within 94/94 PASS):** 7 unit (trend derivation incl. missing-checkout/on-leave/absence math + weekend skip, department distribution incl. unassigned grouping + shares, leave mix, own-summary counts, recentDates window) + 6 integration vs the REAL database with disposable accounts: headcount active-vs-total; departments exclude inactive employees; trend counts real attendance rows; leave mix counts pending then approved after a real review; **admin receives audit activity while HR receives none**; employee dashboard contains own data only (serialized response contains no other employee's id/name) and empty-data employees render without crashing.

**Browser E2E (executed 2026-10-25, disposable `e2e.db.*` accounts — deleted after):** HR dashboard rendered every widget with live data (headcount, 7-working-day trend, departments, leave mix, pending stat, audit correctly hidden, **owner's real locked payroll run visible in the payroll card**); employee dashboard rendered own-only widgets with **no other person's name and no org-wide metrics** in the output. No error states.

**Notes:** metrics are computed server-side in `src/lib/analytics.js` (no new API endpoints → no new attack surface); charts are dependency-free CSS bars with title-tooltips of the exact numbers; the trend shows the 7 most recent PAST working days (fixed window, documented); absent in the trend is DERIVED (active, joined ≤ day, no record, no approved leave) — never stored.

## Phase 6 — Payroll (built 2026-10-25)

**Automated — `npm test` (17 payroll tests within 81/81 PASS):** 7 unit (formulas incl. rounding-sum invariant, deduction math, period bounds incl. leap year, future-period rule, unpaid-day counting with pending/other-type/month-spanning/weekend/holiday cases) + 10 integration vs the REAL database with disposable accounts (salaried 80k employee, unsalaried employee, HR, Admin): future+malformed period rejected; draft created with **exact formulas verified** (80,000 → 32,000/8,000/120,000; unpaid 4 working days → deduction 12,307.69 → net); unsalaried skipped with reason; duplicate run 409; drafts invisible to employees; **HR finalize blocked (lib-level, 403)**; Admin finalize → employee sees payslip with correct net; finalize-twice and recalc-after-finalize 409; recalc picks up data changes with month isolation (Oct leave ≠ Sept payslip); lock flow + locked rejects everything; **concurrent finalize → exactly one succeeds**; 7 endpoints 401 unauthenticated (live HTTP).

**Browser E2E (executed 2026-10-25, disposable `e2e.py.*` accounts — deleted after, runs cascaded):** HR created October 2026 draft via UI (math visible: 50,000 → 20,000 HRA → 5,000 medical → **75,000 net**), **zero Finalize buttons for HR**; Admin finalized and locked via confirm dialogs; employee viewed the payslip (all figures + Locked badge). Dashboard shows the live payroll card.

**Not tested / notes:** concurrent draft creation raced only at DB-unique level (covered); notification UI still Phase 9 (rows not used by payroll).

## Phase 5 — Leave management (built 2026-10-25)

**Automated — `npm test` (26 leave tests within 64/64 PASS):** 12 unit (working-day counting incl. weekends/holidays, overlap inclusivity, balance reservation/release, year attribution, unpaid unlimited, validation matrix) + 14 integration vs the REAL database with disposable accounts: submit stored pending; reviewer notified; own-only visibility + HR org view; pending reserves 14→9; overlap 422; reversed/bad-type/weekend-only 422s; over-balance 422 + unpaid uncapped; self-approval forbidden (even as admin); HR approve (CAS) + audit before/after + employee notification + balance consumed; double-approve 409; **attendance On-leave (not Absent)**; pending/rejected do NOT suppress absence; rejection releases reservation; owner cancel pending + double-cancel 409 + balance released; stranger (employee role) cancel forbidden, HR cancel allowed; **concurrent overlapping submits → exactly 1 survivor**; all 6 endpoints 401 unauthenticated (live HTTP).

**Browser E2E (executed 2026-10-25, disposable `e2e.lv.*` accounts — deleted after):**

| # | Check | Result |
|---|---|---|
| 5.1 | Employee submits via real form → success banner w/ days, Pending row, balance card 14 | ✅ PASS |
| 5.2 | HR sees request + reason + pending count; approves via dialog with comment | ✅ PASS (reviewer shown) |
| 5.3 | Attendance view 2026-11-04 → employee **On leave**, no in/out/duration | ✅ PASS |
| 5.4 | Employee submits casual day → HR rejects with comment → employee sees Rejected + reviewer; casual back to 10/10, annual 9/14 | ✅ PASS |

**Not tested / N/A:**
- [ ] NOT TESTED in this verification pass: notification and announcement UI, recipient scoping, and read state
- [ ] N/A by design: cross-org access (single-org; org-scoped queries)


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

## Phase 4 — Attendance (built 2026-10-25; simulated-Monday suite added same day)

**Automated — `npm test` (34/34 PASS):** 21 unit tests (rules incl. 5 MONDAY-specific: working day, 09:00/09:15:00 present, 09:15:01 late, 09:00→17:30 = 510m present) + 13 integration tests against the **real Supabase database** with an injected Monday 2026-10-26 PKT clock (dedicated disposable test employee, cascade-cleaned): one-record check-in, DB-constraint duplicate rejection (no second row), checkout timestamp + 510m duration, duplicate checkout, no-check-in checkout, Late (Tue 09:20), Half-day (Thu 2h55m), missing-checkout with null duration (past open day), history consistency, and HR summary (`getOrgDayView`) showing the same record. Clock injection is internal-only (`nowUtc` parameter); users cannot influence it — proven live below.

**Live E2E (executed 2026-10-25 with dedicated, clearly-labeled test accounts — cleaned up after):**

| # | Check | Result |
|---|---|---|
| 4.1 | Employee login → dashboard attendance card "Non-working day" (Sunday PKT) | ✅ PASS |
| 4.2 | Employee attendance page renders; seeded past row shows **Missing checkout** | ✅ PASS |
| 4.3 | Check-in on Sunday → 409 "non-working day" | ✅ PASS |
| 4.4 | Check-out with no check-in → 409 | ✅ PASS |
| 4.5 | `?employee_id=<other>` spoof ignored — only own rows returned | ✅ PASS |
| 4.6 | Employee calling PATCH correction → 403 | ✅ PASS |
| 4.7 | HR day view today (Sunday): weekend banner, **zero Absent** derived | ✅ PASS |
| 4.8 | HR day view Friday: Absent derived for record-less employees | ✅ PASS |
| 4.9 | HR correction via UI dialog → row updated (09:20/17:35 PKT), status recalculated to Late, **audit_logs before/after entry written** (DB-verified) | ✅ PASS |
| 4.10 | Correction with checkout before check-in → 400 field error | ✅ PASS |
| 4.11 | All endpoints unauthenticated → 401 (incl. malformed date) | ✅ PASS |
| 4.12 | `?from=garbage` → 400 | ✅ PASS |
| 4.13 | **Spoofed-clock proof (browser)**: crafted POST check-in with fake Monday `work_date/now/timestamp/employee_id/organization_id` → 409 based on the REAL date ("Today is a non-working day"); crafted checkout → 409 "No check-in found for today" | ✅ PASS |

**Manual / blocked:**
- [ ] ~~BLOCKED (calendar): weekday self check-in happy path~~ — now covered by the simulated-Monday integration suite above (real DB, real constraint). Remaining UI-level nice-to-have: click the actual Check in button on a real weekday.
- [ ] NOT RUN live: HTTP-level concurrent duplicate check-in race (DB constraint + integration duplicate test cover the mechanism)
- [ ] N/A by design: cross-organization access — single-org deployment; every query is org-scoped (`.eq(organization_id, …)`)

## Phase 3 — Employee management (built 2026-10-25)

**Executed by assistant — invitation flow (2026-10-25, real browser):**

| # | Check | How | Result |
|---|---|---|---|
| 3.7 | Invite link → /auth/callback → session → /auth/set-password | generateLink invite + browser navigation | ✅ PASS (after implicit-hash setSession fix) |
| 3.8 | Set password via the form | browser form fill + submit | ✅ PASS — "Password saved" |
| 3.9 | Invited non-employee lands on correct terminal screen | browser | ✅ PASS — NoProfileScreen on /dashboard |
| 3.10 | Sign out then sign in with the new password | browser | ✅ PASS — session re-established |
| 3.11 | Test cleanup | admin API deleteUser | ✅ PASS — test user removed |

**Executed by assistant (real results):**

| # | Check | How | Result |
|---|---|---|---|
| 3.1 | Unauthenticated GET /api/employees → 401 | curl, no cookies | ✅ PASS — `{"error":"Not signed in."}` HTTP 401 |
| 3.2 | Unauthenticated POST /api/employees → 401 | curl | ✅ PASS — 401 |
| 3.3 | Unauthenticated GET /api/employees/[id] → 401 | curl | ✅ PASS — 401 |
| 3.4 | Unauthenticated PATCH /api/employees/[id] → 401 | curl | ✅ PASS — 401 |
| 3.5 | Logged-out visit to /dashboard/employees → redirect to /login | browser | ✅ PASS — landed on /login, page rendered |
| 3.6 | Production build registers all new routes | `npm run build` | ✅ PASS — /api/employees, /api/employees/[id], /dashboard/employees present |

**Manual — requires admin bootstrap first (curl or UI):**

- [ ] Admin creates an employee with password (min 8 chars) → 201, row appears, employee can sign in IMMEDIATELY (email pre-confirmed)
- [ ] Password shorter than 8 → blocked in form AND via crafted API call (400 field error)
- [ ] Passwords not matching → form blocks before submit; confirm_password sent via crafted API call → 400 unknown field
- [ ] Duplicate email → 409; no second account created
- [ ] New employee signs in at /login → lands on their correct role-based dashboard (employee sees restricted notice on Employees page)
- [ ] Duplicate email on create → 409 with friendly message
- [ ] HR creates role=admin → 403; HR sends basic_salary (create or edit) → 403
- [ ] Admin edits name/department/joined date → 200, table updates
- [ ] Admin changes employee role → 200; HR attempts role change → 403
- [ ] Admin/HR deactivate employee → confirm dialog → 200; that user's next page visit shows "no active profile" screen
- [ ] Reactivate → 200, access restored
- [ ] HR deactivating an Admin → 403
- [ ] Deactivating/demoting the LAST active Admin → 403 "Cannot remove the last active Admin"
- [ ] Employee GET own profile → 200 (no salary field); GET another id → 403
- [ ] PATCH with unexpected field (e.g. organization_id) → 400
- [ ] Invalid inputs (1-char name, bad email, future-format date, negative salary) → 400 with field errors
- [ ] Cross-organization UUID (from another Supabase project) → 404
- [ ] Empty directory renders polished empty state with "Add employee" (fresh org with only the bootstrap admin shows 1 row)
- [ ] Search by name/email + role/status filters narrow the list; "Clear" resets
- [ ] Mobile (375px): directory as cards, dialogs bottom-sheet, no horizontal scroll
- [ ] Failed profile creation leaves no orphan Auth user (hard to force; compensation code reviewed)
- [ ] ~~Invite email rate limit → 429~~ superseded: direct creation sends no email (429 branch kept for API throttling)
- [ ] Phase 2 regression: login, logout, dashboard protection, role chip still work

## Phase 2 — Authentication & roles (built 2026-10-25; login flow pending admin bootstrap)

| # | Check | How | Result |
|---|---|---|---|
| 2.1 | Connectivity to Supabase with anon key | one-off node script (`/tmp`, deleted): select 1 row from `organizations` | ✅ PASS — 200-level, no error, 0 rows visible (RLS default-deny confirmed) |
| 2.2 | Lint passes | `npm run lint` | ✅ PASS |
| 2.3 | Production build passes | `npm run build` | ✅ PASS — `/dashboard` dynamic, middleware registered |
| 2.4 | Service-role key NOT in browser bundle | read key into shell var, grep `.next` | ✅ PASS — 0 occurrences |
| 2.5 | Successful login → dashboard | manual browser test | ⬜ BLOCKED — needs admin bootstrap first |
| 2.6 | Invalid credentials → clear error | manual browser test | ⬜ BLOCKED — same |
| 2.7 | Logout → back to /login | manual browser test | ⬜ BLOCKED — same |
| 2.8 | Logged-out visit to /dashboard → redirected to /login | manual browser test | ⬜ BLOCKED — same (middleware logic written, not yet exercised) |
| 2.9 | Logged-in visit to /login → redirected to /dashboard | manual browser test | ⬜ BLOCKED — same |
| 2.10 | Inactive profile (status='inactive') cannot access /dashboard | manual: flip an account's profiles.status to 'inactive' in SQL Editor, then visit /dashboard | ⬜ PENDING — needs a booted account |
| 2.11 | Build fails if admin.js is imported from a Client Component | temporary bad import, expect build error | ⬜ NOT RUN (destructive test; `server-only` guard verified by package mechanism + clean build) |

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
