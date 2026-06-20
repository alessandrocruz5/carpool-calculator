import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const driver = await requireGroupDriver(supabase, group.groupId);
  if (!driver.ok) return driver.response;

  const limited = await enforceRateLimit(
    "admin:archive-trips",
    getIdentifier(req, driver.userId),
    { requests: 5, window: "1 m" }
  );
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { olderThanDays?: number };
  const days = Number(body.olderThanDays);
  if (!Number.isInteger(days) || days < 1) {
    return NextResponse.json({ error: "olderThanDays must be >= 1" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("archive_old_trips", {
    p_group_id: group.groupId,
    p_older_than_days: days,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ archived: data ?? 0 });
}
