"use client";
import { createClient } from "@/lib/supabase/client";
import type { DbGasPrice } from "@/lib/supabase/types";

export async function getLatestGasPrice(): Promise<DbGasPrice | null> {
  const supa = createClient();
  const { data, error } = await supa
    .from("gas_prices")
    .select("*")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listGasPrices(): Promise<DbGasPrice[]> {
  const supa = createClient();
  const { data, error } = await supa
    .from("gas_prices")
    .select("*")
    .order("effective_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertGasPrice(
  effective_date: string,
  price_per_liter: number,
  station_name?: string
): Promise<DbGasPrice> {
  const supa = createClient();
  const row: Record<string, unknown> = { effective_date, price_per_liter };
  if (station_name) row.station_name = station_name;
  const { data, error } = await supa
    .from("gas_prices")
    .upsert(row, { onConflict: "effective_date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
