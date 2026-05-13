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
  add: (name: string) => void;
  remove: (id: string) => void;
  toggleActive: (id: string) => void;
}

export const useRoster = create<RosterStore>()(
  persist(
    (set) => ({
      passengers: [],
      add: (name) =>
        set((s) => ({
          passengers: [
            ...s.passengers,
            { id: crypto.randomUUID(), name: name.trim(), active: true },
          ],
        })),
      remove: (id) =>
        set((s) => ({ passengers: s.passengers.filter((p) => p.id !== id) })),
      toggleActive: (id) =>
        set((s) => ({
          passengers: s.passengers.map((p) =>
            p.id === id ? { ...p, active: !p.active } : p
          ),
        })),
    }),
    { name: "carpool-roster" }
  )
);
