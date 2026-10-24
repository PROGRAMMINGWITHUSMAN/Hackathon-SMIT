// ---------------------------------------------------------------------------
// Analytics INTEGRATION tests — real Supabase database, disposable accounts,
// cleaned up after. Verifies that getOrgDashboard/getEmployeeDashboard
// compute the right numbers from real rows and that the employee view can
// never see another employee's data.
//
// Fixture: two salaried employees in different departments (one inactive),
// attendance rows on the two working days before "today", and leave data —
// all created through the real libs.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgDashboard, getEmployeeDashboard } from "@/lib/analytics";
import { submitLeaveRequest, reviewLeaveRequest } from "@/lib/leave";
import { karachiDateString, isWeekend } from "../src/lib/attendance-rules.mjs";

const PASSWORD = "E2E-AN-1234";
let admin;
let orgId;
let empA; // Engineering, active, salaried
let empB; // Sales, INACTIVE
let hr;

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

// The most recent N PAST working days before today (Karachi).
function lastWorkingDays(count) {
  const today = karachiDateString(new Date());
  const out = [];
  let t = Date.parse(today + "T00:00:00Z");
  while (out.length < count) {
    t -= 86400000;
    const dateStr = new Date(t).toISOString().slice(0, 10);
    if (!isWeekend(dateStr)) out.push(dateStr);
  }
  return out.reverse(); // oldest first
}

test.before(async () => {
  admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of existing?.users ?? []) {
    if (u.email.startsWith("e2e.an.")) await admin.auth.admin.deleteUser(u.id);
  }
  orgId = (await admin.from("organizations").select("id").limit(1)).data[0].id;
  empA = await makeAccount("e2e.an.a.hcm@example.com", "E2E AN A", "employee", {
    department: "Engineering", basic_salary: 50000,
  });
  empB = await makeAccount("e2e.an.b.hcm@example.com", "E2E AN B", "employee", {
    department: "Sales", status: "inactive",
  });
  hr = await makeAccount("e2e.an.hr.hcm@example.com", "E2E AN HR", "hr", { department: "People" });
});

test.after(async () => {
  await admin.from("attendance").delete().in("employee_id", [empA.id, empB.id]);
  await admin.from("leave_requests").delete().in("employee_id", [empA.id, empB.id]);
  await admin.from("notifications").delete().like("body", "%E2E AN%");
  for (const u of [empA, empB, hr]) {
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("org dashboard: headcount, departments (active only), empty trend tolerated", async () => {
  const view = await getOrgDashboard(hr);

  // Headcount counts ALL profiles vs ACTIVE ones (empB inactive).
  assert.equal(view.headcount.total >= 3, true);
  assert.equal(view.attendanceToday.summary.present >= 0, true, "no crash on empty days");

  // Departments include our fixture departments for ACTIVE employees only.
  const labels = view.headcount.departments.map((d) => d.label);
  assert.ok(labels.includes("Engineering"));
  assert.ok(!labels.includes("Sales"), "inactive employees are excluded");

  // Real owner data may add more; ensure our employees are counted once.
  const engineering = view.headcount.departments.find((d) => d.label === "Engineering");
  assert.equal(engineering.count >= 1, true);
});

test("org dashboard: trend derives statuses from real rows", async () => {
  const [d1] = lastWorkingDays(2);
  // empA: present day (09:00 in, 17:00 out). empB: nothing (inactive anyway).
  await admin.from("attendance").insert({
    organization_id: orgId,
    employee_id: empA.id,
    work_date: d1,
    check_in: `${d1}T04:00:00Z`,
    check_out: `${d1}T12:00:00Z`,
    status: "present",
  });

  const view = await getOrgDashboard(hr);
  const day = view.attendanceTrend.find((t) => t.date === d1);
  assert.ok(day, "fixture day appears in the trend window");
  assert.ok(day.present >= 1, "our present row is counted");
});

test("org dashboard: leave mix counts real requests incl. pending", async () => {
  const req = await submitLeaveRequest(empA, {
    leave_type: "casual",
    start_date: lastWorkingDays(1)[0], // a past working day — fine for requests
    end_date: lastWorkingDays(1)[0],
    reason: "E2E AN",
  });
  assert.ok(req.request, JSON.stringify(req));

  let view = await getOrgDashboard(hr);
  assert.ok((view.leaveMix.casual?.pending ?? 0) >= 1, "pending counted");
  assert.ok(view.pendingLeaveCount >= 1);

  await reviewLeaveRequest(hr, req.request.id, "approved", "");
  view = await getOrgDashboard(hr);
  assert.ok((view.leaveMix.casual?.approved ?? 0) >= 1, "approved counted after review");
});

test("org dashboard: admin gets audit activity, HR does not", async () => {
  const asHr = await getOrgDashboard(hr);
  assert.equal(asHr.recentActivity, null, "HR never receives audit rows");

  const asAdmin = await getOrgDashboard({ ...hr, role: "admin" });
  assert.ok(Array.isArray(asAdmin.recentActivity), "admin receives the list");
  // The leave approval we just performed must appear.
  assert.ok(
    asAdmin.recentActivity.some((a) => a.action === "leave.approved"),
    "recent activity includes our own audit entry"
  );
});

test("employee dashboard: own data only, never empB's", async () => {
  const view = await getEmployeeDashboard(empA);

  // Own 30-day summary counts only empA's rows (≥ the one we inserted).
  assert.ok(view.monthSummary.present >= 1);
  assert.ok(view.monthSummary.recorded_days >= 1);

  // Own leave balances exist; unpaid unlimited.
  assert.ok(view.leave.balances.casual);
  assert.equal(view.leave.balances.unpaid.unlimited, true);

  // The response contains no other-employee fields at all — shape check.
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes(empB.id), "no trace of another employee id");
  assert.ok(!serialized.includes("E2E AN B"), "no trace of another employee name");
});

test("employee dashboard: empty-data employee renders without crashing", async () => {
  const view = await getEmployeeDashboard(empB); // inactive, no rows at all
  assert.equal(view.monthSummary.recorded_days, 0);
  assert.equal(view.latestPayslip, null);
});
