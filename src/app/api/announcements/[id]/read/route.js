import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isUuid } from "@/lib/employees";
import { markAnnouncementRead } from "@/lib/communications";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid announcement id." }, { status: 400 });
    }
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const result = await markAnnouncementRead(guard.profile, id);
    if (result.notFound) {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/announcements/[id]/read failed:", error);
    return NextResponse.json({ error: "Could not mark announcement as read." }, { status: 500 });
  }
}
