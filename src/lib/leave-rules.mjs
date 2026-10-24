// ---------------------------------------------------------------------------
// Leave business rules — PURE functions, no imports from server modules.
// Same philosophy as attendance-rules.mjs: importable from server, client,
// and tests; all date-dependent logic takes explicit inputs.
//
// DOCUMENTED POLICIES (docs/BUSINESS_RULES.md):
//   - Duration counts INCLUSIVE WORKING days: Saturdays, Sundays, and the
//     organization's holidays are never charged as leave days.
//   - Balance year = calendar year of the request's start date.
//   - Pending + approved requests RESERVE balance; rejected/cancelled
//     release it. Unpaid leave has no finite cap.
//   - A new/being-approved request may not overlap the same employee's
//     pending or approved request (any type).
//   - A request must contain at least one working day.
// ---------------------------------------------------------------------------

import { isValidDateString, isWeekend } from "./attendance-rules.mjs";

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"];
// Statuses that consume (reserve) balance and block overlaps.
export const ACTIVE_STATUSES = ["pending", "approved"];

// Inclusive working-day count between two YYYY-MM-DD strings.
// Returns null for invalid/reversed ranges.
export function countWorkingDays(startStr, endStr, holidayDates = []) {
  if (!isValidDateString(startStr) || !isValidDateString(endStr)) return null;
  const start = Date.parse(startStr + "T00:00:00Z");
  const end = Date.parse(endStr + "T00:00:00Z");
  if (end < start) return null;

  const holidays = new Set(holidayDates);
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    const dateStr = new Date(t).toISOString().slice(0, 10);
    if (isWeekend(dateStr)) continue;
    if (holidays.has(dateStr)) continue;
    count += 1;
  }
  return count;
}

// True when two inclusive date ranges share at least one day.
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

// Balances for one employee + one year.
//   types      : [{code, annual_allowance, is_unlimited}] (canonical rows)
//   requests   : the employee's requests whose start year === year
//   holidayDates: org holidays (working-day math stays consistent)
// Returns { [code]: { allowance, unlimited, used, remaining } }
//   used      : working days of ACTIVE (pending+approved) requests
//   remaining : null when unlimited
export function computeBalances({ types, requests, year, holidayDates = [] }) {
  const result = {};
  for (const type of types) {
    result[type.code] = {
      allowance: type.annual_allowance,
      unlimited: type.is_unlimited,
      used: 0,
      remaining: type.is_unlimited ? null : type.annual_allowance,
    };
  }

  for (const request of requests) {
    if (!ACTIVE_STATUSES.includes(request.status)) continue;
    if (String(request.start_date).slice(0, 4) !== String(year)) continue;
    const days = countWorkingDays(
      request.start_date,
      request.end_date,
      holidayDates
    );
    if (days == null || days === 0) continue;
    const bucket = result[request.leave_type];
    if (!bucket) continue;
    bucket.used += days;
    if (!bucket.unlimited) bucket.remaining = bucket.allowance - bucket.used;
  }

  return result;
}

// Validation for a new request (or one being approved). Pure — callers add
// the database context (existing requests, holidays).
// Returns { errors } (field → message) or { values: {leave_type, start_date,
// end_date, reason, days} }.
export function validateLeaveInput(body, { types, existingRequests, holidayDates = [] }) {
  const errors = {};
  const typeCodes = types.map((t) => t.code);

  if (!typeCodes.includes(body.leave_type)) {
    errors.leave_type = "Choose a valid leave type.";
  }

  if (!isValidDateString(body.start_date)) {
    errors.start_date = "Enter a valid start date (YYYY-MM-DD).";
  }
  if (!isValidDateString(body.end_date)) {
    errors.end_date = "Enter a valid end date (YYYY-MM-DD).";
  }

  if (errors.start_date || errors.end_date) return { errors };

  // An unknown leave type must not fall through to the success return.
  if (errors.leave_type) return { errors };

  if (body.end_date < body.start_date) {
    errors.end_date = "End date must not be before the start date.";
    return { errors };
  }

  let reason = null;
  if (body.reason != null) {
    reason = String(body.reason).trim();
    if (reason.length > 500) {
      errors.reason = "Reason must be 500 characters or fewer.";
    } else if (reason === "") {
      reason = null;
    }
  }
  if (errors.reason) return { errors };

  const days = countWorkingDays(body.start_date, body.end_date, holidayDates);
  if (days == null || days < 1) {
    errors.start_date =
      "The selected range contains no working days (weekends/holidays are not charged).";
    return { errors };
  }

  // Overlap against the same employee's ACTIVE requests.
  const overlapping = (existingRequests ?? []).filter(
    (r) =>
      ACTIVE_STATUSES.includes(r.status) &&
      rangesOverlap(body.start_date, body.end_date, r.start_date, r.end_date)
  );
  if (overlapping.length > 0) {
    errors.end_date =
      "This range overlaps an existing pending or approved leave request.";
    return { errors };
  }

  // Balance (skip for unlimited types).
  const type = types.find((t) => t.code === body.leave_type);
  if (type && !type.is_unlimited) {
    const year = body.start_date.slice(0, 4);
    const balances = computeBalances({
      types,
      requests: existingRequests ?? [],
      year,
      holidayDates,
    });
    const bucket = balances[type.code];
    if (bucket && bucket.remaining - days < 0) {
      errors.leave_type = `Insufficient ${type.name} balance: ${bucket.remaining} day(s) left, ${days} requested.`;
      return { errors };
    }
  }

  return {
    values: {
      leave_type: body.leave_type,
      start_date: body.start_date,
      end_date: body.end_date,
      reason,
      days,
    },
  };
}
