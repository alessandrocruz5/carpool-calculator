import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole } from "@/lib/supabase/types";

export type GroupAuthCheck =
  | { ok: true; userId: string; role: MemberRole }
  | { ok: false; response: NextResponse };

export type SimpleAuth =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Authentication-only guard: confirms a signed-in user without requiring an
 * existing membership row. Used by routes a brand-new user must reach before
 * they belong to any group (e.g. creating their first group, own profile).
 */
export async function requireAuth(supabase: SupabaseClient): Promise<SimpleAuth> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string } | undefined;
  if (!claims?.sub) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: claims.sub };
}

export async function requireUser(supabase: SupabaseClient): Promise<AuthCheck> {
  const { data } = await supabase.auth.getClaims();
  return (data?.claims as { sub?: string } | undefined)?.sub ?? null;
}

function unauthorized(): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  };
}

export async function requireUser(supabase: SupabaseClient): Promise<UserCheck> {
  const userId = await getUserId(supabase);
  if (!userId) return unauthorized();
  return { ok: true, userId };
}

/** Require that the caller is a member of `groupId`. */
export async function requireGroupMember(
  supabase: SupabaseClient,
  groupId: string
): Promise<GroupAuthCheck> {
  const userId = await getUserId(supabase);
  if (!userId) return unauthorized();

  const { data } = await supabase
    .from("members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not a member" }, { status: 403 }),
    };
  }
  return { ok: true, userId, role: data.role as MemberRole };
}

/** Require that the caller is a driver (role `driver` or `both`) of `groupId`. */
export async function requireGroupDriver(
  supabase: SupabaseClient,
  groupId: string
): Promise<GroupAuthCheck> {
  const r = await requireGroupMember(supabase, groupId);
  if (!r.ok) return r;
  if (r.role !== "driver" && r.role !== "both") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return r;
}
