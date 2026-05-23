import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbPassenger } from "@/lib/supabase/mappers";
import type { DbPassenger } from "@/lib/supabase/types";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const { data, error } = await supabase
    .from("passengers")
    .select("*")
    .eq("group_id", group.groupId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbPassenger[]).map(fromDbPassenger));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const body = (await req.json()) as { id?: string; name: string; active?: boolean };
  const insert: Partial<DbPassenger> = {
    group_id: group.groupId,
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
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const body = (await req.json()) as { id: string; active: boolean };
  const { data, error } = await supabase
    .from("passengers")
    .update({ active: body.active })
    .eq("id", body.id)
    .eq("group_id", group.groupId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbPassenger(data as DbPassenger));
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
    .from("passengers")
    .delete()
    .eq("id", id)
    .eq("group_id", group.groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
