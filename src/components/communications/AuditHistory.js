"use client";

import { useCallback, useEffect, useState } from "react";

export default function AuditHistory() {
  const [entries, setEntries] = useState([]);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "25", offset: String(nextOffset) });
    if (action) params.set("action", action);
    if (entity) params.set("entity", entity);
    try {
      const response = await fetch(`/api/audit?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load audit history.");
      setEntries(data.entries);
      setTotal(data.total);
      setOffset(nextOffset);
    } catch {
      setError("Audit history could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }, [action, entity]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(0); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Audit history</h2>
        <p className="mt-1 text-sm text-muted">Administrative actions, with sensitive values omitted.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); load(0); }} className="flex flex-wrap gap-3 rounded-xl border border-line bg-surface p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Action
          <select value={action} onChange={(event) => setAction(event.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">All actions</option>
            {["employee.created", "employee.updated", "employee.role_changed", "employee.status_changed", "attendance.corrected", "leave.approved", "leave.rejected", "leave.cancelled", "payroll.draft_created", "payroll.draft_recalculated", "payroll.finalized", "payroll.locked", "announcement.created", "announcement.updated", "announcement.published", "announcement.archived"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Area
          <select value={entity} onChange={(event) => setEntity(event.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">All areas</option>
            <option value="profiles">Employees</option>
            <option value="attendance">Attendance</option>
            <option value="leave_requests">Leave</option>
            <option value="payroll_runs">Payroll</option>
            <option value="announcements">Announcements</option>
          </select>
        </label>
        <button className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Filter</button>
      </form>

      {loading ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted" role="status">Loading audit history…</p>
      ) : error ? (
        <p className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger" role="alert">{error} <button type="button" onClick={() => load(offset)} className="font-semibold underline">Retry</button></p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">No audit entries found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-page/70 text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted"><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></td>
                  <td className="px-4 py-3 text-ink">{entry.actor_name}</td>
                  <td className="px-4 py-3"><span className="font-medium text-ink">{entry.action}</span><span className="block text-xs text-muted">{entry.entity}</span></td>
                  <td className="px-4 py-3 text-xs text-muted">{Object.entries(entry.details ?? {}).map(([key, value]) => <span key={key} className="mr-3 inline-block"><span className="font-medium text-ink">{key.replaceAll("_", " ")}:</span> {Array.isArray(value) ? value.join(", ") : String(value)}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button type="button" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - 25))} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">Newer</button>
        <span className="text-xs text-muted">{total ? `${offset + 1}–${Math.min(offset + entries.length, total)} of ${total}` : "0 entries"}</span>
        <button type="button" disabled={loading || offset + entries.length >= total} onClick={() => load(offset + 25)} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">Older</button>
      </div>
    </div>
  );
}
