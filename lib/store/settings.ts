"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, type CalcSettings } from "@/lib/calc";

interface SettingsStore {
  settings: CalcSettings;
  gasPrice: number;
  gasPriceUpdatedAt: string | null;
  setSettings: (s: Partial<CalcSettings>) => void;
  setGasPrice: (price: number) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      gasPrice: 90,
      gasPriceUpdatedAt: null,
      setSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),
      setGasPrice: (price) =>
        set({ gasPrice: price, gasPriceUpdatedAt: new Date().toISOString() }),
    }),
    { name: "carpool-settings" }
  )
);
