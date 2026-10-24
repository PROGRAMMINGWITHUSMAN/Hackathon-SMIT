// Dashboard analytics-rule unit tests — Node built-in runner.
import test from "node:test";
import assert from "node:assert/strict";

import {
  recentDates,
  attendanceTrend,
  departmentCounts,
  leaveMix,
  attendanceSummary,
} from "../src/lib/analytics-rules.mjs";

test("recentDates: oldest-first, excludes today, correct length", () => {
  const dates = recentDates("2026-10-25", 3);
  assert.deepEqual(dates, ["2026-10-22", "2026-10-23", "2026-10-24"]);
});

test("trend: stored statuses, missing checkout, on-leave and absent derivation", () => {
  // Employees: A (joined 2026-01-01), B (joined 2026-01-01), C (joined AFTER the window)
  const activeEmployees = [
    { id: "A", joined_at: "2026-01-01" },
    { id: "B", joined_at: "2026-01-01" },
    { id: "C", joined_at: "2026-10-24" },
  ];
  const trend = attendanceTrend({
    dates: ["2026-10-23"], // a Friday (working day)
    rows: [
      { work_date: "2026-10-23", check_in: "x", check_out: "y", status: "present" }, // A
      { work_date: "2026-10-23", check_in: "x", check_out: null, status: "late" },  // B — open day
    ],
    activeEmployees,
    leaves: [{ employee_id: "B", start_date: "2026-10-20", end_date: "2026-10-30" }],
  });
  const day = trend[0];
  assert.equal(day.present, 1);
  assert.equal(day.missing_checkout, 1, "open check-in counts as missing checkout, not late");
  assert.equal(day.on_leave, 1);
  // Expected = A + B (C joined later) = 2; recorded = 2 → absent 0 — BUT B is
  // both recorded AND on leave; the formula counts recorded first, so absent 0.
  assert.equal(day.absent, 0);
});

test("trend: absent = expected − recorded − on_leave", () => {
  const trend = attendanceTrend({
    dates: ["2026-10-23"],
    rows: [
      { work_date: "2026-10-23", check_in: "x", check_out: "y", status: "present" },
    ],
    activeEmployees: [
      { id: "A", joined_at: null },
      { id: "B", joined_at: "2026-01-01" },
      { id: "C", joined_at: "2026-01-01" },
    ],
    leaves: [{ employee_id: "C", start_date: "2026-10-23", end_date: "2026-10-23" }],
  });
  assert.equal(trend[0].absent, 1); // B only
});

test("trend: non-working days show statuses but derive no absent", () => {
  const trend = attendanceTrend({
    dates: ["2026-10-25"], // Sunday
    rows: [],
    activeEmployees: [{ id: "A", joined_at: null }],
    leaves: [],
  });
  assert.equal(trend[0].absent, 0, "weekends never derive absence");
});

test("department distribution: counts, shares, unassigned grouping, sort", () => {
  const dist = departmentCounts([
    { department: "Engineering" },
    { department: "Engineering" },
    { department: " Sales " },
    { department: null },
  ]);
  assert.equal(dist[0].label, "Engineering");
  assert.equal(dist[0].count, 2);
  assert.equal(dist[0].share, 50);
  assert.ok(dist.find((d) => d.label === "Unassigned"));
  assert.equal(dist.reduce((s, d) => s + d.count, 0), 4);
});

test("leave mix: counts by type × status with totals", () => {
  const mix = leaveMix([
    { leave_type: "annual", status: "approved" },
    { leave_type: "annual", status: "pending" },
    { leave_type: "sick", status: "approved" },
  ]);
  assert.equal(mix.annual.total, 2);
  assert.equal(mix.annual.approved, 1);
  assert.equal(mix.sick.total, 1);
  assert.equal(mix.unpaid, undefined);
});

test("employee attendance summary counts derived statuses", () => {
  const summary = attendanceSummary([
    { effective_status: "present" },
    { effective_status: "present" },
    { effective_status: "late" },
    { effective_status: "missing_checkout" },
    { effective_status: "on_leave" },
    { effective_status: "absent" }, // not tracked in own history (never stored)
  ]);
  assert.equal(summary.present, 2);
  assert.equal(summary.late, 1);
  assert.equal(summary.missing_checkout, 1);
  assert.equal(summary.recorded_days, 6);
});
