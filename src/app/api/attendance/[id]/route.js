import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { correctAttendance } from "@/lib/attendance";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/employees";
import { validateCorrectionTimes } from "@/lib/attendance-rules.mjs";

// ---------------------------------------------------------------------------
// PATCH /api/attendance/[id] — HR/Admin correction of an existing record.
//
//   Body (at least one key): { check_in, check_out } as ISO timestamps
//   (check_out may be null to re-open a day). Anything else is rejected.
//   work_date / status / employee / organization are NEVER editable — the
//   status is recalculated server-side from the new times.
//
//   Partial updates are merged with the stored row before validating order
//   (sending only check_out must still be after the stored check_in).
//
//   Every correction writes a before/after entry to audit_logs — records
//   are never silently overwritten without a trace.
// ---------------------------------------------------------------------------

const CORRECTABLE_FIELDS = ["check_in", "check_out"];

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: "Invalid attendance id." },
        { status: 400 }
      );
    }

    const guard = await requireApiUser(["admin", "hr"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile: caller } = guard;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const unknownFields = Object.keys(body).filter(
      (key) => !CORRECTABLE_FIELDS.includes(key)
    );
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { error: `Unexpected field(s): ${unknownFields.join(", ")}.` },
        { status: 400 }
      );
    }
    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Org-scoped lookup: an id from another organization simply 404s.
    const admin = createAdminClient();
    const { data: row, error: fetchError } = await admin
      .from("attendance")
      .select("check_in, check_out")
      .eq("organization_id", caller.organization_id)
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) {
      return NextResponse.json(
        { error: "Attendance record not found." },
        { status: 404 }
      );
    }

    // Merge the partial body with stored values, then validate together.
    const checkInValue = "check_in" in body ? body.check_in : row.check_in;
    const checkOutValue = "check_out" in body ? body.check_out : row.check_out;
    const { errors, values } = validateCorrectionTimes(checkInValue, checkOutValue);
    if (errors) {
      return NextResponse.json(
        { error: "Validation failed.", errors },
        { status: 400 }
      );
    }

    const result = await correctAttendance(caller, id, values);
    const payload = { record: result.record };
    if (result.auditWarning) {
      payload.audit_warning =
        "Correction saved, but the audit log entry could not be written.";
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error("PATCH /api/attendance/[id] failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
