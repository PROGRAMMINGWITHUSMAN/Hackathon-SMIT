import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getOwnPayslips } from "@/lib/payroll";

// GET /api/payroll/payslips — the caller's OWN payslips, only from
// finalized or locked runs (drafts are never visible to employees).
export async function GET() {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;

    const payslips = await getOwnPayslips(guard.profile);
    return NextResponse.json({ payslips });
  } catch (error) {
    console.error("GET /api/payroll/payslips failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
