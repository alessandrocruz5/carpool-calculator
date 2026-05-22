"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useGroups } from "@/lib/store/groups";

export function GroupSwitcher() {
  const { groups, activeGroupId, hydrated, hydrate, switchTo } = useGroups();

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  if (groups.length === 0) {
    return (
      <Link href="/groups" className="hover:underline">
        Groups
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Active group"
        value={activeGroupId ?? ""}
        onChange={(e) => {
          if (e.target.value && e.target.value !== activeGroupId) {
            switchTo(e.target.value).catch((err) =>
              console.error("group switch failed", err)
            );
          }
        }}
        className="bg-brand-600 text-white text-xs border border-white/40 rounded px-1 py-0.5 max-w-[7.5rem]"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id} className="text-slate-900">
            {g.name}
          </option>
        ))}
      </select>
      <Link href="/groups" className="hover:underline" aria-label="Manage groups">
        ⚙
      </Link>
    </div>
  );
}
