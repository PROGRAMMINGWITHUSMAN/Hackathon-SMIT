import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { createAnnouncement, listAnnouncements } from "@/lib/communications";

const CREATE_FIELDS = ["title", "message", "audience_roles", "status"];

export async function GET(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const manage = request.nextUrl.searchParams.get("manage") === "true";
    if (manage && guard.profile.role === "employee") {
      return NextResponse.json({ error: "Only Admin and HR can manage announcements." }, { status: 403 });
    }
    return NextResponse.json({
      announcements: await listAnnouncements(guard.profile, { manage }),
    });
  } catch (error) {
    console.error("GET /api/announcements failed:", error);
    return NextResponse.json({ error: "Could not load announcements." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const unknown = Object.keys(body ?? {}).filter((key) => !CREATE_FIELDS.includes(key));
    if (unknown.length) {
      return NextResponse.json({ error: `Unexpected field(s): ${unknown.join(", ")}.` }, { status: 400 });
    }
    const result = await createAnnouncement(guard.profile, body ?? {});
    if (result.errors) {
      return NextResponse.json({ error: "Validation failed.", errors: result.errors }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/announcements failed:", error);
    return NextResponse.json({ error: "Could not create announcement." }, { status: 500 });
  }
}
