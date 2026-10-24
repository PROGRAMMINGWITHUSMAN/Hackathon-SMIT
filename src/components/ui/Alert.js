// Shared inline alert/banner for form and page-level messages.
// Uses the status token pairs from globals.css (dark text on light tint),
// so contrast stays accessible. Errors announce themselves to screen
// readers via role="alert"; the others are polite status messages.

const TONES = {
  error: "border-danger/40 bg-danger-bg text-danger",
  success: "border-success/40 bg-success-bg text-success",
  warning: "border-warning/40 bg-warning-bg text-warning",
  info: "border-info/40 bg-info-bg text-info",
};

export default function Alert({ tone = "info", children }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border p-3 text-sm ${TONES[tone]}`}
    >
      {children}
    </p>
  );
}
