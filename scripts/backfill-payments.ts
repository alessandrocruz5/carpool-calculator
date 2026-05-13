/**
 * Backfill trip_payments rows for trips that existed before the 0002 migration.
 *
 * Usage:
 *   npx tsx scripts/backfill-payments.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.
 * Loads .env.local then .env automatically.
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
    let loaded = 0;
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
        loaded++;
      }
    }
    console.log(`[backfill] loaded ${loaded} vars from ${path}`);
    return true;
  } catch {
    console.log(`[backfill] no env file at ${path}`);
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
  console.log(
    `[backfill] NEXT_PUBLIC_SUPABASE_URL=${url ? "set" : "MISSING"}, ` +
      `SUPABASE_SECRET_KEY=${process.env.SUPABASE_SECRET_KEY ? "set" : "unset"}, ` +
      `SUPABASE_SERVICE_ROLE_KEY=${
        process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "unset"
      }`
  );
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY / " +
        "SUPABASE_SERVICE_ROLE_KEY. Inline workaround: " +
        "NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... " +
        "npx tsx scripts/backfill-payments.ts"
    );
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
