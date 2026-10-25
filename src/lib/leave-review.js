import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { reviewLeaveRequest } from "@/lib/leave";
import { isUuid } from "@/lib/employees";

// Shared handler for POST /api/leaves/[id]/approve and .../reject
// (kept in one place so the two paths can never diverge; it lives OUTSIDE
// the route files because Next.js routes may only export HTTP methods).
export async function handleLeaveReview(request, params, decision) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
    }

    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    // Accept the optional legacy comment field for API compatibility. Only
    // its presence is audited; its contents are not retained or notified.
    let comment = null;
    try {
      const body = await request.json();
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const extra = Object.keys(body).filter((k) => k !== "comment");
        if (extra.length > 0) {
          return NextResponse.json(
            { error: `Unexpected field(s): ${extra.join(", ")}.` },
            { status: 400 }
          );
        }
        comment = body.comment ?? null;
      }
    } catch {
      // Empty body is fine — the comment is optional.
    }

    const result = await reviewLeaveRequest(profile, id, decision, comment);

    if (result.notFound) {
      return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
    }
    if (result.forbidden) {
      return NextResponse.json({ error: result.forbidden }, { status: 403 });
    }
    if (result.conflict) {
      return NextResponse.json({ error: result.conflict }, { status: 409 });
    }
    if (result.validationErrors) {
      return NextResponse.json(
        { error: "Cannot approve this request.", errors: result.validationErrors },
        { status: 422 }
      );
    }

    const warnings = [result.auditWarning, result.notificationWarning].filter(Boolean);
    return NextResponse.json({
      request: result.request,
      message: decision === "approved" ? "Leave approved." : "Leave rejected.",
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (error) {
    console.error("leave review failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
