"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Profile {
  userId: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

interface ProfileStore {
  profile: Profile | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  }) => Promise<void>;
}

export const useProfile = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profile: null,
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/profile", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as Profile | null;
          set({ profile: data, hydrated: true });
        } catch (err) {
          console.error("profile.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      update: async (patch) => {
        set((s) => {
          if (!s.profile) return s;
          const next: Profile = { ...s.profile };
          if (patch.displayName !== undefined) next.displayName = patch.displayName;
          if (patch.firstName !== undefined) next.firstName = patch.firstName || null;
          if (patch.lastName !== undefined) next.lastName = patch.lastName || null;
          if (patch.avatarUrl !== undefined) next.avatarUrl = patch.avatarUrl;
          // Mirror the server: compose display_name from first/last on write so
          // existing display_name consumers stay in sync optimistically.
          if (patch.firstName !== undefined || patch.lastName !== undefined) {
            const composed = [next.firstName, next.lastName]
              .filter((x): x is string => !!x)
              .join(" ");
            next.displayName = composed || null;
          }
          return { profile: next };
        });
        try {
          const res = await fetch("/api/profile", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as Profile;
          set({ profile: data });
        } catch (err) {
          console.error("profile.update failed", err);
          await get().hydrate();
        }
      },
    }),
    { name: "carpool-profile", partialize: (s) => ({ profile: s.profile }) }
  )
);
