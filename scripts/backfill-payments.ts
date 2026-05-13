/**
 * Backfill trip_payments rows for trips that existed before the 0002 migration.
 *
 * Usage:
 *   npx tsx scripts/backfill-payments.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.
 * Idempotent: existing rows are left alone; only missing (trip_id, passenger_id)
 * pairs are inserted with paid=false.
 */
import { createClient } from "@supabase/supabase-js";
import { calcDay, DEFAULT_SETTINGS, type CalcSettings } from "../lib/calc";
import { fromDbSettings } from "../lib/supabase/mappers";
import type {
  DbGasPrice,
  DbSettings,
  DbTrip,
  DbTripLeg,
  DbTripLegRider,
} from "../lib/supabase/types";

interface TripJoin extends DbTrip {
  trip_legs: (DbTripLeg & { trip_leg_riders: DbTripLegRider[] })[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey);

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const calcSettings: CalcSettings = settingsRow
    ? fromDbSettings(settingsRow as DbSettings)
    : DEFAULT_SETTINGS;

  const { data: trips, error } = await supabase
    .from("trips")
    .select("*, trip_legs(*, trip_leg_riders(*))");
  if (error) throw error;

  const { data: gasPrices } = await supabase.from("gas_prices").select("*");
  const gp = (gasPrices ?? []) as DbGasPrice[];

  let inserted = 0;
  let skipped = 0;
  for (const t of (trips ?? []) as TripJoin[]) {
    const gas =
      gp.find((g) => g.id === t.gas_price_id)?.price_per_liter ?? 0;
    const morning = t.trip_legs.find((l) => l.leg === "morning");
    const evening = t.trip_legs.find((l) => l.leg === "evening");
    const breakdown = calcDay(
      {
        date: t.date,
        gasPricePhpPerL: Number(gas),
        morning: {
          route: morning?.route ?? "skyway",
          passengerIds: morning?.trip_leg_riders.map((r) => r.passenger_id) ?? [],
        },
        evening: {
          route: evening?.route ?? "skyway",
          passengerIds: evening?.trip_leg_riders.map((r) => r.passenger_id) ?? [],
        },
      },
      calcSettings
    );

    const { data: existing } = await supabase
      .from("trip_payments")
      .select("passenger_id")
      .eq("trip_id", t.id);
    const have = new Set(
      ((existing ?? []) as Array<{ passenger_id: string }>).map((r) => r.passenger_id)
    );

    const missing = Object.entries(breakdown.perPassenger)
      .filter(([pid]) => !have.has(pid))
      .map(([pid, amt]) => ({
        trip_id: t.id,
        passenger_id: pid,
        amount_php: amt,
        paid: false,
        paid_at: null,
      }));

    if (missing.length === 0) {
      skipped++;
      continue;
    }
    const { error: insErr } = await supabase.from("trip_payments").insert(missing);
    if (insErr) {
      console.error(`failed for trip ${t.id} (${t.date})`, insErr);
      continue;
    }
    inserted += missing.length;
  }

  console.log(`Done. Inserted ${inserted} payment rows. Trips with nothing to add: ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
