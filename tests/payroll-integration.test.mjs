// ---------------------------------------------------------------------------
// Payroll INTEGRATION tests — real Supabase database, disposable accounts
// (salaried employee, unsalaried employee, HR, Admin), cleaned up after.
// Uses the REAL lib functions; nothing mocked.
//
// The org is SHARED with real data (the owner creates real runs!), so test
// periods are chosen DYNAMICALLY: we scan back from the current Karachi
// month and use months that have no payroll run yet. Expected unpaid-day
// counts are derived with the pure rules module, never hardcoded.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPayrollRun,
  getRunDetail,
  getOwnPayslips,
  recalculatePayrollRun,
  transitionPayrollRun,
  listPayrollRuns,
} from "@/lib/payroll";
import { submitLeaveRequest, reviewLeaveRequest } from "@/lib/leave";
import {
  round2,
  periodBounds,
  periodLabel,
  unpaidDaysInPeriod,
} from "../src/lib/payroll-rules.mjs";
import { karachiDateString } from "../src/lib/attendance-rules.mjs";

const PASSWORD = "E2E-PR-1234";

let admin;
let orgId;
let salaried; // active employee, basic 80,000
let unsalaried; // active employee, no salary
let hr;
let adminUser;

// { year, month } objects picked in test.before; e.g. PRIMARY for the main
// flow, ISOLATION for month-isolation, CONCURRENCY for the CAS race.
const PERIODS = {};

// First Monday of a month as a Date (UTC midnight).
function firstMonday(year, month) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
const dayStr = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * 86400000);

async function makeAccount(email, fullName, role, extra = {}) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error("setup: " + error.message);
  await admin.from("profiles").insert({
    id: data.user.id,
    organization_id: orgId,
    full_name: fullName,
    role,
    joined_at: "2026-01-01",
    ...extra,
  });
  return { id: data.user.id, organization_id: orgId, full_name: fullName, role };
}

test.before(async () => {
  admin = createAdminClient();

  // Self-clean leftovers from failed runs.
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of existing?.users ?? []) {
    if (u.email.startsWith("e2e.pr.")) await admin.auth.admin.deleteUser(u.id);
  }

  orgId = (await admin.from("organizations").select("id").limit(1)).data[0].id;
  salaried = await makeAccount("e2e.pr.emp.hcm@example.com", "E2E PR Salaried", "employee", { basic_salary: 80000 });
  unsalaried = await makeAccount("e2e.pr.nosal.hcm@example.com", "E2E PR Unsalaried", "employee");
  hr = await makeAccount("e2e.pr.hr.hcm@example.com", "E2E PR HR", "hr");
  adminUser = await makeAccount("e2e.pr.admin.hcm@example.com", "E2E PR Admin", "admin");

  // Pick three FREE months (current or past, no existing run), newest first.
  const today = karachiDateString(new Date());
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const taken = new Set();
  for (let i = 0; i < 18 && Object.keys(PERIODS).length < 3; i += 1) {
    const { data: run } = await admin
      .from("payroll_runs")
      .select("id")
      .eq("organization_id", orgId)
      .eq("period_year", y)
      .eq("period_month", m)
      .maybeSingle();
    if (!run && !taken.has(`${y}-${m}`)) {
      taken.add(`${y}-${m}`);
      const slot = ["PRIMARY", "ISOLATION", "CONCURRENCY"][Object.keys(PERIODS).length];
      PERIODS[slot] = { year: y, month: m };
    }
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  if (Object.keys(PERIODS).length < 3) throw new Error("not enough free months for the fixture");
});

// Leave plan inside the PRIMARY month, anchored to its first Monday:
//   approved unpaid Mon → Sat (5 working days; weekend skipped by the rules)
//   pending unpaid two weeks later (must never count)
function primaryLeavePlan() {
  const monday = firstMonday(PERIODS.PRIMARY.year, PERIODS.PRIMARY.month);
  return {
    approved: { start_date: dayStr(monday), end_date: dayStr(plusDays(monday, 5)) },
    pending: { start_date: dayStr(plusDays(monday, 14)), end_date: dayStr(plusDays(monday, 15)) },
  };
}

test.after(async () => {
  // Remove ONLY test-created payroll rows (created_by is one of ours).
  const ours = new Set([salaried.id, unsalaried.id, hr.id, adminUser.id]);
  const { data: runs } = await admin.from("payroll_runs").select("id, created_by");
  for (const run of runs ?? []) {
    if (ours.has(run.created_by)) {
      await admin.from("payroll_runs").delete().eq("id", run.id); // cascades payslips
    }
  }
  await admin.from("notifications").delete().like("body", "%E2E PR%");
  await admin.from("leave_requests").delete().eq("employee_id", salaried.id);
  await admin.auth.admin.deleteUser(salaried.id);
  await admin.auth.admin.deleteUser(unsalaried.id);
  await admin.auth.admin.deleteUser(hr.id);
  await admin.auth.admin.deleteUser(adminUser.id);
});

const findRun = async (slot) => {
  const runs = await listPayrollRuns(hr);
  const p = PERIODS[slot];
  return runs.find((r) => r.period_year === p.year && r.period_month === p.month);
};

test("future period is rejected (422 path); malformed period rejected", async () => {
  const future = await createPayrollRun(hr, { year: 2030, month: 1 });
  assert.ok(future.validationErrors, JSON.stringify(future));
  const malformed = await createPayrollRun(hr, { year: 2026, month: 13 });
  assert.ok(malformed.badRequest);
});

test("HR creates the PRIMARY draft: correct formulas + unpaid deduction", async () => {
  const plan = primaryLeavePlan();
  const approvedLeave = await submitLeaveRequest(salaried, {
    leave_type: "unpaid",
    start_date: plan.approved.start_date,
    end_date: plan.approved.end_date,
  });
  assert.ok(approvedLeave.request, JSON.stringify(approvedLeave));
  await reviewLeaveRequest(hr, approvedLeave.request.id, "approved", "");

  const pendingLeave = await submitLeaveRequest(salaried, {
    leave_type: "unpaid",
    start_date: plan.pending.start_date,
    end_date: plan.pending.end_date,
  });
  assert.ok(pendingLeave.request);

  const result = await createPayrollRun(hr, PERIODS.PRIMARY);
  assert.ok(result.run, JSON.stringify(result));
  assert.equal(result.run.status, "draft");
  assert.equal(result.run.created_by, hr.id);

  const detail = await getRunDetail(hr, result.run.id);
  const slip = detail.payslips.find((s) => s.employee_id === salaried.id);
  assert.ok(slip, "salaried employee has a payslip");

  // Formulas: basic 80,000 → HRA 32,000, medical 8,000, gross 120,000.
  assert.equal(Number(slip.basic), 80000);
  assert.equal(Number(slip.hra), 32000);
  assert.equal(Number(slip.medical), 8000);
  assert.equal(Number(slip.gross), 120000);

  // Unpaid days: approved leave only, weekends excluded — expected value is
  // DERIVED with the pure rules (never hardcoded), then matched on the slip.
  const period = periodBounds(PERIODS.PRIMARY.year, PERIODS.PRIMARY.month);
  const expectedDays = unpaidDaysInPeriod(
    [{ status: "approved", leave_type: "unpaid", ...plan.approved }],
    period
  );
  assert.ok(expectedDays >= 4, "fixture sanity: at least 4 working unpaid days");
  assert.equal(slip.unpaid_leave_days, expectedDays);
  assert.equal(Number(slip.deduction), round2((80000 / 26) * expectedDays));
  assert.equal(Number(slip.net_pay), round2(120000 - (80000 / 26) * expectedDays));

  assert.ok(detail.totals.employees >= 1);

  const skipped = detail.skipped.find((s) => s.name === "E2E PR Unsalaried");
  assert.ok(skipped, "unsalaried employee is reported");
  assert.ok(skipped.reason.includes("salary"));
});

test("duplicate run for the same period is rejected (409 path)", async () => {
  const dup = await createPayrollRun(hr, PERIODS.PRIMARY);
  assert.ok(dup.conflict, JSON.stringify(dup));
});

test("draft payslips are NOT visible to the employee yet", async () => {
  const slips = await getOwnPayslips(salaried);
  assert.equal(slips.length, 0);
});

test("HR cannot finalize; Admin can (CAS); employee sees payslip after finalize", async () => {
  const run = await findRun("PRIMARY");

  const byHr = await transitionPayrollRun(hr, run.id, "finalize");
  assert.ok(byHr.forbidden, "lib-level admin-only enforcement");

  const byAdmin = await transitionPayrollRun(adminUser, run.id, "finalize");
  assert.equal(byAdmin.run.status, "finalized");
  assert.equal(byAdmin.run.finalized_by, adminUser.id);

  const slips = await getOwnPayslips(salaried);
  assert.equal(slips.length, 1);
  assert.equal(slips[0].period_label, periodLabel(PERIODS.PRIMARY.year, PERIODS.PRIMARY.month));
});

test("finalize twice / recalc after finalize are rejected", async () => {
  const run = await findRun("PRIMARY");
  const again = await transitionPayrollRun(adminUser, run.id, "finalize");
  assert.ok(again.conflict);
  const recalc = await recalculatePayrollRun(hr, run.id);
  assert.ok(recalc.conflict);
});

test("draft recalculation picks up data changes with month isolation", async () => {
  // Approve the previously-pending leave, then build the ISOLATION month:
  // PRIMARY leave must not affect it.
  const pending = await admin
    .from("leave_requests")
    .select("id")
    .eq("employee_id", salaried.id)
    .eq("status", "pending")
    .maybeSingle();
  await reviewLeaveRequest(hr, pending.data.id, "approved", "");

  const iso = await createPayrollRun(hr, PERIODS.ISOLATION);
  assert.ok(iso.run);
  const recalc = await recalculatePayrollRun(hr, iso.run.id);
  assert.ok(recalc.run, JSON.stringify(recalc));
  const detail = await getRunDetail(hr, iso.run.id);
  const slip = detail.payslips.find((s) => s.employee_id === salaried.id);
  assert.equal(slip.unpaid_leave_days, 0, "PRIMARY-month leave must not touch the ISOLATION month");
  assert.equal(Number(slip.net_pay), 120000);
});

test("lock flow: finalized → locked (Admin); locked rejects everything", async () => {
  const run = await findRun("PRIMARY");
  const locked = await transitionPayrollRun(adminUser, run.id, "lock");
  assert.equal(locked.run.status, "locked");

  const refinalize = await transitionPayrollRun(adminUser, run.id, "finalize");
  assert.ok(refinalize.conflict);
  const relock = await transitionPayrollRun(adminUser, run.id, "lock");
  assert.ok(relock.conflict);

  const slips = await getOwnPayslips(salaried);
  assert.equal(slips.length, 1, "employee still sees the locked payslip");
});

test("concurrent finalization: exactly one succeeds (CAS)", async () => {
  const conc = await createPayrollRun(hr, PERIODS.CONCURRENCY);
  assert.ok(conc.run);
  const [a, b] = await Promise.all([
    transitionPayrollRun(adminUser, conc.run.id, "finalize"),
    transitionPayrollRun(adminUser, conc.run.id, "finalize"),
  ]);
  assert.equal([a, b].filter((r) => r.run).length, 1);
  assert.equal([a, b].filter((r) => r.conflict).length, 1);
});

test("unauthenticated payroll endpoints return 401 (live HTTP)", async () => {
  const base = "http://localhost:3000";
  const endpoints = [
    [`${base}/api/payroll/runs`, {}],
    [`${base}/api/payroll/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: 2026, month: 1 }) }],
    [`${base}/api/payroll/runs/00000000-0000-0000-0000-000000000000`, {}],
    [`${base}/api/payroll/runs/00000000-0000-0000-0000-000000000000/finalize`, { method: "POST" }],
    [`${base}/api/payroll/runs/00000000-0000-0000-0000-000000000000/lock`, { method: "POST" }],
    [`${base}/api/payroll/runs/00000000-0000-0000-0000-000000000000/recalculate`, { method: "POST" }],
    [`${base}/api/payroll/payslips`, {}],
  ];
  for (const [url, opts] of endpoints) {
    const response = await fetch(url, opts);
    assert.equal(response.status, 401, `${url} must be 401`);
  }
});
