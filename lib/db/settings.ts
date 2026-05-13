"use client";
import { createClient } from "@/lib/supabase/client";
import type { DbSettings } from "@/lib/supabase/types";
import { DEFAULT_SETTINGS, type CalcSettings } from "@/lib/calc";

export async function getSettings(): Promise<DbSettings> {
  const supa = createClient();
  const { data, error } = await supa
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateSettings(patch: Partial<DbSettings>): Promise<DbSettings> {
  const supa = createClient();
  const { data, error } = await supa
    .from("settings")
    .update(patch)
    .eq("id", 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function toCalcSettings(db: DbSettings): CalcSettings {
  return {
    roundTripKm: Number(db.round_trip_km),
    mileageKmPerL: db.mileage_kml_override
      ? Number(db.mileage_kml_override)
      : DEFAULT_SETTINGS.mileageKmPerL,
    parkingFeePhp: Number(db.parking_fee_php),
    tollSkywayPhp: Number(db.toll_skyway_php),
    tollSlexPhp: Number(db.toll_slex_php),
    split1pDriver: db.split_1p_driver,
    split2pDriver: db.split_2p_driver,
    split3pDriver: db.split_3p_driver,
  };
}
