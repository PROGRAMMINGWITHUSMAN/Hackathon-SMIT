// Overview skeleton — heading + stat-card row + two chart/table blocks.
// Shown by the nearest Suspense boundary (this segment or any nested page
// without its own loading.js) while the server fetches real data. Renders
// inside the persistent dashboard layout, so the sidebar never flashes.
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="flex flex-col gap-6">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-sage/60 motion-reduce:animate-none" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-sage/60 motion-reduce:animate-none" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-sage/60 motion-reduce:animate-none" />
            </div>
            <div className="mt-4 h-7 w-20 animate-pulse rounded bg-sage/60 motion-reduce:animate-none" />
            <div className="mt-2 h-4 w-36 animate-pulse rounded bg-sage/40 motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="h-4 w-48 animate-pulse rounded bg-sage/60 motion-reduce:animate-none" />
            <div className="mt-2 h-3 w-64 animate-pulse rounded bg-sage/40 motion-reduce:animate-none" />
            <div className="mt-6 flex h-36 items-end gap-2">
              {[40, 70, 55, 85, 60, 75, 45].map((h, j) => (
                <div
                  key={j}
                  className="w-full animate-pulse rounded-md bg-sage/50 motion-reduce:animate-none"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
