import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbPassenger } from "@/lib/supabase/mappers";
import type { DbPassenger } from "@/lib/supabase/types";
import { requireDriver } from "@/lib/auth/requireDriver";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("passengers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbPassenger[]).map(fromDbPassenger));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const body = (await req.json()) as { id?: string; name: string; active?: boolean };
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
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const body = (await req.json()) as { id: string; active: boolean };
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
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("passengers").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "passenger_has_rides" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
