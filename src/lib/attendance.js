import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listEmployeeProfiles } from "@/lib/employees";
import {
  karachiDateString,
  isWorkingDay,
  checkInStatus,
  finalStatus,
  workedMinutes,
  effectiveStatus,
  isUniqueViolation,
} from "@/lib/attendance-rules.mjs";
import { recordAudit, sendNotification } from "@/lib/communications";

// ---------------------------------------------------------------------------
// Attendance data layer — SERVER ONLY (same rules as the employees module).
// Callers have already been verified with getCurrentUser()/requireApiUser().
// Every query is scoped by organization_id from the verified profile.
//
// Design note: "absent" is DERIVED on read (effectiveStatus) and never
// written by any code path — GET requests never mutate attendance. Stored
// row status holds present/late/half_day as set at check-in/checkout;
// missing_checkout is also derived for display.
// ---------------------------------------------------------------------------

const ATTENDANCE_COLUMNS = "id, organization_id, employee_id, work_date, check_in, check_out, status, created_at";

async function getHolidayDates(admin, organizationId) {
  const { data, error } = await admin
    .from("holidays")
    .select("holiday_date, name")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return data ?? [];
}

async function getApprovedLeaveEmployeeIds(admin, organizationId, dateStr) {
  const { data, error } = await admin
    .from("leave_requests")
    .select("employee_id")
    .eq("organization_id", organizationId)
    .eq("status", "approved")
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.employee_id));
}

// --- Employee: own history -----------------------------------------------------

// fromDate may be null → defaults to a 60-day window ending at toDate.
export async function getAttendanceHistory(
  organizationId,
  employeeId,
  fromDate,
  toDate
) {
  const admin = createAdminClient();
  const from =
    fromDate ?? karachiDateString(new Date(Date.now() - 60 * 86400 * 1000));
  const { data, error } = await admin
    .from("attendance")
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("employee_id", employeeId)
    .gte("work_date", from)
    .lte("work_date", toDate)
    .order("work_date", { ascending: false });
  if (error) throw error;

  const nowUtc = new Date();
  const holidayDates = (await getHolidayDates(admin, organizationId)).map(
    (h) => h.holiday_date
  );

  // Derive the display status (adds missing_checkout for past open days;
  // stored status stays untouched).
  return (data ?? []).map((row) => ({
    ...row,
    effective_status: effectiveStatus({
      record: row,
      workDate: row.work_date,
      nowUtc,
      workingDay: isWorkingDay(row.work_date, holidayDates),
    }),
    worked_minutes:
      row.check_in && row.check_out
        ? Math.round(workedMinutes(new Date(row.check_in), new Date(row.check_out)))
        : null, // null when checkout is missing — never a fabricated duration
  }));
}

// --- Employee: own day (used for the "today" card) ------------------------------

export async function getEmployeeDay(
  organizationId,
  employeeId,
  dateStr,
  nowUtc = new Date()
) {
  const admin = createAdminClient();
  const holidays = await getHolidayDates(admin, organizationId);
  const holidayDates = holidays.map((h) => h.holiday_date);
  const holiday = holidays.find((h) => h.holiday_date === dateStr) ?? null;

  const { data: record, error } = await admin
    .from("attendance")
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("employee_id", employeeId)
    .eq("work_date", dateStr)
    .maybeSingle();
  if (error) throw error;

  const workingDay = isWorkingDay(dateStr, holidayDates);
  const onLeave =
    workingDay &&
    (await getApprovedLeaveEmployeeIds(admin, organizationId, dateStr)).has(
      employeeId
    );

  return {
    date: dateStr,
    is_working_day: workingDay,
    holiday_name: holiday ? holiday.name : null,
    on_leave: onLeave,
    record,
    effective_status: effectiveStatus({
      record,
      workDate: dateStr,
      nowUtc,
      workingDay,
      onApprovedLeave: onLeave,
    }),
    worked_minutes:
      record && record.check_in && record.check_out
        ? Math.round(workedMinutes(new Date(record.check_in), new Date(record.check_out)))
        : null,
  };
}

// --- HR/Admin: organization view for one date -----------------------------------

export async function getOrgDayView(organizationId, dateStr, nowUtc = new Date()) {
  const admin = createAdminClient();

  const holidays = await getHolidayDates(admin, organizationId);
  const holidayDates = holidays.map((h) => h.holiday_date);
  const holiday = holidays.find((h) => h.holiday_date === dateStr) ?? null;
  const workingDay = isWorkingDay(dateStr, holidayDates);

  const [employees, attendanceRows, leaveIds] = await Promise.all([
    listEmployeeProfiles(organizationId),
    admin
      .from("attendance")
      .select(ATTENDANCE_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("work_date", dateStr)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    workingDay
      ? getApprovedLeaveEmployeeIds(admin, organizationId, dateStr)
      : Promise.resolve(new Set()),
  ]);

  const rowsByEmployee = new Map(attendanceRows.map((r) => [r.employee_id, r]));

  const records = employees.map((employee) => {
    const row = rowsByEmployee.get(employee.id) ?? null;
    const status = effectiveStatus({
      record: row,
      workDate: dateStr,
      nowUtc,
      workingDay,
      onApprovedLeave: leaveIds.has(employee.id),
      // Absent only counts from the employee's join date (if known) and
      // only for people still expected at work.
      absentEligible:
        employee.status === "active" &&
        (employee.joined_at == null || dateStr >= employee.joined_at),
    });
    return {
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        department: employee.department,
        role: employee.role,
        status: employee.status,
      },
      record: row,
      effective_status: status,
      worked_minutes:
        row && row.check_in && row.check_out
          ? Math.round(workedMinutes(new Date(row.check_in), new Date(row.check_out)))
          : null,
    };
  });

  const summary = { present: 0, late: 0, half_day: 0, absent: 0, missing_checkout: 0, on_leave: 0 };
  for (const r of records) {
    if (r.effective_status in summary) summary[r.effective_status] += 1;
  }

  return {
    date: dateStr,
    is_working_day: workingDay,
    holiday_name: holiday ? holiday.name : null,
    summary,
    records,
  };
}

// --- Employee self-service actions (server-generated timestamps only) -----------

export async function checkInEmployee(callerProfile, nowUtc = new Date()) {
  const admin = createAdminClient();
  const workDate = karachiDateString(nowUtc);

  const holidayDates = (await getHolidayDates(admin, callerProfile.organization_id))
    .map((h) => h.holiday_date);
  if (!isWorkingDay(workDate, holidayDates)) {
    return { rejected: "non_working_day" };
  }

  try {
    const { data, error } = await admin
      .from("attendance")
      .insert({
        organization_id: callerProfile.organization_id,
        employee_id: callerProfile.id, // verified caller — never from the request
        work_date: workDate,
        check_in: nowUtc.toISOString(),
        status: checkInStatus(nowUtc),
      })
      .select(ATTENDANCE_COLUMNS)
      .single();
    if (error) throw error;
    return { record: data };
  } catch (error) {
    if (isUniqueViolation(error)) return { conflict: "already_checked_in" };
    throw error;
  }
}

export async function checkOutEmployee(callerProfile, nowUtc = new Date()) {
  const admin = createAdminClient();
  const workDate = karachiDateString(nowUtc);

  const { data: row, error: fetchError } = await admin
    .from("attendance")
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", callerProfile.organization_id)
    .eq("employee_id", callerProfile.id)
    .eq("work_date", workDate)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (!row) return { conflict: "no_check_in" };
  if (row.check_out) return { conflict: "already_checked_out" };
  if (nowUtc.getTime() <= new Date(row.check_in).getTime()) {
    return { conflict: "invalid_time" };
  }

  const { data: updated, error: updateError } = await admin
    .from("attendance")
    .update({
      check_out: nowUtc.toISOString(),
      status: finalStatus(new Date(row.check_in), nowUtc),
    })
    .eq("id", row.id)
    .select(ATTENDANCE_COLUMNS)
    .single();
  if (updateError) throw updateError;
  return { record: updated };
}

// --- HR/Admin correction (audited) ----------------------------------------------

// Applies already-validated Date objects. Never deletes rows; the audit log
// keeps the before/after trail (audit_logs table, Admin-visible in Phase 9).
export async function correctAttendance(
  callerProfile,
  attendanceId,
  { checkIn, checkOut }
) {
  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("attendance")
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", callerProfile.organization_id) // org isolation
    .eq("id", attendanceId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!row) return { notFound: true };

  const beforeStatus = row.status;

  const after = {
    check_in: checkIn.toISOString(),
    check_out: checkOut ? checkOut.toISOString() : null,
    status: checkOut ? finalStatus(checkIn, checkOut) : checkInStatus(checkIn),
  };

  const { data: updated, error: updateError } = await admin
    .from("attendance")
    .update(after)
    .eq("id", row.id)
    .select(ATTENDANCE_COLUMNS)
    .single();
  if (updateError) throw updateError;

  const auditWarning = await recordAudit({
    organizationId: callerProfile.organization_id,
    actorId: callerProfile.id,
    action: "attendance.corrected",
    entity: "attendance",
    entityId: row.id,
    details: {
      changed_fields: ["check_in", "check_out"],
      before_status: beforeStatus,
      after_status: after.status,
    },
  });
  const notificationWarning = await sendNotification({
    organizationId: callerProfile.organization_id,
    userIds: [row.employee_id],
    title: "Attendance record updated",
    body: "Your attendance record was corrected by HR.",
    dedupeKey: `attendance:${row.id}:corrected:${after.check_in}:${after.check_out ?? "open"}`,
  });

  return { record: updated, auditWarning, notificationWarning };
}
