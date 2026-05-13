"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS, type CalcSettings } from "@/lib/calc";

interface SettingsStore {
  settings: CalcSettings;
  gasPrice: number;
  gasPriceUpdatedAt: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSettings: (s: Partial<CalcSettings>) => Promise<void>;
  setGasPrice: (price: number) => Promise<void>;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      gasPrice: 90,
      gasPriceUpdatedAt: null,
      hydrated: false,
      hydrate: async () => {
        try {
          const [sRes, gRes] = await Promise.all([
            fetch("/api/settings", { cache: "no-store" }),
            fetch("/api/gas-prices", { cache: "no-store" }),
          ]);
          if (sRes.ok) {
            const s = (await sRes.json()) as CalcSettings | null;
            if (s) set({ settings: s });
          }
          if (gRes.ok) {
            const g = (await gRes.json()) as
              | { gasPrice: number; gasPriceUpdatedAt: string }
              | null;
            if (g)
              set({ gasPrice: g.gasPrice, gasPriceUpdatedAt: g.gasPriceUpdatedAt });
          }
          set({ hydrated: true });
        } catch (err) {
          console.error("settings.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      setSettings: async (s) => {
        set((state) => ({ settings: { ...state.settings, ...s } }));
        try {
          const res = await fetch("/api/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(s),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("settings.setSettings failed", err);
          await get().hydrate();
        }
      },
      setGasPrice: async (price) => {
        const now = new Date().toISOString();
        set({ gasPrice: price, gasPriceUpdatedAt: now });
        try {
          const res = await fetch("/api/gas-prices", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ price }),
          });
          if (!res.ok) throw new Error(await res.text());
          const g = (await res.json()) as {
            gasPrice: number;
            gasPriceUpdatedAt: string;
          };
          set({ gasPrice: g.gasPrice, gasPriceUpdatedAt: g.gasPriceUpdatedAt });
        } catch (err) {
          console.error("settings.setGasPrice failed", err);
          await get().hydrate();
        }
      },
    }),
    {
      name: "carpool-settings",
      partialize: (s) => ({
        settings: s.settings,
        gasPrice: s.gasPrice,
        gasPriceUpdatedAt: s.gasPriceUpdatedAt,
      }),
    }
  )
);
