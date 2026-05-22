import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbFillup, toDbFillupInsert } from "@/lib/supabase/mappers";
import type { DbFillup } from "@/lib/supabase/types";
import type { Fillup } from "@/lib/mileage";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const { data, error } = await supabase
    .from("fillups")
    .select("*")
    .eq("group_id", group.groupId)
    .order("date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbFillup[]).map(fromDbFillup));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const body = (await req.json()) as Omit<Fillup, "id"> & { id?: string };
  const insert: Partial<DbFillup> = toDbFillupInsert(body, group.groupId);
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
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase
    .from("fillups")
    .delete()
    .eq("id", id)
    .eq("group_id", group.groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
