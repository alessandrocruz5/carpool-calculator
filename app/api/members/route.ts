import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireGroupMember, requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import type { MemberRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ROLES: MemberRole[] = ["driver", "passenger", "both"];
const isDriverRole = (r: MemberRole) => r === "driver" || r === "both";

async function emailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email) map.set(u.id, u.email);
    }
  } catch (err) {
    console.error("failed to load member emails", err);
  }
  return map;
}

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const auth = await requireGroupMember(supabase, group.groupId);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("members")
    .select("user_id, role, created_at")
    .eq("group_id", group.groupId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emails = await emailMap();
  const members = ((data ?? []) as Array<{ user_id: string; role: MemberRole }>).map(
    (m) => ({
      userId: m.user_id,
      role: m.role,
      email: emails.get(m.user_id) ?? null,
    })
  );
  return NextResponse.json({
    members,
    selfUserId: auth.userId,
    callerRole: auth.role,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const body = (await req.json()) as { email?: string; role?: MemberRole };
  if (!body.email?.trim())
    return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!body.role || !ROLES.includes(body.role))
    return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const { error } = await supabase.rpc("link_member_by_email", {
    p_group_id: group.groupId,
    p_email: body.email.trim().toLowerCase(),
    p_role: body.role,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const body = (await req.json()) as { userId?: string; role?: MemberRole };
  if (!body.userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  if (!body.role || !ROLES.includes(body.role))
    return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const { data: all } = await supabase
    .from("members")
    .select("user_id, role")
    .eq("group_id", group.groupId);
  const members = (all ?? []) as Array<{ user_id: string; role: MemberRole }>;
  const target = members.find((m) => m.user_id === body.userId);
  if (!target)
    return NextResponse.json({ error: "member not found" }, { status: 404 });

  const driverCount = members.filter((m) => isDriverRole(m.role)).length;
  if (isDriverRole(target.role) && !isDriverRole(body.role) && driverCount <= 1)
    return NextResponse.json(
      { error: "Can't demote the last driver. Add another driver first." },
      { status: 409 }
    );

  const { error } = await supabase
    .from("members")
    .update({ role: body.role })
    .eq("group_id", group.groupId)
    .eq("user_id", body.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const { data: all } = await supabase
    .from("members")
    .select("user_id, role")
    .eq("group_id", group.groupId);
  const members = (all ?? []) as Array<{ user_id: string; role: MemberRole }>;
  const target = members.find((m) => m.user_id === userId);
  if (!target)
    return NextResponse.json({ error: "member not found" }, { status: 404 });

  const driverCount = members.filter((m) => isDriverRole(m.role)).length;
  if (isDriverRole(target.role) && driverCount <= 1)
    return NextResponse.json(
      { error: "Can't remove the last driver. Add another driver first." },
      { status: 409 }
    );

  const { error } = await supabase
    .from("members")
    .delete()
    .eq("group_id", group.groupId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
