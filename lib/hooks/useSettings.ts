"use client";
import { useAsync } from "./useAsync";
import { getSettings, toCalcSettings, updateSettings } from "@/lib/db/settings";
import type { DbSettings } from "@/lib/supabase/types";
import { DEFAULT_SETTINGS } from "@/lib/calc";

export function useSettings() {
  const state = useAsync(getSettings, []);
  const settings = state.data ? toCalcSettings(state.data) : DEFAULT_SETTINGS;

  return {
    ...state,
    settings,
    raw: state.data,
    async update(patch: Partial<DbSettings>) {
      await updateSettings(patch);
      await state.refresh();
    },
  };
}
