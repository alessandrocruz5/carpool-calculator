import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbSettings, toDbSettingsPatch } from "@/lib/supabase/mappers";
import type { DbSettings } from "@/lib/supabase/types";
import type { CalcSettings } from "@/lib/calc";
import { assertDriver } from "@/lib/auth/driverKey";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json(null);
  return NextResponse.json(fromDbSettings(data as DbSettings));
}

export async function PATCH(req: Request) {
  const denied = assertDriver(req);
  if (denied) return denied;
  const body = (await req.json()) as Partial<CalcSettings>;
  const supabase = await createClient();
  const patch = { ...toDbSettingsPatch(body), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("settings")
    .update(patch)
    .eq("id", 1)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbSettings(data as DbSettings));
}
