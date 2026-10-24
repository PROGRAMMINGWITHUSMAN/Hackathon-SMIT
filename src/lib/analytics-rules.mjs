// ---------------------------------------------------------------------------
// Dashboard analytics rules — PURE functions (no I/O), shared by the server
// analytics module and the tests. Metric definitions live here so every
// number on the dashboard has one explanation:
//
//   attendance trend (per PAST working day):
//     present / late / half_day — stored statuses of that day's records
//     missing_checkout          — records with check-in and no check-out
//     on_leave                  — active employees with approved leave that day
//     absent                    — active, joined ≤ day, no record, not on leave
//   department distribution     — share of ACTIVE employees per department
//                                 (null department groups under "Unassigned")
//   leave mix (year)            — request counts by type × status
// ---------------------------------------------------------------------------

import { isWorkingDay } from "./attendance-rules.mjs";

// The last `calendarDays` calendar dates (oldest first), excluding today.
export function recentDates(todayStr, calendarDays = 14) {
  const dates = [];
  const todayMs = Date.parse(todayStr + "T00:00:00Z");
  for (let i = calendarDays; i >= 1; i -= 1) {
    dates.push(new Date(todayMs - i * 86400000).toISOString().slice(0, 10));
  }
  return dates;
}

// Derive the per-day trend. All inputs are plain data:
//   dates           — working dates to report (caller filters non-working)
//   rows            — attendance rows {work_date, check_in, check_out, status}
//   activeEmployees — [{id, joined_at}] eligible for absence
//   leaves          — approved leave rows {employee_id, start_date, end_date}
//   holidayDates    — org holidays (used only if the caller did not pre-filter)
export function attendanceTrend({
  dates,
  rows,
  activeEmployees,
  leaves,
  holidayDates = [],
}) {
  const byDate = new Map();
  for (const date of dates) {
    byDate.set(date, {
      date,
      present: 0,
      late: 0,
      half_day: 0,
      missing_checkout: 0,
      on_leave: 0,
      absent: 0,
    });
  }

  for (const row of rows) {
    const day = byDate.get(row.work_date);
    if (!day) continue;
    if (row.check_in && !row.check_out) day.missing_checkout += 1;
    else if (row.status === "present") day.present += 1;
    else if (row.status === "late") day.late += 1;
    else if (row.status === "half_day") day.half_day += 1;
  }

  for (const day of byDate.values()) {
    const workingDay = isWorkingDay(day.date, holidayDates);
    const onLeaveIds = new Set(
      leaves
        .filter((l) => l.start_date <= day.date && l.end_date >= day.date)
        .map((l) => l.employee_id)
    );
    day.on_leave = onLeaveIds.size;
    if (!workingDay) continue;
    const expected = activeEmployees.filter(
      (e) => e.joined_at == null || e.joined_at <= day.date
    ).length;
    const recorded =
      day.present + day.late + day.half_day + day.missing_checkout;
    day.absent = Math.max(0, expected - recorded - onLeaveIds.size);
  }

  return Array.from(byDate.values());
}

// Department distribution of ACTIVE employees.
export function departmentCounts(activeEmployees) {
  const counts = new Map();
  for (const employee of activeEmployees) {
    const key = employee.department?.trim() || null;
    const label = key ?? "Unassigned";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = activeEmployees.length;
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Leave request counts by type and status for one calendar year.
export function leaveMix(requests) {
  const mix = {};
  for (const request of requests) {
    const byType = (mix[request.leave_type] ??= {
      pending: 0, approved: 0, rejected: 0, cancelled: 0, total: 0,
    });
    byType[request.status] = (byType[request.status] ?? 0) + 1;
    byType.total += 1;
  }
  return mix;
}

// Summarize an employee's own attendance history (already derived rows).
export function attendanceSummary(historyRows) {
  const summary = {
    present: 0, late: 0, half_day: 0, missing_checkout: 0, on_leave: 0,
    recorded_days: historyRows.length,
  };
  for (const row of historyRows) {
    if (row.effective_status in summary) summary[row.effective_status] += 1;
  }
  return summary;
}
