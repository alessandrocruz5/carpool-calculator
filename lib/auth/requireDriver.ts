import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthCheck =
  | { ok: true; userId: string; isDriver: boolean }
  | { ok: false; response: NextResponse };

export async function requireUser(supabase: SupabaseClient): Promise<AuthCheck> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string } | undefined;
  if (!claims?.sub) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const { data: m } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (!m) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not a member" }, { status: 403 }),
    };
  }
  return { ok: true, userId: claims.sub, isDriver: m.role === "driver" };
}

export async function requireDriver(
  supabase: SupabaseClient
): Promise<NextResponse | null> {
  const r = await requireUser(supabase);
  if (!r.ok) return r.response;
  if (!r.isDriver) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
