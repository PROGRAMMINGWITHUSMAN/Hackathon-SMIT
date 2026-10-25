import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isUuid } from "@/lib/employees";
import { markNotificationRead } from "@/lib/communications";

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
    }
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (Object.keys(body ?? {}).length !== 1 || body.read !== true) {
      return NextResponse.json({ error: "Only read=true is accepted." }, { status: 400 });
    }

    const result = await markNotificationRead(guard.profile, id);
    return result.updated
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "Notification not found or already read." }, { status: 404 });
  } catch (error) {
    console.error("PATCH /api/notifications/[id] failed:", error);
    return NextResponse.json({ error: "Could not update notification." }, { status: 500 });
  }
}
