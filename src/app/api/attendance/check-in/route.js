import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { checkInEmployee } from "@/lib/attendance";

// ---------------------------------------------------------------------------
// POST /api/attendance/check-in — employee self-service.
//
// Security model:
//   - The request body is IGNORED completely: timestamps, employee id, and
//     organization all come from the server (current time) and the VERIFIED
//     caller's profile. Nothing can be spoofed.
//   - Duplicate protection is the database's UNIQUE(employee_id, work_date)
//     constraint — mapped here to HTTP 409 (also safe under concurrency).
//   - Weekends/holidays are non-working days → 409 with a clear message.
// ---------------------------------------------------------------------------

export async function POST(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    const result = await checkInEmployee(profile, new Date());

    if (result.rejected === "non_working_day") {
      return NextResponse.json(
        {
          error:
            "Today is a non-working day (weekend or holiday) — attendance is not recorded.",
        },
        { status: 409 }
      );
    }

    if (result.conflict === "already_checked_in") {
      return NextResponse.json(
        { error: "You have already checked in today." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        record: result.record,
        message:
          result.record.status === "late"
            ? "Checked in — marked Late (after 09:15)."
            : "Checked in.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/attendance/check-in failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
