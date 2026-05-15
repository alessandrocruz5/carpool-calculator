"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Passenger {
  id: string;
  name: string;
  active: boolean;
}

interface RosterStore {
  passengers: Passenger[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleActive: (id: string) => Promise<void>;
}

export const useRoster = create<RosterStore>()(
  persist(
    (set, get) => ({
      passengers: [],
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/passengers", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as Passenger[];
          set({ passengers: data, hydrated: true });
        } catch (err) {
          console.error("roster.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      add: async (name) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        const trimmed = name.trim();
        set((s) => ({
          passengers: [...s.passengers, { id, name: trimmed, active: true }],
        }));
        try {
          const res = await fetch("/api/passengers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, name: trimmed, active: true }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("roster.add failed", err);
          await get().hydrate();
        }
      },
      remove: async (id) => {
        set((s) => ({ passengers: s.passengers.filter((p) => p.id !== id) }));
        try {
          const res = await fetch(`/api/passengers?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("roster.remove failed", err);
          await get().hydrate();
        }
      },
      toggleActive: async (id) => {
        const next = !get().passengers.find((p) => p.id === id)?.active;
        set((s) => ({
          passengers: s.passengers.map((p) =>
            p.id === id ? { ...p, active: next } : p
          ),
        }));
        try {
          const res = await fetch("/api/passengers", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, active: next }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("roster.toggleActive failed", err);
          await get().hydrate();
        }
      },
    }),
    { name: "carpool-roster", partialize: (s) => ({ passengers: s.passengers }) }
  )
);
