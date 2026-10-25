import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isUuid } from "@/lib/employees";
import { updateAnnouncement } from "@/lib/communications";

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid announcement id." }, { status: 400 });
    }
    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const result = await updateAnnouncement(guard.profile, id, body ?? {});
    if (result.notFound) {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }
    if (result.errors) {
      return NextResponse.json({ error: "Validation failed.", errors: result.errors }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/announcements/[id] failed:", error);
    return NextResponse.json({ error: "Could not update announcement." }, { status: 500 });
  }
}
