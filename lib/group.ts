import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestUserId } from "@/lib/auth/claims";

export const GROUP_COOKIE = "carpool-group";

/**
 * Resolve the caller's active group. Prefers the `carpool-group` cookie when
 * it points at a group the caller belongs to; otherwise falls back to the
 * caller's only/first membership. Throws when unauthenticated or group-less.
 */
export async function getActiveGroupId(
  supabase: SupabaseClient
): Promise<string> {
  const userId = await getRequestUserId(supabase);
  if (!userId) throw new Error("not authenticated");

  const cookieStore = await cookies();
  const cookieGroupId = cookieStore.get(GROUP_COOKIE)?.value;

  if (cookieGroupId) {
    const { data } = await supabase
      .from("members")
      .select("group_id")
      .eq("user_id", userId)
      .eq("group_id", cookieGroupId)
      .maybeSingle();
    if (data?.group_id) return data.group_id as string;
  }

  const { data } = await supabase
    .from("members")
    .select("group_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.group_id) throw new Error("no group membership");
  return data.group_id as string;
}

export type ActiveGroupCheck =
  | { ok: true; groupId: string }
  | { ok: false; response: NextResponse };

/** Route-handler helper: resolve the active group or yield a 401 response. */
export async function requireActiveGroupId(
  supabase: SupabaseClient
): Promise<ActiveGroupCheck> {
  try {
    return { ok: true, groupId: await getActiveGroupId(supabase) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
}

export function setActiveGroupCookie(res: NextResponse, groupId: string): void {
  res.cookies.set(GROUP_COOKIE, groupId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
