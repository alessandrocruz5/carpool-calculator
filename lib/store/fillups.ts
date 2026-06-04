"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { rollingMileage, type Fillup } from "@/lib/mileage";
import { resilientFetch } from "@/lib/outbox";
import { useSettings } from "@/lib/store/settings";
import { useCars } from "@/lib/store/cars";

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
        const hadRolling = rollingMileage(get().fillups) != null;
        set((s) => ({ fillups: [...s.fillups, optimistic] }));
        // Once a rolling average first becomes computable, the rolling figure
        // takes over and the manual override is switched off automatically.
        if (!hadRolling && rollingMileage(get().fillups) != null) {
          const { settings, setSettings } = useSettings.getState();
          if (settings.mileageOverrideEnabled) {
            void setSettings({ mileageOverrideEnabled: false });
          }
        }
        // Persist the car-specific rolling average back to the car record so
        // every group that uses the same car sees the real measured efficiency.
        if (f.carId) {
          const carRolling = rollingMileage(get().fillups, 5, f.carId);
          if (carRolling != null) {
            void useCars.getState().update(f.carId, {
              fuelEfficiencyKml: Math.round(carRolling * 1000) / 1000,
            });
          }
        }
        try {
          const res = await resilientFetch("/api/fillups", {
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
          const res = await resilientFetch(`/api/fillups?id=${encodeURIComponent(id)}`, {
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
