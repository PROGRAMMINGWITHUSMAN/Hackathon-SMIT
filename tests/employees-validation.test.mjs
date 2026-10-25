// Employee validation tests — pure validation only; no Supabase calls.
import test from "node:test";
import assert from "node:assert/strict";

import { validateEmployeeInput } from "../src/lib/employees.js";

test("employee joining date validation rejects impossible calendar dates", () => {
  const result = validateEmployeeInput(
    { joined_at: "2026-02-31" },
    { partial: true }
  );

  assert.ok(result.errors.joined_at);
});

test("employee joining date validation accepts a real leap day", () => {
  const result = validateEmployeeInput(
    { joined_at: "2024-02-29" },
    { partial: true }
  );

  assert.equal(result.values.joined_at, "2024-02-29");
});
