"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import AttendanceStatusBadge, { formatMinutes } from "./AttendanceStatusBadge";
import { karachiTimeLabel } from "@/lib/attendance-rules.mjs";

// Employee attendance view: today's card with check-in / check-out actions
// (calls the API — the server owns all timestamps and decisions), plus the
// employee's OWN history with a status filter. Times show Karachi (PKT).

export default function AttendanceEmployee({ today, history }) {
  const router = useRouter();
  const [loading, setLoading] = useState(null); // "in" | "out" | null
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const record = today.record;

  async function attend(action) {
    setLoading(action);
    setError("");
    setBanner("");
    let response;
    try {
      response = await fetch(`/api/attendance/${action === "in" ? "check-in" : "check-out"}`, {
        method: "POST",
      });
    } catch {
      setError("Network error — please try again.");
      setLoading(null);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(null);
      return;
    }
    setBanner(data.message ?? "Done.");
    setLoading(null);
    router.refresh();
  }

  const filteredHistory = useMemo(
    () =>
      statusFilter === "all"
        ? history
        : history.filter((h) => h.effective_status === statusFilter),
    [history, statusFilter]
  );

  const durationNote =
    record && record.check_in && !record.check_out
      ? "Duration will appear once you check out."
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          My attendance
        </h2>
        <p className="mt-1 text-sm text-muted">
          Times are Pakistan Standard Time (PKT). Office starts 09:00; after
          09:15 counts as Late.
        </p>
      </div>

      {banner !== "" && <Alert tone="success">{banner}</Alert>}
      {error !== "" && <Alert tone="error">{error}</Alert>}

      {/* Today card */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Today · {today.date}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <AttendanceStatusBadge status={today.effective_status} />
              {today.holiday_name && (
                <span className="text-sm text-muted">
                  Holiday — {today.holiday_name}
                </span>
              )}
            </div>
            {record && (
              <div className="mt-4 grid grid-cols-3 gap-6 text-sm">
                <div>
                  <p className="text-muted">Check-in</p>
                  <p className="font-medium text-ink">
                    {karachiTimeLabel(record.check_in) ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Check-out</p>
                  <p className="font-medium text-ink">
                    {karachiTimeLabel(record.check_out) ?? "Pending"}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Worked</p>
                  <p className="font-medium text-ink">
                    {formatMinutes(today.worked_minutes)}
                  </p>
                </div>
              </div>
            )}
            {durationNote && (
              <p className="mt-3 text-xs text-muted">{durationNote}</p>
            )}
          </div>

          <div className="flex gap-2">
            {!today.is_working_day ? (
              <span className="max-w-[220px] rounded-xl border border-line bg-sage/40 p-3 text-xs text-muted">
                Today is a non-working day (weekend or holiday) — attendance is
                not recorded.
              </span>
            ) : !record ? (
              <Button onClick={() => attend("in")} disabled={loading !== null}>
                {loading === "in" ? "Checking in…" : "Check in"}
              </Button>
            ) : !record.check_out ? (
              <Button onClick={() => attend("out")} disabled={loading !== null}>
                {loading === "out" ? "Checking out…" : "Check out"}
              </Button>
            ) : (
              <span className="rounded-xl border border-line bg-sage/40 p-3 text-xs text-muted">
                Day complete — checked out.
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* History */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Recent history</h3>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter history by status"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        >
          <option value="all">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="half_day">Half-day</option>
          <option value="missing_checkout">Missing checkout</option>
          <option value="on_leave">On leave</option>
        </select>
      </div>

      {filteredHistory.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            {history.length === 0
              ? "No attendance records yet — they appear here after your first check-in."
              : "No records match this filter."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-page/60 text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Check-in</th>
                <th scope="col" className="px-4 py-3 font-medium">Check-out</th>
                <th scope="col" className="px-4 py-3 font-medium">Worked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredHistory.map((h) => (
                <tr key={h.id} className="hover:bg-sage/20">
                  <td className="px-4 py-3 font-medium text-ink">{h.work_date}</td>
                  <td className="px-4 py-3">
                    <AttendanceStatusBadge status={h.effective_status} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {karachiTimeLabel(h.check_in) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {karachiTimeLabel(h.check_out) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatMinutes(h.worked_minutes)}
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
