import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbFillup, toDbFillupInsert } from "@/lib/supabase/mappers";
import type { DbFillup } from "@/lib/supabase/types";
import type { Fillup } from "@/lib/mileage";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fillups")
    .select("*")
    .order("date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbFillup[]).map(fromDbFillup));
}

export async function POST(req: Request) {
  const body = (await req.json()) as Omit<Fillup, "id"> & { id?: string };
  const supabase = await createClient();
  const insert: Partial<DbFillup> = toDbFillupInsert(body);
  if (body.id) insert.id = body.id;
  const { data, error } = await supabase
    .from("fillups")
    .insert(insert)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbFillup(data as DbFillup));
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("fillups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
