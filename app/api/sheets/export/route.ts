import { NextResponse } from "next/server";
import dayjs from "dayjs";
import { calcLeg, type CalcSettings, type Route } from "@/lib/calc";
import { appendRows, type ExportRow } from "@/lib/sheets";

interface Body {
  weekStart: string;
  trips: Array<{
    date: string;
    gasPrice: number;
    parkingFee: number;
    morning: { route: Route; passengerIds: string[] };
    evening: { route: Route; passengerIds: string[] };
  }>;
  passengers: { id: string; name: string }[];
  settings: CalcSettings;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const nameById = new Map(body.passengers.map((p) => [p.id, p.name]));
    const namesAll = body.passengers.map((p) => p.name);

    const rows: ExportRow[] = [];
    for (const t of body.trips) {
      for (const legName of ["morning", "evening"] as const) {
        const leg = t[legName];
        const breakdown = calcLeg(
          { leg: legName, route: leg.route, passengerCount: leg.passengerIds.length },
          t.gasPrice,
          body.settings
        );
        const passenger_shares: Record<string, number> = {};
        for (const id of leg.passengerIds) {
          const name = nameById.get(id) ?? id;
          passenger_shares[name] = breakdown.passengerEach;
        }
        rows.push({
          date: t.date,
          leg: legName,
          route: leg.route,
          driver_share: breakdown.driverShare,
          gas_price: t.gasPrice,
          parking: breakdown.parkingCost,
          toll: breakdown.tollCost,
          passenger_shares,
        });
      }
    }

    const tab = dayjs(body.weekStart).format("YYYY-MM");
    const written = await appendRows(tab, rows, namesAll);
    return NextResponse.json({ ok: true, rows: written });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
