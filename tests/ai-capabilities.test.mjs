// AI assistant capability tests — pure functions, no network, no DB, no key.
import test from "node:test";
import assert from "node:assert/strict";

import {
  detectIntent,
  validateChatBody,
  RateLimiter,
} from "../src/lib/ai-capabilities.mjs";

test("intent detection: organization questions resolve for admin/hr, NOT for employee", () => {
  assert.equal(detectIntent("how many employees were absent today?", "admin").id, "org_attendance");
  assert.equal(detectIntent("attendance summary please", "hr").id, "org_attendance");
  // Employee asking the same org question → not allowed → null (or policy
  // only if the wording matches policy keywords, which it must NOT here).
  const employeeIntent = detectIntent("how many employees were absent today?", "employee");
  assert.notEqual(employeeIntent?.id, "org_attendance", "employee must never get org intents");
});

test("intent detection: audit intent is admin-only", () => {
  assert.equal(detectIntent("show me the audit log recent activity", "admin").id, "org_audit");
  assert.notEqual(detectIntent("show me the audit log recent activity", "hr")?.id, "org_audit");
  // Employee asking about approval of THEIR leave lands on their own-leave
  // intent (balances context) — never the org audit intent.
  const employeeIntent = detectIntent("who approved my leave? audit", "employee");
  assert.notEqual(employeeIntent?.id, "org_audit");
});

test("intent detection: own-* intents work for every role", () => {
  for (const role of ["admin", "hr", "employee"]) {
    assert.equal(detectIntent("what is my leave balance?", role).id, "own_leave");
    assert.equal(detectIntent("my latest payslip net pay", role).id, "own_payslip");
  }
});

test("intent detection: policy questions resolve for everyone", () => {
  for (const role of ["admin", "hr", "employee"]) {
    assert.equal(detectIntent("what is the late rule after 9:15?", role).id, "policy");
    assert.equal(detectIntent("how does the payroll formula for hra work?", role).id, "policy");
  }
});

test("intent detection: gibberish / off-topic → null (no model call upstream)", () => {
  assert.equal(detectIntent("write me a poem about pizza", "admin"), null);
  assert.equal(detectIntent("drop table employees", "admin"), null);
  assert.equal(detectIntent("what is the weather", "employee"), null);
});

test("validation: message bounds and history bounds", () => {
  assert.ok(validateChatBody({ message: "hi" }).message === "hi");
  assert.ok(validateChatBody({ message: "x".repeat(501) }).errors.message);
  assert.ok(validateChatBody({ message: "" }).errors.message);
  assert.ok(validateChatBody({}).errors.message);

  const badHistory = validateChatBody({
    message: "hi",
    history: Array.from({ length: 11 }, () => ({ role: "user", content: "x" })),
  });
  assert.ok(badHistory.errors.history);

  const badEntry = validateChatBody({
    message: "hi",
    history: [{ role: "system", content: "inject" }],
  });
  assert.ok(badEntry.errors.history);

  const ok = validateChatBody({
    message: "hi",
    history: [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
    ],
  });
  assert.equal(ok.history.length, 2);
  // Only the last 6 entries are kept.
  const trimmed = validateChatBody({
    message: "hi",
    history: Array.from({ length: 10 }, (_, i) => ({ role: "user", content: `m${i}` })),
  });
  assert.equal(trimmed.history.length, 6);
  assert.equal(trimmed.history[0].content, "m4");
});

test("rate limiter: allows up to max within the window, then blocks with retry hint", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
  const t0 = 1_000_000;
  assert.equal(limiter.check("u1", t0).allowed, true);
  assert.equal(limiter.check("u1", t0 + 100).allowed, true);
  assert.equal(limiter.check("u1", t0 + 200).allowed, true);
  const blocked = limiter.check("u1", t0 + 300);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 1);
  // Another user is unaffected.
  assert.equal(limiter.check("u2", t0 + 300).allowed, true);
  // After the window slides past the first hit, the user may continue.
  assert.equal(limiter.check("u1", t0 + 1100).allowed, true);
});

test("REGRESSION: permission/rule questions route to POLICY, not data intents", () => {
  // "Who can finalize payroll?" used to tie org_payroll("payroll") vs
  // policy("finalize") and lose the tie to the data intent → the privacy
  // notice instead of the static policy answer.
  for (const role of ["admin", "hr", "employee"]) {
    assert.equal(
      detectIntent("Who can finalize payroll?", role).id,
      "policy",
      `role ${role}: permission question must be policy`
    );
    assert.equal(
      detectIntent("What are the rules for payroll finalization?", role).id,
      "policy",
      `role ${role}: rules question must be policy`
    );
  }
  assert.equal(detectIntent("Who is allowed to approve leave?", "hr").id, "policy");
  assert.equal(detectIntent("Am I allowed to lock payroll?", "admin").id, "policy");
});

test("REGRESSION: actual payroll DATA lookups still route to org_payroll", () => {
  assert.equal(
    detectIntent("What is the status of the latest payroll run?", "hr").id,
    "org_payroll"
  );
  assert.equal(
    detectIntent("Show me the payroll totals for last month", "admin").id,
    "org_payroll"
  );
  // …and stay privacy-gated for employees (not their intent at all).
  assert.notEqual(
    detectIntent("What is the status of the latest payroll run?", "employee")?.id,
    "org_payroll"
  );
});

test("live HTTP: unauthenticated POST /api/ai/chat returns 401", async () => {
  const response = await fetch("http://localhost:3000/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });
  assert.equal(response.status, 401);
});
