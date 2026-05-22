import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireUser,
  requireGroupDriver,
  requireGroupMember,
} from "@/lib/auth/requireDriver";
import { getActiveGroupId, setActiveGroupCookie, GROUP_COOKIE } from "@/lib/group";

export const dynamic = "force-dynamic";

interface MemberWithGroup {
  role: "driver" | "passenger" | "both";
  groups: { id: string; name: string; owner_user_id: string } | null;
}

export async function GET() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const { data, error } = await supabase
    .from("members")
    .select("role, groups(id, name, owner_user_id)")
    .eq("user_id", user.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const groups = ((data ?? []) as unknown as MemberWithGroup[])
    .filter((r) => r.groups)
    .map((r) => ({
      id: r.groups!.id,
      name: r.groups!.name,
      ownerUserId: r.groups!.owner_user_id,
      role: r.role,
    }));
  let activeGroupId: string | null = null;
  try {
    activeGroupId = await getActiveGroupId(supabase);
  } catch {
    activeGroupId = null;
  }
  return NextResponse.json({ groups, activeGroupId, selfUserId: user.userId });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const body = (await req.json()) as { name?: string };
  if (!body.name?.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });
  const { data, error } = await supabase.rpc("create_group", {
    p_name: body.name.trim(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const groupId = data as string;
  const res = NextResponse.json({ id: groupId, name: body.name.trim() });
  setActiveGroupCookie(res, groupId);
  return res;
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const body = (await req.json()) as { id?: string; name?: string };
  if (!body.id || !body.name?.trim())
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  // Rename is allowed for any driver of the group.
  const denied = await requireGroupDriver(supabase, body.id);
  if (!denied.ok) return denied.response;
  const admin = createAdminClient();
  const { error } = await admin
    .from("groups")
    .update({ name: body.name.trim() })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Child tables to purge before deleting a group. Ordered so foreign keys
// are satisfied (children before parents).
const GROUP_CHILD_TABLES = [
  "trip_payments",
  "trip_leg_riders",
  "trip_legs",
  "trips",
  "fillups",
  "gas_prices",
  "passengers",
  "settings",
  "member_invites",
  "members",
];

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: group } = await supabase
    .from("groups")
    .select("owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!group)
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  if ((group as { owner_user_id: string }).owner_user_id !== user.userId)
    return NextResponse.json(
      { error: "only the owner can delete this group" },
      { status: 403 }
    );

  const admin = createAdminClient();
  for (const table of GROUP_CHILD_TABLES) {
    const { error } = await admin.from(table).delete().eq("group_id", id);
    if (error)
      return NextResponse.json(
        { error: `${table}: ${error.message}` },
        { status: 500 }
      );
  }
  const { error: gErr } = await admin.from("groups").delete().eq("id", id);
  if (gErr)
    return NextResponse.json({ error: gErr.message }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  // Point the active-group cookie at a remaining membership, if any.
  const { data: remaining } = await supabase
    .from("members")
    .select("group_id")
    .eq("user_id", user.userId)
    .limit(1)
    .maybeSingle();
  const next = (remaining as { group_id: string } | null)?.group_id;
  if (next) setActiveGroupCookie(res, next);
  else res.cookies.delete(GROUP_COOKIE);
  return res;
}

// Switch the caller's active group.
export async function PUT(req: Request) {
  const supabase = await createClient();
  const body = (await req.json()) as { id?: string };
  if (!body.id)
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  const denied = await requireGroupMember(supabase, body.id);
  if (!denied.ok) return denied.response;
  const res = NextResponse.json({ ok: true });
  setActiveGroupCookie(res, body.id);
  return res;
}
