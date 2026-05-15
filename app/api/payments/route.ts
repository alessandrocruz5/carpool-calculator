import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertDriver } from "@/lib/auth/driverKey";
import type { DbTripPayment } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface PaymentWithDate extends DbTripPayment {
  trips?: { date: string } | null;
}

interface PassengerJoin {
  passenger_id: string;
  amount_php: number | string;
  passengers?: { name: string } | null;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const summary = searchParams.get("summary");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const passengerId = searchParams.get("passengerId");
  const paid = searchParams.get("paid");

  if (summary === "1") {
    const { data, error } = await supabase
      .from("trip_payments")
      .select("passenger_id, amount_php, passengers!inner(name)")
      .eq("paid", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as unknown as PassengerJoin[];
    const agg = new Map<
      string,
      { passenger_id: string; name: string; unpaid_total_php: number; unpaid_count: number }
    >();
    for (const r of rows) {
      const cur = agg.get(r.passenger_id) ?? {
        passenger_id: r.passenger_id,
        name: r.passengers?.name ?? r.passenger_id,
        unpaid_total_php: 0,
        unpaid_count: 0,
      };
      cur.unpaid_total_php += Number(r.amount_php);
      cur.unpaid_count += 1;
      agg.set(r.passenger_id, cur);
    }
    const out = Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(out);
  }

  let q = supabase
    .from("trip_payments")
    .select("trip_id, passenger_id, amount_php, paid, paid_at, trips!inner(date)");

  if (passengerId) q = q.eq("passenger_id", passengerId);
  if (paid === "true") q = q.eq("paid", true);
  if (paid === "false") q = q.eq("paid", false);
  if (from) q = q.gte("trips.date", from);
  if (to) q = q.lte("trips.date", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as unknown as PaymentWithDate[]).map((r) => ({
    tripId: r.trip_id,
    passengerId: r.passenger_id,
    amountPhp: Number(r.amount_php),
    paid: r.paid,
    paidAt: r.paid_at,
    date: r.trips?.date ?? null,
  }));
  return NextResponse.json(rows);
}

interface PatchItem {
  tripId: string;
  passengerId: string;
  paid: boolean;
}

export async function PATCH(req: Request) {
  const denied = assertDriver(req);
  if (denied) return denied;

  const body = (await req.json()) as
    | PatchItem
    | { items: PatchItem[] }
    | PatchItem[];

  const items: PatchItem[] = Array.isArray(body)
    ? body
    : "items" in body && Array.isArray(body.items)
    ? body.items
    : [body as PatchItem];

  for (const it of items) {
    if (!it || !it.tripId || !it.passengerId || typeof it.paid !== "boolean") {
      return NextResponse.json(
        { error: "each item requires tripId, passengerId, paid" },
        { status: 400 }
      );
    }
  }

  const supabase = await createClient();
  const updated: Array<{
    tripId: string;
    passengerId: string;
    amountPhp: number;
    paid: boolean;
    paidAt: string | null;
  }> = [];

  for (const it of items) {
    const { data, error } = await supabase
      .from("trip_payments")
      .update({
        paid: it.paid,
        paid_at: it.paid ? new Date().toISOString() : null,
      })
      .eq("trip_id", it.tripId)
      .eq("passenger_id", it.passengerId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const row = data as DbTripPayment;
    updated.push({
      tripId: row.trip_id,
      passengerId: row.passenger_id,
      amountPhp: Number(row.amount_php),
      paid: row.paid,
      paidAt: row.paid_at,
    });
  }

  if (!Array.isArray(body) && !("items" in (body as object))) {
    return NextResponse.json(updated[0]);
  }
  return NextResponse.json(updated);
}
