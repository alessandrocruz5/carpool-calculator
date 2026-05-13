"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Fillup } from "@/lib/mileage";

interface FillupsStore {
  fillups: Fillup[];
  add: (f: Omit<Fillup, "id">) => void;
  remove: (id: string) => void;
}

export const useFillups = create<FillupsStore>()(
  persist(
    (set) => ({
      fillups: [],
      add: (f) =>
        set((s) => ({
          fillups: [...s.fillups, { ...f, id: crypto.randomUUID() }],
        })),
      remove: (id) =>
        set((s) => ({ fillups: s.fillups.filter((x) => x.id !== id) })),
    }),
    { name: "carpool-fillups" }
  )
);
