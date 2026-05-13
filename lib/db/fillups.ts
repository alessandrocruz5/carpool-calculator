"use client";
import { createClient } from "@/lib/supabase/client";
import type { DbFillup } from "@/lib/supabase/types";

export async function listFillups(): Promise<DbFillup[]> {
  const supa = createClient();
  const { data, error } = await supa
    .from("fillups")
    .select("*")
    .order("odometer_km", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addFillup(input: {
  date: string;
  liters: number;
  total_php: number;
  odometer_km: number;
}): Promise<DbFillup> {
  const supa = createClient();
  const { data, error } = await supa
    .from("fillups")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFillup(id: string) {
  const supa = createClient();
  const { error } = await supa.from("fillups").delete().eq("id", id);
  if (error) throw error;
}
