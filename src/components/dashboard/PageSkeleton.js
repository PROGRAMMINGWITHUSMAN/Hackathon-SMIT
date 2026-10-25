// Shared skeleton pieces for the dashboard feature pages (employees,
// attendance, leave, payroll): heading + stat cards + a table-shaped block.
// Server components with zero client JS; pulse animation disabled under
// prefers-reduced-motion.
export function PageSkeleton({ cards = 4, rows = 6, withToolbar = true }) {
  return (
    <div aria-busy="true" aria-label="Loading page" className="flex flex-col gap-6">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-sage/60 motion-reduce:animate-none" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="h-7 w-16 animate-pulse rounded bg-sage/60 motion-reduce:animate-none" />
            <div className="mt-3 h-4 w-32 animate-pulse rounded bg-sage/40 motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      {withToolbar && (
        <div className="flex gap-3">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-sage/40 motion-reduce:animate-none" />
          <div className="h-10 w-36 animate-pulse rounded-xl bg-sage/40 motion-reduce:animate-none" />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line bg-page/60 px-4 py-3">
          <div className="flex gap-8">
            {["Employee", "Department", "Status", "Actions"].map((h, i) => (
              <div
                key={i}
                className="h-3 w-24 animate-pulse rounded bg-sage/50 motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-sage/50 motion-reduce:animate-none" />
            <div className="h-4 w-40 animate-pulse rounded bg-sage/50 motion-reduce:animate-none" />
            <div className="ml-auto h-4 w-24 animate-pulse rounded bg-sage/40 motion-reduce:animate-none" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-sage/40 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
