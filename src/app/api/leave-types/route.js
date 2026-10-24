import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getLeaveTypes } from "@/lib/leave";

// GET /api/leave-types — canonical leave types (any active profile).
export async function GET() {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;

    const types = await getLeaveTypes();
    return NextResponse.json({ types });
  } catch (error) {
    console.error("GET /api/leave-types failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
