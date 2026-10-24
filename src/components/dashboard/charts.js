// Dependency-free charts built from design-token divs. Server-safe (no
// client JavaScript) with accessible labels; every bar carries a title with
// the exact numbers behind it. Empty data renders an honest empty state.

export function TrendChart({ days }) {
  if (!days || days.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No working days in this window yet.</p>;
  }
  const max = Math.max(
    ...days.map((d) => d.present + d.late + d.half_day + d.absent + d.on_leave + d.missing_checkout),
    1
  );
  const SEGMENTS = [
    { key: "present", label: "Present", cls: "bg-primary" },
    { key: "late", label: "Late", cls: "bg-warning" },
    { key: "half_day", label: "Half-day", cls: "bg-warning/60" },
    { key: "missing_checkout", label: "Missing checkout", cls: "bg-danger/60" },
    { key: "on_leave", label: "On leave", cls: "bg-info" },
    { key: "absent", label: "Absent", cls: "bg-danger" },
  ];
  return (
    <div>
      <div className="flex h-36 items-end gap-2" role="img" aria-label="Attendance over the last working days">
        {days.map((d) => {
          const total = d.present + d.late + d.half_day + d.absent + d.on_leave + d.missing_checkout;
          const title = `${d.date}: ${SEGMENTS.map((s) => `${s.label} ${d[s.key]}`).join(", ")} (expected ${total})`;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={title}>
              <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-md" aria-hidden="true">
                {SEGMENTS.map((s) => (
                  <div
                    key={s.key}
                    className={s.cls}
                    style={{ height: `${(d[s.key] / max) * 100}%`, minHeight: d[s.key] > 0 ? "2px" : "0" }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-muted">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`h-2 w-2 rounded-sm ${s.cls}`} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DepartmentBars({ distribution }) {
  if (!distribution || distribution.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No active employees yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {distribution.map((d) => (
        <li key={d.label}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink">{d.label}</span>
            <span className="text-muted">{d.count} · {d.share}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sage/60" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${d.share}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const LEAVE_STATUS_CLS = {
  approved: "bg-primary",
  pending: "bg-warning",
  rejected: "bg-danger",
  cancelled: "bg-zinc-300",
};
const LEAVE_STATUS_LABEL = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function LeaveMixBars({ mix }) {
  const types = Object.entries(mix ?? {});
  if (types.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No leave requests this year yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {types.map(([type, counts]) => {
        const total = Math.max(counts.total, 1);
        const title = `${type}: ${Object.entries(LEAVE_STATUS_LABEL)
          .map(([k, l]) => `${l} ${counts[k] ?? 0}`)
          .join(", ")}`;
        return (
          <li key={type} title={title}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium capitalize text-ink">{type}</span>
              <span className="text-muted">{counts.total} request{counts.total === 1 ? "" : "s"}</span>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-sage/60" aria-hidden="true">
              {Object.keys(LEAVE_STATUS_CLS).map((status) =>
                counts[status] ? (
                  <div
                    key={status}
                    className={LEAVE_STATUS_CLS[status]}
                    style={{ width: `${((counts[status] ?? 0) / total) * 100}%` }}
                  />
                ) : null
              )}
            </div>
          </li>
        );
      })}
      <li className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {Object.entries(LEAVE_STATUS_LABEL).map(([status, label]) => (
          <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`h-2 w-2 rounded-sm ${LEAVE_STATUS_CLS[status]}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </li>
    </ul>
  );
}
