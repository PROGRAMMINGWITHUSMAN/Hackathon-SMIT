// Leave business-rule unit tests — Node built-in runner, no database.
import test from "node:test";
import assert from "node:assert/strict";

import {
  countWorkingDays,
  rangesOverlap,
  computeBalances,
  validateLeaveInput,
} from "../src/lib/leave-rules.mjs";

const TYPES = [
  { code: "annual", name: "Annual Leave", annual_allowance: 14, is_unlimited: false },
  { code: "sick", name: "Sick Leave", annual_allowance: 8, is_unlimited: false },
  { code: "casual", name: "Casual Leave", annual_allowance: 10, is_unlimited: false },
  { code: "unpaid", name: "Unpaid Leave", annual_allowance: 0, is_unlimited: true },
];

// 2026-10-26..30 = Mon..Fri (all working); 2026-10-31/11-01 = Sat/Sun.

test("working days: a Mon–Fri week counts 5 inclusive days", () => {
  assert.equal(countWorkingDays("2026-10-26", "2026-10-30"), 5);
});

test("working days: weekends are never charged", () => {
  assert.equal(countWorkingDays("2026-10-31", "2026-11-01"), 0); // Sat+Sun
  assert.equal(countWorkingDays("2026-10-30", "2026-11-02"), 2); // Fri + Mon
});

test("working days: holidays are not charged", () => {
  assert.equal(countWorkingDays("2026-10-26", "2026-10-28", ["2026-10-27"]), 2);
});

test("working days: reversed or invalid ranges return null", () => {
  assert.equal(countWorkingDays("2026-10-30", "2026-10-26"), null);
  assert.equal(countWorkingDays("oops", "2026-10-30"), null);
});

test("overlap detection is inclusive on both ends", () => {
  assert.equal(rangesOverlap("2026-10-26", "2026-10-28", "2026-10-28", "2026-10-30"), true);
  assert.equal(rangesOverlap("2026-10-26", "2026-10-27", "2026-10-28", "2026-10-30"), false);
});

test("balances: pending RESERVES, rejected/cancelled RELEASE", () => {
  const mk = (status, start, end) => ({
    leave_type: "annual", status, start_date: start, end_date: end,
  });
  const balances = computeBalances({
    types: TYPES,
    year: "2026",
    requests: [
      mk("pending", "2026-10-26", "2026-10-27"), // 2 days reserved
      mk("approved", "2026-11-02", "2026-11-04"), // 3 days consumed
      mk("rejected", "2026-11-09", "2026-11-13"), // released
      mk("cancelled", "2026-11-16", "2026-11-17"), // released
    ],
  });
  assert.equal(balances.annual.used, 5);
  assert.equal(balances.annual.remaining, 9);
});

test("balances: other years do not consume this year's allowance", () => {
  const balances = computeBalances({
    types: TYPES,
    year: "2026",
    requests: [
      { leave_type: "annual", status: "approved", start_date: "2025-12-29", end_date: "2025-12-31" },
    ],
  });
  assert.equal(balances.annual.remaining, 14);
});

test("balances: unpaid is unlimited (remaining null, never exceeded)", () => {
  const balances = computeBalances({
    types: TYPES,
    year: "2026",
    requests: [
      { leave_type: "unpaid", status: "approved", start_date: "2026-10-26", "end_date": "2026-11-13" },
    ],
  });
  assert.equal(balances.unpaid.unlimited, true);
  assert.equal(balances.unpaid.remaining, null);
});

test("validation: valid Mon–Fri request passes with days=5", () => {
  const { values, errors } = validateLeaveInput({
    leave_type: "annual", start_date: "2026-10-26", end_date: "2026-10-30", reason: " trip ",
  }, { types: TYPES, existingRequests: [] });
  assert.equal(errors, undefined);
  assert.equal(values.days, 5);
  assert.equal(values.reason, "trip");
});

test("validation: reversed range, bad type, bad dates, weekend-only are 422s", () => {
  const run = (body) => validateLeaveInput(body, { types: TYPES, existingRequests: [] });

  assert.ok(run({ leave_type: "annual", start_date: "2026-10-30", end_date: "2026-10-26" }).errors.end_date);
  assert.ok(run({ leave_type: "vacation", start_date: "2026-10-26", end_date: "2026-10-27" }).errors.leave_type);
  assert.ok(run({ leave_type: "annual", start_date: "nope", end_date: "2026-10-27" }).errors.start_date);
  assert.ok(run({ leave_type: "annual", start_date: "2026-10-31", end_date: "2026-11-01" }).errors.start_date);
});

test("validation: overlap with own pending/approved request is rejected; rejected does not block", () => {
  const base = { types: TYPES, holidayDates: [] };
  const existing = (status) => [
    { leave_type: "sick", status, start_date: "2026-11-02", end_date: "2026-11-04" },
  ];
  assert.ok(validateLeaveInput(
    { leave_type: "annual", start_date: "2026-11-04", end_date: "2026-11-06" },
    { ...base, existingRequests: existing("pending") }
  ).errors.end_date);
  assert.ok(validateLeaveInput(
    { leave_type: "annual", start_date: "2026-11-04", end_date: "2026-11-06" },
    { ...base, existingRequests: existing("rejected") }
  ).errors === undefined);
});

test("validation: insufficient balance is rejected with the remaining amount", () => {
  // Oct 26 – Nov 10 2026 = 12 working days used of 14 → 2 left.
  const requests = [
    { leave_type: "annual", status: "approved", start_date: "2026-10-26", end_date: "2026-11-10" },
  ];
  const tooMany = validateLeaveInput(
    { leave_type: "annual", start_date: "2026-11-16", end_date: "2026-11-20" }, // 5 days
    { types: TYPES, existingRequests: requests }
  );
  assert.match(tooMany.errors.leave_type, /Insufficient Annual Leave balance: 2 day/);

  const fits = validateLeaveInput(
    { leave_type: "annual", start_date: "2026-11-16", end_date: "2026-11-17" }, // 2 days
    { types: TYPES, existingRequests: requests }
  );
  assert.equal(fits.errors, undefined);
});

test("validation: unpaid never fails on balance, even for a whole year", () => {
  const result = validateLeaveInput(
    { leave_type: "unpaid", start_date: "2026-01-01", end_date: "2026-12-31" },
    { types: TYPES, existingRequests: [] }
  );
  assert.equal(result.errors, undefined);
  assert.ok(result.values.days > 200);
});
