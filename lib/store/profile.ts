"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Profile {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface ProfileStore {
  profile: Profile | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: {
    displayName?: string;
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
        set((s) =>
          s.profile
            ? {
                profile: {
                  ...s.profile,
                  ...(patch.displayName !== undefined
                    ? { displayName: patch.displayName }
                    : {}),
                  ...(patch.avatarUrl !== undefined
                    ? { avatarUrl: patch.avatarUrl }
                    : {}),
                },
              }
            : s
        );
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
