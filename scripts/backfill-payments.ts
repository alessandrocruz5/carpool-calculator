/**
 * Backfill trip_payments rows for trips that existed before the 0002 migration.
 *
 * Usage:
 *   npx tsx scripts/backfill-payments.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and one of SUPABASE_SECRET_KEY or
 * SUPABASE_SERVICE_ROLE_KEY in env. Loads .env.local then .env automatically.
 * Idempotent: existing rows are left alone; only missing (trip_id, passenger_id)
 * pairs are inserted with paid=false.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
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

function loadEnvFile(path: string): boolean {
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = value;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const scriptDir = resolve(__dirname);
const repoRoot = resolve(scriptDir, "..");
loadEnvFile(resolve(repoRoot, ".env.local"));
loadEnvFile(resolve(repoRoot, ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

interface TripJoin extends DbTrip {
  trip_legs: (DbTripLeg & { trip_leg_riders: DbTripLegRider[] })[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY / " +
        "SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }
  // RLS bypass required: one-time migration script runs outside any user session
  // and must read/write trips, gas_prices, and trip_payments across ALL groups
  // with no JWT — a user-scoped client would silently return empty result sets.
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
    // Ordered legs by position (legacy enum as the fallback ordering key).
    const legOrder = (l: DbTripLeg): number =>
      l.position != null
        ? l.position
        : l.leg === "morning"
        ? 0
        : l.leg === "evening"
        ? 1
        : Number.MAX_SAFE_INTEGER;
    const legs = [...t.trip_legs]
      .sort((a, b) => legOrder(a) - legOrder(b))
      .map((l) => ({
        route: l.route ?? "skyway",
        passengerIds: l.trip_leg_riders.map((r) => r.passenger_id),
        distanceKm: Number(l.distance_km),
      }));
    const breakdown = calcDay(
      {
        date: t.date,
        gasPricePhpPerL: Number(gas),
        legs,
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

  console.log(`Done. Inserted ${inserted} payment rows. Skipped: ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
