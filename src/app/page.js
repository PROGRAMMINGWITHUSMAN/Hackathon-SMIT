export default function Home() {
  const modules = [
    "Auth & Roles",
    "Organization Setup",
    "Employees",
    "Attendance",
    "Leave",
    "Payroll",
    "Dashboard",
    "AI Assistant",
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
          Saylani Hackathon
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">
          HCM Lite
        </h1>
        <p className="mt-3 text-zinc-600">
          A lightweight HR Management System — attendance, leave, payroll and
          more, with server-enforced roles.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {modules.map((m) => (
            <span
              key={m}
              className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
            >
              {m}
            </span>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Phase 1 (foundation) complete — awaiting review.</strong>{" "}
          First-run organization setup arrives in Phase 2. There is nothing to
          log in to yet.
        </div>
      </main>
    </div>
  );
}
