// Small pill label for statuses (role names, "Soon", success/error states).
// Tones use the status token pairs from globals.css — always a dark text
// color on its matching light background, so contrast stays accessible.

const TONES = {
  primary: "bg-primary-tint text-primary ring-primary/20",
  success: "bg-success-bg text-success ring-success/20",
  warning: "bg-warning-bg text-warning ring-warning/20",
  danger: "bg-danger-bg text-danger ring-danger/20",
  info: "bg-info-bg text-info ring-info/20",
  neutral: "bg-sage text-ink ring-black/10",
};

export default function Badge({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
