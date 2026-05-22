import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import type { MemberRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ROLES: MemberRole[] = ["driver", "passenger", "both"];

function isDriverRole(role: string): boolean {
  return role === "driver" || role === "both";
}

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const { data: members, error } = await supabase
    .from("members")
    .select("user_id, role, created_at")
    .eq("group_id", group.groupId)
    .order("created_at", { ascending: true });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (members ?? []) as Array<{
    user_id: string;
    role: MemberRole;
    created_at: string;
  }>;

  const emailById = new Map<string, string>();
  const nameById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: usersData } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    for (const u of usersData?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, display_name")
      .in(
        "user_id",
        rows.map((r) => r.user_id)
      );
    for (const p of (profiles ?? []) as Array<{
      user_id: string;
      display_name: string | null;
    }>) {
      if (p.display_name) nameById.set(p.user_id, p.display_name);
    }
  } catch (err) {
    console.error("failed to load member identities", err);
  }

  return NextResponse.json(
    rows.map((m) => ({
      userId: m.user_id,
      role: m.role,
      email: emailById.get(m.user_id) ?? null,
      displayName: nameById.get(m.user_id) ?? null,
      isSelf: m.user_id === denied.userId,
    }))
  );
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const body = (await req.json()) as { email?: string; role?: string };
  const email = body.email?.trim();
  const role = body.role;
  if (!email)
    return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!role || !ROLES.includes(role as MemberRole))
    return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const { error } = await supabase.rpc("link_member_by_email", {
    p_group_id: group.groupId,
    p_email: email,
    p_role: role,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const body = (await req.json()) as { userId?: string; role?: string };
  if (!body.userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });
  if (!body.role || !ROLES.includes(body.role as MemberRole))
    return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const { data: rows } = await supabase
    .from("members")
    .select("user_id, role")
    .eq("group_id", group.groupId);
  const members = (rows ?? []) as Array<{ user_id: string; role: string }>;
  const target = members.find((m) => m.user_id === body.userId);
  if (!target)
    return NextResponse.json({ error: "member not found" }, { status: 404 });

  const driverCount = members.filter((m) => isDriverRole(m.role)).length;
  if (
    isDriverRole(target.role) &&
    !isDriverRole(body.role) &&
    driverCount <= 1
  ) {
    return NextResponse.json(
      { error: "Can't demote the last driver. Add another driver first." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("members")
    .update({ role: body.role })
    .eq("group_id", group.groupId)
    .eq("user_id", body.userId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { data: rows } = await supabase
    .from("members")
    .select("user_id, role")
    .eq("group_id", group.groupId);
  const members = (rows ?? []) as Array<{ user_id: string; role: string }>;
  const target = members.find((m) => m.user_id === userId);
  if (!target)
    return NextResponse.json({ error: "member not found" }, { status: 404 });

  const driverCount = members.filter((m) => isDriverRole(m.role)).length;
  if (isDriverRole(target.role) && driverCount <= 1) {
    return NextResponse.json(
      { error: "Can't remove the last driver. Add another driver first." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("members")
    .delete()
    .eq("group_id", group.groupId)
    .eq("user_id", userId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
