import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NoProfileScreen from "@/components/dashboard/NoProfileScreen";
import LeaveEmployee from "@/components/leave/LeaveEmployee";
import LeaveAdmin from "@/components/leave/LeaveAdmin";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import { getLeaveTypes, getEmployeeLeaveView, getOrgLeaveView } from "@/lib/leave";

// Server Component — role decides the view. Employees see only their own
// requests and balances; Admin/HR see the organization. The API enforces
// the same split for every direct call.

export default async function LeavePage() {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }
  if (!profile) {
    return <NoProfileScreen email={user.email} />;
  }

  // Fetch first (try/catch around data only), build JSX afterwards.
  let types = null;
  let employeeView = null;
  let orgView = null;
  let loadError = false;
  try {
    types = await getLeaveTypes();
    if (profile.role === "employee") {
      employeeView = await getEmployeeLeaveView(profile);
    } else {
      orgView = await getOrgLeaveView(profile, {});
    }
  } catch (error) {
    console.error("Leave page failed to load:", error);
    loadError = true;
  }

  let content;
  if (loadError) {
    content = (
      <Card>
        <Alert tone="error">
          Could not load leave data. Refresh the page to try again.
        </Alert>
      </Card>
    );
  } else if (profile.role === "employee") {
    content = (
      <LeaveEmployee
        types={types}
        balances={employeeView.balances}
        requests={employeeView.requests}
      />
    );
  } else {
    content = <LeaveAdmin initial={orgView} types={types} />;
  }

  return (
    <DashboardShell
      title="Leave"
      email={user.email}
      fullName={profile.full_name}
      role={profile.role}
    >
      {content}
    </DashboardShell>
  );
}
