import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fromDbTrip,
  fromDbSettings,
  fromDbFillup,
  type DbTripWithLegs,
} from "@/lib/supabase/mappers";
import type { StoredTrip, LegState } from "@/lib/store/trips";
import type { DbGasPrice, DbSettings, DbFillup } from "@/lib/supabase/types";
import { calcDay, DEFAULT_SETTINGS } from "@/lib/calc";
import { rollingMileage, resolveEffectiveMileage } from "@/lib/mileage";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";

export const dynamic = "force-dynamic";

const TRIP_SELECT =
  "id, date, parking_fee_php, notes, car_id, driver_user_id, gas_price_id, " +
  "trip_legs(leg, position, route, distance_km, toll_php, trip_leg_riders(passenger_id, extra_distance_km))";

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const [tripsRes, gpRes] = await Promise.all([
    supabase
      .from("trips")
      .select(TRIP_SELECT)
      .eq("group_id", group.groupId)
      .is("archived_at", null)
      .order("date", { ascending: true }),
    supabase
      .from("gas_prices")
      .select("id, price_per_liter")
      .eq("group_id", group.groupId)
      .order("effective_date", { ascending: true }),
  ]);
  const { data, error } = tripsRes;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const gasPrices = (gpRes.data ?? []) as Pick<
    DbGasPrice,
    "id" | "price_per_liter"
  >[];

  const trips: StoredTrip[] = ((data ?? []) as unknown as DbTripWithLegs[]).map((r) => {
    const gp = gasPrices.find((g) => g.id === r.gas_price_id);
    return fromDbTrip(r, gp ? Number(gp.price_per_liter) : 0);
  });
  return NextResponse.json(trips);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const groupId = group.groupId;
  const body = (await req.json()) as StoredTrip;

  // Authoritative ordered legs. `?? []` guards against a stale client that omits
  // them entirely — the length check below rejects that with a 400.
  const inputLegs: LegState[] = body.legs ?? [];

  if (inputLegs.length === 0) {
    return NextResponse.json(
      { error: "at least one leg is required" },
      { status: 400 }
    );
  }
  if (inputLegs.some((leg) => !(leg.distanceKm > 0))) {
    return NextResponse.json(
      { error: "distance_km must be positive for every leg" },
      { status: 400 }
    );
  }

  // Model A per-rider detour distance must be non-negative (NaN rejected too).
  const extraKms = inputLegs.flatMap((leg) =>
    Object.values(leg.extraKmByRider ?? {})
  );
  if (extraKms.some((km) => !(km >= 0))) {
    return NextResponse.json(
      { error: "extra_distance_km must be >= 0" },
      { status: 400 }
    );
  }

  // Per-leg toll override (SABAY-39): null/undefined means "use the route
  // default"; any provided value must be a finite, non-negative number. The
  // finiteness guard rejects Infinity/NaN and numeric-coercible strings before
  // they reach the money split or overflow the numeric(8,2) column as a 500.
  if (
    inputLegs.some(
      (leg) =>
        leg.tollPhp != null &&
        !(Number.isFinite(leg.tollPhp) && leg.tollPhp >= 0)
    )
  ) {
    return NextResponse.json(
      { error: "toll_php must be a finite number >= 0" },
      { status: 400 }
    );
  }

  // When a car/driver is attached, validate ownership + group membership and
  // resolve the car's fuel efficiency for the cost calculation below.
  let carMileageKmPerL: number | null = null;
  if (body.carId != null || body.driverUserId != null) {
    if (body.carId == null || body.driverUserId == null) {
      return NextResponse.json(
        { error: "car_id and driver_user_id must be provided together" },
        { status: 400 }
      );
    }
    const { data: memberRow } = await supabase
      .from("members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", body.driverUserId)
      .maybeSingle();
    const role = (memberRow as { role?: string } | null)?.role;
    if (role !== "driver" && role !== "both") {
      return NextResponse.json(
        { error: "driver_user_id is not a driver of the active group" },
        { status: 400 }
      );
    }
    const { data: carRow } = await supabase
      .from("cars")
      .select("owner_user_id, fuel_efficiency_kml")
      .eq("id", body.carId)
      .maybeSingle();
    const car = carRow as
      | { owner_user_id: string; fuel_efficiency_kml: number | null }
      | null;
    if (!car || car.owner_user_id !== body.driverUserId) {
      return NextResponse.json(
        { error: "car_id is not owned by driver_user_id" },
        { status: 400 }
      );
    }
    carMileageKmPerL =
      car.fuel_efficiency_kml != null ? Number(car.fuel_efficiency_kml) : null;
  }

  // Find the gas_prices row effective for this trip's date (latest with effective_date <= trip.date).
  // If none exists, snapshot body.gasPrice into a new gas_prices row so the Log renders correctly.
  const { data: gpRow } = await supabase
    .from("gas_prices")
    .select("id")
    .eq("group_id", groupId)
    .lte("effective_date", body.date)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  let gasPriceId = (gpRow as { id: string } | null)?.id ?? null;
  if (!gasPriceId && body.gasPrice > 0) {
    const { data: newGp, error: newGpErr } = await supabase
      .from("gas_prices")
      .insert({
        group_id: groupId,
        effective_date: body.date,
        price_per_liter: body.gasPrice,
      })
      .select("id")
      .single();
    if (newGpErr)
      return NextResponse.json({ error: newGpErr.message }, { status: 500 });
    gasPriceId = (newGp as { id: string }).id;
  }

  const { data: tripRow, error: tripErr } = await supabase
    .from("trips")
    .upsert(
      {
        group_id: groupId,
        date: body.date,
        gas_price_id: gasPriceId,
        parking_fee_php: body.parkingFee,
        notes: body.notes ?? null,
        car_id: body.carId ?? null,
        driver_user_id: body.driverUserId ?? null,
      },
      { onConflict: "group_id,date" }
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

  // Ordered legs: position is authoritative; the first two keep their legacy
  // morning/evening name, later legs are unnamed (leg null, position >= 2).
  const legsToInsert = inputLegs.map((leg, i) => ({
    group_id: groupId,
    trip_id: tripId,
    leg: i === 0 ? ("morning" as const) : i === 1 ? ("evening" as const) : null,
    position: i,
    route: leg.route,
    distance_km: leg.distanceKm,
    // Null = use the route default; a provided value overrides it (SABAY-39).
    toll_php: leg.tollPhp ?? null,
  }));
  const { data: legRows, error: legErr } = await supabase
    .from("trip_legs")
    .insert(legsToInsert)
    .select("id, position");
  if (legErr) return NextResponse.json({ error: legErr.message }, { status: 500 });

  // Map each inserted leg back to its position so riders attach to the right leg
  // (insert/select does not guarantee row order).
  const legIdByPosition = new Map<number, string>();
  for (const row of (legRows ?? []) as { id: string; position: number }[]) {
    legIdByPosition.set(row.position, row.id);
  }

  const riders = inputLegs.flatMap((leg, i) =>
    leg.passengerIds.map((pid) => ({
      group_id: groupId,
      trip_leg_id: legIdByPosition.get(i)!,
      passenger_id: pid,
      extra_distance_km: leg.extraKmByRider?.[pid] ?? 0,
    }))
  );
  if (riders.length > 0) {
    const { error: ridErr } = await supabase.from("trip_leg_riders").insert(riders);
    if (ridErr) return NextResponse.json({ error: ridErr.message }, { status: 500 });
  }

  // Compute per-passenger amounts for this trip and upsert trip_payments.
  // Preserve existing paid status; only update amount + insert new rows.
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  const baseSettings = settingsRow
    ? fromDbSettings(settingsRow as DbSettings)
    : DEFAULT_SETTINGS;
  // Resolve the effective mileage with the same precedence as the trip UI so
  // the saved payment split matches what the user sees:
  // car rated → car measured → manual override → overall rolling avg → default.
  const { data: fillupRows } = await supabase
    .from("fillups")
    .select("*")
    .eq("group_id", groupId);
  const fillups = (fillupRows ?? []).map((f) => fromDbFillup(f as DbFillup));
  const carMeasured = body.carId ? rollingMileage(fillups, 5, body.carId) : null;
  const overallRolling = rollingMileage(fillups);
  const carEfficiency =
    carMileageKmPerL != null && carMileageKmPerL > 0 ? carMileageKmPerL : carMeasured;
  const effectiveMileage = resolveEffectiveMileage({
    carEfficiency,
    override: baseSettings.mileageKmPerL,
    overrideEnabled: baseSettings.mileageOverrideEnabled,
    rollingAvg: overallRolling,
    fallback: DEFAULT_SETTINGS.mileageKmPerL,
  });
  const calcSettings = { ...baseSettings, mileageKmPerL: effectiveMileage };

  const breakdown = calcDay(
    {
      date: body.date,
      gasPricePhpPerL: body.gasPrice,
      legs: inputLegs,
    },
    calcSettings
  );

  const passengerIds = Object.keys(breakdown.perPassenger);

  // Remove payment rows for passengers no longer on this trip.
  if (passengerIds.length === 0) {
    await supabase.from("trip_payments").delete().eq("trip_id", tripId);
  } else {
    await supabase
      .from("trip_payments")
      .delete()
      .eq("trip_id", tripId)
      .not("passenger_id", "in", `(${passengerIds.map((id) => `"${id}"`).join(",")})`);
  }

  if (passengerIds.length > 0) {
    // Fetch existing rows to preserve paid status; update amount.
    const { data: existing } = await supabase
      .from("trip_payments")
      .select("passenger_id, paid, paid_at")
      .eq("trip_id", tripId);
    const existingMap = new Map(
      ((existing ?? []) as Array<{ passenger_id: string; paid: boolean; paid_at: string | null }>).map(
        (r) => [r.passenger_id, r]
      )
    );
    const payments = passengerIds.map((pid) => ({
      group_id: groupId,
      trip_id: tripId,
      passenger_id: pid,
      amount_php: breakdown.perPassenger[pid],
      paid: existingMap.get(pid)?.paid ?? false,
      paid_at: existingMap.get(pid)?.paid_at ?? null,
    }));
    const { error: payErr } = await supabase
      .from("trip_payments")
      .upsert(payments, { onConflict: "trip_id,passenger_id" });
    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: tripId, date: body.date });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", id)
    .eq("group_id", group.groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
