import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import AuthHashRedirect from "@/components/AuthHashRedirect";
import {
  IconGrid,
  IconUsers,
  IconClock,
  IconCalendar,
  IconWallet,
} from "@/components/ui/icons";

// Public landing page (server component — no client JavaScript needed).
// Every button is a real link: Sign in → /login, Dashboard → /dashboard.
// All colors come from the design tokens in globals.css.

const FEATURES = [
  {
    icon: IconUsers,
    title: "Employee management",
    text: "A clean directory with departments, designations, and salaries — managed by HR and Admin.",
  },
  {
    icon: IconClock,
    title: "Attendance",
    text: "Check-in and check-out with automatic late, half-day, and missing-checkout detection.",
  },
  {
    icon: IconCalendar,
    title: "Leave management",
    text: "Annual, sick, casual, and unpaid leave with balances, validation, and approvals.",
  },
  {
    icon: IconWallet,
    title: "Payroll",
    text: "Payslips with automatic allowances and deductions — drafted by HR, locked by Admin.",
  },
];

// Sample rows for the preview mockup below (clearly labeled as illustration).
const PREVIEW_ROWS = [
  {
    name: "Ayesha K.",
    initials: "AK",
    status: "Present",
    tone: "bg-success-bg text-success ring-success/20",
  },
  {
    name: "Bilal R.",
    initials: "BR",
    status: "Late",
    tone: "bg-warning-bg text-warning ring-warning/20",
  },
  {
    name: "Hina S.",
    initials: "HS",
    status: "On leave",
    tone: "bg-info-bg text-info ring-info/20",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <AuthHashRedirect />
      {/* Navbar */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <IconGrid className="h-4.5 w-4.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              HCM Lite
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className={buttonClasses("ghost", "sm")}
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className={`${buttonClasses("primary", "sm")} hidden sm:inline-flex`}
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 lg:px-8 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary-tint px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
              Built for the Saylani Hackathon
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.12] tracking-tight text-ink sm:text-5xl">
              People operations, without the weight.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              HCM Lite is a lightweight HR management system for small teams —
              employees, attendance, leave, and payroll in one clean place,
              secured by role-based access.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className={buttonClasses("primary", "lg")}>
                Sign in
              </Link>
              <Link
                href="/dashboard"
                className={buttonClasses("secondary", "lg")}
              >
                Go to dashboard
              </Link>
            </div>
          </div>

          {/* Product preview — illustrative sample data */}
          <div>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
              <div className="flex items-center gap-1.5 border-b border-line bg-page px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
              </div>
              <div className="grid grid-cols-[auto_1fr]">
                <div className="hidden w-14 flex-col items-center gap-2 border-r border-line p-3 sm:flex">
                  {[IconGrid, IconUsers, IconClock, IconCalendar, IconWallet].map(
                    (Icon, i) => (
                      <span
                        key={i}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          i === 0
                            ? "bg-primary-tint text-primary"
                            : "text-muted/40"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                    )
                  )}
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Employees", value: "24" },
                      { label: "Present", value: "21" },
                      { label: "On leave", value: "2" },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-lg border border-line bg-sage/40 px-3 py-2.5"
                      >
                        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">
                          {s.label}
                        </p>
                        <p className="mt-1 text-xl font-semibold text-ink">
                          {s.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="divide-y divide-line rounded-lg border border-line">
                    {PREVIEW_ROWS.map((row) => (
                      <div
                        key={row.name}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-tint text-[11px] font-semibold text-primary">
                          {row.initials}
                        </span>
                        <span className="flex-1 text-sm font-medium text-ink">
                          {row.name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${row.tone}`}
                        >
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Preview — sample data shown for illustration.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Features
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
            What&apos;s inside
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Focused modules with role-based access — Admin, HR, and Employee
            each see exactly what they need.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-line bg-surface p-5 shadow-card transition hover:border-primary/30"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sage text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-ink">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-xs text-muted sm:px-6 lg:px-8">
          <span>HCM Lite · Lightweight HR Management</span>
          <span>Saylani Hackathon 2026</span>
        </div>
      </footer>
    </div>
  );
}
