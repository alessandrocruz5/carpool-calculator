import { NextResponse } from "next/server";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/server";
import { calcLeg, type Route } from "@/lib/calc";
import { toCalcSettings } from "@/lib/db/settings";
import { appendRows, type ExportRow } from "@/lib/sheets";
import { weekdays } from "@/lib/week";

interface Body {
  weekStart: string;
}

interface TripRow {
  id: string;
  date: string;
  parking_fee_php: number;
  gas_prices: { price_per_liter: number } | null;
  trip_legs: {
    leg: "morning" | "evening";
    route: Route;
    trip_leg_riders: { passenger_id: string }[];
  }[];
}

export async function POST(req: Request) {
  try {
    const { weekStart } = (await req.json()) as Body;
    const days = weekdays(weekStart);
    const supa = createClient();

    const [{ data: trips, error: tErr }, { data: passengers, error: pErr }, { data: settingsRow, error: sErr }] =
      await Promise.all([
        supa
          .from("trips")
          .select(
            "id, date, parking_fee_php, gas_prices(price_per_liter), trip_legs(leg, route, trip_leg_riders(passenger_id))"
          )
          .gte("date", days[0])
          .lte("date", days[4]),
        supa.from("passengers").select("id, name").order("name"),
        supa.from("settings").select("*").eq("id", 1).single(),
      ]);

    if (tErr) throw tErr;
    if (pErr) throw pErr;
    if (sErr) throw sErr;

    const settings = toCalcSettings(settingsRow);
    const nameById = new Map((passengers ?? []).map((p) => [p.id, p.name]));
    const namesAll = (passengers ?? []).map((p) => p.name);

    const rows: ExportRow[] = [];
    for (const t of (trips ?? []) as unknown as TripRow[]) {
      const gasPrice = t.gas_prices ? Number(t.gas_prices.price_per_liter) : 0;
      for (const legName of ["morning", "evening"] as const) {
        const leg = t.trip_legs.find((l) => l.leg === legName);
        if (!leg) continue;
        const passengerIds = leg.trip_leg_riders.map((r) => r.passenger_id);
        const breakdown = calcLeg(
          { leg: legName, route: leg.route, passengerCount: passengerIds.length },
          gasPrice,
          settings
        );
        const passenger_shares: Record<string, number> = {};
        for (const id of passengerIds) {
          const name = nameById.get(id) ?? id;
          passenger_shares[name] = breakdown.passengerEach;
        }
        rows.push({
          date: t.date,
          leg: legName,
          route: leg.route,
          driver_share: breakdown.driverShare,
          gas_price: gasPrice,
          parking: breakdown.parkingCost,
          toll: breakdown.tollCost,
          passenger_shares,
        });
      }
    }

    const tab = dayjs(weekStart).format("YYYY-MM");
    const written = await appendRows(tab, rows, namesAll);
    return NextResponse.json({ ok: true, rows: written });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
