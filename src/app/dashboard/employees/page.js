import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listEmployeeProfiles } from "@/lib/employees";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NoProfileScreen from "@/components/dashboard/NoProfileScreen";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmployeesClient from "@/components/employees/EmployeesClient";
import { IconUsers } from "@/components/ui/icons";

// Server Component. Identity, role, and organization are resolved here on
// the server; the client component below only receives data this viewer is
// allowed to see (the API re-checks everything for every mutation).
export default async function EmployeesPage() {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!profile) {
    return <NoProfileScreen email={user.email} />;
  }

  if (profile.role === "employee") {
    return (
      <DashboardShell
        title="Employees"
        email={user.email}
        fullName={profile.full_name}
        role={profile.role}
      >
        <Card>
          <Alert tone="warning">
            The employee directory is available to Admin and HR accounts. If
            you believe you should have access, contact your administrator.
          </Alert>
        </Card>
      </DashboardShell>
    );
  }

  let employees = [];
  let loadFailed = false;
  try {
    employees = await listEmployeeProfiles(profile.organization_id);
  } catch (error) {
    console.error("Employees page failed to load directory:", error);
    loadFailed = true;
  }

  return (
    <DashboardShell
      title="Employees"
      email={user.email}
      fullName={profile.full_name}
      role={profile.role}
    >
      {loadFailed ? (
        <Card>
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-bg text-warning">
              <IconUsers className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                Could not load the directory
              </p>
              <p className="mt-1 text-sm text-muted">
                Something went wrong on our side. Refresh the page to retry.
              </p>
            </div>
            <Link href="/dashboard/employees" className="text-sm font-medium text-primary hover:underline">
              Retry
            </Link>
          </div>
        </Card>
      ) : (
        <EmployeesClient
          employees={employees}
          viewerRole={profile.role}
          viewerId={profile.id}
          loadFailed={false}
        />
      )}
    </DashboardShell>
  );
}
