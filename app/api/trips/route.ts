import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbTrip, type DbTripWithLegs } from "@/lib/supabase/mappers";
import type { StoredTrip } from "@/lib/store/trips";
import type { DbGasPrice } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const TRIP_SELECT =
  "*, trip_legs(*, trip_leg_riders(*))";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .order("date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: gpData } = await supabase
    .from("gas_prices")
    .select("*")
    .order("effective_date", { ascending: true });
  const gasPrices = (gpData ?? []) as DbGasPrice[];

  const trips: StoredTrip[] = ((data ?? []) as DbTripWithLegs[]).map((r) => {
    const gp = gasPrices.find((g) => g.id === r.gas_price_id);
    return fromDbTrip(r, gp ? Number(gp.price_per_liter) : 0);
  });
  return NextResponse.json(trips);
}

export async function POST(req: Request) {
  const body = (await req.json()) as StoredTrip;
  const supabase = await createClient();

  // Find the gas_prices row effective for this trip's date (latest with effective_date <= trip.date)
  const { data: gpRow } = await supabase
    .from("gas_prices")
    .select("id")
    .lte("effective_date", body.date)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const gasPriceId = (gpRow as { id: string } | null)?.id ?? null;

  const { data: tripRow, error: tripErr } = await supabase
    .from("trips")
    .upsert(
      {
        date: body.date,
        gas_price_id: gasPriceId,
        parking_fee_php: body.parkingFee,
        notes: body.notes ?? null,
      },
      { onConflict: "date" }
    )
    .select()
    .single();
  if (tripErr) return NextResponse.json({ error: tripErr.message }, { status: 500 });

  const tripId = (tripRow as { id: string }).id;

  // Replace legs + riders. Cascade on trip_legs delete cleans up riders.
  const { error: delErr } = await supabase
    .from("trip_legs")
    .delete()
    .eq("trip_id", tripId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const legsToInsert = [
    { trip_id: tripId, leg: "morning" as const, route: body.morning.route },
    { trip_id: tripId, leg: "evening" as const, route: body.evening.route },
  ];
  const { data: legRows, error: legErr } = await supabase
    .from("trip_legs")
    .insert(legsToInsert)
    .select();
  if (legErr) return NextResponse.json({ error: legErr.message }, { status: 500 });

  const morningLeg = (legRows ?? []).find((l: { leg: string }) => l.leg === "morning") as
    | { id: string }
    | undefined;
  const eveningLeg = (legRows ?? []).find((l: { leg: string }) => l.leg === "evening") as
    | { id: string }
    | undefined;

  const riders = [
    ...body.morning.passengerIds.map((pid) => ({
      trip_leg_id: morningLeg!.id,
      passenger_id: pid,
    })),
    ...body.evening.passengerIds.map((pid) => ({
      trip_leg_id: eveningLeg!.id,
      passenger_id: pid,
    })),
  ];
  if (riders.length > 0) {
    const { error: ridErr } = await supabase.from("trip_leg_riders").insert(riders);
    if (ridErr) return NextResponse.json({ error: ridErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: tripId, date: body.date });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
