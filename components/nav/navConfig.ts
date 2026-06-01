import { Home, ClipboardList, Wallet, Fuel, Settings, type LucideIcon } from "lucide-react";
import { PASSENGER_TAB_HREFS } from "@/lib/auth/passengerAccess";

export interface NavTab {
  href: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * The single source of truth for the primary (bottom-bar) destinations.
 * Both the layout's bottom nav and any future nav surface should read from
 * here so the tab list never drifts out of sync.
 */
export const PRIMARY_TABS: NavTab[] = [
  { href: "/", label: "Trip", Icon: Home },
  { href: "/log", label: "Log", Icon: ClipboardList },
  { href: "/payments", label: "Payments", Icon: Wallet },
  { href: "/gas", label: "Gas", Icon: Fuel },
  { href: "/settings", label: "Settings", Icon: Settings },
];

/** Filter the primary tabs down to what the given role may see. */
export function visibleTabs(role: string | null | undefined): NavTab[] {
  if (role === "passenger") {
    return PRIMARY_TABS.filter((t) =>
      (PASSENGER_TAB_HREFS as readonly string[]).includes(t.href)
    );
  }
  return PRIMARY_TABS;
}
