"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Fillup } from "@/lib/mileage";
import { fetchWithDriverKey } from "@/lib/auth/clientDriverKey";

interface FillupsStore {
  fillups: Fillup[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (f: Omit<Fillup, "id">) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useFillups = create<FillupsStore>()(
  persist(
    (set, get) => ({
      fillups: [],
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/fillups", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as Fillup[];
          set({ fillups: data, hydrated: true });
        } catch (err) {
          console.error("fillups.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      add: async (f) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        const optimistic: Fillup = { ...f, id };
        set((s) => ({ fillups: [...s.fillups, optimistic] }));
        try {
          const res = await fetchWithDriverKey("/api/fillups", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...f, id }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("fillups.add failed", err);
          await get().hydrate();
        }
      },
      remove: async (id) => {
        const prev = get().fillups;
        set({ fillups: prev.filter((x) => x.id !== id) });
        try {
          const res = await fetchWithDriverKey(`/api/fillups?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("fillups.remove failed", err);
          await get().hydrate();
        }
      },
    }),
    { name: "carpool-fillups", partialize: (s) => ({ fillups: s.fillups }) }
  )
);
