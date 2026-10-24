"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button, { buttonClasses } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import AttendanceStatusBadge, {
  formatMinutes,
} from "./AttendanceStatusBadge";
import CorrectDialog from "./CorrectDialog";
import { initialsOf } from "@/components/employees/EmployeeDetailDialog";
import { karachiTimeLabel } from "@/lib/attendance-rules.mjs";

// HR/Admin attendance view: pick a date, see the whole organization for that
// day — summary counts, per-employee statuses (absent is derived, never
// written), search + status filter, and audited time corrections.

const SUMMARY_CARDS = [
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "half_day", label: "Half-day" },
  { key: "absent", label: "Absent" },
  { key: "missing_checkout", label: "Missing checkout" },
  { key: "on_leave", label: "On leave" },
];

export default function AttendanceAdmin({ initial, today }) {
  const [date, setDate] = useState(today);
  const [view, setView] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [correcting, setCorrecting] = useState(null); // record object

  async function loadView(newDate) {
    setLoading(true);
    setError("");
    setBanner("");
    try {
      const response = await fetch(`/api/attendance?date=${newDate}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not load attendance.");
      } else {
        setView(data);
      }
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return view.records.filter((r) => {
      if (statusFilter !== "all" && r.effective_status !== statusFilter)
        return false;
      if (q !== "" && !`${r.employee.full_name} ${r.employee.department ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [view, query, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Attendance
          </h2>
          <p className="mt-1 text-sm text-muted">
            Organization view · times in PKT · absent is derived only for past
            working days.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Date
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                setDate(e.target.value);
                if (e.target.value) loadView(e.target.value);
              }}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
            />
          </label>
          <Button variant="secondary" onClick={() => loadView(date)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      {banner !== "" && <Alert tone="success">{banner}</Alert>}
      {error !== "" && <Alert tone="error">{error}</Alert>}

      {!view.is_working_day && (
        <Alert tone="info">
          {view.holiday_name
            ? `${view.date} is a holiday — ${view.holiday_name}. No attendance is expected.`
            : `${view.date} falls on a weekend. No attendance is expected.`}
        </Alert>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {SUMMARY_CARDS.map((s) => (
          <Card key={s.key}>
            <p className="text-2xl font-semibold text-ink">
              {view.summary[s.key] ?? 0}
            </p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        >
          <option value="all">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="half_day">Half-day</option>
          <option value="absent">Absent</option>
          <option value="missing_checkout">Missing checkout</option>
          <option value="on_leave">On leave</option>
          <option value="no_record">No check-in yet</option>
        </select>
      </div>

      {/* Records */}
      {filtered.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            No employees match this search or filter.
          </p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Employee</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Check-in</th>
                  <th scope="col" className="px-4 py-3 font-medium">Check-out</th>
                  <th scope="col" className="px-4 py-3 font-medium">Worked</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((r) => (
                  <tr key={r.employee.id} className="hover:bg-sage/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[11px] font-semibold text-primary">
                          {initialsOf(r.employee.full_name)}
                        </span>
                        <div>
                          <p className="font-medium text-ink">{r.employee.full_name}</p>
                          <p className="text-xs text-muted">
                            {r.employee.department ?? "No department"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AttendanceStatusBadge status={r.effective_status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {r.record ? karachiTimeLabel(r.record.check_in) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {r.record ? karachiTimeLabel(r.record.check_out) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatMinutes(r.worked_minutes)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.record ? (
                        <button
                          className={buttonClasses("ghost", "sm")}
                          onClick={() => setCorrecting(r.record)}
                        >
                          Correct
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

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((r) => (
              <div
                key={r.employee.id}
                className="rounded-xl border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{r.employee.full_name}</p>
                    <p className="text-xs text-muted">
                      {r.employee.department ?? "No department"}
                    </p>
                  </div>
                  <AttendanceStatusBadge status={r.effective_status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
                  <div>
                    <p>In</p>
                    <p className="font-medium text-ink">
                      {r.record ? karachiTimeLabel(r.record.check_in) ?? "—" : "—"}
                    </p>
                  </div>
                  <div>
                    <p>Out</p>
                    <p className="font-medium text-ink">
                      {r.record ? karachiTimeLabel(r.record.check_out) ?? "—" : "—"}
                    </p>
                  </div>
                  <div>
                    <p>Worked</p>
                    <p className="font-medium text-ink">{formatMinutes(r.worked_minutes)}</p>
                  </div>
                </div>
                {r.record && (
                  <button
                    className={`${buttonClasses("secondary", "sm")} mt-3 w-full`}
                    onClick={() => setCorrecting(r.record)}
                  >
                    Correct times
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {correcting && (
        <CorrectDialog
          record={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={(message) => {
            setCorrecting(null);
            setBanner(message ?? "Correction saved.");
            loadView(date);
          }}
        />
      )}
    </div>
  );
}
