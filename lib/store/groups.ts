"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Group {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

interface GroupsStore {
  groups: Group[];
  activeGroupId: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  create: (name: string) => Promise<void>;
  switchTo: (groupId: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useGroups = create<GroupsStore>()(
  persist(
    (set, get) => ({
      groups: [],
      activeGroupId: null,
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/groups", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as (Group & { isActive?: boolean })[];
          const currentActiveId = get().activeGroupId;
          // Prefer the server-authoritative active group (from session cookie)
          // so a group switch via GroupSwitcher is reflected after page reload.
          // Without this, stale localStorage overrides the cookie and
          // applyGroupScope loads the wrong group's data.
          const serverActiveId = data.find((g) => g.isActive)?.id ?? null;
          const resolvedId =
            serverActiveId ??
            (currentActiveId && data.some((g) => g.id === currentActiveId)
              ? currentActiveId
              : data[0]?.id ?? null);
          set({ groups: data, hydrated: true, activeGroupId: resolvedId });
          // Sync cookie only when we fell back (no server-active group found).
          if (!serverActiveId && resolvedId && resolvedId !== currentActiveId) {
            await get().switchTo(resolvedId);
          }
        } catch (err) {
          console.error("groups.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      create: async (name) => {
        const trimmed = name.trim();
        try {
          const res = await fetch("/api/groups", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          });
          if (!res.ok) throw new Error(await res.text());
          const group = (await res.json()) as Group;
          set((s) => ({ groups: [...s.groups, group] }));
          await get().switchTo(group.id);
        } catch (err) {
          console.error("groups.create failed", err);
          await get().hydrate();
        }
      },
      switchTo: async (groupId) => {
        set({ activeGroupId: groupId });
        try {
          const res = await fetch("/api/groups/switch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ groupId }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("groups.switchTo failed", err);
        }
      },
      rename: async (id, name) => {
        const trimmed = name.trim();
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === id ? { ...g, name: trimmed } : g
          ),
        }));
        try {
          const res = await fetch("/api/groups", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, name: trimmed }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("groups.rename failed", err);
          await get().hydrate();
        }
      },
      remove: async (id) => {
        set((s) => {
          const groups = s.groups.filter((g) => g.id !== id);
          return {
            groups,
            activeGroupId:
              s.activeGroupId === id
                ? groups[0]?.id ?? null
                : s.activeGroupId,
          };
        });
        try {
          const res = await fetch(`/api/groups?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("groups.remove failed", err);
          await get().hydrate();
        }
      },
    }),
    {
      name: "carpool-groups",
      partialize: (s) => ({ activeGroupId: s.activeGroupId }),
    }
  )
);
