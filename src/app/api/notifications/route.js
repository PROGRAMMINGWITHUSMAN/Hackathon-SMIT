import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listNotifications } from "@/lib/communications";

export async function GET(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;

    const params = request.nextUrl.searchParams;
    const rawLimit = Number(params.get("limit") ?? 20);
    const rawOffset = Number(params.get("offset") ?? 0);
    if (
      !Number.isInteger(rawLimit) ||
      !Number.isInteger(rawOffset) ||
      rawLimit < 1 ||
      rawOffset < 0
    ) {
      return NextResponse.json({ error: "Invalid pagination." }, { status: 400 });
    }
    const limit = Math.min(rawLimit, 50);
    if (rawOffset > 10000) {
      return NextResponse.json({ error: "Pagination limit exceeded." }, { status: 400 });
    }

    return NextResponse.json(
      await listNotifications(guard.profile, { limit, offset: rawOffset })
    );
  } catch (error) {
    console.error("GET /api/notifications failed:", error);
    return NextResponse.json(
      { error: "Could not load notifications." },
      { status: 500 }
    );
  }
}
