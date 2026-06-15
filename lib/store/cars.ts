"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Car } from "@/lib/supabase/mappers";
import type { SaveResult } from "@/lib/store/settings";

export type { Car };

export interface CarInput {
  name: string;
  fuelEfficiencyKml?: number | null;
  tankSizeLiters?: number | null;
  maxPassengers?: number | null;
}

interface CarsStore {
  cars: Car[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (input: CarInput) => Promise<SaveResult>;
  update: (
    id: string,
    patch: Partial<Pick<Car, "name" | "fuelEfficiencyKml" | "tankSizeLiters" | "maxPassengers">>
  ) => Promise<SaveResult>;
  remove: (id: string) => Promise<{ ok: true } | { ok: false; status: number; tripCount?: number }>;
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
          maxPassengers: input.maxPassengers ?? null,
        };
        set((s) => ({ cars: [...s.cars, optimistic] }));
        try {
          const res = await fetch("/api/cars", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, ...input, name: optimistic.name }),
          });
          if (!res.ok) throw new Error(await res.text());
          return { ok: true };
        } catch (err) {
          console.error("cars.add failed", err);
          await get().hydrate();
          return { ok: false, error: errorMessage(err) };
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
          return { ok: true };
        } catch (err) {
          console.error("cars.update failed", err);
          await get().hydrate();
          return { ok: false, error: errorMessage(err) };
        }
      },
      remove: async (id) => {
        try {
          const res = await fetch(`/api/cars?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (res.status === 409) {
            const body = (await res.json().catch(() => ({}))) as {
              tripCount?: number;
            };
            return { ok: false, status: 409, tripCount: body.tripCount };
          }
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("cars.remove failed", res.status, text);
            return { ok: false, status: res.status };
          }
          set((s) => ({ cars: s.cars.filter((c) => c.id !== id) }));
          return { ok: true };
        } catch (err) {
          console.error("cars.remove failed", err);
          return { ok: false, status: 0 };
        }
      },
    }),
    { name: "carpool-cars", partialize: (s) => ({ cars: s.cars }) }
  )
);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}
