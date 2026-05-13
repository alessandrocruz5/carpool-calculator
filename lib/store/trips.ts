"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Route } from "@/lib/calc";

export interface StoredTrip {
  id: string;
  date: string;
  gasPrice: number;
  parkingFee: number;
  morning: { route: Route; passengerIds: string[] };
  evening: { route: Route; passengerIds: string[] };
  notes?: string;
}

interface TripsStore {
  trips: StoredTrip[];
  upsert: (trip: StoredTrip) => void;
  remove: (id: string) => void;
}

export const useTrips = create<TripsStore>()(
  persist(
    (set) => ({
      trips: [],
      upsert: (trip) =>
        set((s) => {
          const idx = s.trips.findIndex((t) => t.date === trip.date);
          if (idx >= 0) {
            const next = [...s.trips];
            next[idx] = trip;
            return { trips: next };
          }
          return { trips: [...s.trips, trip] };
        }),
      remove: (id) => set((s) => ({ trips: s.trips.filter((t) => t.id !== id) })),
    }),
    { name: "carpool-trips" }
  )
);
