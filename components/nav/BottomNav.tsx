"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleTabs } from "./navConfig";

export function BottomNav({ role }: { role: string | null }) {
  const pathname = usePathname();
  const tabs = visibleTabs(role);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200">
      <div
        className="max-w-3xl mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-tour={`nav-${label.toLowerCase()}`}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                active
                  ? "text-brand-600 font-medium"
                  : "text-slate-500 hover:text-brand-600"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
