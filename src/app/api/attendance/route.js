import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getAttendanceHistory, getOrgDayView } from "@/lib/attendance";
import {
  karachiDateString,
  isValidDateString,
} from "@/lib/attendance-rules.mjs";

// ---------------------------------------------------------------------------
// GET /api/attendance
//
//   Employee        → own history (optional validated ?from=&to=, default
//                     last 60 days, Karachi). Client-supplied employee ids
//                     are ignored entirely.
//   Admin / HR      → organization view for ?date= (default: today Karachi).
//                     Returns working-day info, derived statuses (absent is
//                     computed, never stored), and summary counts.
//
// Read-only: this endpoint never writes attendance rows.
// ---------------------------------------------------------------------------

const MAX_HISTORY_DAYS = 366;

export async function GET(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    const params = request.nextUrl.searchParams;

    if (profile.role === "employee") {
      const today = karachiDateString(new Date());
      let from = params.get("from") ?? null;
      let to = params.get("to") ?? today;

      if (from !== null && !isValidDateString(from)) {
        return NextResponse.json({ error: "Invalid 'from' date." }, { status: 400 });
      }
      if (!isValidDateString(to)) {
        return NextResponse.json({ error: "Invalid 'to' date." }, { status: 400 });
      }
      if (from === null) {
        const defaultFrom = new Date(Date.now() - 60 * 24 * 3600 * 1000);
        from = karachiDateString(defaultFrom);
      }
      if (from > to) {
        return NextResponse.json(
          { error: "'from' must not be after 'to'." },
          { status: 400 }
        );
      }
      if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_HISTORY_DAYS) {
        return NextResponse.json(
          { error: "Range too large (max 366 days)." },
          { status: 400 }
        );
      }

      const history = await getAttendanceHistory(
        profile.organization_id,
        profile.id,
        from,
        to
      );
      return NextResponse.json({ history });
    }

    // Admin / HR: one-day organization view.
    const today = karachiDateString(new Date());
    const date = params.get("date") ?? today;
    if (!isValidDateString(date)) {
      return NextResponse.json({ error: "Invalid 'date'." }, { status: 400 });
    }

    const view = await getOrgDayView(profile.organization_id, date);
    return NextResponse.json(view);
  } catch (error) {
    console.error("GET /api/attendance failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
