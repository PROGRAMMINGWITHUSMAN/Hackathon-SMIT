import Badge from "@/components/ui/Badge";

// One place that turns an attendance status into a consistent badge.
// Used by the employee view, HR/Admin view, and history tables.

const STATUS_MAP = {
  present: { tone: "success", label: "Present" },
  late: { tone: "warning", label: "Late" },
  half_day: { tone: "warning", label: "Half-day" },
  absent: { tone: "danger", label: "Absent" },
  missing_checkout: { tone: "danger", label: "Missing checkout" },
  on_leave: { tone: "info", label: "On leave" },
  non_working: { tone: "neutral", label: "Non-working day" },
  not_joined: { tone: "neutral", label: "Not joined yet" },
  no_record: { tone: "neutral", label: "No check-in" },
};

export default function AttendanceStatusBadge({ status }) {
  const item = STATUS_MAP[status] ?? { tone: "neutral", label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function statusLabel(status) {
  return (STATUS_MAP[status] ?? { label: status }).label;
}

export function formatMinutes(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
