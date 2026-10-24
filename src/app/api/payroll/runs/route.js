import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listPayrollRuns, createPayrollRun } from "@/lib/payroll";

// ---------------------------------------------------------------------------
// /api/payroll/runs
//   GET  : list the organization's payroll runs with totals (Admin/HR)
//   POST : create a DRAFT for {year, month} (Admin/HR). Duplicate period →
//          409 (also guarded by the DB unique constraint). Future month →
//          422. Malformed period → 400.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    const runs = await listPayrollRuns(guard.profile);
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("GET /api/payroll/runs failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const year = Number(body.year);
    const month = Number(body.month);
    const extra = Object.keys(body).filter((k) => !["year", "month"].includes(k));
    if (extra.length > 0) {
      return NextResponse.json(
        { error: `Unexpected field(s): ${extra.join(", ")}.` },
        { status: 400 }
      );
    }

    const result = await createPayrollRun(guard.profile, { year, month });

    if (result.badRequest) {
      return NextResponse.json({ error: result.badRequest }, { status: 400 });
    }
    if (result.validationErrors) {
      return NextResponse.json(
        { error: result.validationErrors.period, errors: result.validationErrors },
        { status: 422 }
      );
    }
    if (result.conflict) {
      return NextResponse.json({ error: result.conflict }, { status: 409 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/payroll/runs failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
