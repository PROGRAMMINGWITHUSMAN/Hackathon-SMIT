import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { cancelLeaveRequest } from "@/lib/leave";
import { isUuid } from "@/lib/employees";

// POST /api/leaves/[id]/cancel — withdraw a PENDING request.
//   Owner   : their own pending request
//   Admin/HR: any pending request in their organization
// Approved/rejected requests are history and can never be cancelled (409).
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
    }

    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    const result = await cancelLeaveRequest(profile, id);

    if (result.notFound) {
      return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
    }
    if (result.forbidden) {
      return NextResponse.json({ error: result.forbidden }, { status: 403 });
    }
    if (result.conflict) {
      return NextResponse.json({ error: result.conflict }, { status: 409 });
    }

    return NextResponse.json({
      request: result.request,
      message: "Request cancelled — any reserved balance is released.",
      ...([result.auditWarning, result.notificationWarning].filter(Boolean).length
        ? { warnings: [result.auditWarning, result.notificationWarning].filter(Boolean) }
        : {}),
    });
  } catch (error) {
    console.error("POST /api/leaves/[id]/cancel failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
