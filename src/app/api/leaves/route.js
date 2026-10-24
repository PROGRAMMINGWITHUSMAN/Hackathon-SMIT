import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getEmployeeLeaveView, getOrgLeaveView, submitLeaveRequest } from "@/lib/leave";
import { isValidDateString } from "@/lib/attendance-rules.mjs";
import { LEAVE_STATUSES } from "@/lib/leave-rules.mjs";

// ---------------------------------------------------------------------------
// /api/leaves
//
//   GET  : Employee → own requests + current-year balances. Admin/HR →
//          organization-wide requests with validated filters
//          (?status=&type=&employee_id=&from=&to=).
//   POST : submit a request for the CALLER only (employee_id/organization_id
//          are never accepted from the body). Business-rule failures
//          (overlap, balance, invalid range) → 422 with field errors.
// ---------------------------------------------------------------------------

const SUBMIT_FIELDS = ["leave_type", "start_date", "end_date", "reason"];

export async function GET(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    if (profile.role === "employee") {
      const view = await getEmployeeLeaveView(profile);
      return NextResponse.json(view);
    }

    // Admin / HR: validated filters.
    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const leaveType = params.get("type");
    const employeeId = params.get("employee_id");
    const fromDate = params.get("from");
    const toDate = params.get("to");

    if (status && !LEAVE_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    }
    if (fromDate && !isValidDateString(fromDate)) {
      return NextResponse.json({ error: "Invalid 'from' date." }, { status: 400 });
    }
    if (toDate && !isValidDateString(toDate)) {
      return NextResponse.json({ error: "Invalid 'to' date." }, { status: 400 });
    }

    const view = await getOrgLeaveView(profile, {
      status,
      leaveType,
      employeeId,
      fromDate,
      toDate,
    });
    return NextResponse.json(view);
  } catch (error) {
    console.error("GET /api/leaves failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

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
      (key) => !SUBMIT_FIELDS.includes(key)
    );
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { error: `Unexpected field(s): ${unknownFields.join(", ")}.` },
        { status: 400 }
      );
    }

    const result = await submitLeaveRequest(profile, body);

    if (result.validationErrors) {
      return NextResponse.json(
        { error: "Leave request is not valid.", errors: result.validationErrors },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        request: result.request,
        days: result.days,
        message: `Leave request submitted (${result.days} working day${result.days === 1 ? "" : "s"}) — pending review.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/leaves failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
