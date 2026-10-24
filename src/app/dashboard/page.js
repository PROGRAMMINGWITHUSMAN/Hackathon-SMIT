import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getOrgDashboard, getEmployeeDashboard } from "@/lib/analytics";
import { karachiTimeLabel, karachiDateString } from "@/lib/attendance-rules.mjs";
import { statusLabel } from "@/components/attendance/AttendanceStatusBadge";
import DashboardShell from "@/components/dashboard/DashboardShell";
import NoProfileScreen from "@/components/dashboard/NoProfileScreen";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Alert from "@/components/ui/Alert";
import AttendanceStatusBadge from "@/components/attendance/AttendanceStatusBadge";
import { formatMinutes } from "@/components/attendance/AttendanceStatusBadge";
import RunStatusBadge from "@/components/payroll/RunStatusBadge";
import { TrendChart, DepartmentBars, LeaveMixBars } from "@/components/dashboard/charts";
import {
  IconUsers,
  IconClock,
  IconCalendar,
  IconWallet,
} from "@/components/ui/icons";

// Server Component — every metric is computed here on the server from real
// data via src/lib/analytics.js (role-scoped; employees only ever see own
// numbers). Charts are dependency-free and server-rendered.

const money = (n) => `PKR ${Number(n).toLocaleString()}`;

export default async function DashboardPage() {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }
  if (!profile) {
    return <NoProfileScreen email={user.email} />;
  }

  const firstName = profile.full_name.split(" ")[0];
  const isEmployee = profile.role === "employee";

  // Fetch first (try/catch around data only), build JSX afterwards.
  let org = null;
  let own = null;
  let loadError = false;
  try {
    if (isEmployee) {
      own = await getEmployeeDashboard(profile);
    } else {
      org = await getOrgDashboard(profile);
    }
  } catch (error) {
    console.error("Dashboard failed to load:", error);
    loadError = true;
  }

  if (loadError) {
    return (
      <DashboardShell
        title="Overview"
        email={user.email}
        fullName={profile.full_name}
        role={profile.role}
      >
        <Card>
          <Alert tone="error">
            Could not load the dashboard. Refresh the page to try again.
          </Alert>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Overview"
      email={user.email}
      fullName={profile.full_name}
      role={profile.role}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Welcome back, {firstName}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isEmployee
              ? "Your attendance, leave, and pay at a glance."
              : "Your organization at a glance — all numbers are live."}
          </p>
        </div>
        <Badge tone="primary">
          {profile.role === "admin" ? "Admin" : profile.role === "hr" ? "HR" : "Employee"}
        </Badge>
      </div>

      {isEmployee ? (
        <EmployeeDashboard own={own} />
      ) : (
        <OrgDashboard org={org} viewerRole={profile.role} />
      )}
    </DashboardShell>
  );
}

// ---------------------------------------------------------------------------
// Admin / HR
// ---------------------------------------------------------------------------
function OrgDashboard({ org, viewerRole }) {
  const att = org.attendanceToday.summary;
  const checkedIn = att.present + att.late;
  const latestRun = org.payrollRuns[0] ?? null;

  return (
    <>
      {/* Stat cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/employees" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <IconUsers className="h-5 w-5" />
              </span>
              <Badge tone="success">Live</Badge>
            </div>
            <p className="mt-4 text-2xl font-semibold text-ink">{org.headcount.active}</p>
            <p className="mt-1 text-sm text-muted">
              Active employees ({org.headcount.total} total)
            </p>
          </Card>
        </Link>

        <Link href="/dashboard/attendance" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <IconClock className="h-5 w-5" />
              </span>
              <Badge tone="success">Live</Badge>
            </div>
            <p className="mt-4 text-2xl font-semibold text-ink">
              {org.attendanceToday.is_working_day ? checkedIn : "—"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {org.attendanceToday.is_working_day
                ? `Present ${att.present} · Late ${att.late} · Absent ${att.absent} · Leave ${att.on_leave}`
                : org.attendanceToday.holiday_name
                  ? `Holiday — ${org.attendanceToday.holiday_name}`
                  : "Non-working day (weekend)"}
            </p>
          </Card>
        </Link>

        <Link href="/dashboard/leave" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <IconCalendar className="h-5 w-5" />
              </span>
              <Badge tone="success">Live</Badge>
            </div>
            <p className="mt-4 text-2xl font-semibold text-ink">{org.pendingLeaveCount}</p>
            <p className="mt-1 text-sm text-muted">Pending leave requests</p>
          </Card>
        </Link>

        <Link href="/dashboard/payroll" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <IconWallet className="h-5 w-5" />
              </span>
              {latestRun ? <Badge tone="success">Live</Badge> : null}
            </div>
            <p className="mt-4 text-xl font-semibold text-ink">
              {latestRun ? latestRun.label : "No runs yet"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {latestRun
                ? `Net ${money(latestRun.totals.net)} · ${latestRun.totals.employees} payslip(s)`
                : "Create the first payroll draft"}
            </p>
          </Card>
        </Link>
      </div>

      {/* Charts row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          title="Attendance — last 7 working days"
          description="Stored check-in statuses plus derived absence (active employees with no record and no approved leave)."
        >
          <TrendChart days={org.attendanceTrend} />
        </Card>
        <Card
          title="Departments"
          description="Share of active employees per department."
        >
          <DepartmentBars distribution={org.headcount.departments} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title={`Leave requests — ${karachiDateString(new Date()).slice(0, 4)}`}
          description="Requests by type and status for the current calendar year."
        >
          <LeaveMixBars mix={org.leaveMix} />
        </Card>

        {viewerRole === "admin" ? (
          <Card
            title="Recent activity"
            description="Latest recorded administrative actions (audit log)."
          >
            {org.recentActivity == null || org.recentActivity.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">
                No recorded activity yet.
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {org.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{a.action}</p>
                      <p className="text-xs text-muted">by {a.actor_name}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {new Date(a.created_at).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <Card title="Recent activity" description="Available to Admin accounts only.">
            <p className="py-6 text-center text-xs text-muted">
              The audit trail is visible to Admins.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Employee — own data only
// ---------------------------------------------------------------------------
function EmployeeDashboard({ own }) {
  const b = own.leave.balances;
  const balanceRows = ["annual", "sick", "casual"].map((code) => ({
    code,
    label: { annual: "Annual", sick: "Sick", casual: "Casual" }[code],
    remaining: b[code]?.remaining ?? 0,
    allowance: b[code]?.allowance ?? 0,
  }));

  return (
    <>
      {/* Stat cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/attendance" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <IconClock className="h-5 w-5" />
              </span>
              <Badge tone="success">Live</Badge>
            </div>
            <div className="mt-4">
              <AttendanceStatusBadge status={own.attendanceToday.status} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {own.attendanceToday.is_working_day
                ? own.attendanceToday.check_in
                  ? `In ${karachiTimeLabel(own.attendanceToday.check_in)}${
                      own.attendanceToday.check_out
                        ? ` · Out ${karachiTimeLabel(own.attendanceToday.check_out)}`
                        : ""
                    }${own.attendanceToday.worked_minutes != null ? ` · ${formatMinutes(own.attendanceToday.worked_minutes)}` : ""}`
                  : "No check-in yet today"
                : own.attendanceToday.holiday_name
                  ? `Holiday — ${own.attendanceToday.holiday_name}`
                  : "Non-working day (weekend)"}
            </p>
          </Card>
        </Link>

        <Card>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {own.monthSummary.present + own.monthSummary.late}
          </p>
          <p className="mt-1 text-sm text-muted">Days present (last 30 days)</p>
          <p className="mt-2 text-xs text-muted">
            Late {own.monthSummary.late} · Half-day {own.monthSummary.half_day} · Missing
            checkout {own.monthSummary.missing_checkout}
          </p>
        </Card>

        <Link href="/dashboard/leave" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <p className="mt-1 text-2xl font-semibold text-ink">
              {balanceRows.map((r) => r.remaining).reduce((s, v) => s + v, 0)}
            </p>
            <p className="mt-1 text-sm text-muted">Paid leave days remaining</p>
            <p className="mt-2 text-xs text-muted">
              {balanceRows.map((r) => `${r.label} ${r.remaining}/${r.allowance}`).join(" · ")}
              {own.leave.pendingCount > 0 ? ` · ${own.leave.pendingCount} pending` : ""}
            </p>
          </Card>
        </Link>

        <Link href="/dashboard/payroll" className="group block">
          <Card className="transition group-hover:border-primary/30">
            <p className="mt-1 text-xl font-semibold text-ink">
              {own.latestPayslip ? money(own.latestPayslip.net_pay) : "—"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {own.latestPayslip ? `Net pay · ${own.latestPayslip.period_label}` : "No payslips yet"}
            </p>
          </Card>
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          title="My attendance — last 30 days"
          description="Your recorded days by derived status (weekends and holidays are never counted)."
        >
          <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Present", own.monthSummary.present],
              ["Late", own.monthSummary.late],
              ["Half-day", own.monthSummary.half_day],
              ["Missing checkout", own.monthSummary.missing_checkout],
              ["On leave", own.monthSummary.on_leave],
              ["Recorded days", own.monthSummary.recorded_days],
            ].map(([label, value]) => (
              <li key={label} className="rounded-xl border border-line bg-page/60 p-3">
                <p className="text-xl font-semibold text-ink">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="My leave balances"
          description="Pending requests reserve balance until reviewed. Unpaid leave has no cap."
        >
          <DepartmentBars
            distribution={balanceRows.map((r) => ({
              label: r.label,
              count: r.remaining,
              share: r.allowance > 0 ? Math.round((r.remaining / r.allowance) * 100) : 0,
            }))}
          />
        </Card>
      </div>
    </>
  );
}
