"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccess } from "@/lib/auth/passengerAccess";
import { GroupSwitcher } from "./GroupSwitcher";

interface Tab {
  href: string;
  label: string;
  driverOnly?: boolean;
}

const TABS: Tab[] = [
  { href: "/", label: "Trip" },
  { href: "/log", label: "Log" },
  { href: "/week", label: "Week" },
  { href: "/gas", label: "Gas" },
  { href: "/mileage", label: "Mileage" },
  { href: "/cars", label: "Cars", driverOnly: true },
  { href: "/settings", label: "Settings" },
];

export function HeaderNav() {
  const { isDriver } = useAccess();
  return (
    <div className="flex items-center gap-3 text-xs opacity-90">
      <GroupSwitcher />
      {isDriver && (
        <Link href="/admin/members" className="hover:underline">
          Members
        </Link>
      )}
      <Link href="/account" className="hover:underline">
        Account
      </Link>
      <form action="/auth/signout" method="post">
        <button type="submit" className="hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { isDriver } = useAccess();
  const tabs = TABS.filter((t) => !t.driverOnly || isDriver);

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
      <div
        className="max-w-3xl mx-auto grid text-xs"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`py-3 text-center ${
                active
                  ? "text-brand-600 font-medium"
                  : "text-slate-700 hover:text-brand-600"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
