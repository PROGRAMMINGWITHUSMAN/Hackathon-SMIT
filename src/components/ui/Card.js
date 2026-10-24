// Shared card container: surface panel, token border + soft shadow, optional
// title/description header row. Used for every content block in the app.

export default function Card({
  title,
  description,
  action,
  children,
  className = "",
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-card ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
