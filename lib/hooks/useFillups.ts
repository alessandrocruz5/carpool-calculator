"use client";
import { useAsync } from "./useAsync";
import { addFillup, listFillups, removeFillup } from "@/lib/db/fillups";
import type { Fillup } from "@/lib/mileage";

export function useFillups() {
  const state = useAsync(listFillups, []);

  const fillups: Fillup[] = (state.data ?? []).map((f) => ({
    id: f.id,
    date: f.date,
    liters: Number(f.liters),
    totalPhp: Number(f.total_php),
    odometerKm: Number(f.odometer_km),
  }));

  return {
    ...state,
    fillups,
    async add(input: { date: string; liters: number; totalPhp: number; odometerKm: number }) {
      await addFillup({
        date: input.date,
        liters: input.liters,
        total_php: input.totalPhp,
        odometer_km: input.odometerKm,
      });
      await state.refresh();
    },
    async remove(id: string) {
      await removeFillup(id);
      await state.refresh();
    },
  };
}
