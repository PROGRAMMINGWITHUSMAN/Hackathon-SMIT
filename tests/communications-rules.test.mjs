import test from "node:test";
import assert from "node:assert/strict";

import {
  ANNOUNCEMENT_ROLES,
  sanitizeAuditDetails,
  validateAnnouncementInput,
} from "../src/lib/communications-rules.mjs";
import { notificationHref } from "../src/lib/notification-links.mjs";

test("announcement validation trims and accepts supported fields", () => {
  const result = validateAnnouncementInput({
    title: "  Office update  ",
    message: "  A short update. ",
    audience_roles: ["admin", "employee"],
  });
  assert.deepEqual(result.values, {
    title: "Office update",
    message: "A short update.",
    audience_roles: ["admin", "employee"],
  });
});

test("announcement validation rejects invalid lengths, roles, duplicate roles, and status", () => {
  assert.ok(validateAnnouncementInput({
    title: "no",
    message: " ",
    audience_roles: ["owner"],
  }).errors);
  assert.ok(validateAnnouncementInput({
    title: "valid title",
    message: "valid message",
    audience_roles: ["admin", "admin"],
  }).errors.audience_roles);
  assert.ok(validateAnnouncementInput({
    title: "valid title",
    message: "valid message",
    audience_roles: ["employee"],
    status: "published; forged",
  }).errors.status);
  assert.deepEqual(ANNOUNCEMENT_ROLES, ["admin", "hr", "employee"]);
});

test("partial announcement validation checks only supplied fields", () => {
  assert.deepEqual(
    validateAnnouncementInput({ status: "archived" }, { partial: true }).values,
    { status: "archived" }
  );
});

test("audit sanitization keeps only action-specific, bounded metadata", () => {
  assert.deepEqual(
    sanitizeAuditDetails("employee.role_changed", {
      before_role: "employee",
      after_role: "hr",
      password: "do-not-log",
      email: "private@example.test",
    }),
    { before_role: "employee", after_role: "hr" }
  );
  assert.deepEqual(
    sanitizeAuditDetails("payroll.finalized", {
      period: "2026-10",
      net_pay: 123456,
      employee_count: 10,
    }),
    { period: "2026-10" }
  );
});

test("audit sanitization filters changed fields and invalid metadata values", () => {
  assert.deepEqual(
    sanitizeAuditDetails("attendance.corrected", {
      changed_fields: ["check_in", "password", { field: "check_out" }],
      before_status: "present",
      after_status: "late",
    }),
    {
      changed_fields: ["check_in"],
      before_status: "present",
      after_status: "late",
    }
  );
  assert.deepEqual(
    sanitizeAuditDetails("leave.approved", {
      comment_added: true,
      before_status: "pending",
      after_status: "approved",
      comment: "sensitive content",
    }),
    { before_status: "pending", after_status: "approved", comment_added: true }
  );
  assert.deepEqual(sanitizeAuditDetails("unknown.action", { anything: "private" }), {});
});

test("notification destinations are fixed internal routes; unknown titles have no link", () => {
  assert.equal(notificationHref("Payslip available"), "/dashboard/payroll");
  assert.equal(notificationHref("New announcement"), "/dashboard/announcements");
  assert.equal(notificationHref("Unknown notification"), null);
  assert.equal(notificationHref("javascript:alert(1)"), null);
});
