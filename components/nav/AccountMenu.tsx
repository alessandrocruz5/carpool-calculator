"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleUser, Users, FolderCog, LogOut } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Collapses the former top-right cluster (Account · Groups · Members · Sign
 * out) into a single menu button, so the header stays uncluttered and the
 * tap targets are comfortable on mobile.
 */
export function AccountMenu({ role }: { role: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDriver = role !== "passenger";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        data-tour="nav-members"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-700/40"
      >
        <CircleUser className="h-5 w-5" aria-hidden />
        <span className="sr-only sm:not-sr-only">Account</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-700 shadow-lg ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <Link href="/account" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <CircleUser className="h-4 w-4 text-slate-400" aria-hidden />
            Account
          </Link>
          <Link href="/groups" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <FolderCog className="h-4 w-4 text-slate-400" aria-hidden />
            Groups
          </Link>
          {isDriver && (
            <Link
              href="/admin/members"
              role="menuitem"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Users className="h-4 w-4 text-slate-400" aria-hidden />
              Members
            </Link>
          )}
          <div className="my-1 border-t border-slate-100" />
          <SignOutButton className={`${itemClass} text-red-600`}>
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </SignOutButton>
        </div>
      )}
    </div>
  );
}
