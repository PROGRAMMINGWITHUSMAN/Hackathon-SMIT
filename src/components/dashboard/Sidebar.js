"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import Badge from "@/components/ui/Badge";
import { IconGrid } from "@/components/ui/icons";

// Desktop sidebar (hidden below lg — mobile navigation lives in the Topbar).
// Uses the dedicated dark "sidebar" token with sage text — both defined in
// the design tokens (globals.css). "use client" is needed only for
// usePathname(), which highlights the current page. No data or privileged
// logic lives here.

export default function Sidebar({ role }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sage text-sidebar">
          <IconGrid className="h-4.5 w-4.5" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-white">
          HCM Lite
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const active = item.href !== undefined && pathname === item.href;

          const content = (
            <>
              <item.icon
                className={`h-5 w-5 ${
                  active ? "text-white" : "text-sage/70 group-hover:text-white"
                }`}
              />
              <span className="flex-1">{item.label}</span>
              {item.comingSoon && <Badge tone="warning">Soon</Badge>}
            </>
          );

          const classes = `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            active
              ? "bg-white/10 text-white"
              : "text-sage hover:bg-white/5 hover:text-white"
          } ${item.comingSoon ? "cursor-default" : ""}`;

          if (item.href) {
            return (
              <Link key={item.label} href={item.href} className={classes}>
                {content}
              </Link>
            );
          }
          return (
            <span
              key={item.label}
              aria-disabled="true"
              className={`${classes} opacity-70`}
            >
              {content}
            </span>
          );
        })}
      </nav>

      <div className="px-5 py-4">
        <p className="text-xs text-sage/70">HCM Lite · Saylani Hackathon</p>
      </div>
    </aside>
  );
}
