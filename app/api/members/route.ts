import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Fetch emails for ALL members (not just the current user) so the list can
  // show a human-readable label instead of a raw UUID. auth.users is not
  // queryable with the user-scoped client, so use the admin client and look
  // up each member by id. The current user's email is already known.
  const emailMap = new Map<string, string | null>();
  if (currentUserId) emailMap.set(currentUserId, user?.email ?? null);
  const missingEmailIds = userIds.filter((id) => !emailMap.has(id));
  if (missingEmailIds.length > 0) {
    try {
      const admin = createAdminClient();
      const lookups = await Promise.all(
        missingEmailIds.map((id) => admin.auth.admin.getUserById(id))
      );
      missingEmailIds.forEach((id, i) => {
        emailMap.set(id, lookups[i].data?.user?.email ?? null);
      });
    } catch {
      // If the admin client isn't configured, fall back to ids gracefully.
    }
  }

  return NextResponse.json(
    members.map((m) => ({
      // Original fields (keep the store working)
      ...fromDbMember(m),
      // Enriched fields for MembersAdmin
      displayName: profileMap.get(m.user_id) ?? null,
      email: emailMap.get(m.user_id) ?? null,
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

  // link_member_by_email writes a member_invites row only when no auth user
  // exists yet for this email (existing accounts are added straight to
  // members). When that pending invite was created, send Supabase's invite
  // email so the new user can confirm and claim the membership on first
  // sign-in. This MUST run after the RPC: admin.inviteUserByEmail creates the
  // auth user immediately, which would otherwise flip the RPC into the
  // existing-user branch and skip the member_invites -> claim flow.
  const { data: invite } = await supabase
    .from("member_invites")
    .select("email")
    .eq("group_id", groupId)
    .eq("email", email)
    .maybeSingle();
  if (invite) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
    try {
      const admin = createAdminClient();
      const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        { redirectTo: `${siteUrl}/auth/confirm` }
      );
      // A concurrent sign-up can race us into "already registered"; the pending
      // membership stands and is claimed on next sign-in, so don't fail.
      if (inviteErr && !/already.*registered/i.test(inviteErr.message)) {
        return NextResponse.json({ error: inviteErr.message }, { status: 500 });
      }
    } catch {
      // Admin client not configured (no service-role key) — the invite row
      // still exists, so degrade cleanly instead of failing the request.
    }
  }
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
    // Prefer the account name, then the email local-part, then a short id —
    // matching link_member_by_email so a roster label never degrades to a raw
    // UUID when an email is known.
    let name =
      (profileRow as { display_name?: string | null } | null)?.display_name?.trim() ||
      "";
    if (!name) {
      let email: string | null = null;
      try {
        const admin = createAdminClient();
        const { data: lookup } = await admin.auth.admin.getUserById(body.userId);
        email = lookup?.user?.email ?? null;
      } catch {
        // admin client not configured — fall through to the short id.
      }
      name = email ? email.split("@")[0] : body.userId.slice(0, 8);
    }
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
