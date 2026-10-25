import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listAuditHistory } from "@/lib/communications";

const ACTION_RE = /^[a-z][a-z0-9_.-]{1,63}$/;
const ENTITY_RE = /^[a-z][a-z0-9_]{1,39}$/;

export async function GET(request) {
  try {
    const guard = await requireApiUser(["admin"]);
    if (guard.errorResponse) return guard.errorResponse;
    const params = request.nextUrl.searchParams;
    const limitValue = Number(params.get("limit") ?? 25);
    const offset = Number(params.get("offset") ?? 0);
    const action = params.get("action") || undefined;
    const entity = params.get("entity") || undefined;
    if (
      !Number.isInteger(limitValue) ||
      limitValue < 1 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000 ||
      (action && !ACTION_RE.test(action)) ||
      (entity && !ENTITY_RE.test(entity))
    ) {
      return NextResponse.json({ error: "Invalid filter or pagination." }, { status: 400 });
    }
    const result = await listAuditHistory(guard.profile, {
      limit: Math.min(limitValue, 50),
      offset,
      action,
      entity,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/audit failed:", error);
    return NextResponse.json({ error: "Could not load audit history." }, { status: 500 });
  }
}
