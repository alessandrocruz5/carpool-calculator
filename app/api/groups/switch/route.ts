import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/requireDriver";
import { ACTIVE_GROUP_COOKIE } from "@/lib/auth/activeGroup";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(req: Request) {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit(
    "groups:switch",
    getIdentifier(req, auth.userId),
    { requests: 20, window: "1 m" }
  );
  if (limited) return limited;

  const body = (await req.json()) as { groupId: string };
  if (!body.groupId)
    return NextResponse.json({ error: "missing groupId" }, { status: 400 });

  const { data, error } = await supabase
    .from("members")
    .select("user_id")
    .eq("group_id", body.groupId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "not a member" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_GROUP_COOKIE, body.groupId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return res;
}
