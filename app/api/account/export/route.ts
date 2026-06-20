import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/requireDriver";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function hashEmail(email: string): string {
  return (
    "sha256:" +
    createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16)
  );
}

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "user";
}

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const limited = await enforceRateLimit(
    "account:export",
    `user:${userId}`,
    { requests: 5, window: "1 h" }
  );
  if (limited) return limited;

  const admin = createAdminClient();

  // Batch 1: all queries that only need userId (fully independent).
  const [
    { data: userInfo },
    { data: profile },
    { data: members },
    { data: cars },
    { data: fillups },
    { data: tripsDriven },
  ] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("members").select("*").eq("user_id", userId),
    admin.from("cars").select("*").eq("owner_user_id", userId),
    admin.from("fillups").select("*").eq("owner_user_id", userId),
    admin.from("trips").select("*").eq("driver_user_id", userId),
  ]);

  const callerEmail = userInfo?.user?.email ?? null;
  const drivenTripIds = (tripsDriven ?? []).map((t) => t.id);
  const groupIds = Array.from(new Set((members ?? []).map((m) => m.group_id)));
  const passengerIds = Array.from(
    new Set(
      (members ?? [])
        .map((m) => m.passenger_id)
        .filter((p): p is string => typeof p === "string")
    )
  );

  // Batch 2: queries that depend on ids derived from batch 1 (all independent
  // of each other, so run together).
  const [
    { data: drivenLegs },
    { data: ridersForUser },
    { data: paymentsAsRider },
    { data: paymentsAsDriver },
    { data: groups },
  ] = await Promise.all([
    drivenTripIds.length > 0
      ? admin.from("trip_legs").select("*").in("trip_id", drivenTripIds)
      : Promise.resolve({ data: [] as unknown[] }),
    passengerIds.length > 0
      ? admin.from("trip_leg_riders").select("*").in("passenger_id", passengerIds)
      : Promise.resolve({ data: [] as unknown[] }),
    passengerIds.length > 0
      ? admin.from("trip_payments").select("*").in("passenger_id", passengerIds)
      : Promise.resolve({ data: [] as unknown[] }),
    drivenTripIds.length > 0
      ? admin.from("trip_payments").select("*").in("trip_id", drivenTripIds)
      : Promise.resolve({ data: [] as unknown[] }),
    groupIds.length > 0
      ? admin.from("groups").select("id, name, owner_user_id, created_at").in("id", groupIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // De-duplicate payments by composite key (trip_id, passenger_id).
  const paymentKey = (p: { trip_id: string; passenger_id: string }) =>
    `${p.trip_id}::${p.passenger_id}`;
  const paymentMap = new Map<string, unknown>();
  for (const p of (paymentsAsRider ?? []) as Array<{
    trip_id: string;
    passenger_id: string;
  }>) {
    paymentMap.set(paymentKey(p), p);
  }
  for (const p of (paymentsAsDriver ?? []) as Array<{
    trip_id: string;
    passenger_id: string;
  }>) {
    paymentMap.set(paymentKey(p), p);
  }
  const payments = Array.from(paymentMap.values());

  const exportedAt = new Date().toISOString();
  const payload = {
    schema_version: 1,
    exported_at: exportedAt,
    user: {
      id: userId,
      email: callerEmail,
    },
    note:
      "Other users' personal data (e.g. emails of co-riders) has been redacted or hashed.",
    profile: profile ?? null,
    groups: groups ?? [],
    members: members ?? [],
    cars: cars ?? [],
    fillups: fillups ?? [],
    trips_driven: tripsDriven ?? [],
    trip_legs: drivenLegs ?? [],
    trip_legs_ridden: ridersForUser ?? [],
    payments,
    _redacted: {
      example_email_hash: callerEmail ? hashEmail(callerEmail) : null,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const filenameEmail = sanitizeFilenamePart(callerEmail ?? userId);
  const filenameDate = exportedAt.slice(0, 10);
  const filename = `carpool-data-${filenameEmail}-${filenameDate}.json`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(json));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
