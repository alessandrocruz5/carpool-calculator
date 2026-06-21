import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbSettings, toDbSettingsPatch } from "@/lib/supabase/mappers";
import type { DbSettings } from "@/lib/supabase/types";
import type { CalcSettings } from "@/lib/calc";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("group_id", group.groupId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json(null);
  return NextResponse.json(fromDbSettings(data as DbSettings));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;

  const limited = await enforceRateLimit(
    "settings:write",
    getIdentifier(req, denied.userId),
    { requests: 20, window: "1 m" }
  );
  if (limited) return limited;

  const body = (await req.json()) as Partial<CalcSettings>;
  const patch = { ...toDbSettingsPatch(body), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("settings")
    .update(patch)
    .eq("group_id", group.groupId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbSettings(data as DbSettings));
}
