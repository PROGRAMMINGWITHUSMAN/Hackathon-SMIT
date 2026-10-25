import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  listEmployeeProfiles,
  createEmployee,
  validateEmployeeInput,
} from "@/lib/employees";
import { activeProfiles, recordAudit, sendNotification } from "@/lib/communications";

// ---------------------------------------------------------------------------
// /api/employees — the employee directory API (Admin + HR).
//
//   GET  : list the organization's employees (with emails merged from Auth)
//   POST : create an employee (invite email + profile)
//
// Security: identity/role verified via requireApiUser(); organization_id
// always comes from the caller's verified profile, never from the request.
// ---------------------------------------------------------------------------

// Keys a client may send when creating an employee. Anything else is rejected
// so crafted requests cannot smuggle fields like organization_id, status, or
// confirm_password (the confirm field is validated client-side only and must
// never reach the server or database).
const CREATE_FIELDS = [
  "full_name",
  "email",
  "password",
  "role",
  "department",
  "designation",
  "joined_at",
  "basic_salary",
];

// Salary is sensitive: HR manages records but never sees or sets pay.
function removeSalaryFor(employee) {
  const { basic_salary, ...rest } = employee;
  return rest;
}

export async function GET() {
  try {
    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    const employees = await listEmployeeProfiles(profile.organization_id);

    return NextResponse.json({
      employees:
        profile.role === "hr" ? employees.map(removeSalaryFor) : employees,
    });
  } catch (error) {
    console.error("GET /api/employees failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
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

    // Reject unexpected fields outright.
    const unknownFields = Object.keys(body).filter(
      (key) => !CREATE_FIELDS.includes(key)
    );
    if (unknownFields.length > 0) {
      return NextResponse.json(
        {
          error: `Unexpected field(s): ${unknownFields.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const { errors, values } = validateEmployeeInput(body);
    if (errors) {
      return NextResponse.json(
        { error: "Validation failed.", errors },
        { status: 400 }
      );
    }

    // Privilege rules on create:
    //   - creating privileged roles (admin/hr) is Admin-only
    //   - setting a salary is Admin-only
    if (values.role !== "employee" && caller.role === "hr") {
      return NextResponse.json(
        { error: "Only an Admin can create Admin or HR accounts." },
        { status: 403 }
      );
    }
    if ("basic_salary" in values && caller.role === "hr") {
      return NextResponse.json(
        { error: "Only an Admin can set salaries." },
        { status: 403 }
      );
    }

    const result = await createEmployee({
      organizationId: caller.organization_id,
      input: values,
    });

    if (result.conflict) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Emails must be unique.",
        },
        { status: 409 }
      );
    }

    if (result.weakPassword) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          errors: { password: result.message },
        },
        { status: 400 }
      );
    }

    if (result.rateLimited) {
      // Nothing was created — Supabase throttled the request.
      return NextResponse.json(
        {
          error:
            "Supabase is temporarily rate-limiting account creation. No account was created — please try again in a few minutes.",
        },
        { status: 429 }
      );
    }

    const warnings = [];
    const auditWarning = await recordAudit({
      organizationId: caller.organization_id,
      actorId: caller.id,
      action: "employee.created",
      entity: "profiles",
      entityId: result.profile.id,
      details: { role: result.profile.role },
    });
    if (auditWarning) warnings.push(auditWarning);
    const { profiles: managers, warning: recipientWarning } = await activeProfiles(
      caller.organization_id,
      ["admin", "hr"]
    );
    if (recipientWarning) warnings.push(recipientWarning);
    const notificationWarning = await sendNotification({
      organizationId: caller.organization_id,
      userIds: managers.filter((person) => person.id !== caller.id).map((person) => person.id),
      title: "Employee added",
      body: "An employee record was created.",
      dedupeKey: `employee:${result.profile.id}:created`,
    });
    if (notificationWarning) warnings.push(notificationWarning);

    return NextResponse.json(
      {
        employee:
          caller.role === "hr" ? removeSalaryFor(result.profile) : result.profile,
        message:
          "Employee created. They can now sign in with the email and password you set.",
        ...(warnings.length ? { warnings } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/employees failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
