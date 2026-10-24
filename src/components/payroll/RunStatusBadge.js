import Badge from "@/components/ui/Badge";

const STATUS_MAP = {
  draft: { tone: "warning", label: "Draft" },
  finalized: { tone: "success", label: "Finalized" },
  locked: { tone: "neutral", label: "Locked" },
};

export default function RunStatusBadge({ status }) {
  const item = STATUS_MAP[status] ?? { tone: "neutral", label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
