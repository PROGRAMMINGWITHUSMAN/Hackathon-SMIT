"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button, { buttonClasses } from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";
import LeaveStatusBadge from "./LeaveStatusBadge";

// Employee leave view: balance cards, request form (validated server-side —
// the client only makes errors friendly), own request history with filters,
// and cancellation of PENDING requests only (documented policy).

export default function LeaveEmployee({ types, balances, requests }) {
  const router = useRouter();

  const [leaveType, setLeaveType] = useState(types[0]?.code ?? "annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});
    setBanner("");

    let response;
    try {
      response = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          reason,
        }),
      });
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.errors) setFieldErrors(data.errors);
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    setBanner([data.message ?? "Request submitted.", ...(data.warnings ?? [])].join(" "));
    setStartDate("");
    setEndDate("");
    setReason("");
    setLoading(false);
    router.refresh();
  }

  async function cancel(request) {
    setBusyId(request.id);
    setBanner("");
    setError("");
    const response = await fetch(`/api/leaves/${request.id}/cancel`, {
      method: "POST",
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Could not cancel the request.");
      setBusyId(null);
      return;
    }
    setBanner([data.message ?? "Request cancelled.", ...(data.warnings ?? [])].join(" "));
    setBusyId(null);
    router.refresh();
  }

  const filtered = useMemo(
    () =>
      statusFilter === "all"
        ? requests
        : requests.filter((r) => r.status === statusFilter),
    [requests, statusFilter]
  );

  const inputClass =
    "block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          My leave
        </h2>
        <p className="mt-1 text-sm text-muted">
          Weekends and holidays are never charged. Pending requests reserve
          your balance until reviewed.
        </p>
      </div>

      {banner !== "" && <Alert tone="success">{banner}</Alert>}
      {error !== "" && <Alert tone="error">{error}</Alert>}

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {types.map((t) => {
          const b = balances[t.code] ?? { used: 0, remaining: null, allowance: 0, unlimited: t.is_unlimited };
          return (
            <Card key={t.code}>
              <p className="text-sm font-semibold text-ink">{t.name}</p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {b.unlimited ? (
                  "Unlimited"
                ) : (
                  <>
                    {b.remaining}
                    <span className="text-base font-normal text-muted">
                      {" / "}
                      {b.allowance} days left
                    </span>
                  </>
                )}
              </p>
              {!b.unlimited && (
                <p className="mt-1 text-sm text-muted">{b.used} day(s) used or reserved</p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Request form */}
      <Card title="Request leave">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="leave_type" className="text-sm font-medium text-ink">
              Leave type *
            </label>
            <select
              id="leave_type"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className={inputClass}
            >
              {types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
            {fieldErrors.leave_type && (
              <p className="text-xs text-danger">{fieldErrors.leave_type}</p>
            )}
          </div>
          <div />
          <Input
            id="start_date"
            label="Start date *"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            error={fieldErrors.start_date}
          />
          <Input
            id="end_date"
            label="End date *"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            error={fieldErrors.end_date}
          />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="reason" className="text-sm font-medium text-ink">
              Reason (optional)
            </label>
            <textarea
              id="reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Short note for your reviewer…"
              className={inputClass}
            />
            {fieldErrors.reason && (
              <p className="text-xs text-danger">{fieldErrors.reason}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      </Card>

      {/* History */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">My requests</h3>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            {requests.length === 0
              ? "No leave requests yet — submit your first request above."
              : "No requests match this filter."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-page/60 text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Dates</th>
                <th scope="col" className="px-4 py-3 font-medium">Days</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Reviewed by</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-sage/20">
                  <td className="px-4 py-3 font-medium capitalize text-ink">{r.leave_type}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.start_date} → {r.end_date}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.days}</td>
                  <td className="px-4 py-3">
                    <LeaveStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {r.reviewer_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "pending" ? (
                      <button
                        className={buttonClasses("ghost", "sm")}
                        onClick={() => cancel(r)}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id ? "Cancelling…" : "Cancel"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
