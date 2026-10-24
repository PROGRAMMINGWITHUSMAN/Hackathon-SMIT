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

## Attendance **[BRIEF + Phase 4 implementation decisions]**
- Timezone for everything: **Asia/Karachi (UTC+5, no DST — fixed offset)**. Work dates and the late rule use Karachi wall time, timestamps stored as UTC `timestamptz`.
- Office starts **09:00**; check-in **strictly after 09:15 = Late** (exactly 09:15:00 is Present).
- **Half-day: under 5 worked hours** (checkout − check-in). **Precedence: half_day beats Late** — a 3-hour day is a half-day even if the person also arrived late. Exactly 5.0 hours is a full day.
- **Check-in without checkout, after the day ends = Missing Checkout** — never given a fabricated duration (duration shows "—" until checkout).
- **Absent** is *derived on read, never written*: only for a **past** working day, for an **active** employee who **joined on/before that date**, with no record and **no approved leave** covering it. Weekends (Sat+Sun **[DEFAULT]**, provisional until org workday config exists) and `holidays` table entries are never absent.
- Duplicate same-day check-in → **HTTP 409**; the real protection is the database `UNIQUE(employee_id, work_date)` constraint (safe under concurrency).
- Check-in on a weekend/holiday → **409** (attendance not recorded on non-working days).
- All check-in/out timestamps are **server-generated**; request bodies for those endpoints are ignored. Corrections (HR/Admin) accept ISO times, recalculate status server-side, and write a **before/after audit_logs entry** — records are never silently overwritten.
- GET requests never mutate attendance.

## Leave **[BRIEF + Phase 5 implementation decisions]**
- Allowances (canonical `leave_types` data): **annual 14, sick 8, casual 10, unpaid unlimited** per calendar year.
- **Duration = inclusive WORKING days.** Weekends (Sat+Sun) and `holidays` table entries are never charged. A range with zero working days is rejected (422).
- **Balance year = the calendar year of the request's start date.**
- **Pending + approved requests reserve balance**; rejected/cancelled release it. Unpaid has no cap.
- **Overlap rule:** a request may not overlap the same employee's pending or approved request (any type) → 422. Concurrent submissions: post-insert re-validation with **earliest-created-wins** arbitration — exactly one overlapping request survives (integration-tested).
- Employees submit **only for themselves**; nobody may approve/reject their **own** request (403). HR/Admin review within their organization only (foreign ids → 404). Review/cancel are compare-and-swap: an already-reviewed request → 409.
- **Cancellation policy:** only PENDING requests can be cancelled — by the owner or by HR/Admin. Approved leave is history: it is never withdrawn, only re-requested after discussion.
- Optional reviewer comment (≤500 chars) is stored in the audit log and the employee notification (no schema change needed).
- Approved leave shows as **On leave** in attendance and is never marked Absent (existing rule, now integration-tested). Pending/rejected/cancelled never suppress absence.
- Dates are compared as Asia/Karachi calendar dates; timestamps stored UTC.

## Payroll **[BRIEF + Phase 6 implementation decisions]**
- Period = a **calendar month in Asia/Karachi**. Payroll can be created for the current or any past month — never a future one (422).
- **Basic** comes from the employee profile. **HRA = 40% of basic · Medical = 10% · Gross = basic + HRA + medical** (= 1.5 × basic; components are rounded to 2dp and always sum exactly).
- **Unpaid leave deduction = round2(basic ÷ 26 × unpaid working days in the period).** Only APPROVED unpaid leave counts; weekends/holidays are never charged (existing leave rules); month-spanning requests are charged per month for the working days inside it. Pending/rejected/cancelled leave never deducts.
- **Net pay = gross − deduction.**
- **Eligibility:** active employees with a salary set who joined on/before the period end. Everyone else is skipped with a reason shown to HR (inactive / no salary / joined after period).
- **Workflow:** HR/Admin create and review **drafts** (recalculable); **only Admin finalizes** (draft→finalized) and **locks** (finalized→locked). Transitions are compare-and-swap: double finalize, finalize-after-lock, or concurrent finalization → 409. Finalized/locked runs are immutable and their payslip figures are frozen snapshots.
- **Visibility:** employees see ONLY their own payslips, and only from finalized/locked runs — drafts are invisible to employees.
- Duplicate runs for the same period are impossible (DB unique constraint + 409).

## AI assistant
- Answers use **real, authorized database data only**; the assistant never bypasses the asker's role permissions; AI keys stay server-side. **[BRIEF]**
- Provider deferred to Phase 9. **[APPROVED]**
