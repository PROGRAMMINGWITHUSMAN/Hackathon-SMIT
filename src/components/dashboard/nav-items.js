// One list of dashboard navigation items, shared by the desktop Sidebar and
// the mobile nav in the Topbar — so they can never disagree.
// Items without an href are future modules (shown with a "Soon" badge and
// rendered as non-clickable text, never as dead links).

import {
  IconGrid,
  IconUsers,
  IconClock,
  IconCalendar,
  IconWallet,
} from "@/components/ui/icons";

export const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: IconGrid },
  { label: "Employees", href: "/dashboard/employees", icon: IconUsers },
  { label: "Attendance", href: "/dashboard/attendance", icon: IconClock },
  { label: "Leave", href: "/dashboard/leave", icon: IconCalendar },
  { label: "Payroll", href: "/dashboard/payroll", icon: IconWallet },
];
