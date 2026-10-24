import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgDayView, getEmployeeDay, getAttendanceHistory } from "@/lib/attendance";
import { getEmployeeLeaveView } from "@/lib/leave";
import { listPayrollRuns, getOwnPayslips } from "@/lib/payroll";
import { karachiDateString, isWorkingDay } from "@/lib/attendance-rules.mjs";
import {
  recentDates,
  attendanceTrend,
  departmentCounts,
  leaveMix,
  attendanceSummary,
} from "@/lib/analytics-rules.mjs";

// ---------------------------------------------------------------------------
// Dashboard analytics — SERVER ONLY. One call per role assembles everything
// the Overview page needs, reusing the existing data layers where possible.
//
// Query discipline: profiles are fetched ONCE per org dashboard (without
// salary) and reused for headcount, departments, and absence expectations;
// the trend uses one ranged attendance query + one ranged approved-leave
// query over a 14-day window — no per-day or per-employee loops.
//
// Authorization: callers are already verified (requireApiUser/getCurrentUser
// upstream). Employee dashboards only ever query the caller's own rows —
// there is no code path that accepts another employee id.
// ---------------------------------------------------------------------------

const PROFILE_MIN_COLUMNS = "id, department, status, joined_at";

async function getHolidaysOnce(admin, orgId) {
  const { data, error } = await admin
    .from("holidays")
    .select("holiday_date")
    .eq("organization_id", orgId);
  if (error) throw error;
  return (data ?? []).map((h) => h.holiday_date);
}

// Admin / HR organization dashboard.
export async function getOrgDashboard(callerProfile, nowUtc = new Date()) {
  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;
  const today = karachiDateString(nowUtc);
  const year = today.slice(0, 4);

  const [profiles, holidayDates] = await Promise.all([
    admin
      .from("profiles")
      .select(PROFILE_MIN_COLUMNS)
      .eq("organization_id", orgId)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    getHolidaysOnce(admin, orgId),
  ]);

  const active = profiles.filter((p) => p.status === "active");

  // --- Attendance: today (existing composite helper) + 14-day trend ---
  const [dayView, attendanceRows, leaveRowsInRange] = await Promise.all([
    getOrgDayView(orgId, today, nowUtc),
    admin
      .from("attendance")
      .select("work_date, check_in, check_out, status")
      .eq("organization_id", orgId)
      .gte("work_date", karachiDateString(new Date(nowUtc.getTime() - 14 * 86400000)))
      .lte("work_date", today)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    admin
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .eq("organization_id", orgId)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", karachiDateString(new Date(nowUtc.getTime() - 14 * 86400000)))
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
  ]);

  const workingDates = recentDates(today, 14).filter((d) =>
    isWorkingDay(d, holidayDates)
  );
  const trend = attendanceTrend({
    dates: workingDates.slice(-7), // the 7 most recent PAST working days
    rows: attendanceRows,
    activeEmployees: active.map((p) => ({ id: p.id, joined_at: p.joined_at })),
    leaves: leaveRowsInRange,
    holidayDates,
  });

  // --- Leave mix (current calendar year) ---
  const { data: yearRequests, error: yearError } = await admin
    .from("leave_requests")
    .select("leave_type, status")
    .eq("organization_id", orgId)
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);
  if (yearError) throw yearError;
  const mix = leaveMix(yearRequests ?? []);
  const pendingLeaveCount = (yearRequests ?? []).filter(
    (r) => r.status === "pending"
  ).length;

  // --- Payroll: latest runs with totals (existing helper) ---
  const runs = await listPayrollRuns(callerProfile);

  // --- Recent activity (Admin only, per business rules) ---
  let recentActivity = null;
  if (callerProfile.role === "admin") {
    const { data: audit, error: auditError } = await admin
      .from("audit_logs")
      .select("id, action, entity, created_at, actor_id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (auditError) throw auditError;
    const actorIds = Array.from(
      new Set((audit ?? []).map((a) => a.actor_id).filter(Boolean))
    );
    const namesById = new Map();
    if (actorIds.length > 0) {
      const { data: people } = await admin
        .from("profiles")
        .select("id, full_name")
        .eq("organization_id", orgId)
        .in("id", actorIds);
      for (const person of people ?? []) namesById.set(person.id, person.full_name);
    }
    recentActivity = (audit ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      actor_name: a.actor_id ? namesById.get(a.actor_id) ?? "Unknown" : "System",
      created_at: a.created_at,
    }));
  }

  return {
    today,
    headcount: {
      active: active.length,
      total: profiles.length,
      departments: departmentCounts(active),
    },
    attendanceToday: {
      is_working_day: dayView.is_working_day,
      holiday_name: dayView.holiday_name,
      summary: dayView.summary,
    },
    attendanceTrend: trend,
    leaveMix: mix,
    pendingLeaveCount,
    payrollRuns: runs.slice(0, 3),
    recentActivity,
  };
}

// Employee personal dashboard — own rows only, never another employee's.
export async function getEmployeeDashboard(callerProfile, nowUtc = new Date()) {
  const orgId = callerProfile.organization_id;
  const today = karachiDateString(nowUtc);
  const from30 = karachiDateString(new Date(nowUtc.getTime() - 30 * 86400000));

  const [todayAttendance, history, leaveView, payslips] = await Promise.all([
    getEmployeeDay(orgId, callerProfile.id, today, nowUtc),
    getAttendanceHistory(orgId, callerProfile.id, from30, today),
    getEmployeeLeaveView(callerProfile, nowUtc),
    getOwnPayslips(callerProfile),
  ]);

  return {
    today,
    attendanceToday: {
      status: todayAttendance.effective_status,
      is_working_day: todayAttendance.is_working_day,
      holiday_name: todayAttendance.holiday_name,
      check_in: todayAttendance.record?.check_in ?? null,
      check_out: todayAttendance.record?.check_out ?? null,
      worked_minutes: todayAttendance.worked_minutes,
    },
    monthSummary: attendanceSummary(history),
    leave: {
      balances: leaveView.balances,
      pendingCount: leaveView.requests.filter((r) => r.status === "pending").length,
    },
    latestPayslip: payslips[0] ?? null,
  };
}
