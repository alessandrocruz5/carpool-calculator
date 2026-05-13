import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertDriver } from "@/lib/auth/driverKey";
import type { DbTripPayment } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface PaymentWithDate extends DbTripPayment {
  trips?: { date: string } | null;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const passengerId = searchParams.get("passengerId");
  const paid = searchParams.get("paid");

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

  const rows = ((data ?? []) as PaymentWithDate[]).map((r) => ({
    tripId: r.trip_id,
    passengerId: r.passenger_id,
    amountPhp: Number(r.amount_php),
    paid: r.paid,
    paidAt: r.paid_at,
    date: r.trips?.date ?? null,
  }));
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const denied = assertDriver(req);
  if (denied) return denied;
  const body = (await req.json()) as {
    tripId: string;
    passengerId: string;
    paid: boolean;
  };
  if (!body.tripId || !body.passengerId) {
    return NextResponse.json({ error: "missing tripId or passengerId" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_payments")
    .update({
      paid: body.paid,
      paid_at: body.paid ? new Date().toISOString() : null,
    })
    .eq("trip_id", body.tripId)
    .eq("passenger_id", body.passengerId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as DbTripPayment;
  return NextResponse.json({
    tripId: row.trip_id,
    passengerId: row.passenger_id,
    amountPhp: Number(row.amount_php),
    paid: row.paid,
    paidAt: row.paid_at,
  });
}
