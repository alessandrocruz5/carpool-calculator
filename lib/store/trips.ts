"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Route } from "@/lib/calc";
import { resilientFetch } from "@/lib/outbox";

/** One ordered leg of a day's trip. Mirrors calc's `DayLegInput`. */
export interface LegState {
  route: Route;
  passengerIds: string[];
  distanceKm: number;
  extraKmByRider?: Record<string, number>;
}

export interface StoredTrip {
  id: string;
  date: string;
  gasPrice: number;
  parkingFee: number;
  carId?: string | null;
  driverUserId?: string | null;
  /** Authoritative ordered legs (min 1), parking on the first leg only. */
  legs: LegState[];
  notes?: string;
}

interface TripsStore {
  trips: StoredTrip[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsert: (trip: StoredTrip) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTrips = create<TripsStore>()(
  persist(
    (set, get) => ({
      trips: [],
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/trips", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as StoredTrip[];
          set({ trips: data, hydrated: true });
        } catch (err) {
          console.error("trips.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      upsert: async (trip) => {
        set((s) => {
          const idx = s.trips.findIndex((t) => t.date === trip.date);
          if (idx >= 0) {
            const next = [...s.trips];
            next[idx] = trip;
            return { trips: next };
          }
          return { trips: [...s.trips, trip] };
        });
        try {
          const res = await resilientFetch("/api/trips", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(trip),
          });
          if (!res.ok) throw new Error(await res.text());
          await get().hydrate();
        } catch (err) {
          console.error("trips.upsert failed", err);
          await get().hydrate();
          throw err;
        }
      },
      remove: async (id) => {
        set((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
        try {
          const res = await resilientFetch(`/api/trips?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("trips.remove failed", err);
          await get().hydrate();
          throw err;
        }
      },
    }),
    {
      name: "carpool-trips",
      version: 1,
      migrate: (persisted: unknown) => {
        const state = persisted as { trips?: unknown[] };
        // Drop cached trips that predate the legs array (old morning/evening format).
        const trips = (state.trips ?? []).filter(
          (t): t is StoredTrip => Array.isArray((t as StoredTrip).legs)
        );
        return { trips };
      },
      partialize: (s) => ({ trips: s.trips }),
    }
  )
);
