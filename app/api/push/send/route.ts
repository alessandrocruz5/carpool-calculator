import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebPush } from "@/lib/push";

export const dynamic = "force-dynamic";

const STALE_MS = 6 * 24 * 60 * 60 * 1000;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  // Vercel cron also supports x-cron-secret as a fallback convention.
  if (req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS bypass required: cron job has no user session; must fan-out across all
  // groups to read gas_prices, enumerate every driver in members, fetch all
  // matching push_subscriptions, and prune expired endpoints — operations that
  // span multiple users/groups and cannot be scoped to a single JWT.
  const admin = createAdminClient();

  const { data: latest, error: gpErr } = await admin
    .from("gas_prices")
    .select("updated_at, created_at, effective_date")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (gpErr) {
    return NextResponse.json({ error: gpErr.message }, { status: 500 });
  }

  const updatedAt = latest
    ? new Date(latest.updated_at ?? latest.created_at ?? latest.effective_date)
    : null;
  const ageMs = updatedAt ? Date.now() - updatedAt.getTime() : Infinity;
  if (ageMs <= STALE_MS) {
    return NextResponse.json({ ok: true, stale: false, ageMs });
  }

  const { data: drivers, error: drvErr } = await admin
    .from("members")
    .select("user_id")
    .eq("role", "driver");
  if (drvErr) {
    return NextResponse.json({ error: drvErr.message }, { status: 500 });
  }
  const driverIds = (drivers ?? []).map((d) => d.user_id);
  if (driverIds.length === 0) {
    return NextResponse.json({ ok: true, stale: true, sent: 0 });
  }

  const { data: subs, error: subErr } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", driverIds);
  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  const webpush = getWebPush();
  const payload = JSON.stringify({
    title: "Gas price update needed",
    body: "The latest gas price is over 6 days old. Tap to update.",
    url: "/gas",
    tag: "gas-stale",
  });

  let sent = 0;
  const expired: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.endpoint);
      }
    })
  );

  if (expired.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", expired);
  }

  return NextResponse.json({
    ok: true,
    stale: true,
    ageMs,
    sent,
    pruned: expired.length,
  });
}

export const POST = handle;
// Vercel cron invokes the route with GET; reuse the same handler.
export const GET = handle;
