import { NextResponse } from "next/server";
import dayjs from "dayjs";
import { calcLeg, type CalcSettings, type Route } from "@/lib/calc";
import { appendRows, replaceRows, type ExportRow } from "@/lib/sheets";
import { createClient } from "@/lib/supabase/server";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

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

function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_SHEET_ID
  );
}

export async function GET() {
  return NextResponse.json({ configured: isConfigured() });
}

export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, disabled: true, reason: "sheets_export_not_configured" },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const limited = await enforceRateLimit(
    "sheets:export",
    getIdentifier(req, denied.userId),
    { requests: 3, window: "1 m" }
  );
  if (limited) return limited;

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

    // Also refresh the Payments-YYYY-MM tab (per trip per rider, with paid status).
    const monthStart = dayjs(body.weekStart).startOf("month").format("YYYY-MM-DD");
    const monthEnd = dayjs(body.weekStart).endOf("month").format("YYYY-MM-DD");
    const { data: payRows, error: payErr } = await supabase
      .from("trip_payments")
      .select("trip_id, passenger_id, amount_php, paid, paid_at, trips!inner(date)")
      .eq("group_id", group.groupId)
      .gte("trips.date", monthStart)
      .lte("trips.date", monthEnd);

    if (!payErr) {
      const paymentTabHeaders = [
        "date",
        "passenger",
        "amount_php",
        "paid",
        "paid_at",
        "trip_id",
        "passenger_id",
      ];
      type PayJoin = {
        trip_id: string;
        passenger_id: string;
        amount_php: number;
        paid: boolean;
        paid_at: string | null;
        trips: { date: string } | null;
      };
      const sortedRows = ((payRows ?? []) as unknown as PayJoin[])
        .map((r) => ({
          date: r.trips?.date ?? "",
          passenger: nameById.get(r.passenger_id) ?? r.passenger_id,
          amount_php: Number(r.amount_php),
          paid: r.paid,
          paid_at: r.paid_at ?? "",
          trip_id: r.trip_id,
          passenger_id: r.passenger_id,
        }))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.passenger.localeCompare(b.passenger)
        );
      await replaceRows(`Payments-${tab}`, paymentTabHeaders, sortedRows);
    } else {
      log.error("payments export query failed", { err: payErr });
    }

    return NextResponse.json({ ok: true, rows: written });
  } catch (e) {
    log.error("sheets export failed", e);
    return NextResponse.json(
      { ok: false, error: "export_failed" },
      { status: 500 }
    );
  }
}
