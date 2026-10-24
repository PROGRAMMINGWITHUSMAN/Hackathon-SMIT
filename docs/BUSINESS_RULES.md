# HCM Lite — Business Rules

Everything here comes from the challenge brief or an explicitly approved decision.
Legend: **[BRIEF]** stated in the challenge · **[APPROVED]** decision approved by the project owner on 2026-10-24 · **[DEFAULT]** sensible default chosen by the assistant, still confirmable.

## Roles & permissions
- Roles: **Admin, HR, Employee**. **[BRIEF]**
- Permission matrix **[APPROVED]**:
  - **Admin** — manages salaries, company settings, payroll finalization, audit logs
  - **HR** — manages employee records, attendance, leave, payroll drafts
  - **Employee** — sees own records only
- Leave approval: **HR or Admin**. **[APPROVED]**
- Authorization is enforced on the server in every Route Handler; hiding UI is not security. **[BRIEF]**

## Organization
- One organization per deployment. **[APPROVED]**
- First-run setup creates the organization + initial Admin, exactly once; repeats rejected (HTTP 403), backed by a database-level singleton constraint.

## Attendance **[BRIEF]** unless marked
- Office starts **09:00** (Asia/Karachi **[APPROVED]**); check-in after **09:15 = Late**
- Worked hours = checkout − check-in; **under 5 hours = Half-day**
- **No check-in + no approved leave = Absent**
- **Check-in without checkout = Missing Checkout**
- Duplicate same-day check-in → **HTTP 409** (database unique constraint)
- Weekends and configured holidays are **non-working days, never auto-Absent** **[APPROVED]**; default weekend = Sat+Sun **[DEFAULT]**
- Status precedence when several match: half_day beats late **[DEFAULT — confirm]**

## Leave **[BRIEF]** unless marked
- Allowances per year: **annual 14, sick 8, casual 10, unpaid unlimited**
- Validation on apply (failure → **HTTP 422**): valid date range, no overlap with the same employee's leaves, not on weekends/holidays, sufficient remaining balance
- Unpaid leave affects payroll (see below)

## Payroll **[BRIEF + APPROVED]**
- Monthly cycle, PKR **[DEFAULT]**
- **HRA = 40% of basic · Medical = 10% of basic · Gross = 1.5 × basic** (= basic + HRA + medical)
- **Unpaid-leave deduction = (basic ÷ 26) × unpaid days [APPROVED]**
- Payslip shows **gross, deductions, and net pay** (= gross − deduction) **[APPROVED]**
- Workflow: **HR drafts → Admin finalizes and locks**; locked runs are immutable, payslip figures are snapshots

## AI assistant
- Answers use **real, authorized database data only**; the assistant never bypasses the asker's role permissions; AI keys stay server-side. **[BRIEF]**
- Provider deferred to Phase 9. **[APPROVED]**
