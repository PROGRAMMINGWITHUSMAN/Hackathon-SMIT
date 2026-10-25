import { getCurrentUser } from "@/lib/auth";
import LeaveEmployee from "@/components/leave/LeaveEmployee";
import LeaveAdmin from "@/components/leave/LeaveAdmin";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import { getLeaveTypes, getEmployeeLeaveView, getOrgLeaveView } from "@/lib/leave";

// Server Component — role decides the view. Employees see only their own
// requests and balances; Admin/HR see the organization. The API enforces
// the same split for every direct call.

export default async function LeavePage() {
  // Layout guarantees a verified user with an active profile.
  const { profile } = await getCurrentUser();

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

  return content;
}
