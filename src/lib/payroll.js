import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listEmployeeProfiles } from "@/lib/employees";
import { karachiDateString } from "@/lib/attendance-rules.mjs";
import {
  isValidPeriod,
  periodBounds,
  isFuturePeriod,
  periodLabel,
  computePayslip,
  unpaidDaysInPeriod,
} from "@/lib/payroll-rules.mjs";
import { isUniqueViolation } from "@/lib/attendance-rules.mjs";
import { isUuid } from "@/lib/employees";
import { recordAudit, sendNotification } from "@/lib/communications";

// ---------------------------------------------------------------------------
// Payroll data layer — SERVER ONLY. Callers verified via requireApiUser().
//
// Status model (schema payroll_runs):
//   draft     → created by HR/Admin; payslips recomputable; NOT visible to
//               employees
//   finalized → Admin-approved (CAS); no further edits; visible to employees
//   locked    → Admin-locked (CAS); immutable forever
//
// Eligibility for a payslip: status active AND basic_salary set AND (no
// join date OR joined on/before the period end). Everyone else is reported
// in `skipped` with a reason so HR sees exactly what a run excludes.
// ---------------------------------------------------------------------------

const RUN_COLUMNS =
  "id, organization_id, period_year, period_month, status, created_by, finalized_by, finalized_at, created_at";
const SLIP_COLUMNS =
  "id, payroll_run_id, employee_id, basic, hra, medical, gross, unpaid_leave_days, deduction, net_pay, created_at";

function totalsFor(slips) {
  const totals = { employees: slips.length, gross: 0, deduction: 0, net: 0 };
  for (const s of slips) {
    totals.gross += Number(s.gross);
    totals.deduction += Number(s.deduction);
    totals.net += Number(s.net_pay);
  }
  totals.gross = Math.round(totals.gross * 100) / 100;
  totals.deduction = Math.round(totals.deduction * 100) / 100;
  totals.net = Math.round(totals.net * 100) / 100;
  return totals;
}

async function getHolidayDates(admin, orgId) {
  const { data, error } = await admin
    .from("holidays")
    .select("holiday_date")
    .eq("organization_id", orgId);
  if (error) throw error;
  return (data ?? []).map((h) => h.holiday_date);
}

// Approved unpaid leave per employee overlapping the period.
async function getUnpaidLeaves(admin, orgId, period) {
  const { data, error } = await admin
    .from("leave_requests")
    .select("employee_id, leave_type, status, start_date, end_date")
    .eq("organization_id", orgId)
    .eq("leave_type", "unpaid")
    .eq("status", "approved")
    .lte("start_date", period.end)
    .gte("end_date", period.start);
  if (error) throw error;

  const byEmployee = new Map();
  for (const row of data ?? []) {
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, []);
    byEmployee.get(row.employee_id).push(row);
  }
  return byEmployee;
}

// Compute the payslip set for a period (also used to derive `skipped`).
async function computePayslipRows(admin, orgId, year, month) {
  const period = periodBounds(year, month);
  const [employees, holidayDates, unpaidByEmployee] = await Promise.all([
    listEmployeeProfiles(orgId),
    getHolidayDates(admin, orgId),
    getUnpaidLeaves(admin, orgId, period),
  ]);

  const rows = [];
  const skipped = [];
  for (const employee of employees) {
    if (employee.status !== "active") {
      skipped.push({ id: employee.id, name: employee.full_name, reason: "inactive" });
      continue;
    }
    if (employee.basic_salary == null) {
      skipped.push({ id: employee.id, name: employee.full_name, reason: "no salary set" });
      continue;
    }
    if (employee.joined_at != null && employee.joined_at > period.end) {
      skipped.push({ id: employee.id, name: employee.full_name, reason: "joined after the period" });
      continue;
    }
    const unpaidDays = unpaidDaysInPeriod(
      unpaidByEmployee.get(employee.id) ?? [],
      period,
      holidayDates
    );
    rows.push({
      employee_id: employee.id,
      employee_name: employee.full_name,
      ...computePayslip(Number(employee.basic_salary), unpaidDays),
    });
  }
  return { rows, skipped };
}

// --- Reads -------------------------------------------------------------------

export async function listPayrollRuns(callerProfile) {
  const admin = createAdminClient();
  const { data: runs, error } = await admin
    .from("payroll_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", callerProfile.organization_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });
  if (error) throw error;

  // Totals per run (small row counts; one fetch keeps this simple).
  const { data: slips, error: slipError } = await admin
    .from("payslips")
    .select("payroll_run_id, gross, deduction, net_pay");
  if (slipError) throw slipError;
  const byRun = new Map();
  for (const s of slips ?? []) {
    if (!byRun.has(s.payroll_run_id)) byRun.set(s.payroll_run_id, []);
    byRun.get(s.payroll_run_id).push(s);
  }

  return (runs ?? []).map((run) => ({
    ...run,
    label: periodLabel(run.period_year, run.period_month),
    totals: totalsFor(byRun.get(run.id) ?? []),
  }));
}

export async function getRunDetail(callerProfile, runId) {
  if (!isUuid(runId)) return { badRequest: true };
  const admin = createAdminClient();

  const { data: run, error } = await admin
    .from("payroll_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", callerProfile.organization_id)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!run) return { notFound: true };

  const { data: slips, error: slipError } = await admin
    .from("payslips")
    .select(SLIP_COLUMNS)
    .eq("payroll_run_id", run.id);
  if (slipError) throw slipError;

  // Skipped list is deterministic — recompute it so reviews always reflect
  // the current roster reality (the payslip figures themselves are frozen
  // snapshots from creation/recalculation time).
  const { skipped } = await computePayslipRows(
    admin,
    callerProfile.organization_id,
    run.period_year,
    run.period_month
  );

  const employees = await listEmployeeProfiles(callerProfile.organization_id);
  const nameById = new Map(employees.map((e) => [e.id, e.full_name]));

  return {
    run: {
      ...run,
      label: periodLabel(run.period_year, run.period_month),
    },
    payslips: (slips ?? []).map((s) => ({
      ...s,
      employee_name: nameById.get(s.employee_id) ?? null,
    })),
    totals: totalsFor(slips ?? []),
    skipped,
  };
}

// Employee's OWN payslips — only from finalized or locked runs.
export async function getOwnPayslips(callerProfile) {
  const admin = createAdminClient();
  const { data: runs, error: runError } = await admin
    .from("payroll_runs")
    .select("id, period_year, period_month, status, finalized_at")
    .eq("organization_id", callerProfile.organization_id)
    .in("status", ["finalized", "locked"]);
  if (runError) throw runError;
  const runById = new Map((runs ?? []).map((r) => [r.id, r]));

  const { data: slips, error } = await admin
    .from("payslips")
    .select(SLIP_COLUMNS)
    .eq("employee_id", callerProfile.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (slips ?? [])
    .filter((s) => runById.has(s.payroll_run_id))
    .map((s) => {
      const run = runById.get(s.payroll_run_id);
      return {
        ...s,
        period_label: periodLabel(run.period_year, run.period_month),
        run_status: run.status,
      };
    });
}

// --- Draft creation --------------------------------------------------------

export async function createPayrollRun(callerProfile, { year, month }, nowUtc = new Date()) {
  if (!isValidPeriod(year, month)) return { badRequest: "Invalid period (year 2020–2100, month 1–12)." };
  if (isFuturePeriod(year, month, karachiDateString(nowUtc))) {
    return { validationErrors: { period: "Payroll cannot be created for a future month." } };
  }

  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;

  // Fast duplicate check (friendly error); the DB UNIQUE constraint also
  // guards concurrent creation.
  const { data: existing } = await admin
    .from("payroll_runs")
    .select("id")
    .eq("organization_id", orgId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();
  if (existing) {
    return { conflict: `A payroll run for ${periodLabel(year, month)} already exists.` };
  }

  const { rows, skipped } = await computePayslipRows(admin, orgId, year, month);

  const { data: run, error: runError } = await admin
    .from("payroll_runs")
    .insert({
      organization_id: orgId,
      period_year: year,
      period_month: month,
      status: "draft",
      created_by: callerProfile.id,
    })
    .select(RUN_COLUMNS)
    .single();
  if (runError) {
    if (isUniqueViolation(runError)) {
      return { conflict: `A payroll run for ${periodLabel(year, month)} already exists.` };
    }
    throw runError;
  }

  if (rows.length > 0) {
    const { error: slipError } = await admin
      .from("payslips")
      .insert(rows.map(({ employee_name, ...slip }) => ({ ...slip, payroll_run_id: run.id })));
    if (slipError) {
      // Compensation: never leave a run without its payslips.
      await admin.from("payroll_runs").delete().eq("id", run.id);
      throw slipError;
    }
  }

  const auditWarning = await recordAudit({
    organizationId: orgId,
    actorId: callerProfile.id,
    action: "payroll.draft_created",
    entity: "payroll_runs",
    entityId: run.id,
    details: { period: `${year}-${String(month).padStart(2, "0")}`, employee_count: rows.length },
  });
  return {
    run: { ...run, label: periodLabel(year, month) },
    totals: totalsFor(rows),
    skipped,
    auditWarning,
  };
}

// --- Recalculate (draft only) ------------------------------------------------

export async function recalculatePayrollRun(callerProfile, runId) {
  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;

  const { data: run } = await admin
    .from("payroll_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { notFound: true };
  if (run.status !== "draft") {
    return { conflict: `Only draft payroll can be recalculated (this run is ${run.status}).` };
  }

  // CAS guard: freeze the run against a concurrent finalize before we
  // delete/recreate payslips.
  const { count } = await admin
    .from("payroll_runs")
    .update({ status: "draft" }, { count: "exact" })
    .eq("id", runId)
    .eq("status", "draft");
  if (!count) {
    return { conflict: "This run was finalized while recalculating." };
  }

  const { rows, skipped } = await computePayslipRows(admin, orgId, run.period_year, run.period_month);
  await admin.from("payslips").delete().eq("payroll_run_id", runId);
  if (rows.length > 0) {
    const { error } = await admin
      .from("payslips")
      .insert(rows.map(({ employee_name, ...slip }) => ({ ...slip, payroll_run_id: runId })));
    if (error) throw error;
  }
  const auditWarning = await recordAudit({
    organizationId: orgId,
    actorId: callerProfile.id,
    action: "payroll.draft_recalculated",
    entity: "payroll_runs",
    entityId: runId,
    details: { period: `${run.period_year}-${String(run.period_month).padStart(2, "0")}` },
  });
  return { run, totals: totalsFor(rows), skipped, auditWarning };
}

// --- Finalize / lock (Admin only, compare-and-swap) ---------------------------

const TRANSITIONS = {
  finalize: { from: "draft", to: "finalized" },
  lock: { from: "finalized", to: "locked" },
};

export async function transitionPayrollRun(callerProfile, runId, action) {
  const transition = TRANSITIONS[action];
  if (!transition) return { badRequest: "Unknown action." };

  // Defense in depth: the HTTP routes already require the admin role, but
  // the lib enforces it too so no caller can ever bypass it.
  if (callerProfile.role !== "admin") {
    return { forbidden: "Only an Admin can finalize or lock payroll." };
  }

  const admin = createAdminClient();
  const { data: run } = await admin
    .from("payroll_runs")
    .select(RUN_COLUMNS)
    .eq("organization_id", callerProfile.organization_id)
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { notFound: true };
  if (run.status !== transition.from) {
    return {
      conflict: `This run is ${run.status} — ${action} requires ${transition.from}.`,
    };
  }

  const patch =
    action === "finalize"
      ? { status: "finalized", finalized_by: callerProfile.id, finalized_at: new Date().toISOString() }
      : { status: "locked" };

  const { data: updated, error } = await admin
    .from("payroll_runs")
    .update(patch)
    .eq("id", runId)
    .eq("status", transition.from) // CAS — concurrent finalize loses here
    .select(RUN_COLUMNS);
  if (error) throw error;
  if (!updated || updated.length === 0) {
    return { conflict: `This run was already ${transition.from === "draft" ? "finalized" : "processed"}.` };
  }

  const changedRun = updated[0];
  const period = `${run.period_year}-${String(run.period_month).padStart(2, "0")}`;
  const auditWarning = await recordAudit({
    organizationId: callerProfile.organization_id,
    actorId: callerProfile.id,
    action: action === "finalize" ? "payroll.finalized" : "payroll.locked",
    entity: "payroll_runs",
    entityId: runId,
    details: { period },
  });

  let notificationWarning = null;
  if (action === "finalize") {
    const { data: slips, error: slipError } = await admin
      .from("payslips")
      .select("employee_id")
      .eq("payroll_run_id", runId);
    if (slipError) {
      console.error("Payroll finalization recipients could not be loaded:", slipError.message);
      notificationWarning = "Payroll was finalized, but employee notifications could not be delivered.";
    } else {
      notificationWarning = await sendNotification({
        organizationId: callerProfile.organization_id,
        userIds: (slips ?? []).map((slip) => slip.employee_id),
        title: "Payslip available",
        body: `Your payroll for ${period} has been finalized.`,
        dedupeKey: `payroll:${runId}:finalized`,
      });
    }
  }
  return { run: changedRun, auditWarning, notificationWarning };
}
