import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/requireDriver";
import { fromDbProfile, toDbProfilePatch } from "@/lib/supabase/mappers";
import type { DbProfile } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({
      userId: user.userId,
      displayName: null,
      avatarUrl: null,
    });
  return NextResponse.json(fromDbProfile(data as DbProfile));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const body = (await req.json()) as {
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  const patch = toDbProfilePatch({
    ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
    ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
  });
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", user.userId)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data) return NextResponse.json(fromDbProfile(data as DbProfile));

  // Profile row missing (rare — normally created by signup trigger).
  const { data: inserted, error: insErr } = await supabase
    .from("profiles")
    .insert({ user_id: user.userId, ...patch })
    .select()
    .single();
  if (insErr)
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json(fromDbProfile(inserted as DbProfile));
}
