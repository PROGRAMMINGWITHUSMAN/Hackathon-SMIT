import Link from "next/link";
import Badge from "@/components/ui/Badge";
import SignOutButton from "@/app/dashboard/signout-button";
import { NAV_ITEMS } from "./nav-items";
import { IconGrid } from "@/components/ui/icons";

// Top bar shown on every dashboard page. Plain server component — it only
// receives the user's display info as props; the privileged lookup stays in
// the page (src/lib/auth.js). On small screens it also carries a horizontal
// nav row (the desktop Sidebar is hidden there). Colors come from the
// design tokens in globals.css.

const ROLE_LABELS = {
  admin: "Admin",
  hr: "HR",
  employee: "Employee",
};

export default function Topbar({ title, email, fullName, role }) {
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <IconGrid className="h-4.5 w-4.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">
            HCM Lite
          </span>
        </div>

        <h1 className="hidden text-base font-semibold text-ink lg:block">
          {title}
        </h1>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-ink">{fullName}</p>
            <p className="text-xs text-muted">{email}</p>
          </div>
          <Badge tone="primary">{roleLabel}</Badge>
          <SignOutButton />
        </div>
      </div>

      {/* Mobile navigation (desktop uses the Sidebar) */}
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        {NAV_ITEMS.map((item) => {
          const classes =
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition";
          if (item.href) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`${classes} bg-primary-tint text-primary`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          }
          return (
            <span
              key={item.label}
              aria-disabled="true"
              className={`${classes} bg-sage/60 text-muted`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              <span className="text-[10px] uppercase tracking-wide">soon</span>
            </span>
          );
        })}
      </nav>
    </header>
  );
}
