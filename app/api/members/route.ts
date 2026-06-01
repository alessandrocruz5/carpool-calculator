import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbMember } from "@/lib/supabase/mappers";
import type { DbMember } from "@/lib/supabase/types";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { getActiveGroupId, requireActiveGroupId } from "@/lib/group";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Role = "driver" | "passenger" | "both";

export async function GET() {
  const supabase = await createClient();
  let groupId: string;
  try {
    groupId = await getActiveGroupId(supabase);
  } catch {
    return NextResponse.json([]);
  }

  // Identify current user to mark isSelf and expose their email
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = (data ?? []) as DbMember[];

  // Fetch display names from profiles for all members
  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = userIds.length > 0
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map(
    ((profiles ?? []) as { user_id: string; display_name: string | null }[]).map(
      (p) => [p.user_id, p.display_name]
    )
  );

  return NextResponse.json(
    members.map((m) => ({
      // Original fields (keep the store working)
      ...fromDbMember(m),
      // Enriched fields for MembersAdmin
      displayName: profileMap.get(m.user_id) ?? null,
      email: m.user_id === currentUserId ? (user?.email ?? null) : null,
      isSelf: m.user_id === currentUserId,
    }))
  );
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const groupCheck = await requireActiveGroupId(supabase);
  if (!groupCheck.ok) return groupCheck.response;
  const groupId = groupCheck.groupId;
  const auth = await requireGroupDriver(supabase, groupId);
  if (!auth.ok) return auth.response;
  const limited = await enforceRateLimit(
    "members:invite",
    getIdentifier(req, auth.userId),
    { requests: 5, window: "1 m" }
  );
  if (limited) return limited;
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
  const groupCheck = await requireActiveGroupId(supabase);
  if (!groupCheck.ok) return groupCheck.response;
  const groupId = groupCheck.groupId;
  const auth = await requireGroupDriver(supabase, groupId);
  if (!auth.ok) return auth.response;
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
  const updated = data as DbMember;

  // When role changes to a passenger-capable role, ensure a passenger record
  // exists so the member appears in the trip roster on the Today page.
  if ((body.role === "passenger" || body.role === "both") && !updated.passenger_id) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", body.userId)
      .maybeSingle();
    const name =
      (profileRow as { display_name?: string | null } | null)?.display_name?.trim() ||
      body.userId.slice(0, 8);
    const { data: passenger, error: pErr } = await supabase
      .from("passengers")
      .insert({ group_id: groupId, name, active: true })
      .select()
      .single();
    if (!pErr && passenger) {
      const passengerId = (passenger as { id: string }).id;
      await supabase
        .from("members")
        .update({ passenger_id: passengerId })
        .eq("group_id", groupId)
        .eq("user_id", body.userId);
      updated.passenger_id = passengerId;
    }
  }

  // Deactivate passenger when downgrading to driver-only
  if (body.role === "driver" && updated.passenger_id) {
    await supabase
      .from("passengers")
      .update({ active: false })
      .eq("id", updated.passenger_id)
      .eq("group_id", groupId);
  }

  return NextResponse.json(fromDbMember(updated));
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const groupCheck = await requireActiveGroupId(supabase);
  if (!groupCheck.ok) return groupCheck.response;
  const groupId = groupCheck.groupId;
  const auth = await requireGroupDriver(supabase, groupId);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });

  const { data: targetRow, error } = await supabase
    .from("members")
    .select("role, passenger_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isDriverRole = (r: Role) => r === "driver" || r === "both";
  if (targetRow && isDriverRole(targetRow.role)) {
    const { data: driverRows } = await supabase
      .from("members")
      .select("user_id")
      .eq("group_id", groupId)
      .or("role.eq.driver,role.eq.both");
    if ((driverRows ?? []).length <= 1) {
      return NextResponse.json(
        { error: "Can't remove the last driver. Link another driver first." },
        { status: 400 }
      );
    }
  }

  const { error: delErr } = await supabase
    .from("members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (targetRow?.passenger_id) {
    await supabase
      .from("passengers")
      .update({ active: false })
      .eq("id", targetRow.passenger_id)
      .eq("group_id", groupId);
  }

  return NextResponse.json({ ok: true });
}
