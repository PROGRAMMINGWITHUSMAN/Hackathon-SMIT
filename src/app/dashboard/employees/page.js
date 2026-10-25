import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listEmployeeProfiles } from "@/lib/employees";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import EmployeesClient from "@/components/employees/EmployeesClient";
import { IconUsers } from "@/components/ui/icons";

// Server Component. Identity, role, and organization are resolved here on
// the server; the client component below only receives data this viewer is
// allowed to see (the API re-checks everything for every mutation).
export default async function EmployeesPage() {
  // Layout guarantees a verified user with an active profile.
  const { profile } = await getCurrentUser();

  if (profile.role === "employee") {
    return (
      <Card>
        <Alert tone="warning">
          The employee directory is available to Admin and HR accounts. If
          you believe you should have access, contact your administrator.
        </Alert>
      </Card>
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

  if (loadFailed) {
    return (
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
          <Link
            href="/dashboard/employees"
            className="text-sm font-medium text-primary hover:underline"
          >
            Retry
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <EmployeesClient
      employees={employees}
      viewerRole={profile.role}
      viewerId={profile.id}
      loadFailed={false}
    />
  );
}
