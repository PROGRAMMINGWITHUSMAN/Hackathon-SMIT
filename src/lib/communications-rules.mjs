export const ANNOUNCEMENT_ROLES = ["admin", "hr", "employee"];
export const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"];

export function validateAnnouncementInput(input, { partial = false } = {}) {
  const errors = {};
  const values = {};

  if (!partial || "title" in input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < 3 || title.length > 120) {
      errors.title = "Title must be 3–120 characters.";
    } else {
      values.title = title;
    }
  }

  if (!partial || "message" in input) {
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (message.length < 1 || message.length > 5000) {
      errors.message = "Message must be 1–5000 characters.";
    } else {
      values.message = message;
    }
  }

  if (!partial || "audience_roles" in input) {
    const roles = input.audience_roles;
    if (
      !Array.isArray(roles) ||
      roles.length < 1 ||
      roles.some((role) => !ANNOUNCEMENT_ROLES.includes(role)) ||
      new Set(roles).size !== roles.length
    ) {
      errors.audience_roles = "Choose one or more valid audience roles.";
    } else {
      values.audience_roles = roles;
    }
  }

  if ("status" in input) {
    if (!ANNOUNCEMENT_STATUSES.includes(input.status)) {
      errors.status = "Choose draft, published, or archived.";
    } else {
      values.status = input.status;
    }
  }

  return Object.keys(errors).length ? { errors } : { values };
}

const AUDIT_DETAIL_KEYS = {
  "employee.created": ["role"],
  "employee.updated": ["changed_fields"],
  "employee.role_changed": ["before_role", "after_role"],
  "employee.status_changed": ["before_status", "after_status"],
  "attendance.corrected": ["changed_fields", "before_status", "after_status"],
  "leave.approved": ["before_status", "after_status", "comment_added"],
  "leave.rejected": ["before_status", "after_status", "comment_added"],
  "leave.cancelled": ["before_status", "after_status"],
  "payroll.draft_created": ["period", "employee_count"],
  "payroll.draft_recalculated": ["period"],
  "payroll.finalized": ["period"],
  "payroll.locked": ["period"],
  "announcement.created": ["status", "audience_roles"],
  "announcement.updated": ["changed_fields"],
  "announcement.published": ["audience_roles"],
  "announcement.archived": [],
};

export function sanitizeAuditDetails(action, details) {
  const allowed = AUDIT_DETAIL_KEYS[action];
  if (!allowed || !details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  const safe = {};
  for (const key of allowed) {
    if (!(key in details)) continue;
    if (key === "changed_fields" && Array.isArray(details[key])) {
      safe[key] = details[key].filter((field) =>
        ["full_name", "role", "status", "department", "designation", "joined_at", "basic_salary", "check_in", "check_out", "title", "message", "audience_roles"].includes(field)
      );
    } else if (key === "audience_roles" && Array.isArray(details[key])) {
      safe[key] = details[key].filter((role) => ANNOUNCEMENT_ROLES.includes(role));
    } else if (["before_status", "after_status", "role", "before_role", "after_role", "status"].includes(key)) {
      if (typeof details[key] === "string" && details[key].length <= 32) {
        safe[key] = details[key];
      }
    } else if (key === "period" && /^\d{4}-(0[1-9]|1[0-2])$/.test(details[key])) {
      safe[key] = details[key];
    } else if (key === "employee_count" && Number.isInteger(details[key]) && details[key] >= 0) {
      safe[key] = details[key];
    } else if (key === "comment_added" && typeof details[key] === "boolean") {
      safe[key] = details[key];
    }
  }
  return safe;
}
