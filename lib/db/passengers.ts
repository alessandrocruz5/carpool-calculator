"use client";
import { createClient } from "@/lib/supabase/client";
import type { DbPassenger } from "@/lib/supabase/types";

export async function listPassengers(): Promise<DbPassenger[]> {
  const supa = createClient();
  const { data, error } = await supa
    .from("passengers")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function addPassenger(name: string): Promise<DbPassenger> {
  const supa = createClient();
  const { data, error } = await supa
    .from("passengers")
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setPassengerActive(id: string, active: boolean) {
  const supa = createClient();
  const { error } = await supa.from("passengers").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function removePassenger(id: string) {
  const supa = createClient();
  const { error } = await supa.from("passengers").delete().eq("id", id);
  if (error) throw error;
}
