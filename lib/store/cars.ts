"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Car } from "@/lib/supabase/mappers";

export type { Car };

export interface CarInput {
  name: string;
  fuelEfficiencyKml?: number | null;
  tankSizeLiters?: number | null;
}

interface CarsStore {
  cars: Car[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (input: CarInput) => Promise<void>;
  update: (
    id: string,
    patch: Partial<Pick<Car, "name" | "fuelEfficiencyKml" | "tankSizeLiters">>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useCars = create<CarsStore>()(
  persist(
    (set, get) => ({
      cars: [],
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/cars", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as Car[];
          set({ cars: data, hydrated: true });
        } catch (err) {
          console.error("cars.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      add: async (input) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        const optimistic: Car = {
          id,
          ownerUserId: "",
          name: input.name.trim(),
          fuelEfficiencyKml: input.fuelEfficiencyKml ?? null,
          tankSizeLiters: input.tankSizeLiters ?? null,
        };
        set((s) => ({ cars: [...s.cars, optimistic] }));
        try {
          const res = await fetch("/api/cars", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, ...input, name: optimistic.name }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("cars.add failed", err);
          await get().hydrate();
        }
      },
      update: async (id, patch) => {
        set((s) => ({
          cars: s.cars.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
        try {
          const res = await fetch("/api/cars", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, ...patch }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("cars.update failed", err);
          await get().hydrate();
        }
      },
      remove: async (id) => {
        set((s) => ({ cars: s.cars.filter((c) => c.id !== id) }));
        try {
          const res = await fetch(`/api/cars?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("cars.remove failed", err);
          await get().hydrate();
        }
      },
    }),
    { name: "carpool-cars", partialize: (s) => ({ cars: s.cars }) }
  )
);
