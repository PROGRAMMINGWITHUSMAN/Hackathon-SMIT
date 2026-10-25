import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { karachiDateString } from "@/lib/attendance-rules.mjs";
import { recordAudit, sendNotification } from "@/lib/communications";
import {
  validateLeaveInput,
  computeBalances,
  rangesOverlap,
  countWorkingDays,
  ACTIVE_STATUSES,
} from "@/lib/leave-rules.mjs";

// ---------------------------------------------------------------------------
// Leave data layer — SERVER ONLY. Same conventions as the employees and
// attendance modules: callers are already verified via requireApiUser();
// every query is scoped by the caller's organization_id.
//
// Concurrency design (documented in BUSINESS_RULES.md):
//   - Submit: validate → insert → RE-validate against the database → if the
//     world changed under us (another concurrent request), delete ONLY our
//     own row (compensation) and return 422. Whoever re-validates last wins;
//     overlapping double-booking self-heals.
//   - Review/cancel: compare-and-swap via UPDATE ... WHERE status='pending'.
//     A second reviewer (or double-click) updates zero rows → 409.
// ---------------------------------------------------------------------------

const REQUEST_COLUMNS =
  "id, organization_id, employee_id, leave_type, start_date, end_date, reason, status, decided_by, decided_at, created_at";

async function getHolidayDates(admin, organizationId) {
  const { data, error } = await admin
    .from("holidays")
    .select("holiday_date")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data ?? []).map((h) => h.holiday_date);
}

async function getLeaveTypesInternal(admin) {
  const { data, error } = await admin.from("leave_types").select("*");
  if (error) throw error;
  return data ?? [];
}

// Attach employee/reviewer names to raw request rows (single extra query).
async function withNames(admin, organizationId, rows) {
  const ids = new Set();
  rows.forEach((r) => {
    ids.add(r.employee_id);
    if (r.decided_by) ids.add(r.decided_by);
  });
  if (ids.size === 0) return [];
  const { data: people, error } = await admin
    .from("profiles")
    .select("id, full_name, department")
    .eq("organization_id", organizationId)
    .in("id", Array.from(ids));
  if (error) throw error;
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    employee_name: byId.get(r.employee_id)?.full_name ?? null,
    employee_department: byId.get(r.employee_id)?.department ?? null,
    reviewer_name: r.decided_by ? byId.get(r.decided_by)?.full_name ?? null : null,
  }));
}

async function notify(admin, organizationId, userIds, title, body, dedupeKey) {
  return sendNotification({ organizationId, userIds, title, body, dedupeKey });
}

async function audit(admin, organizationId, actorId, action, entityId, details) {
  return recordAudit({
    organizationId,
    actorId,
    action,
    entity: "leave_requests",
    entityId,
    details,
  });
}

// --- Reads ----------------------------------------------------------------

export async function getLeaveTypes() {
  return getLeaveTypesInternal(createAdminClient());
}

// Employee view: own requests (newest first) + current-year balances.
export async function getEmployeeLeaveView(callerProfile, nowUtc = new Date()) {
  const admin = createAdminClient();
  const { organization_id: orgId, id: employeeId } = callerProfile;

  const [types, holidayDates, requestsRaw] = await Promise.all([
    getLeaveTypesInternal(admin),
    getHolidayDates(admin, orgId),
    admin
      .from("leave_requests")
      .select(REQUEST_COLUMNS)
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
  ]);

  const year = karachiDateString(nowUtc).slice(0, 4);
  const balances = computeBalances({
    types,
    requests: requestsRaw,
    year,
    holidayDates,
  });

  const requests = await withNames(admin, orgId, requestsRaw);
  return {
    year,
    balances,
    requests: requests.map(withComputedDays(holidayDates)),
  };
}

// HR/Admin view: org-wide requests with filters + pending summary.
export async function getOrgLeaveView(
  callerProfile,
  { status, leaveType, employeeId, fromDate, toDate } = {}
) {
  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;

  let query = admin
    .from("leave_requests")
    .select(REQUEST_COLUMNS)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  if (leaveType) query = query.eq("leave_type", leaveType);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (fromDate) query = query.gte("end_date", fromDate);
  if (toDate) query = query.lte("start_date", toDate);

  const { data: rows, error } = await query;
  if (error) throw error;

  const holidayDates = await getHolidayDates(admin, orgId);
  const requests = await withNames(admin, orgId, rows ?? []);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  return {
    pendingCount,
    requests: requests.map(withComputedDays(holidayDates)),
  };
}

function withComputedDays(holidayDates) {
  return (r) => ({
    ...r,
    days: countWorkingDays(r.start_date, r.end_date, holidayDates) ?? 0,
  });
}

// --- Submit -----------------------------------------------------------------

export async function submitLeaveRequest(callerProfile, input, nowUtc = new Date()) {
  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;

  const [types, holidayDates, existing] = await Promise.all([
    getLeaveTypesInternal(admin),
    getHolidayDates(admin, orgId),
    admin
      .from("leave_requests")
      .select(REQUEST_COLUMNS)
      .eq("organization_id", orgId)
      .eq("employee_id", callerProfile.id)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
  ]);

  const { errors, values } = validateLeaveInput(input, {
    types,
    existingRequests: existing,
    holidayDates,
  });
  if (errors) return { validationErrors: errors };

  const { data: inserted, error: insertError } = await admin
    .from("leave_requests")
    .insert({
      organization_id: orgId,
      employee_id: callerProfile.id, // verified caller — never from the body
      leave_type: values.leave_type,
      start_date: values.start_date,
      end_date: values.end_date,
      reason: values.reason,
      status: "pending",
    })
    .select(REQUEST_COLUMNS)
    .single();
  if (insertError) throw insertError;

  // Post-insert re-validation (race protection): re-read the ACTIVE set and
  // re-check overlap + balance including our own new row. On overlap, the
  // EARLIEST-created request wins: a later duplicate deletes only itself, so
  // concurrent submissions always leave exactly one survivor (never zero,
  // never two). Balance overruns always delete the new row.
  const recheck = await revalidateActiveSet(
    admin,
    orgId,
    callerProfile.id,
    inserted,
    types,
    holidayDates
  );
  if (recheck) {
    let keepOurs = false;
    if (recheck.kind === "overlap") {
      keepOurs = await amIEarliestOverlapping(
        admin,
        orgId,
        callerProfile.id,
        inserted
      );
    }
    if (!keepOurs) {
      await admin.from("leave_requests").delete().eq("id", inserted.id);
      return { validationErrors: recheck.errors };
    }
  }

  // Notify the org's reviewers (Admin + HR profiles) about the new request.
  const { data: reviewers, error: reviewerError } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("role", ["admin", "hr"])
    .neq("id", callerProfile.id);
  let notificationWarning = null;
  if (reviewerError) {
    console.error("Leave reviewers could not be loaded:", reviewerError.message);
    notificationWarning = "The request was submitted, but reviewer notifications could not be delivered.";
  } else if (!reviewers?.length) {
    notificationWarning = "The request was submitted, but no active reviewer is available to notify.";
  } else {
    notificationWarning = await notify(
      admin,
      orgId,
      (reviewers ?? []).map((r) => r.id),
      "New leave request",
      "A new leave request is ready for review.",
      `leave-request:${inserted.id}:submitted`
    );
  }

  return { request: inserted, days: values.days, notificationWarning };
}

// Checks the ACTIVE set (pending+approved) of one employee against a
// candidate row. Returns { kind, errors } or null when everything is fine.
async function revalidateActiveSet(
  admin,
  orgId,
  employeeId,
  candidate,
  types,
  holidayDates
) {
  const { data: activeRaw, error } = await admin
    .from("leave_requests")
    .select(REQUEST_COLUMNS)
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .in("status", ACTIVE_STATUSES);
  if (error) throw error;
  const active = activeRaw ?? [];

  const others = active.filter((r) => r.id !== candidate.id);
  const overlapping = others.filter((r) =>
    rangesOverlap(
      candidate.start_date,
      candidate.end_date,
      r.start_date,
      r.end_date
    )
  );
  if (overlapping.length > 0) {
    return {
      kind: "overlap",
      errors: {
        end_date:
          "This range overlaps an existing pending or approved leave request.",
      },
    };
  }

  const type = types.find((t) => t.code === candidate.leave_type);
  if (type && !type.is_unlimited) {
    const balances = computeBalances({
      types,
      requests: active, // includes the candidate row itself
      year: candidate.start_date.slice(0, 4),
      holidayDates,
    });
    if (balances[candidate.leave_type].remaining < 0) {
      return {
        kind: "balance",
        errors: {
          leave_type: `Insufficient ${type.name} balance for this request.`,
        },
      };
    }
  }
  return null;
}

// Overlap arbitration: is OUR row the earliest-created of the overlapping
// ACTIVE set? The earliest keeps itself; later duplicates delete themselves.
async function amIEarliestOverlapping(admin, orgId, employeeId, ours) {
  const { data: rows, error } = await admin
    .from("leave_requests")
    .select("id, created_at")
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .in("status", ACTIVE_STATUSES)
    .lte("start_date", ours.end_date)
    .gte("end_date", ours.start_date);
  if (error) throw error;
  const overlapping = [ours, ...(rows ?? []).filter((r) => r.id !== ours.id)];
  overlapping.sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) ||
    String(a.id).localeCompare(String(b.id))
  );
  return overlapping[0].id === ours.id;
}

// --- Review (approve / reject) ------------------------------------------------

export async function reviewLeaveRequest(
  callerProfile,
  requestId,
  decision, // "approved" | "rejected"
  comment
) {
  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;

  const { data: request, error: fetchError } = await admin
    .from("leave_requests")
    .select(REQUEST_COLUMNS)
    .eq("organization_id", orgId) // other org's id → simply not found
    .eq("id", requestId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!request) return { notFound: true };

  // Nobody reviews their own request (checked here AND at the route).
  if (request.employee_id === callerProfile.id) {
    return { forbidden: "You cannot approve or reject your own leave request." };
  }
  if (request.status !== "pending") {
    return { conflict: `This request was already ${request.status}.` };
  }

  // Approving must still respect overlaps and balances among ACTIVE rows.
  if (decision === "approved") {
    const [types, holidayDates] = await Promise.all([
      getLeaveTypesInternal(admin),
      getHolidayDates(admin, orgId),
    ]);
    const problem = await revalidateActiveSet(
      admin,
      orgId,
      request.employee_id,
      request,
      types,
      holidayDates
    );
    if (problem) return { validationErrors: problem.errors };
  }

  const decidedAt = new Date().toISOString();
  // Compare-and-swap: only a still-pending row can change. A concurrent
  // reviewer updates zero rows → conflict, not double-processing.
  const { data: updated, error: updateError, count } = await admin
    .from("leave_requests")
    .update({
      status: decision,
      decided_by: callerProfile.id,
      decided_at: decidedAt,
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select(REQUEST_COLUMNS);
  if (updateError) throw updateError;
  if (!updated || updated.length === 0) {
    return { conflict: "This request was already reviewed by someone else." };
  }

  const typeName = request.leave_type;
  const notificationWarning = await notify(
    admin,
    orgId,
    [request.employee_id],
    decision === "approved" ? "Leave approved" : "Leave rejected",
    decision === "approved"
      ? `Your ${typeName} leave request was approved.`
      : `Your ${typeName} leave request was rejected.`,
    `leave-request:${requestId}:${decision}`
  );

  const auditWarning = await audit(admin, orgId, callerProfile.id, `leave.${decision}`, requestId, {
    before_status: request.status,
    after_status: decision,
    comment_added: typeof comment === "string" && comment.trim().length > 0,
  });
  return { request: updated[0], notificationWarning, auditWarning };
}

// --- Cancel / withdraw ---------------------------------------------------------

// Policy: only PENDING requests can be cancelled. The owner may cancel their
// own; Admin/HR may cancel anyone's pending request in their organization.
// Approved leave is historical — correct it by asking HR, not by withdrawing.
export async function cancelLeaveRequest(callerProfile, requestId) {
  const admin = createAdminClient();
  const orgId = callerProfile.organization_id;

  const { data: request, error: fetchError } = await admin
    .from("leave_requests")
    .select(REQUEST_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!request) return { notFound: true };

  const isOwner = request.employee_id === callerProfile.id;
  const isReviewer = callerProfile.role === "admin" || callerProfile.role === "hr";
  if (!isOwner && !isReviewer) {
    return { forbidden: "You can only cancel your own requests." };
  }
  if (request.status !== "pending") {
    return { conflict: "Only pending requests can be cancelled." };
  }

  const { data: updated, error: updateError } = await admin
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("status", "pending") // compare-and-swap
    .select(REQUEST_COLUMNS);
  if (updateError) throw updateError;
  if (!updated || updated.length === 0) {
    return { conflict: "This request was already processed." };
  }

  // If a reviewer cancels someone's pending request, tell the employee.
  let notificationWarning = null;
  if (!isOwner) {
    notificationWarning = await notify(
      admin,
      orgId,
      [request.employee_id],
      "Leave request cancelled",
      "Your leave request was cancelled.",
      `leave-request:${requestId}:cancelled`
    );
  }
  const auditWarning = await audit(admin, orgId, callerProfile.id, "leave.cancelled", requestId, {
    before_status: "pending",
    after_status: "cancelled",
  });

  return { request: updated[0], notificationWarning, auditWarning };
}
