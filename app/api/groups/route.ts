import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbGroup } from "@/lib/supabase/mappers";
import type { DbGroup } from "@/lib/supabase/types";
import { requireAuth, requireDriver } from "@/lib/auth/requireDriver";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbGroup[]).map(fromDbGroup));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;
  const body = (await req.json()) as { name: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });
  const { data: groupId, error } = await supabase.rpc("create_group", {
    p_name: name,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data, error: fetchErr } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .single();
  if (fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  return NextResponse.json(fromDbGroup(data as DbGroup));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const body = (await req.json()) as { id: string; name: string };
  const name = body.name?.trim();
  if (!body.id || !name)
    return NextResponse.json({ error: "missing id or name" }, { status: 400 });
  const { data, error } = await supabase
    .from("groups")
    .update({ name })
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbGroup(data as DbGroup));
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
