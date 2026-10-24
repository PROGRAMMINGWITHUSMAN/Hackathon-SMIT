"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button, { buttonClasses } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import LeaveStatusBadge from "./LeaveStatusBadge";
import LeaveDecisionDialog from "./LeaveDecisionDialog";
import { initialsOf } from "@/components/employees/EmployeeDetailDialog";

// HR/Admin leave management: pending summary, org-wide request list with
// filters, approve/reject (with optional comment), and reviewer info.
// All actions hit the API — the server re-checks roles, self-approval,
// transitions, balance, and organization scoping on every call.

export default function LeaveAdmin({ initial, types }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deciding, setDeciding] = useState(null); // { request, decision }

  async function load(opts = {}) {
    setLoading(true);
    setError("");
    setBanner("");
    const params = new URLSearchParams();
    if (opts.status ?? statusFilter !== "all") {
      const s = opts.status ?? (statusFilter === "all" ? null : statusFilter);
      if (s) params.set("status", s);
    }
    if (typeFilter !== "all") params.set("type", typeFilter);
    try {
      const response = await fetch(`/api/leaves?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not load leave requests.");
      } else {
        setView(data);
      }
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  async function cancel(request) {
    setError("");
    const response = await fetch(`/api/leaves/${request.id}/cancel`, {
      method: "POST",
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Could not cancel the request.");
      return;
    }
    setBanner(data.message ?? "Request cancelled.");
    await load();
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return view.requests.filter((r) => {
      if (typeFilter !== "all" && r.leave_type !== typeFilter) return false;
      if (q !== "") {
        const hay = `${r.employee_name ?? ""} ${r.employee_department ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [view, query, typeFilter]);

  const selectClass =
    "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Leave management
          </h2>
          <p className="mt-1 text-sm text-muted">
            Approve or reject requests for your organization. Approved leave
            shows as “On leave” in attendance.
          </p>
        </div>
        <Button variant="secondary" onClick={() => load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {banner !== "" && <Alert tone="success">{banner}</Alert>}
      {error !== "" && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-2xl font-semibold text-ink">{view.pendingCount}</p>
          <p className="mt-1 text-sm text-muted">Pending review</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-ink">
            {view.requests.filter((r) => r.status === "approved").length}
          </p>
          <p className="mt-1 text-sm text-muted">Approved (current list)</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold text-ink">
            {view.requests.filter((r) => r.status === "rejected").length}
          </p>
          <p className="mt-1 text-sm text-muted">Rejected (current list)</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee or department…"
          aria-label="Search employees"
          className="w-full flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            load({ status: e.target.value === "all" ? null : e.target.value });
          }}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by leave type"
          className={selectClass}
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            {view.requests.length === 0
              ? "No leave requests in your organization yet."
              : "No requests match the current filters."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-page/60 text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Employee</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Dates</th>
                <th scope="col" className="px-4 py-3 font-medium">Days</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Reviewer</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-sage/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[11px] font-semibold text-primary">
                        {initialsOf(r.employee_name ?? "?")}
                      </span>
                      <div>
                        <p className="font-medium text-ink">{r.employee_name}</p>
                        {r.reason && (
                          <p className="max-w-[220px] truncate text-xs text-muted" title={r.reason}>
                            “{r.reason}”
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{r.leave_type}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.start_date} → {r.end_date}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.days}</td>
                  <td className="px-4 py-3">
                    <LeaveStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.reviewer_name ? (
                      <span>
                        {r.reviewer_name}
                        {r.decided_at && (
                          <span className="block text-xs">
                            {new Date(r.decided_at).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {r.status === "pending" ? (
                        <>
                          <button
                            className={buttonClasses("ghost", "sm")}
                            onClick={() => setDeciding({ request: r, decision: "approve" })}
                          >
                            Approve
                          </button>
                          <button
                            className={buttonClasses("ghost", "sm")}
                            onClick={() => setDeciding({ request: r, decision: "reject" })}
                          >
                            Reject
                          </button>
                          <button
                            className={buttonClasses("ghost", "sm")}
                            onClick={() => cancel(r)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deciding && (
        <LeaveDecisionDialog
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={async (message) => {
            setDeciding(null);
            setBanner(message);
            await load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
