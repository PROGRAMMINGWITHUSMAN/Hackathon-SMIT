import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getRunDetail } from "@/lib/payroll";

// GET /api/payroll/runs/[id] — run detail with payslip breakdown, totals,
// and the deterministic skipped-employee list (Admin/HR).
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;

    const result = await getRunDetail(guard.profile, id);
    if (result.badRequest) {
      return NextResponse.json({ error: "Invalid run id." }, { status: 400 });
    }
    if (result.notFound) {
      return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/payroll/runs/[id] failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
