import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gasPriceFromDb } from "@/lib/supabase/mappers";
import type { DbGasPrice } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gas_prices")
    .select("*")
    .order("effective_date", { ascending: false })
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = (data ?? [])[0] as DbGasPrice | undefined;
  return NextResponse.json(row ? gasPriceFromDb(row) : null);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { price: number; effectiveDate?: string };
  const date = body.effectiveDate ?? new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gas_prices")
    .upsert(
      {
        effective_date: date,
        price_per_liter: body.price,
      },
      { onConflict: "effective_date" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(gasPriceFromDb(data as DbGasPrice));
}
