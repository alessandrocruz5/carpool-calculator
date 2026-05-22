import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbProfile } from "@/lib/supabase/mappers";
import type { DbProfile } from "@/lib/supabase/types";
import { requireAuth } from "@/lib/auth/requireDriver";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json(null);
  return NextResponse.json(fromDbProfile(data as DbProfile));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;
  const body = (await req.json()) as {
    displayName?: string;
    avatarUrl?: string;
  };
  const patch: Partial<DbProfile> = { updated_at: new Date().toISOString() };
  if (body.displayName !== undefined)
    patch.display_name = body.displayName.trim();
  if (body.avatarUrl !== undefined)
    patch.avatar_url = body.avatarUrl.trim() || null;
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", auth.userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbProfile(data as DbProfile));
}
