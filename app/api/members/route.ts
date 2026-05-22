import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbMember } from "@/lib/supabase/mappers";
import type { DbMember } from "@/lib/supabase/types";
import { requireDriver } from "@/lib/auth/requireDriver";
import { getActiveGroupId } from "@/lib/auth/activeGroup";

export const dynamic = "force-dynamic";

type Role = "driver" | "passenger" | "both";

export async function GET() {
  const supabase = await createClient();
  const groupId = await getActiveGroupId();
  if (!groupId) return NextResponse.json([]);
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbMember[]).map(fromDbMember));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const groupId = await getActiveGroupId();
  if (!groupId)
    return NextResponse.json({ error: "no active group" }, { status: 400 });
  const body = (await req.json()) as { email: string; role: Role };
  const email = body.email?.trim();
  if (!email)
    return NextResponse.json({ error: "missing email" }, { status: 400 });
  const { error } = await supabase.rpc("link_member_by_email", {
    p_group_id: groupId,
    p_email: email,
    p_role: body.role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const groupId = await getActiveGroupId();
  if (!groupId)
    return NextResponse.json({ error: "no active group" }, { status: 400 });
  const body = (await req.json()) as { userId: string; role: Role };
  if (!body.userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  const { data, error } = await supabase
    .from("members")
    .update({ role: body.role })
    .eq("group_id", groupId)
    .eq("user_id", body.userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbMember(data as DbMember));
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const denied = await requireDriver(supabase);
  if (denied) return denied;
  const groupId = await getActiveGroupId();
  if (!groupId)
    return NextResponse.json({ error: "no active group" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const { data: rows, error } = await supabase
    .from("members")
    .select("user_id, role")
    .eq("group_id", groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const members = (rows ?? []) as { user_id: string; role: Role }[];
  const target = members.find((m) => m.user_id === userId);
  const isDriverRole = (r: Role) => r === "driver" || r === "both";
  const driverCount = members.filter((m) => isDriverRole(m.role)).length;
  if (target && isDriverRole(target.role) && driverCount <= 1) {
    return NextResponse.json(
      { error: "Can't remove the last driver. Link another driver first." },
      { status: 400 }
    );
  }

  const { error: delErr } = await supabase
    .from("members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
