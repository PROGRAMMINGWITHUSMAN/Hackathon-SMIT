"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Badge from "@/components/ui/Badge";
import SignOutButton from "@/app/dashboard/signout-button";
import { NAV_ITEMS } from "./nav-items";
import { IconGrid } from "@/components/ui/icons";
import NotificationBell from "@/components/communications/NotificationBell";

// Top bar shown on every dashboard page. Client component: it derives the
// PAGE TITLE from the current pathname (so the layout doesn't need it per
// page) and carries the horizontal nav row on small screens. It only
// receives display info as props — the privileged lookup stays in the
// layout/page on the server.

const ROLE_LABELS = {
  admin: "Admin",
  hr: "HR",
  employee: "Employee",
};

function titleFor(pathname) {
  const match = NAV_ITEMS.find(
    (item) => item.href === pathname
  );
  return match ? match.label : "Overview";
}

export default function Topbar({ email, fullName, role }) {
  const pathname = usePathname();
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

        {/* aria-live announces the title change after navigation commits. */}
        <h1
          className="hidden text-base font-semibold text-ink lg:block"
          aria-live="polite"
        >
          {titleFor(pathname)}
        </h1>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-ink">{fullName}</p>
            <p className="text-xs text-muted">{email}</p>
          </div>
          <NotificationBell />
          <Badge tone="primary">{roleLabel}</Badge>
          <SignOutButton />
        </div>
      </div>

      {/* Mobile navigation (desktop uses the Sidebar) */}
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Dashboard pages">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const active = item.href === pathname;
          const classes =
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition";
          if (item.href) {
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${classes} ${
                  active
                    ? "bg-primary-tint text-primary"
                    : "bg-sage/60 text-muted"
                }`}
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
