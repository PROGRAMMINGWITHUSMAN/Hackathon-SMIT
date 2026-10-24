import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { recalculatePayrollRun } from "@/lib/payroll";

// POST /api/payroll/runs/[id]/recalculate — Admin/HR, DRAFT only: recompute
// every payslip from current salaries and approved unpaid leave (compare-
// and-swap guarded against a concurrent finalize).
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;

    const result = await recalculatePayrollRun(guard.profile, id);
    if (result.notFound) {
      return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });
    }
    if (result.conflict) {
      return NextResponse.json({ error: result.conflict }, { status: 409 });
    }
    return NextResponse.json({
      ...result,
      message: "Draft recalculated from current data.",
    });
  } catch (error) {
    console.error("POST /api/payroll/runs/[id]/recalculate failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
