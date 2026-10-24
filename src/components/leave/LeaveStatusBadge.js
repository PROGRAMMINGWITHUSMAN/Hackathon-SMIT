import Badge from "@/components/ui/Badge";

const STATUS_MAP = {
  pending: { tone: "warning", label: "Pending" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "danger", label: "Rejected" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export default function LeaveStatusBadge({ status }) {
  const item = STATUS_MAP[status] ?? { tone: "neutral", label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
