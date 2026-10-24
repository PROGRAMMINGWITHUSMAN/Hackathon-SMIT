// Attendance business-rule tests — Node's built-in test runner, no
// dependencies. Run with: npm test
// All times are injected deterministically; nothing touches the database.
//
// Helper: pk("2026-10-23", "09:15:00") builds the UTC instant that equals
// that Karachi wall-clock time (Karachi = UTC+5, no DST).

import test from "node:test";
import assert from "node:assert/strict";

import {
  KARACHI_OFFSET_MS,
  karachiDateString,
  karachiSecondsOfDay,
  isWeekend,
  isWorkingDay,
  hasDayEnded,
  checkInStatus,
  workedMinutes,
  finalStatus,
  effectiveStatus,
  validateCorrectionTimes,
  isUniqueViolation,
} from "../src/lib/attendance-rules.mjs";

const pk = (date, time) =>
  new Date(new Date(`${date}T${time}Z`).getTime() - KARACHI_OFFSET_MS);

// 2026-10-23 is a Friday (working), 2026-10-25 is a Sunday.

test("timezone conversion: UTC evening is the next Karachi date", () => {
  assert.equal(karachiDateString(new Date("2026-10-24T20:00:00Z")), "2026-10-25");
  assert.equal(karachiDateString(new Date("2026-10-24T18:59:59Z")), "2026-10-24");
  assert.equal(karachiSecondsOfDay(pk("2026-10-23", "09:00:30")), 9 * 3600 + 30);
});

test("weekends: Sunday and Saturday are non-working by default", () => {
  assert.equal(isWeekend("2026-10-25"), true); // Sunday
  assert.equal(isWeekend("2026-10-24"), true); // Saturday
  assert.equal(isWeekend("2026-10-23"), false); // Friday
});

test("holidays are respected in isWorkingDay", () => {
  assert.equal(isWorkingDay("2026-10-23", ["2026-10-23"]), false);
  assert.equal(isWorkingDay("2026-10-22", ["2026-10-23"]), true);
});

test("late rule: 09:00 check-in is Present", () => {
  assert.equal(checkInStatus(pk("2026-10-23", "09:00:00")), "present");
});

test("late rule: exactly 09:15:00 is still Present (strictly after = Late)", () => {
  assert.equal(checkInStatus(pk("2026-10-23", "09:15:00")), "present");
  assert.equal(checkInStatus(pk("2026-10-23", "09:15:01")), "late");
  assert.equal(checkInStatus(pk("2026-10-23", "12:00:00")), "late");
});

test("duration: computed from real timestamps", () => {
  assert.equal(
    workedMinutes(pk("2026-10-23", "09:00:00"), pk("2026-10-23", "17:30:00")),
    510
  );
});

test("half-day: under 5 worked hours beats Late (documented precedence)", () => {
  // Arrived late AND worked under 5 hours → half_day, not late.
  assert.equal(
    finalStatus(pk("2026-10-23", "09:20:00"), pk("2026-10-23", "12:00:00")),
    "half_day"
  );
});

test("half-day boundary: exactly 5 hours is a full day", () => {
  assert.equal(
    finalStatus(pk("2026-10-23", "09:00:00"), pk("2026-10-23", "14:00:00")),
    "present"
  );
  assert.equal(
    finalStatus(pk("2026-10-23", "09:00:00"), pk("2026-10-23", "13:59:59")),
    "half_day"
  );
});

test("completed full days keep their check-in status", () => {
  assert.equal(
    finalStatus(pk("2026-10-23", "09:20:00"), pk("2026-10-23", "18:20:00")),
    "late"
  );
  assert.equal(
    finalStatus(pk("2026-10-23", "09:00:00"), pk("2026-10-23", "18:00:00")),
    "present"
  );
});

test("invalid checkout (before check-in) yields null, never a fabricated status", () => {
  assert.equal(
    finalStatus(pk("2026-10-23", "10:00:00"), pk("2026-10-23", "09:00:00")),
    null
  );
});

test("missing checkout: after the day ends the status is missing_checkout", () => {
  const record = {
    work_date: "2026-10-23",
    check_in: pk("2026-10-23", "09:00:00").toISOString(),
    check_out: null,
  };
  const status = effectiveStatus({
    record,
    workDate: "2026-10-23",
    nowUtc: new Date("2026-10-24T10:00:00Z"),
    workingDay: true,
  });
  assert.equal(status, "missing_checkout");
});

test("missing checkout: same day before checkout is in-progress, not missing", () => {
  const record = {
    work_date: "2026-10-23",
    check_in: pk("2026-10-23", "09:20:00").toISOString(),
    check_out: null,
  };
  const status = effectiveStatus({
    record,
    workDate: "2026-10-23",
    nowUtc: pk("2026-10-23", "13:00:00"),
    workingDay: true,
  });
  assert.equal(status, "late"); // checked in, day not over yet
});

test("absent: only for a PAST working day without approved leave or record", () => {
  const base = { record: null, workDate: "2026-10-23", workingDay: true };

  assert.equal(
    effectiveStatus({ ...base, nowUtc: new Date("2026-10-24T05:00:00Z") }),
    "absent"
  );
  // Future/today: never absent yet.
  assert.equal(
    effectiveStatus({ ...base, nowUtc: pk("2026-10-23", "12:00:00") }),
    "no_record"
  );
  // Weekend: never absent.
  assert.equal(
    effectiveStatus({
      ...base,
      workDate: "2026-10-25",
      workingDay: false,
      nowUtc: new Date("2026-10-26T05:00:00Z"),
    }),
    "non_working"
  );
  // Approved leave: not absent.
  assert.equal(
    effectiveStatus({
      ...base,
      nowUtc: new Date("2026-10-24T05:00:00Z"),
      onApprovedLeave: true,
    }),
    "on_leave"
  );
  // Before join date: not absent.
  assert.equal(
    effectiveStatus({
      ...base,
      nowUtc: new Date("2026-10-24T05:00:00Z"),
      absentEligible: false,
    }),
    "not_joined"
  );
});

test("day-ended detection follows the Karachi calendar", () => {
  assert.equal(hasDayEnded("2026-10-23", new Date("2026-10-24T01:00:00Z")), true);
  assert.equal(hasDayEnded("2026-10-23", pk("2026-10-23", "23:59:59")), false);
});

test("correction validation rejects invalid and out-of-order times", () => {
  const bad = validateCorrectionTimes("not-a-date", "2026-10-23T05:00:00Z");
  assert.ok(bad.errors.check_in);

  const ordered = validateCorrectionTimes(
    "2026-10-23T04:00:00Z", // 09:00 PKT
    "2026-10-23T03:00:00Z" // 08:00 PKT — before check-in
  );
  assert.ok(ordered.errors.check_out);

  const ok = validateCorrectionTimes(
    "2026-10-23T04:00:00Z",
    "2026-10-23T12:30:00Z"
  );
  assert.ok(ok.values.checkIn instanceof Date);
  assert.ok(ok.values.checkOut instanceof Date);

  const noCheckout = validateCorrectionTimes("2026-10-23T04:00:00Z", null);
  assert.equal(noCheckout.values.checkOut, null);
});

test("duplicate check-in mapping: PostgreSQL 23505 is recognized", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ code: "42P16" }), false);
  assert.equal(isUniqueViolation(null), false);
});

// --- Simulated-Monday unit tests (2026-10-26 Asia/Karachi) -------------------
// The pk() helper above builds instants from Karachi wall time; Monday is
// chosen because the rules must treat it as an ordinary working day.

test("MONDAY 2026-10-26 is a working day (no holiday passed)", () => {
  assert.equal(new Date("2026-10-26T00:00:00Z").getUTCDay(), 1); // it IS Monday
  assert.equal(isWeekend("2026-10-26"), false);
  assert.equal(isWorkingDay("2026-10-26", []), true);
  // A holiday on that date WOULD make it non-working (rule not weakened).
  assert.equal(isWorkingDay("2026-10-26", ["2026-10-26"]), false);
});

test("MONDAY check-in at 09:00 PKT is Present", () => {
  assert.equal(checkInStatus(pk("2026-10-26", "09:00:00")), "present");
});

test("MONDAY check-in at exactly 09:15:00 PKT is still Present", () => {
  assert.equal(checkInStatus(pk("2026-10-26", "09:15:00")), "present");
});

test("MONDAY check-in after 09:15 PKT is Late", () => {
  assert.equal(checkInStatus(pk("2026-10-26", "09:15:01")), "late");
  assert.equal(checkInStatus(pk("2026-10-26", "10:30:00")), "late");
});

test("MONDAY full day: 09:00→17:30 is Present with 510 worked minutes", () => {
  const inUtc = pk("2026-10-26", "09:00:00");
  const outUtc = pk("2026-10-26", "17:30:00");
  assert.equal(workedMinutes(inUtc, outUtc), 510);
  assert.equal(finalStatus(inUtc, outUtc), "present");
});
