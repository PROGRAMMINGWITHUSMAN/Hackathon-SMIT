import "server-only";
import { getOrgDashboard, getEmployeeDashboard } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// AI context builders — SERVER ONLY. One function per data intent; each
// reuses the existing analytics/data layers and renders a MINIMAL,
// AGGREGATED text summary. Rules:
//
//   - No raw rows, no employee names/salaries in organization contexts
//     (counts and totals only). Own-data contexts contain only the caller's
//     own numbers.
//   - The audit intent (Admin only — enforced here by role check returning
//     null for anyone else) exposes action-type counts, never actor names.
//   - POLICY_CONTEXT is static product documentation (no personal data) and
//     is the ONLY context enabled without the privacy flag.
// ---------------------------------------------------------------------------

export const POLICY_CONTEXT = `
HCM Lite policies (Asia/Karachi timezone, UTC+5):
- Attendance: office starts 09:00. Check-in strictly after 09:15 is Late; at or before 09:15 is Present.
- Worked duration = checkout minus check-in. Under 5 hours is a Half-day; Half-day takes precedence over Late. Exactly 5 hours is a full day.
- Check-in without checkout, once the day ends, is Missing Checkout (no fabricated duration).
- Absent is derived for a past working day when an active employee (joined on/before that day) has no record and no approved leave. Weekends (Sat+Sun) and configured holidays are never absent.
- Duplicate same-day check-in is rejected (HTTP 409). Check-in/out timestamps are server-generated.
- Leave allowances per calendar year: Annual 14, Sick 8, Casual 10, Unpaid unlimited. Weekends/holidays are never charged as leave days.
- Pending + approved requests reserve balance; rejected/cancelled release it. A request may not overlap the same employee's pending/approved request. Employees submit only for themselves and cannot approve their own request. Only pending requests can be cancelled.
- HR/Admin review requests; HR cannot set salaries or assign Admin/HR roles; only Admin manages salaries, finalizes/locks payroll, deactivates accounts, and views audit logs.
- Payroll: HRA = 40% of basic, Medical = 10%, Gross = 1.5 x basic. Unpaid leave deduction = (basic / 26) x unpaid working days in the month. Net = gross - deduction. HR drafts payroll; only Admin finalizes then locks (immutable). Employees see only their own payslips, only after finalization.
- Accounts are created by Admin/HR (email + password set by them, no public signup); passwords are hashed by Supabase Auth.
`;

// Organization-level summaries (Admin/HR). Aggregates only.
async function orgAttendance(profile) {
  const view = await getOrgDashboard(profile);
  const s = view.attendanceToday.summary;
  const today = view.attendanceToday.is_working_day
    ? `Today (${view.today}): present ${s.present}, late ${s.late}, half-day ${s.half_day}, absent ${s.absent}, on leave ${s.on_leave}, missing checkout ${s.missing_checkout}.`
    : `Today (${view.today}) is a non-working day${view.attendanceToday.holiday_name ? ` — holiday: ${view.attendanceToday.holiday_name}` : " (weekend)"}.`;
  const trend = view.attendanceTrend
    .map(
      (d) =>
        `${d.date}: present ${d.present}, late ${d.late}, half-day ${d.half_day}, absent ${d.absent}, on leave ${d.on_leave}, missing checkout ${d.missing_checkout}`
    )
    .join("; ");
  return `Attendance summary. ${today} Recent working days — ${trend}. Active employees: ${view.headcount.active}.`;
}

async function orgDepartments(profile) {
  const view = await getOrgDashboard(profile);
  const parts = view.headcount.departments
    .map((d) => `${d.label} ${d.count} (${d.share}%)`)
    .join(", ");
  return `Active employees: ${view.headcount.active} of ${view.headcount.total} total. Departments: ${parts}.`;
}

async function orgLeave(profile) {
  const view = await getOrgDashboard(profile);
  const mix = Object.entries(view.leaveMix)
    .map(([type, counts]) => {
      const approved = counts.approved ?? 0;
      const pending = counts.pending ?? 0;
      const rejected = counts.rejected ?? 0;
      return `${type}: ${counts.total} total (${approved} approved, ${pending} pending, ${rejected} rejected)`;
    })
    .join("; ");
  return `Leave requests this year: ${mix || "none yet"}. Currently pending review: ${view.pendingLeaveCount}.`;
}

async function orgPayroll(profile) {
  const view = await getOrgDashboard(profile);
  const runs = view.payrollRuns
    .map(
      (r) =>
        `${r.label}: ${r.status}, ${r.totals.employees} payslips, net PKR ${r.totals.net}`
    )
    .join("; ");
  return `Latest payroll runs (totals only): ${runs || "no runs yet"}.`;
}

async function orgAudit(profile) {
  if (profile.role !== "admin") return null; // enforced again here, not just upstream
  const view = await getOrgDashboard(profile);
  if (!view.recentActivity || view.recentActivity.length === 0) {
    return "Recent activity: no recorded administrative actions yet.";
  }
  const counts = {};
  for (const a of view.recentActivity) counts[a.action] = (counts[a.action] ?? 0) + 1;
  const parts = Object.entries(counts)
    .map(([action, count]) => `${action} x${count}`)
    .join(", ");
  return `Recent administrative activity (most recent ${view.recentActivity.length} entries, by action): ${parts}.`;
}

// Own-data summaries (any active profile) — caller's numbers only.
async function ownAttendance(profile) {
  const view = await getEmployeeDashboard(profile);
  const m = view.monthSummary;
  return `Your attendance (last 30 days): present ${m.present}, late ${m.late}, half-day ${m.half_day}, missing checkout ${m.missing_checkout}, on leave ${m.on_leave}, recorded days ${m.recorded_days}. Today: ${view.attendanceToday.status}.`;
}

async function ownLeave(profile) {
  const view = await getEmployeeDashboard(profile);
  const b = view.leave.balances;
  const parts = ["annual", "sick", "casual"]
    .map((code) => `${code} ${b[code]?.remaining ?? 0}/${b[code]?.allowance ?? 0} remaining`)
    .join(", ");
  return `Your leave: ${parts}; unpaid is unlimited. Pending requests: ${view.leave.pendingCount}.`;
}

async function ownPayslip(profile) {
  const view = await getEmployeeDashboard(profile);
  if (!view.latestPayslip) {
    return "You have no finalized payslips yet.";
  }
  const p = view.latestPayslip;
  return `Your latest payslip (${p.period_label}, ${p.run_status}): gross PKR ${p.gross}, deduction PKR ${p.deduction} (${p.unpaid_leave_days} unpaid day(s)), net PKR ${p.net_pay}.`;
}

const BUILDERS = {
  org_attendance: orgAttendance,
  org_departments: orgDepartments,
  org_leave: orgLeave,
  org_payroll: orgPayroll,
  org_audit: orgAudit,
  own_attendance: ownAttendance,
  own_leave: ownLeave,
  own_payslip: ownPayslip,
};

// Returns the sanitized text context for an intent, or null when the role
// may not receive it.
export async function buildContextForIntent(intentId, profile) {
  const builder = BUILDERS[intentId];
  if (!builder) return null;
  return builder(profile);
}
