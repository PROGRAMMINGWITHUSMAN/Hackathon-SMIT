// ---------------------------------------------------------------------------
// Leave INTEGRATION tests — real Supabase database, disposable test
// accounts (an employee and an HR reviewer), everything cleaned up after.
// Business logic is the REAL lib (src/lib/leave.js); no mocks. Dates use
// fixed November 2026 weeks (Mon 2026-11-02 .. Fri 2026-11-06 etc.).
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  submitLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  getEmployeeLeaveView,
  getOrgLeaveView,
} from "@/lib/leave";
import { getOrgDayView } from "@/lib/attendance";

let admin;
let orgId;
let employee; // { id, organization_id, full_name, role: "employee" }
let hr; // { id, organization_id, full_name, role: "hr" }

async function makeAccount(email, fullName, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "E2E-Leave-1234",
    email_confirm: true,
  });
  if (error) throw new Error("setup: " + error.message);
  await admin.from("profiles").insert({
    id: data.user.id,
    organization_id: orgId,
    full_name: fullName,
    role,
    joined_at: "2026-01-01",
  });
  return { id: data.user.id, organization_id: orgId, full_name: fullName, role };
}

test.before(async () => {
  admin = createAdminClient();

  // Self-clean any leftovers from failed runs.
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of existing?.users ?? []) {
    if (u.email.startsWith("e2e.leave")) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  orgId = (await admin.from("organizations").select("id").limit(1)).data[0].id;
  employee = await makeAccount("e2e.leave.emp.hcm@example.com", "E2E Leave Test Employee", "employee");
  hr = await makeAccount("e2e.leave.hr.hcm@example.com", "E2E Leave Test HR", "hr");
});

test.after(async () => {
  // Remove test notifications/audit noise that references the real admin
  // (submit notifies all reviewers), then the accounts (cascades requests).
  await admin.from("notifications").delete().like("body", "%E2E Leave Test%");
  const auditRows = await admin
    .from("audit_logs")
    .select("id, details")
    .eq("organization_id", orgId)
    .eq("entity", "leave_requests");
  const testIds = new Set([employee.id, hr.id]);
  const mine = (auditRows.data ?? []).filter(
    (row) => testIds.has(row.details?.employee_id) || testIds.has(row.details?.actor_id)
  );
  if (mine.length > 0) {
    await admin.from("audit_logs").delete().in("id", mine.map((r) => r.id));
  }
  await admin.auth.admin.deleteUser(employee.id);
  await admin.auth.admin.deleteUser(hr.id);
});

test("valid Mon–Fri request is stored as pending with 5 working days", async () => {
  const result = await submitLeaveRequest(employee, {
    leave_type: "annual",
    start_date: "2026-11-02",
    end_date: "2026-11-06",
    reason: "family trip",
  });
  assert.ok(result.request, JSON.stringify(result));
  assert.equal(result.days, 5);
  assert.equal(result.request.status, "pending");
  assert.equal(result.request.employee_id, employee.id);

  const { count } = await admin
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("id", result.request.id);
  assert.equal(count, 1, "stored in the real database");
});

test("reviewer notification was created for the pending request", async () => {
  const { data } = await admin
    .from("notifications")
    .select("user_id, title")
    .like("body", "%E2E Leave Test Employee%")
    .eq("title", "New leave request");
  assert.ok((data ?? []).some((n) => n.user_id === hr.id), "HR notified");
});

test("employee sees own request; org view (HR) sees it too with names", async () => {
  const own = await getEmployeeLeaveView(employee);
  assert.equal(own.requests.length, 1);
  assert.equal(own.requests[0].employee_name, "E2E Leave Test Employee");

  const orgView = await getOrgLeaveView(hr, {});
  const found = orgView.requests.find((r) => r.employee_id === employee.id);
  assert.ok(found, "HR can see the employee's request");
  assert.equal(orgView.pendingCount, 1);
});

test("pending request RESERVES balance (14 → 9 annual days)", async () => {
  const view = await getEmployeeLeaveView(employee);
  assert.equal(view.balances.annual.used, 5);
  assert.equal(view.balances.annual.remaining, 9);
});

test("overlapping request is rejected (422) while the first is pending", async () => {
  const result = await submitLeaveRequest(employee, {
    leave_type: "sick",
    start_date: "2026-11-06", // overlaps Fri of the pending annual week
    end_date: "2026-11-10",
  });
  assert.ok(result.validationErrors.end_date, JSON.stringify(result));
});

test("invalid inputs are rejected: reversed range, bad type, weekend-only", async () => {
  const reversed = await submitLeaveRequest(employee, {
    leave_type: "casual", start_date: "2026-11-10", end_date: "2026-11-02",
  });
  assert.ok(reversed.validationErrors.end_date);

  const badType = await submitLeaveRequest(employee, {
    leave_type: "sabbatical", start_date: "2026-11-16", end_date: "2026-11-17",
  });
  assert.ok(badType.validationErrors.leave_type);

  const weekendOnly = await submitLeaveRequest(employee, {
    leave_type: "casual", start_date: "2026-11-07", end_date: "2026-11-08",
  });
  assert.ok(weekendOnly.validationErrors.start_date);
});

test("insufficient balance is rejected; unpaid has no cap", async () => {
  // casual has 10 days; ask for 11 working days (Mon 16 Nov – Mon 30 Nov).
  const over = await submitLeaveRequest(employee, {
    leave_type: "casual", start_date: "2026-11-16", end_date: "2026-11-30",
  });
  assert.ok(over.validationErrors.leave_type, JSON.stringify(over));

  // unpaid is never balance-rejected (whole month, fine).
  const unpaid = await submitLeaveRequest(employee, {
    leave_type: "unpaid", start_date: "2026-11-16", end_date: "2026-11-30",
  });
  assert.ok(unpaid.request, JSON.stringify(unpaid));
});

test("employee cannot approve their own request", async () => {
  const pending = (await getEmployeeLeaveView(employee)).requests[0];
  const result = await reviewLeaveRequest({ ...employee, role: "admin" }, pending.id, "approved");
  assert.equal(result.forbidden !== undefined, true);
});

test("HR CAN approve; audit + notification written; balance consumed", async () => {
  const pending = (await getEmployeeLeaveView(employee)).requests.find(
    (r) => r.leave_type === "annual"
  );
  const result = await reviewLeaveRequest(hr, pending.id, "approved", "enjoy");
  assert.equal(result.request.status, "approved");
  assert.equal(result.request.decided_by, hr.id);
  assert.ok(result.request.decided_at);

  const audit = await admin
    .from("audit_logs")
    .select("action, details")
    .eq("entity_id", pending.id)
    .order("created_at", { ascending: false })
    .limit(1);
  assert.equal(audit.data[0].action, "leave.approved");
  assert.equal(audit.data[0].details.before.status, "pending");
  assert.equal(audit.data[0].details.after.status, "approved");
  assert.equal(audit.data[0].details.comment, "enjoy");

  const notified = await admin
    .from("notifications")
    .select("title")
    .eq("user_id", employee.id)
    .eq("title", "Leave approved");
  assert.equal(notified.data.length, 1, "employee notified");

  const view = await getEmployeeLeaveView(employee);
  assert.equal(view.balances.annual.remaining, 9, "approved still consumes");
});

test("double approval is rejected (invalid transition)", async () => {
  const approved = (await getEmployeeLeaveView(employee)).requests.find(
    (r) => r.leave_type === "annual"
  );
  const again = await reviewLeaveRequest(hr, approved.id, "approved");
  assert.ok(again.conflict);
});

test("approved leave shows On leave in the HR attendance day view (not Absent)", async () => {
  const view = await getOrgDayView(orgId, "2026-11-04", new Date("2026-11-09T10:00:00Z"));
  const mine = view.records.find((r) => r.employee.id === employee.id);
  assert.equal(mine.effective_status, "on_leave");
});

test("pending/rejected leave does NOT suppress absence", async () => {
  // Friday 2026-10-23 (past working day): employee has a PENDING request —
  // must still derive absent.
  const pendingFri = await submitLeaveRequest(employee, {
    leave_type: "sick", start_date: "2026-10-23", end_date: "2026-10-23",
  });
  assert.ok(pendingFri.request);
  let view = await getOrgDayView(orgId, "2026-10-23", new Date("2026-10-26T05:00:00Z"));
  let mine = view.records.find((r) => r.employee.id === employee.id);
  assert.equal(mine.effective_status, "absent", "pending must not count as leave");

  await reviewLeaveRequest(hr, pendingFri.request.id, "rejected", "");
  view = await getOrgDayView(orgId, "2026-10-23", new Date("2026-10-26T05:00:00Z"));
  mine = view.records.find((r) => r.employee.id === employee.id);
  assert.equal(mine.effective_status, "absent", "rejected must not count as leave");
});

test("rejected request releases its reservation; balance is restored", async () => {
  // unpaid request from earlier is still pending — reject it and confirm the
  // (unlimited) flow, then verify annual stayed at 9 (approved week only).
  const unpaid = (await getEmployeeLeaveView(employee)).requests.find(
    (r) => r.leave_type === "unpaid" && r.status === "pending"
  );
  await reviewLeaveRequest(hr, unpaid.id, "rejected", "");
  const view = await getEmployeeLeaveView(employee);
  assert.equal(view.balances.annual.remaining, 9);
  assert.equal(view.balances.unpaid.used, 0, "rejected unpaid releases");
});

test("employee can cancel own PENDING request; cancelled releases balance", async () => {
  const req = await submitLeaveRequest(employee, {
    leave_type: "sick", start_date: "2026-12-07", end_date: "2026-12-08",
  });
  const cancelled = await cancelLeaveRequest(employee, req.request.id);
  assert.equal(cancelled.request.status, "cancelled");

  const again = await cancelLeaveRequest(employee, req.request.id);
  assert.ok(again.conflict, "cancelling twice is rejected");

  const view = await getEmployeeLeaveView(employee);
  assert.equal(view.balances.sick.remaining, 8, "cancelled releases reservation");
});

test("employee cannot cancel another employee's request; HR can cancel pending", async () => {
  const req = await submitLeaveRequest(employee, {
    leave_type: "casual", start_date: "2026-12-14", end_date: "2026-12-15",
  });
  // A different EMPLOYEE (not owner, not a reviewer) must be forbidden.
  const stranger = {
    id: "00000000-0000-0000-0000-000000000000",
    organization_id: orgId,
    full_name: "Stranger",
    role: "employee",
  };
  const forbidden = await cancelLeaveRequest(stranger, req.request.id);
  assert.ok(forbidden.forbidden, JSON.stringify(forbidden));

  const byHr = await cancelLeaveRequest(hr, req.request.id);
  assert.equal(byHr.request.status, "cancelled");
});

test("concurrent overlapping submissions: exactly ONE survives (race compensation)", async () => {
  const [a, b] = await Promise.all([
    submitLeaveRequest(employee, {
      leave_type: "annual", start_date: "2027-01-11", end_date: "2027-01-15",
    }),
    submitLeaveRequest(employee, {
      leave_type: "annual", start_date: "2027-01-13", end_date: "2027-01-19",
    }),
  ]);
  const successes = [a, b].filter((r) => r.request).length;
  const failures = [a, b].filter((r) => r.validationErrors).length;
  assert.equal(successes, 1, "exactly one overlapping request may survive");
  assert.equal(failures, 1, "the loser is compensated (its row deleted)");

  const { count } = await admin
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employee.id)
    .eq("leave_type", "annual")
    .gte("start_date", "2027-01-11")
    .lte("end_date", "2027-01-19");
  assert.equal(count, 1);
});

test("unauthenticated endpoints return 401 (HTTP level, live)", async () => {
  const base = "http://localhost:3000";
  const endpoints = [
    [`${base}/api/leave-types`, {}],
    [`${base}/api/leaves`, {}],
    [`${base}/api/leaves/00000000-0000-0000-0000-000000000000/approve`, { method: "POST" }],
    [`${base}/api/leaves/00000000-0000-0000-0000-000000000000/reject`, { method: "POST" }],
    [`${base}/api/leaves/00000000-0000-0000-0000-000000000000/cancel`, { method: "POST" }],
    [`${base}/api/leaves`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leave_type: "annual", start_date: "2026-11-02", end_date: "2026-11-06" }) }],
  ];
  for (const [url, opts] of endpoints) {
    const response = await fetch(url, opts);
    assert.equal(response.status, 401, `${url} must be 401 unauthenticated`);
  }
});
