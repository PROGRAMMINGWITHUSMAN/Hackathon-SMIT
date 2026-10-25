import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listNotifications } from "@/lib/communications";

export async function GET() {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const result = await listNotifications(guard.profile, { limit: 1 });
    return NextResponse.json({ unread_count: result.unread_count });
  } catch (error) {
    console.error("GET /api/notifications/unread-count failed:", error);
    return NextResponse.json(
      { error: "Could not load unread notifications." },
      { status: 500 }
    );
  }
}
