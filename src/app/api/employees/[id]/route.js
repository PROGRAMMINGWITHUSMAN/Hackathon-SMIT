import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  getEmployeeProfile,
  updateEmployeeProfile,
  countOtherActiveAdmins,
  validateEmployeeInput,
  isUuid,
} from "@/lib/employees";
import { activeProfiles, recordAudit, sendNotification } from "@/lib/communications";

// ---------------------------------------------------------------------------
// /api/employees/[id] — one employee.
//
//   GET   : fetch one employee (Admin/HR for anyone; Employee for self only,
//           without salary)
//   PATCH : update permitted fields with per-role rules:
//             full_name, department, designation, joined_at → Admin + HR
//             basic_salary, role                              → Admin only
//             status → Admin/HR (HR only on 'employee' targets;
//                       never on yourself; never on the last active Admin)
//
// Every lookup is scoped to the caller's organization_id, so an ID from
// another organization simply returns 404.
// ---------------------------------------------------------------------------

const EDIT_FIELDS = [
  "full_name",
  "department",
  "designation",
  "joined_at",
  "basic_salary",
  "role",
  "status",
];

function removeSalaryFor(employee) {
  if (!employee) return employee;
  const { basic_salary, ...rest } = employee;
  return rest;
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
    }

    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile: caller } = guard;

    // Employees may only look up their own record.
    if (caller.role === "employee" && id !== caller.id) {
      return NextResponse.json(
        { error: "You can only view your own profile." },
        { status: 403 }
      );
    }

    const employee = await getEmployeeProfile(caller.organization_id, id);
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found." },
        { status: 404 }
      );
    }

    // Salary is visible to Admin only (HR manages records, not pay; an
    // employee viewing their own record does not need it here).
    if (caller.role !== "admin") {
      return NextResponse.json({ employee: removeSalaryFor(employee) });
    }
    return NextResponse.json({ employee });
  } catch (error) {
    console.error("GET /api/employees/[id] failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
    }

    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile: caller } = guard;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const unknownFields = Object.keys(body).filter(
      (key) => !EDIT_FIELDS.includes(key)
    );
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { error: `Unexpected field(s): ${unknownFields.join(", ")}.` },
        { status: 400 }
      );
    }
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 }
      );
    }

    const { errors, values } = validateEmployeeInput(body, { partial: true });
    if (errors) {
      return NextResponse.json(
        { error: "Validation failed.", errors },
        { status: 400 }
      );
    }

    // Target must exist in the caller's organization.
    const target = await getEmployeeProfile(caller.organization_id, id);
    if (!target) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    // --- per-role rules (checked BEFORE persisting anything) ---
    if (caller.role === "hr" && "basic_salary" in body) {
      return NextResponse.json(
        { error: "Only an Admin can manage salaries." },
        { status: 403 }
      );
    }
    if (caller.role === "hr" && "role" in body) {
      return NextResponse.json(
        { error: "Only an Admin can change roles." },
        { status: 403 }
      );
    }
    if ("role" in body && id === caller.id) {
      return NextResponse.json(
        { error: "You cannot change your own role." },
        { status: 403 }
      );
    }
    if ("status" in body) {
      if (id === caller.id) {
        return NextResponse.json(
          { error: "You cannot change your own status." },
          { status: 403 }
        );
      }
      if (caller.role === "hr" && target.role !== "employee") {
        return NextResponse.json(
          { error: "HR can only change the status of employee accounts." },
          { status: 403 }
        );
      }
    }

    // Last-active-Admin protection: if this change would remove the org's
    // only active admin (by deactivating them or changing their role),
    // refuse it.
    const removesAdmin =
      target.role === "admin" &&
      target.status === "active" &&
      (("status" in body && values.status === "inactive") ||
        ("role" in body && values.role !== "admin"));
    if (removesAdmin) {
      const others = await countOtherActiveAdmins(
        caller.organization_id,
        target.id
      );
      if (others === 0) {
        return NextResponse.json(
          { error: "Cannot remove the last active Admin of the organization." },
          { status: 403 }
        );
      }
    }

    // Build the final changes object from validated values for the keys
    // the client actually sent.
    const changes = {};
    for (const key of Object.keys(body)) {
      if (key in values) changes[key] = values[key];
    }

    const updated = await updateEmployeeProfile({
      organizationId: caller.organization_id,
      employeeId: id,
      changes,
    });

    const warnings = [];
    const changedFields = Object.keys(changes);
    if ("role" in changes) {
      const warning = await recordAudit({
        organizationId: caller.organization_id,
        actorId: caller.id,
        action: "employee.role_changed",
        entity: "profiles",
        entityId: updated.id,
        details: { before_role: target.role, after_role: updated.role },
      });
      if (warning) warnings.push(warning);
    }
    if ("status" in changes) {
      const warning = await recordAudit({
        organizationId: caller.organization_id,
        actorId: caller.id,
        action: "employee.status_changed",
        entity: "profiles",
        entityId: updated.id,
        details: { before_status: target.status, after_status: updated.status },
      });
      if (warning) warnings.push(warning);
    }
    if (changedFields.some((field) => !["role", "status"].includes(field))) {
      const warning = await recordAudit({
        organizationId: caller.organization_id,
        actorId: caller.id,
        action: "employee.updated",
        entity: "profiles",
        entityId: updated.id,
        details: { changed_fields: changedFields },
      });
      if (warning) warnings.push(warning);
    }

    if (changedFields.some((field) => ["role", "status"].includes(field))) {
      const { profiles: managers, warning: recipientWarning } = await activeProfiles(
        caller.organization_id,
        ["admin", "hr"]
      );
      if (recipientWarning) warnings.push(recipientWarning);
      const recipients = new Set(
        managers.filter((person) => person.id !== caller.id).map((person) => person.id)
      );
      if (updated.status === "active") recipients.add(updated.id);
      const warning = await sendNotification({
        organizationId: caller.organization_id,
        userIds: [...recipients],
        title: "Employee access updated",
        body: "An employee role or account status changed.",
        dedupeKey: `employee:${updated.id}:access:${updated.updated_at}`,
      });
      if (warning) warnings.push(warning);
    }

    if (caller.role !== "admin") {
      return NextResponse.json({
        employee: removeSalaryFor(updated),
        ...(warnings.length ? { warnings } : {}),
      });
    }
    return NextResponse.json({
      employee: updated,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (error) {
    if (
      error?.code === "P0001" &&
      error?.message === "Cannot remove the last active Admin of the organization."
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    console.error("PATCH /api/employees/[id] failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
