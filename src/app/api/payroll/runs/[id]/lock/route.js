import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transitionPayrollRun } from "@/lib/payroll";

// POST /api/payroll/runs/[id]/lock — ADMIN ONLY. finalized → locked
// (compare-and-swap). Locked runs are immutable forever.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const guard = await requireApiUser(["admin"]);
    if (guard.errorResponse) return guard.errorResponse;

    const result = await transitionPayrollRun(guard.profile, id, "lock");
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
      message: "Payroll locked — it can no longer be changed.",
    });
  } catch (error) {
    console.error("POST /api/payroll/runs/[id]/lock failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
