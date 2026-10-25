import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { markAllNotificationsRead } from "@/lib/communications";

export async function POST() {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    await markAllNotificationsRead(guard.profile);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/notifications/read-all failed:", error);
    return NextResponse.json({ error: "Could not update notifications." }, { status: 500 });
  }
}
