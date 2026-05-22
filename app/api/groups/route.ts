import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/requireDriver";
import { getActiveGroupId, setActiveGroupCookie } from "@/lib/group";
import type { MemberRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface GroupRow {
  group_id: string;
  role: MemberRole;
  groups: { id: string; name: string; owner_user_id: string } | null;
}

export async function GET() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;

  const { data, error } = await supabase
    .from("members")
    .select("group_id, role, groups(id, name, owner_user_id)")
    .eq("user_id", user.userId)
    .order("created_at", { ascending: true });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  let activeId: string | null = null;
  try {
    activeId = await getActiveGroupId(supabase);
  } catch {
    activeId = null;
  }

  const groups = ((data ?? []) as unknown as GroupRow[])
    .filter((r) => r.groups)
    .map((r) => ({
      id: r.group_id,
      name: r.groups!.name,
      role: r.role,
      isOwner: r.groups!.owner_user_id === user.userId,
      isActive: r.group_id === activeId,
    }));

  return NextResponse.json({ groups, activeId });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;

  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name)
    return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase.rpc("create_group", { p_name: name });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  const groupId = data as string;
  const res = NextResponse.json({ id: groupId, name });
  setActiveGroupCookie(res, groupId);
  return res;
}

/** Switch the caller's active group. */
export async function PUT(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;

  const body = (await req.json()) as { id?: string };
  if (!body.id)
    return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data } = await supabase
    .from("members")
    .select("group_id")
    .eq("user_id", user.userId)
    .eq("group_id", body.id)
    .maybeSingle();
  if (!data)
    return NextResponse.json({ error: "not a member" }, { status: 403 });

  const res = NextResponse.json({ ok: true, activeId: body.id });
  setActiveGroupCookie(res, body.id);
  return res;
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;

  const body = (await req.json()) as { id?: string; name?: string };
  if (!body.id)
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  const name = body.name?.trim();
  if (!name)
    return NextResponse.json({ error: "name required" }, { status: 400 });

  const { error } = await supabase.rpc("rename_group", {
    p_group_id: body.id,
    p_name: name,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: group } = await supabase
    .from("groups")
    .select("owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!group)
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  if ((group as { owner_user_id: string }).owner_user_id !== user.userId)
    return NextResponse.json(
      { error: "only the group owner can delete this group" },
      { status: 403 }
    );

  // RLS for invites/settings deletes requires driver membership, so clear
  // them before the members rows (which would revoke that membership).
  await supabase.from("member_invites").delete().eq("group_id", id);
  await supabase.from("settings").delete().eq("group_id", id);
  await supabase.from("members").delete().eq("group_id", id);
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error)
    return NextResponse.json(
      { error: `${error.message} (delete trips and other data first)` },
      { status: 400 }
    );
  return NextResponse.json({ ok: true });
}
