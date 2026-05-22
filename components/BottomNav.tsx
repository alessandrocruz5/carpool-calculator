"use client";
import Link from "next/link";
import { useActiveRole, roleCanDrive, roleCanRide } from "@/lib/auth/passengerAccess";

type Audience = "shared" | "driver" | "passenger";

const TABS: { href: string; label: string; audience: Audience }[] = [
  { href: "/", label: "Today", audience: "shared" },
  { href: "/log", label: "Log", audience: "driver" },
  { href: "/week", label: "Week", audience: "shared" },
  { href: "/gas", label: "Gas", audience: "driver" },
  { href: "/mileage", label: "Mileage", audience: "driver" },
  { href: "/cars", label: "Cars", audience: "driver" },
  { href: "/payments", label: "Payments", audience: "passenger" },
  { href: "/settings", label: "Settings", audience: "driver" },
];

export function BottomNav() {
  const role = useActiveRole();
  const canDrive = roleCanDrive(role);
  const canRide = roleCanRide(role);

  // Until the role resolves, show only shared tabs to avoid flashing tabs
  // the user can't use. A `both` user matches every audience.
  const visible = TABS.filter((t) => {
    if (t.audience === "shared") return true;
    if (t.audience === "driver") return canDrive;
    if (t.audience === "passenger") return canRide;
    return false;
  });

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
      <div
        className="max-w-3xl mx-auto grid text-xs"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
        {visible.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="py-3 text-center text-slate-700 hover:text-brand-600"
          >
            {n.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
