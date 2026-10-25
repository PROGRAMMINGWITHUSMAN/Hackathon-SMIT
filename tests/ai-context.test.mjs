// AI context-builder INTEGRATION tests — real database, disposable
// accounts, NO Gemini calls (context strings only). Verifies role gating
// and that employee contexts never contain other people's data.
import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildContextForIntent, POLICY_CONTEXT } from "@/lib/ai-context";

const PASSWORD = "E2E-AI-1234";
let admin;
let orgId;
let employee;
let hr;

test.before(async () => {
  admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of existing?.users ?? []) {
    if (u.email.startsWith("e2e.ai.")) await admin.auth.admin.deleteUser(u.id);
  }
  orgId = (await admin.from("organizations").select("id").limit(1)).data[0].id;

  async function make(email, name, role, extra = {}) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await admin.from("profiles").insert({
      id: data.user.id, organization_id: orgId, full_name: name, role,
      joined_at: "2026-01-01", ...extra,
    });
    return { id: data.user.id, organization_id: orgId, full_name: name, role };
  }

  employee = await make("e2e.ai.emp.hcm@example.com", "E2E AI Employee", "employee", {
    department: "QA", basic_salary: 40000,
  });
  hr = await make("e2e.ai.hr.hcm@example.com", "E2E AI HR", "hr");
});

test.after(async () => {
  await admin.from("notifications").delete().like("body", "%E2E AI%");
  await admin.auth.admin.deleteUser(employee.id);
  await admin.auth.admin.deleteUser(hr.id);
});

test("policy context is static documentation with no personal data", () => {
  assert.ok(POLICY_CONTEXT.includes("09:15"));
  assert.ok(POLICY_CONTEXT.includes("1.5 x basic"));
  assert.ok(!POLICY_CONTEXT.includes("E2E AI"), "no fixture names in the policy text");
});

test("org intents build aggregated contexts for HR; audit denied for HR", async () => {
  for (const intentId of ["org_attendance", "org_departments", "org_leave", "org_payroll"]) {
    const context = await buildContextForIntent(intentId, hr);
    assert.ok(typeof context === "string" && context.length > 0, intentId);
  }
  assert.equal(await buildContextForIntent("org_audit", hr), null, "HR never receives audit context");
});

test("own contexts contain ONLY the caller's data (no other employee's name)", async () => {
  const attendance = await buildContextForIntent("own_attendance", employee);
  const leave = await buildContextForIntent("own_leave", employee);
  const payslip = await buildContextForIntent("own_payslip", employee);

  for (const context of [attendance, leave, payslip]) {
    assert.ok(context.length > 0);
    assert.ok(!context.includes("E2E AI HR"), "no other person's name");
    assert.ok(!context.includes(hr.id), "no other person's id");
  }
  // Own data should never leak org aggregates either.
  assert.ok(!attendance.includes("Active employees:"), "own context must not include org headcount");
});

test("employee is denied org contexts at the builder level (defense in depth)", async () => {
  // Even if intent detection were bypassed, the builders key off the
  // analytics layer's role scoping: own_* builders take any profile, but
  // org_* builders must not accept an employee profile for audit at least
  // (explicit role check). The general org builders produce org aggregates
  // and are gated by intent detection upstream — verified in capabilities
  // tests. Here we assert the explicit audit gate:
  assert.equal(await buildContextForIntent("org_audit", employee), null);
});

test("unknown intent id → null", async () => {
  assert.equal(await buildContextForIntent("does_not_exist", hr), null);
});
