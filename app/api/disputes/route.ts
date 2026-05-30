import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";
import { getWebPush } from "@/lib/push";
import type { DbTripDispute } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;

  const { data, error } = await supabase
    .from("trip_disputes")
    .select(
      "id, group_id, trip_id, reporter_user_id, reason, status, resolution_note, created_at, resolved_at, resolved_by"
    )
    .eq("group_id", group.groupId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []) as DbTripDispute[]);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth.response;
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;

  const limited = await enforceRateLimit(
    "disputes:create",
    getIdentifier(req, auth.userId),
    { requests: 10, window: "1 m" }
  );
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    tripId?: string;
    reason?: string;
  };
  const tripId = body.tripId;
  const reason = (body.reason ?? "").trim();
  if (!tripId || !reason) {
    return NextResponse.json(
      { error: "tripId and reason are required" },
      { status: 400 }
    );
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: "reason too long" }, { status: 400 });
  }

  // Trip must belong to the active group; RLS would block otherwise, but
  // surface a clear 404 instead of a generic insert failure.
  const { data: trip } = await supabase
    .from("trips")
    .select("id, date, driver_user_id")
    .eq("id", tripId)
    .eq("group_id", group.groupId)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "trip not found" }, { status: 404 });
  }

  const { data: inserted, error } = await supabase
    .from("trip_disputes")
    .insert({
      group_id: group.groupId,
      trip_id: tripId,
      reporter_user_id: auth.userId,
      reason,
    })
    .select(
      "id, group_id, trip_id, reporter_user_id, reason, status, resolution_note, created_at, resolved_at, resolved_by"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await notifyDrivers(group.groupId, trip.date as string).catch((err) => {
    console.error("dispute push notify failed", err);
  });

  return NextResponse.json(inserted as DbTripDispute);
}

async function notifyDrivers(groupId: string, tripDate: string) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const admin = createAdminClient();
  const { data: drivers } = await admin
    .from("members")
    .select("user_id")
    .eq("group_id", groupId)
    .in("role", ["driver", "both"]);
  const ids = (drivers ?? []).map((d) => d.user_id as string);
  if (ids.length === 0) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", ids);
  if (!subs || subs.length === 0) return;

  const webpush = getWebPush();
  const payload = JSON.stringify({
    title: "Trip dispute opened",
    body: `A passenger reported an issue with the trip on ${tripDate}.`,
    url: "/admin#disputes",
    tag: `dispute-${tripDate}`,
  });

  const expired: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          payload
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.endpoint as string);
      }
    })
  );
  if (expired.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", expired);
  }
}
