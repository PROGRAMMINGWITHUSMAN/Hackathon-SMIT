import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

// The dashboard page frame: sidebar on desktop, top bar with mobile nav,
// and a centered content column. Rendered by the dashboard LAYOUT so the
// shell stays mounted across page navigations — pages render only their
// content into it. The page title in the topbar derives from the current
// pathname (see Topbar), so pages no longer pass it.

export default function DashboardShell({ email, fullName, role, children }) {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={email} fullName={fullName} role={role} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
