"use client";
import { useAsync } from "./useAsync";
import {
  deleteTrip,
  getTrip,
  listTrips,
  upsertTrip,
  type FullTrip,
  type UpsertTripInput,
} from "@/lib/db/trips";

export function useTrip(date: string) {
  const state = useAsync<FullTrip | null>(() => getTrip(date), [date]);
  return {
    ...state,
    trip: state.data,
    async save(input: UpsertTripInput) {
      await upsertTrip(input);
      await state.refresh();
    },
    async remove(id: string) {
      await deleteTrip(id);
      await state.refresh();
    },
  };
}

export function useAllTrips() {
  const state = useAsync<FullTrip[]>(() => listTrips(), []);
  return {
    ...state,
    trips: state.data ?? [],
    async remove(id: string) {
      await deleteTrip(id);
      await state.refresh();
    },
  };
}

export function useWeekTrips(weekStart: string, weekEnd: string) {
  const state = useAsync<FullTrip[]>(
    () => listTrips(weekStart, weekEnd),
    [weekStart, weekEnd]
  );
  return { ...state, trips: state.data ?? [] };
}
