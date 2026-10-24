// Payroll business-rule unit tests — Node built-in runner, no database.
import test from "node:test";
import assert from "node:assert/strict";

import {
  round2,
  isValidPeriod,
  periodBounds,
  isFuturePeriod,
  periodLabel,
  computePayslip,
  unpaidDaysInPeriod,
} from "../src/lib/payroll-rules.mjs";

test("payslip math: HRA 40%, medical 10%, gross = 1.5 × basic and sums exactly", () => {
  const slip = computePayslip(80000, 0);
  assert.equal(slip.basic, 80000);
  assert.equal(slip.hra, 32000);
  assert.equal(slip.medical, 8000);
  assert.equal(slip.gross, 120000); // 1.5 × basic
  assert.equal(slip.basic + slip.hra + slip.medical, slip.gross);
  assert.equal(slip.deduction, 0);
  assert.equal(slip.net_pay, 120000);
});

test("payslip math: rounding keeps components summing to gross", () => {
  const slip = computePayslip(33333.33, 0);
  assert.equal(slip.hra, round2(33333.33 * 0.4));
  assert.equal(slip.medical, round2(33333.33 * 0.1));
  assert.equal(slip.gross, round2(slip.basic + slip.hra + slip.medical));
});

test("deduction = basic / 26 × unpaid days (rounded to 2dp)", () => {
  // 80000 / 26 × 3 = 9230.769… → 9230.77
  const slip = computePayslip(80000, 3);
  assert.equal(slip.deduction, 9230.77);
  assert.equal(slip.net_pay, round2(120000 - 9230.77));
});

test("period bounds and labels", () => {
  assert.deepEqual(periodBounds(2026, 11), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(periodBounds(2028, 2), { start: "2028-02-01", end: "2028-02-29" }); // leap year
  assert.equal(periodLabel(2026, 11), "November 2026");
  assert.equal(isValidPeriod(2026, 11), true);
  assert.equal(isValidPeriod(2026, 13), false);
  assert.equal(isValidPeriod(2019, 5), false);
});

test("future periods are rejected, current and past are allowed", () => {
  assert.equal(isFuturePeriod(2026, 12, "2026-11-25"), true);
  assert.equal(isFuturePeriod(2027, 1, "2026-11-25"), true);
  assert.equal(isFuturePeriod(2026, 11, "2026-11-25"), false);
  assert.equal(isFuturePeriod(2026, 10, "2026-11-25"), false);
});

// November 2026: Mon 2, Tue 3, … Fri 6; weekend 7–8.
test("unpaid days: only APPROVED UNPAID leave counts, intersected with the month", () => {
  const period = periodBounds(2026, 11);
  const requests = [
    { status: "approved", leave_type: "unpaid", start_date: "2026-11-02", end_date: "2026-11-04" }, // 3 days
    { status: "pending", leave_type: "unpaid", start_date: "2026-11-05", end_date: "2026-11-06" }, // ignored
    { status: "approved", leave_type: "annual", start_date: "2026-11-05", end_date: "2026-11-06" }, // ignored
    { status: "approved", leave_type: "unpaid", start_date: "2026-10-29", end_date: "2026-11-03" }, // Nov part: 2–3 → 2 days
  ];
  assert.equal(unpaidDaysInPeriod(requests, period), 5);
});

test("unpaid days: weekends and holidays inside the leave are not charged", () => {
  const period = periodBounds(2026, 11);
  const requests = [
    // Fri 6 → Mon 9: Fri and Mon charged, Sat/Sun not.
    { status: "approved", leave_type: "unpaid", start_date: "2026-11-06", end_date: "2026-11-09" },
  ];
  assert.equal(unpaidDaysInPeriod(requests, period), 2);
  assert.equal(
    unpaidDaysInPeriod(
      [{ status: "approved", leave_type: "unpaid", start_date: "2026-11-05", end_date: "2026-11-06" }],
      period,
      ["2026-11-05", "2026-11-06"]
    ),
    0,
    "holidays excluded via the org holiday table"
  );
});
