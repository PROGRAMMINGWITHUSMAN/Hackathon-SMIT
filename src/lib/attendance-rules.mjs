// ---------------------------------------------------------------------------
// Attendance business rules — PURE functions, no imports, no I/O.
//
// Importable from server code, client code, AND tests. Every time-dependent
// function takes time as an explicit parameter so tests can inject fixed
// moments ("deterministic time injection").
//
// TIMEZONE: Asia/Karachi = UTC+5 with no daylight saving (Pakistan abolished
// DST), so a fixed offset is exact and needs no timezone library.
//
// DOCUMENTED PRECEDENCE (see docs/BUSINESS_RULES.md):
//   1. No check-in + past working day + not on approved leave + joined
//      → absent (computed on read, never written by a GET)
//   2. Check-in without checkout, day ended → missing_checkout
//   3. Completed day, worked < 5 hours      → half_day  (beats Late)
//   4. Completed day, >= 5 hours            → late if checked in strictly
//                                            after 09:15, else present
// ---------------------------------------------------------------------------

export const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
export const OFFICE_START_SECONDS = 9 * 3600; // 09:00 PKT
export const LATE_AFTER_SECONDS = 9 * 3600 + 15 * 60; // strictly after 09:15
export const MIN_FULL_DAY_MINUTES = 5 * 60; // under 5 worked hours = half day

// --- Karachi wall-clock helpers ----------------------------------------------

export function karachiShift(dateUtc) {
  return new Date(dateUtc.getTime() + KARACHI_OFFSET_MS);
}
export function karachiUnshift(dateKarachiWallAsUtc) {
  return new Date(dateKarachiWallAsUtc.getTime() - KARACHI_OFFSET_MS);
}

// "YYYY-MM-DD" of the given instant in Karachi time.
export function karachiDateString(dateUtc) {
  return karachiShift(dateUtc).toISOString().slice(0, 10);
}

// Seconds since Karachi midnight (used for the late rule).
export function karachiSecondsOfDay(dateUtc) {
  const k = karachiShift(dateUtc);
  return k.getUTCHours() * 3600 + k.getUTCMinutes() * 60 + k.getUTCSeconds();
}

// --- Dates and working days ---------------------------------------------------

export function isValidDateString(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z"))
  );
}

// Provisional default: Saturday + Sunday are non-working (documented in
// BUSINESS_RULES.md; change here once an org workday setting exists).
export function isWeekend(dateStr) {
  const weekday = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return weekday === 0 || weekday === 6; // 0 = Sunday, 6 = Saturday
}

export function isWorkingDay(dateStr, holidayDates = []) {
  return !isWeekend(dateStr) && !holidayDates.includes(dateStr);
}

// A work date is "over" once Karachi's calendar date has moved past it.
export function hasDayEnded(dateStr, nowUtc) {
  return karachiDateString(nowUtc) > dateStr;
}

// --- Status rules ---------------------------------------------------------------

// Status at check-in time: strictly after 09:15 PKT is Late.
export function checkInStatus(atUtc) {
  return karachiSecondsOfDay(atUtc) > LATE_AFTER_SECONDS ? "late" : "present";
}

// Worked minutes from real timestamps; negative means invalid (out before in).
export function workedMinutes(checkInUtc, checkOutUtc) {
  return (checkOutUtc.getTime() - checkInUtc.getTime()) / 60000;
}

// Final status once checked out. half_day takes precedence over late
// (a 3-hour day is a half-day even if the person also arrived late).
export function finalStatus(checkInUtc, checkOutUtc) {
  const minutes = workedMinutes(checkInUtc, checkOutUtc);
  if (minutes < 0) return null; // invalid timestamps
  if (minutes < MIN_FULL_DAY_MINUTES) return "half_day";
  return checkInStatus(checkInUtc);
}

// The single source of truth for display/reporting status. Never mutates data.
//   record: attendance row (or null) — { work_date, check_in, check_out }
//   workingDay / onApprovedLeave / absentEligible: caller-provided facts
// Returns one of: present | late | half_day | missing_checkout | absent |
//                 on_leave | non_working | not_joined | no_record
export function effectiveStatus({
  record,
  workDate,
  nowUtc,
  workingDay,
  onApprovedLeave = false,
  absentEligible = true,
}) {
  if (record && record.check_in) {
    if (!record.check_out) {
      if (hasDayEnded(workDate, nowUtc)) return "missing_checkout";
      return checkInStatus(new Date(record.check_in));
    }
    const final = finalStatus(
      new Date(record.check_in),
      new Date(record.check_out)
    );
    return final ?? "present";
  }

  if (!workingDay) return "non_working";
  if (onApprovedLeave) return "on_leave";
  if (!absentEligible) return "not_joined";
  if (hasDayEnded(workDate, nowUtc)) return "absent";
  return "no_record";
}

// --- Correction validation (HR/Admin edits) -----------------------------------

// Accepts ISO strings (or null to clear a checkout). Returns
// { values: { checkIn: Date|null, checkOut: Date|null } } or { errors }.
export function validateCorrectionTimes(checkInValue, checkOutValue) {
  const errors = {};
  const values = { checkIn: null, checkOut: null };

  if (checkInValue == null || checkInValue === "") {
    errors.check_in = "Check-in time is required.";
  } else {
    const d = new Date(checkInValue);
    if (Number.isNaN(d.getTime())) errors.check_in = "Invalid timestamp.";
    else values.checkIn = d;
  }

  if (checkOutValue != null && checkOutValue !== "") {
    const d = new Date(checkOutValue);
    if (Number.isNaN(d.getTime())) errors.check_out = "Invalid timestamp.";
    else values.checkOut = d;
  }

  if (
    values.checkIn &&
    values.checkOut &&
    values.checkOut.getTime() <= values.checkIn.getTime()
  ) {
    errors.check_out = "Check-out must be after check-in.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { values };
}

// PostgreSQL unique-violation (concurrent duplicate check-in protection is
// the database's UNIQUE(employee_id, work_date); this maps it to HTTP 409).
export function isUniqueViolation(error) {
  return Boolean(error && error.code === "23505");
}

// --- Small display helpers (used by client components too) --------------------

// "09:05" PKT wall-clock from an ISO timestamp (no seconds).
export function karachiTimeLabel(iso) {
  if (!iso) return null;
  const k = karachiShift(new Date(iso));
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ISO instant → value for <input type="datetime-local"> in Karachi wall time.
export function toKarachiInputValue(iso) {
  if (!iso) return "";
  const k = karachiShift(new Date(iso));
  return k.toISOString().slice(0, 16);
}

// <input type="datetime-local"> value (Karachi wall time) → ISO instant.
export function fromKarachiInputValue(value) {
  if (!value) return null;
  return karachiUnshift(new Date(value + ":00Z")).toISOString();
}
