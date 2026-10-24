import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { checkOutEmployee } from "@/lib/attendance";
import { karachiTimeLabel } from "@/lib/attendance-rules.mjs";

// ---------------------------------------------------------------------------
// POST /api/attendance/check-out — employee self-service.
//
// Body ignored (server time is authoritative). Possible 409 conflicts:
//   no_check_in        — checked out without ever checking in today
//   already_checked_out— duplicate checkout
//   invalid_time       — server clock is not after the stored check-in
// The final status is recalculated at checkout: under 5 worked hours is a
// half-day (takes precedence over Late); otherwise the check-in rule holds.
// ---------------------------------------------------------------------------

export async function POST(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    const result = await checkOutEmployee(profile, new Date());

    if (result.conflict === "no_check_in") {
      return NextResponse.json(
        { error: "No check-in found for today — check in first." },
        { status: 409 }
      );
    }
    if (result.conflict === "already_checked_out") {
      return NextResponse.json(
        { error: "You have already checked out today." },
        { status: 409 }
      );
    }
    if (result.conflict === "invalid_time") {
      return NextResponse.json(
        { error: "Check-out must be after your check-in time." },
        { status: 409 }
      );
    }

    const message =
      result.record.status === "half_day"
        ? `Checked out at ${karachiTimeLabel(result.record.check_out)} — under 5 worked hours, marked Half-day.`
        : `Checked out at ${karachiTimeLabel(result.record.check_out)}.`;

    return NextResponse.json({ record: result.record, message }, { status: 200 });
  } catch (error) {
    console.error("POST /api/attendance/check-out failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
