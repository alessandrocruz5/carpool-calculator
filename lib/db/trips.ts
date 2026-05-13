"use client";
import { createClient } from "@/lib/supabase/client";
import type { Route } from "@/lib/calc";

export interface FullTrip {
  id: string;
  date: string;
  gas_price: number;
  parking_fee_php: number;
  morning: { route: Route; passengerIds: string[] };
  evening: { route: Route; passengerIds: string[] };
  notes: string | null;
}

interface RawTripRow {
  id: string;
  date: string;
  parking_fee_php: number;
  notes: string | null;
  gas_prices: { price_per_liter: number } | null;
  trip_legs: {
    id: string;
    leg: "morning" | "evening";
    route: Route;
    trip_leg_riders: { passenger_id: string }[];
  }[];
}

function shape(row: RawTripRow): FullTrip {
  const morning = row.trip_legs.find((l) => l.leg === "morning");
  const evening = row.trip_legs.find((l) => l.leg === "evening");
  return {
    id: row.id,
    date: row.date,
    gas_price: row.gas_prices ? Number(row.gas_prices.price_per_liter) : 0,
    parking_fee_php: Number(row.parking_fee_php),
    morning: {
      route: morning?.route ?? "skyway",
      passengerIds: morning?.trip_leg_riders.map((r) => r.passenger_id) ?? [],
    },
    evening: {
      route: evening?.route ?? "skyway",
      passengerIds: evening?.trip_leg_riders.map((r) => r.passenger_id) ?? [],
    },
    notes: row.notes,
  };
}

const SELECT =
  "id, date, parking_fee_php, notes, gas_prices(price_per_liter), trip_legs(id, leg, route, trip_leg_riders(passenger_id))";

export async function listTrips(weekStart?: string, weekEnd?: string): Promise<FullTrip[]> {
  const supa = createClient();
  let q = supa.from("trips").select(SELECT).order("date", { ascending: false });
  if (weekStart) q = q.gte("date", weekStart);
  if (weekEnd) q = q.lte("date", weekEnd);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as RawTripRow[]).map(shape);
}

export async function getTrip(date: string): Promise<FullTrip | null> {
  const supa = createClient();
  const { data, error } = await supa
    .from("trips")
    .select(SELECT)
    .eq("date", date)
    .maybeSingle();
  if (error) throw error;
  return data ? shape(data as unknown as RawTripRow) : null;
}

export interface UpsertTripInput {
  date: string;
  gas_price_id: string;
  parking_fee_php: number;
  morning: { route: Route; passengerIds: string[] };
  evening: { route: Route; passengerIds: string[] };
  notes?: string;
}

export async function upsertTrip(input: UpsertTripInput): Promise<string> {
  const supa = createClient();

  const { data: tripRow, error: tripErr } = await supa
    .from("trips")
    .upsert(
      {
        date: input.date,
        gas_price_id: input.gas_price_id,
        parking_fee_php: input.parking_fee_php,
        notes: input.notes ?? null,
      },
      { onConflict: "date" }
    )
    .select("id")
    .single();
  if (tripErr) throw tripErr;
  const tripId = tripRow.id;

  // delete existing legs (cascade removes riders), re-insert
  const { error: delErr } = await supa.from("trip_legs").delete().eq("trip_id", tripId);
  if (delErr) throw delErr;

  for (const legName of ["morning", "evening"] as const) {
    const leg = input[legName];
    const { data: legRow, error: legErr } = await supa
      .from("trip_legs")
      .insert({ trip_id: tripId, leg: legName, route: leg.route })
      .select("id")
      .single();
    if (legErr) throw legErr;
    if (leg.passengerIds.length > 0) {
      const { error: riderErr } = await supa
        .from("trip_leg_riders")
        .insert(leg.passengerIds.map((pid) => ({ trip_leg_id: legRow.id, passenger_id: pid })));
      if (riderErr) throw riderErr;
    }
  }
  return tripId;
}

export async function deleteTrip(id: string) {
  const supa = createClient();
  const { error } = await supa.from("trips").delete().eq("id", id);
  if (error) throw error;
}
