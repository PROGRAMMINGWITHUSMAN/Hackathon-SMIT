// ---------------------------------------------------------------------------
// Attendance INTEGRATION tests — real Supabase database, real constraints,
// simulated Monday clock. TEST-ONLY.
//
// How the clock works: the server functions in src/lib/attendance.js accept
// `nowUtc` as an explicit parameter (the HTTP routes always pass new Date();
// clients can never influence it — check-in/out bodies are ignored entirely).
// These tests call the SAME server functions directly with fixed instants
// for Monday 2026-10-26 (Asia/Karachi). The database, the UNIQUE constraint,
// and all business logic are completely real — nothing is mocked.
//
// Data ownership: a dedicated disposable test employee is created in setup()
// and deleted in teardown (profiles/attendance cascade). Real users and
// their records are never touched.
//
// Requires: .env.local with Supabase keys (loaded by the npm test script).
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkInEmployee,
  checkOutEmployee,
  getAttendanceHistory,
  getOrgDayView,
} from "@/lib/attendance";
import {
  karachiDateString,
  isWorkingDay,
  workedMinutes,
} from "../src/lib/attendance-rules.mjs";

const KARACHI_OFFSET_MS = 5 * 3600 * 1000;
// Karachi wall time → UTC instant (the simulated clock).
const pk = (date, time) =>
  new Date(new Date(`${date}T${time}Z`).getTime() - KARACHI_OFFSET_MS);

const TEST_EMAIL = "e2e.monday.hcm@example.com";
const TEST_PASSWORD = "E2E-Monday-1234";

let admin;
let testProfile;

test.before(async () => {
  admin = createAdminClient();

  // Self-clean: if a previous failed run left the test user behind, remove
  // it first so this suite is always repeatable.
  const { data: existing } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const leftover = (existing?.users ?? []).find((u) => u.email === TEST_EMAIL);
  if (leftover) {
    await admin.auth.admin.deleteUser(leftover.id);
  }

  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .limit(1);
  const orgId = org[0].id;

  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error("setup createUser failed: " + error.message);

  await admin.from("profiles").insert({
    id: data.user.id,
    organization_id: orgId,
    full_name: "E2E Monday Test",
    role: "employee",
    joined_at: "2026-10-01",
  });

  testProfile = { id: data.user.id, organization_id: orgId };
});

test.after(async () => {
  if (!testProfile) return;
  // Deleting the Auth user cascades profiles and attendance rows.
  const { error } = await admin.auth.admin.deleteUser(testProfile.id);
  if (error) throw new Error("teardown failed: " + error.message);
  const { count } = await admin
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", testProfile.id);
  assert.equal(count, 0, "test attendance rows should cascade-delete");
});

test("simulated clock: Monday 09:00 PKT lands on the Monday work date", () => {
  assert.equal(karachiDateString(pk("2026-10-26", "09:00:00")), "2026-10-26");
});

test("Monday is a working day with the org's REAL holiday table", async () => {
  const { data: holidays } = await admin
    .from("holidays")
    .select("holiday_date")
    .eq("organization_id", testProfile.organization_id);
  const dates = (holidays ?? []).map((h) => h.holiday_date);
  assert.equal(
    dates.includes("2026-10-26"),
    false,
    "precondition: no holiday configured for Monday (if this fails, a real holiday was added — adjust the simulated date)"
  );
  assert.equal(isWorkingDay("2026-10-26", dates), true);
});

test("check-out without check-in is rejected (before any check-in exists)", async () => {
  const result = await checkOutEmployee(testProfile, pk("2026-10-28", "17:00:00"));
  assert.equal(result.conflict, "no_check_in");
});

test("Monday 09:00 PKT check-in creates exactly ONE record with status present", async () => {
  const result = await checkInEmployee(testProfile, pk("2026-10-26", "09:00:00"));
  assert.ok(result.record, "expected a created record");
  assert.equal(result.record.work_date, "2026-10-26");
  assert.equal(result.record.status, "present");
  // Compare instants (not strings): Postgres renders timestamptz as +00:00.
  assert.equal(
    new Date(result.record.check_in).getTime(),
    pk("2026-10-26", "09:00:00").getTime()
  );

  const { count } = await admin
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", testProfile.id)
    .eq("work_date", "2026-10-26");
  assert.equal(count, 1);
});

test("duplicate Monday check-in is rejected BY THE DATABASE (no second record)", async () => {
  const result = await checkInEmployee(testProfile, pk("2026-10-26", "10:00:00"));
  assert.equal(result.conflict, "already_checked_in");
  const { count } = await admin
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", testProfile.id)
    .eq("work_date", "2026-10-26");
  assert.equal(count, 1, "no second record may exist");
});

test("Monday checkout records the timestamp and a correct 8h30m duration", async () => {
  const result = await checkOutEmployee(testProfile, pk("2026-10-26", "17:30:00"));
  assert.ok(result.record);
  assert.equal(
    new Date(result.record.check_out).getTime(),
    pk("2026-10-26", "17:30:00").getTime()
  );
  assert.equal(result.record.status, "present");
  assert.equal(
    Math.round(workedMinutes(new Date(result.record.check_in), new Date(result.record.check_out))),
    510
  );
});

test("duplicate Monday checkout is rejected", async () => {
  const result = await checkOutEmployee(testProfile, pk("2026-10-26", "18:00:00"));
  assert.equal(result.conflict, "already_checked_out");
});

test("Tuesday 09:20 PKT check-in derives Late (integration)", async () => {
  const inResult = await checkInEmployee(testProfile, pk("2026-10-27", "09:20:00"));
  assert.equal(inResult.record.status, "late");
  const outResult = await checkOutEmployee(testProfile, pk("2026-10-27", "18:20:00"));
  assert.equal(outResult.record.status, "late", "9h worked keeps the late status");
});

test("Thursday 09:05→12:00 (2h55m) derives Half-day (integration)", async () => {
  await checkInEmployee(testProfile, pk("2026-10-29", "09:05:00"));
  const out = await checkOutEmployee(testProfile, pk("2026-10-29", "12:00:00"));
  assert.equal(out.record.status, "half_day");
});

test("past open day (Fri 2026-10-23, check-in only) → missing checkout, NO fabricated duration", async () => {
  await checkInEmployee(testProfile, pk("2026-10-23", "09:00:00"));
  const history = await getAttendanceHistory(
    testProfile.organization_id,
    testProfile.id,
    "2026-10-23",
    "2026-10-23"
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].effective_status, "missing_checkout");
  assert.equal(history[0].worked_minutes, null, "duration must be null, never invented");
});

test("employee history reflects every simulated record consistently", async () => {
  const history = await getAttendanceHistory(
    testProfile.organization_id,
    testProfile.id,
    "2026-10-20",
    "2026-10-31"
  );
  const byDate = Object.fromEntries(history.map((h) => [h.work_date, h]));
  assert.equal(byDate["2026-10-26"].effective_status, "present");
  assert.equal(byDate["2026-10-26"].worked_minutes, 510);
  assert.equal(byDate["2026-10-27"].effective_status, "late");
  assert.equal(byDate["2026-10-29"].effective_status, "half_day");
});

test("HR/Admin summary (getOrgDayView) reflects the same Monday record", async () => {
  const view = await getOrgDayView(
    testProfile.organization_id,
    "2026-10-26",
    pk("2026-10-26", "18:00:00") // Monday evening — day complete
  );
  const mine = view.records.find((r) => r.employee.id === testProfile.id);
  assert.ok(mine, "test employee appears in the org view");
  assert.equal(mine.effective_status, "present");
  assert.equal(mine.worked_minutes, 510);
  assert.ok(view.summary.present >= 1);
});
