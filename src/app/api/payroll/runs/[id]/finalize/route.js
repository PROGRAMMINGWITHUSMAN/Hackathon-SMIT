import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transitionPayrollRun } from "@/lib/payroll";

// POST /api/payroll/runs/[id]/finalize — ADMIN ONLY. draft → finalized
// (compare-and-swap: double finalize or racing finalize → 409). Payslips
// become visible to employees.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const guard = await requireApiUser(["admin"]);
    if (guard.errorResponse) return guard.errorResponse;

    const result = await transitionPayrollRun(guard.profile, id, "finalize");
    if (result.notFound) {
      return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });
    }
    if (result.forbidden) {
      return NextResponse.json({ error: result.forbidden }, { status: 403 });
    }
    if (result.conflict) {
      return NextResponse.json({ error: result.conflict }, { status: 409 });
    }
    return NextResponse.json({
      run: result.run,
      message: "Payroll finalized — payslips are now visible to employees.",
      ...([result.auditWarning, result.notificationWarning].filter(Boolean).length
        ? { warnings: [result.auditWarning, result.notificationWarning].filter(Boolean) }
        : {}),
    });
  } catch (error) {
    console.error("POST /api/payroll/runs/[id]/finalize failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
