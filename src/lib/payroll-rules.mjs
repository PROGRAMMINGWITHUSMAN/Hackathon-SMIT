// ---------------------------------------------------------------------------
// Payroll business rules — PURE functions (same philosophy as the attendance
// and leave rule modules: importable from server, client, and tests).
//
// DOCUMENTED POLICIES (docs/BUSINESS_RULES.md):
//   - Period = a calendar month in Asia/Karachi (fixed UTC+5).
//   - basic comes from the employee profile; HRA = 40% of basic; medical =
//     10% of basic; gross = basic + HRA + medical (always equals 1.5 × basic
//     and the three components always sum exactly — rounding is applied to
//     each component, then gross is their sum).
//   - Unpaid leave deduction = round2(basic / 26 × unpaid days). Only
//     APPROVED unpaid leave counts; weekends/holidays are never charged
//     (working-day counting reused from leave-rules); a request spanning
//     month boundaries is charged to each month for its working days that
//     fall inside that month.
//   - Net pay = gross − deduction.
//   - A period that has not started yet cannot have payroll (future month).
// ---------------------------------------------------------------------------

import { countWorkingDays } from "./leave-rules.mjs";

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function isValidPeriod(year, month) {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2020 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12
  );
}

// Inclusive first/last calendar date of the period (YYYY-MM-DD).
export function periodBounds(year, month) {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

// Payroll may be created for the current month or any past month — never a
// month that has not started. todayStr = current Karachi date (YYYY-MM-DD).
export function isFuturePeriod(year, month, todayStr) {
  const currentYear = Number(todayStr.slice(0, 4));
  const currentMonth = Number(todayStr.slice(5, 7));
  if (year > currentYear) return true;
  if (year === currentYear && month > currentMonth) return true;
  return false;
}

export function periodLabel(year, month) {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[month - 1]} ${year}`;
}

// The payslip math for one employee.
export function computePayslip(basic, unpaidLeaveDays) {
  const hra = round2(basic * 0.4);
  const medical = round2(basic * 0.1);
  const gross = round2(basic + hra + medical); // = 1.5 × basic, always sums
  const deduction = round2((basic / 26) * unpaidLeaveDays);
  const netPay = round2(gross - deduction);
  return {
    basic: round2(basic),
    hra,
    medical,
    gross,
    unpaid_leave_days: unpaidLeaveDays,
    deduction,
    net_pay: netPay,
  };
}

// Working days an employee was on APPROVED UNPAID leave inside the period.
// requests: [{status, leave_type, start_date, end_date}] (caller filters to
// approved unpaid; we still verify defensively). Month-spanning requests are
// intersected with the period before counting.
export function unpaidDaysInPeriod(requests, period, holidayDates = []) {
  let total = 0;
  for (const request of requests) {
    if (request.status !== "approved" || request.leave_type !== "unpaid") continue;
    const start = request.start_date > period.start ? request.start_date : period.start;
    const end = request.end_date < period.end ? request.end_date : period.end;
    if (start > end) continue;
    const days = countWorkingDays(start, end, holidayDates);
    if (days != null && days > 0) total += days;
  }
  return total;
}
