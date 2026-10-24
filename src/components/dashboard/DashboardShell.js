import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

// The dashboard page frame: sidebar on desktop, top bar with mobile nav,
// and a centered content column. Pages stay server components and just wrap
// their content in this shell.

export default function DashboardShell({
  title,
  email,
  fullName,
  role,
  children,
}) {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} email={email} fullName={fullName} role={role} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
