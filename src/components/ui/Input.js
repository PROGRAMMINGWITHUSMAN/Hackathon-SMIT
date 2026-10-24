// Labeled input using design tokens. Shows the danger border + message when
// there is an error. Extra props (type, value, onChange, placeholder,
// required, autoComplete…) pass straight through to the native <input>.

export default function Input({ label, error, id, className = "", ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        id={id}
        className={[
          "block w-full rounded-xl border px-3 py-2 text-sm text-ink placeholder-muted shadow-card transition",
          "focus:outline-none focus:ring-2",
          error
            ? "border-danger/60 focus:border-danger focus:ring-danger/30"
            : "border-line focus:border-primary focus:ring-focus/30",
          className,
        ].join(" ")}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
