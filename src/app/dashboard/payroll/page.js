import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NoProfileScreen from "@/components/dashboard/NoProfileScreen";
import PayrollAdmin from "@/components/payroll/PayrollAdmin";
import PayrollEmployee from "@/components/payroll/PayrollEmployee";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import { listPayrollRuns, getOwnPayslips } from "@/lib/payroll";
import { karachiDateString } from "@/lib/attendance-rules.mjs";

// Server Component — HR/Admin get the payroll workspace; employees get their
// own finalized payslips. The API enforces the same split for direct calls.

export default async function PayrollPage() {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }
  if (!profile) {
    return <NoProfileScreen email={user.email} />;
  }

  const today = karachiDateString(new Date());
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  // Fetch first (try/catch around data only), build JSX afterwards.
  let payslips = null;
  let runs = null;
  let loadError = false;
  try {
    if (profile.role === "employee") {
      payslips = await getOwnPayslips(profile);
    } else {
      runs = await listPayrollRuns(profile);
    }
  } catch (error) {
    console.error("Payroll page failed to load:", error);
    loadError = true;
  }

  let content;
  if (loadError) {
    content = (
      <Card>
        <Alert tone="error">
          Could not load payroll. Refresh the page to try again.
        </Alert>
      </Card>
    );
  } else if (profile.role === "employee") {
    content = <PayrollEmployee payslips={payslips} />;
  } else {
    content = (
      <PayrollAdmin
        initialRuns={runs}
        viewerRole={profile.role}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    );
  }

  return (
    <DashboardShell
      title="Payroll"
      email={user.email}
      fullName={profile.full_name}
      role={profile.role}
    >
      {content}
    </DashboardShell>
  );
}
