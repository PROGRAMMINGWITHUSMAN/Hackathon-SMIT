import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NoProfileScreen from "@/components/dashboard/NoProfileScreen";

// Dashboard layout — runs ONCE per navigation and keeps the shell (sidebar,
// topbar) mounted while only the content area swaps between pages. This is
// what prevents sidebar flashing/remounting on every navigation.
//
// Auth lives here too: unauthenticated → /login; signed in without an
// active profile → the terminal screen (the page below never renders).
export default async function DashboardLayout({ children }) {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!profile) {
    return <NoProfileScreen email={user.email} />;
  }

  return (
    <DashboardShell email={user.email} fullName={profile.full_name} role={profile.role}>
      {children}
    </DashboardShell>
  );
}
