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
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  const patch: Partial<DbProfile> = {
    user_id: auth.userId,
    updated_at: new Date().toISOString(),
  };
  if (body.displayName !== undefined)
    patch.display_name = body.displayName.trim();
  if (body.firstName !== undefined)
    patch.first_name = body.firstName.trim() || null;
  if (body.lastName !== undefined)
    patch.last_name = body.lastName.trim() || null;
  if (body.avatarUrl !== undefined)
    patch.avatar_url = body.avatarUrl.trim() || null;
  // Compose the canonical "First Last" display_name from the structured names so
  // every existing display_name consumer keeps working unchanged.
  if (body.firstName !== undefined || body.lastName !== undefined) {
    const composed = [patch.first_name, patch.last_name]
      .filter((x): x is string => !!x)
      .join(" ");
    patch.display_name = composed || null;
  }
  // Upsert on user_id so a signed-in user with no profile row yet (e.g. the
  // trigger-created row never landed) self-heals instead of 500ing on a no-op
  // UPDATE. The `profiles_insert_own` RLS policy (SABAY-20) guards the INSERT path.
  const { data, error } = await supabase
    .from("profiles")
    .upsert(patch, { onConflict: "user_id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbProfile(data as DbProfile));
}
