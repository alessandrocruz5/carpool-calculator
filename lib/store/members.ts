"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MemberRole = "driver" | "passenger" | "both";

export interface Member {
  userId: string;
  groupId: string;
  role: MemberRole;
  passengerId: string | null;
  createdAt: string;
  displayName: string | null;
}

interface MembersStore {
  members: Member[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  invite: (email: string, role: MemberRole) => Promise<void>;
  changeRole: (userId: string, role: MemberRole) => Promise<void>;
  remove: (userId: string) => Promise<void>;
}

export const useMembers = create<MembersStore>()(
  persist(
    (set, get) => ({
      members: [],
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/members", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as Member[];
          set({ members: data, hydrated: true });
        } catch (err) {
          console.error("members.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      invite: async (email, role) => {
        try {
          const res = await fetch("/api/members", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email.trim(), role }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("members.invite failed", err);
        }
        await get().hydrate();
      },
      changeRole: async (userId, role) => {
        set((s) => ({
          members: s.members.map((m) =>
            m.userId === userId ? { ...m, role } : m
          ),
        }));
        try {
          const res = await fetch("/api/members", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId, role }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("members.changeRole failed", err);
          await get().hydrate();
        }
      },
      remove: async (userId) => {
        set((s) => ({
          members: s.members.filter((m) => m.userId !== userId),
        }));
        try {
          const res = await fetch(
            `/api/members?userId=${encodeURIComponent(userId)}`,
            { method: "DELETE" }
          );
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("members.remove failed", err);
          await get().hydrate();
        }
      },
    }),
    { name: "carpool-members", partialize: (s) => ({ members: s.members }) }
  )
);
