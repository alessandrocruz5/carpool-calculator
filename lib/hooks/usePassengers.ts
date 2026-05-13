"use client";
import { useAsync } from "./useAsync";
import {
  addPassenger,
  listPassengers,
  removePassenger,
  setPassengerActive,
} from "@/lib/db/passengers";

export function usePassengers() {
  const state = useAsync(listPassengers, []);

  return {
    ...state,
    passengers: state.data ?? [],
    async add(name: string) {
      await addPassenger(name);
      await state.refresh();
    },
    async toggleActive(id: string, active: boolean) {
      await setPassengerActive(id, active);
      await state.refresh();
    },
    async remove(id: string) {
      await removePassenger(id);
      await state.refresh();
    },
  };
}
