const ROUTES_BY_TITLE = {
  "New leave request": "/dashboard/leave",
  "Leave approved": "/dashboard/leave",
  "Leave rejected": "/dashboard/leave",
  "Leave request cancelled": "/dashboard/leave",
  "Employee added": "/dashboard/employees",
  "Employee access updated": "/dashboard",
  "Attendance record updated": "/dashboard/attendance",
  "Payslip available": "/dashboard/payroll",
  "New announcement": "/dashboard/announcements",
};

export function notificationHref(title) {
  return ROUTES_BY_TITLE[title] ?? null;
}
