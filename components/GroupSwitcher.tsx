"use client";
import { useEffect, useState } from "react";

interface GroupItem {
  id: string;
  name: string;
  isActive: boolean;
}

export function GroupSwitcher() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/groups", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as GroupItem[];
        setGroups(data);
        const active = data.find((g) => g.isActive);
        setActiveId(active?.id ?? "");
      } catch {
        // header switcher is non-critical; ignore load failures
      }
    })();
  }, []);

  async function onChange(value: string) {
    if (value === "__manage__") {
      window.location.assign("/groups");
      return;
    }
    if (!value || value === activeId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/groups/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.assign("/");
    } catch {
      setBusy(false);
    }
  }

  if (groups.length === 0) return null;

  return (
    <select
      aria-label="Active group"
      value={activeId}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      className="bg-brand-700 text-white text-xs rounded px-1.5 py-1 max-w-[8rem] disabled:opacity-50"
    >
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
      <option value="__manage__">Manage groups…</option>
    </select>
  );
}
