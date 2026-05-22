"use client";
import { create } from "zustand";
import type { MemberRole } from "@/lib/supabase/types";

export interface GroupItem {
  id: string;
  name: string;
  ownerUserId: string;
  role: MemberRole;
}

interface GroupsStore {
  groups: GroupItem[];
  activeGroupId: string | null;
  selfUserId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  create: (name: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  switchTo: (id: string) => Promise<void>;
}

export const useGroups = create<GroupsStore>((set, get) => ({
  groups: [],
  activeGroupId: null,
  selfUserId: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/groups", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as {
        groups: GroupItem[];
        activeGroupId: string | null;
        selfUserId: string | null;
      };
      set({
        groups: d.groups,
        activeGroupId: d.activeGroupId,
        selfUserId: d.selfUserId,
        hydrated: true,
      });
    } catch (err) {
      console.error("groups.hydrate failed", err);
      set({ hydrated: true });
    }
  },
  create: async (name) => {
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await res.text());
    const d = (await res.json()) as { id: string };
    await get().hydrate();
    return d.id ?? null;
  },
  rename: async (id, name) => {
    const res = await fetch("/api/groups", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    if (!res.ok) throw new Error(await res.text());
    await get().hydrate();
  },
  remove: async (id) => {
    const res = await fetch(`/api/groups?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await res.text());
    await get().hydrate();
  },
  switchTo: async (id) => {
    const res = await fetch("/api/groups", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(await res.text());
    // Active group is server-scoped; reload so every store re-hydrates.
    if (typeof window !== "undefined") window.location.reload();
  },
}));
