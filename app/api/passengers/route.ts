import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbPassenger } from "@/lib/supabase/mappers";
import type { DbPassenger } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("passengers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbPassenger[]).map(fromDbPassenger));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; name: string; active?: boolean };
  const supabase = createClient();
  const insert: Partial<DbPassenger> = {
    name: body.name.trim(),
    active: body.active ?? true,
  };
  if (body.id) insert.id = body.id;
  const { data, error } = await supabase
    .from("passengers")
    .insert(insert)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbPassenger(data as DbPassenger));
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { id: string; active: boolean };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("passengers")
    .update({ active: body.active })
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbPassenger(data as DbPassenger));
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const supabase = createClient();
  const { error } = await supabase.from("passengers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
