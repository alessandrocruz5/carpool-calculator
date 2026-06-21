import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireGroupMember } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import { enforceRateLimit, getIdentifier } from "@/lib/rate-limit";
import { sendPushToUsers } from "@/lib/push";
import type { DbTripPayment } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** A claim counts as active only within this window of being made. */
const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Derive whether a payment's claim is currently pending driver confirmation. */
function isClaimActive(
  claimedAt: string | null,
  paid: boolean,
  cutoffMs: number
): boolean {
  return !paid && claimedAt != null && new Date(claimedAt).getTime() > cutoffMs;
}

interface PaymentWithDate extends DbTripPayment {
  trips?: { date: string } | null;
}

interface PassengerJoin {
  passenger_id: string;
  amount_php: number | string;
  passengers?: { name: string } | null;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const { searchParams } = new URL(req.url);
  const summary = searchParams.get("summary");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const passengerId = searchParams.get("passengerId");
  const paid = searchParams.get("paid");

  if (summary === "1") {
    const { data, error } = await supabase
      .from("trip_payments")
      .select("passenger_id, amount_php, passengers!inner(name)")
      .eq("group_id", group.groupId)
      .eq("paid", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as unknown as PassengerJoin[];
    const agg = new Map<
      string,
      { passenger_id: string; name: string; unpaid_total_php: number; unpaid_count: number }
    >();
    for (const r of rows) {
      const cur = agg.get(r.passenger_id) ?? {
        passenger_id: r.passenger_id,
        name: r.passengers?.name ?? r.passenger_id,
        unpaid_total_php: 0,
        unpaid_count: 0,
      };
      cur.unpaid_total_php += Number(r.amount_php);
      cur.unpaid_count += 1;
      agg.set(r.passenger_id, cur);
    }
    const out = Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(out);
  }

  const cutoffMs = Date.now() - CLAIM_WINDOW_MS;

  let q = supabase
    .from("trip_payments")
    .select(
      "trip_id, passenger_id, amount_php, paid, paid_at, claimed_at, trips!inner(date, archived_at)"
    )
    .eq("group_id", group.groupId)
    .is("trips.archived_at", null);

  if (passengerId) q = q.eq("passenger_id", passengerId);
  if (paid === "true") q = q.eq("paid", true);
  if (paid === "false") q = q.eq("paid", false);
  if (from) q = q.gte("trips.date", from);
  if (to) q = q.lte("trips.date", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as unknown as PaymentWithDate[]).map((r) => ({
    tripId: r.trip_id,
    passengerId: r.passenger_id,
    amountPhp: Number(r.amount_php),
    paid: r.paid,
    paidAt: r.paid_at,
    claimedAt: r.claimed_at,
    claimActive: isClaimActive(r.claimed_at, r.paid, cutoffMs),
    date: r.trips?.date ?? null,
  }));

  // Lazy expiry sweep, only when this view actually surfaced an expired,
  // still-unconfirmed claim — so an ordinary read (or one filtered to paid
  // rows / a date range) never issues a privileged write. A claim unconfirmed
  // for >24h reads as unclaimed and the passenger must re-mark, but the
  // SABAY-33 column-guard trigger forbids a passenger overwriting an existing
  // claimed_at, so expired claims must be reset to null server-side first.
  // Best-effort housekeeping: never block the read.
  if (rows.some((r) => r.claimedAt != null && !r.paid && !r.claimActive)) {
    await sweepExpiredClaims(group.groupId, new Date(cutoffMs).toISOString());
  }
  return NextResponse.json(rows);
}

/**
 * Reset expired, still-unconfirmed claims to null for a group. Touches rows
 * across passengers, so it runs on the service-role client (the SABAY-33
 * `trip_payments_pending_claim_idx` partial index backs this query). Swallows
 * all failures — a missing admin config simply leaves the claim derived as
 * inactive (GET already does that) at the cost of not enabling re-marks.
 */
async function sweepExpiredClaims(groupId: string, cutoffIso: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("trip_payments")
      .update({ claimed_at: null })
      .eq("group_id", groupId)
      .eq("paid", false)
      .not("claimed_at", "is", null)
      .lt("claimed_at", cutoffIso);
    if (error) console.error("payments claim sweep failed", error.message);
  } catch (err) {
    console.error("payments claim sweep skipped", err);
  }
}

interface PatchItem {
  tripId: string;
  passengerId: string;
  /** Driver-only: confirm (true) / unconfirm (false) a payment. */
  paid?: boolean;
  /** Passenger-only: record an "I paid" claim on their own payment. */
  claim?: boolean;
}

function mapRow(row: DbTripPayment, cutoffMs: number) {
  return {
    tripId: row.trip_id,
    passengerId: row.passenger_id,
    amountPhp: Number(row.amount_php),
    paid: row.paid,
    paidAt: row.paid_at,
    claimedAt: row.claimed_at,
    claimActive: isClaimActive(row.claimed_at, row.paid, cutoffMs),
  };
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  // Both roles may PATCH; the per-item rules below decide what each may write.
  const member = await requireGroupMember(supabase, group.groupId);
  if (!member.ok) return member.response;
  const isDriver = member.role === "driver" || member.role === "both";

  const limited = await enforceRateLimit(
    "payments:mark",
    getIdentifier(req, member.userId),
    { requests: 30, window: "1 m" }
  );
  if (limited) return limited;

  const body = (await req.json()) as PatchItem | { items: PatchItem[] } | PatchItem[];

  const items: PatchItem[] = Array.isArray(body)
    ? body
    : "items" in body && Array.isArray(body.items)
    ? body.items
    : [body as PatchItem];

  for (const it of items) {
    const isConfirm = typeof it?.paid === "boolean";
    const isClaim = typeof it?.claim === "boolean";
    if (!it || !it.tripId || !it.passengerId || (!isConfirm && !isClaim)) {
      return NextResponse.json(
        { error: "each item requires tripId, passengerId, and paid or claim" },
        { status: 400 }
      );
    }
  }

  // Per-role authorization, enforced in the route ahead of any write:
  //  - confirm (paid): drivers only
  //  - claim: only on a payment the caller's own passenger row owns
  for (const it of items) {
    if (typeof it.paid === "boolean") {
      if (!isDriver) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } else {
      const { data: owns, error } = await supabase.rpc("is_own_passenger", {
        gid: group.groupId,
        pid: it.passengerId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!owns) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
  }

  const cutoffMs = Date.now() - CLAIM_WINDOW_MS;
  const updated: ReturnType<typeof mapRow>[] = [];

  for (const it of items) {
    const patch =
      typeof it.paid === "boolean"
        ? { paid: it.paid, paid_at: it.paid ? new Date().toISOString() : null }
        : { claimed_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from("trip_payments")
      .update(patch)
      .eq("group_id", group.groupId)
      .eq("trip_id", it.tripId)
      .eq("passenger_id", it.passengerId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const mapped = mapRow(data as DbTripPayment, cutoffMs);
    updated.push(mapped);

    // Fire notifications best-effort — never block the write response.
    if (typeof it.paid === "boolean" && it.paid) {
      void notifyConfirmToPassenger(group.groupId, it.passengerId, mapped.amountPhp);
    } else if (typeof it.claim === "boolean" && it.claim) {
      void notifyClaimToDrivers(group.groupId, it.passengerId, mapped.amountPhp);
    }
  }

  if (!Array.isArray(body) && !("items" in (body as object))) {
    return NextResponse.json(updated[0]);
  }
  return NextResponse.json(updated);
}

async function notifyClaimToDrivers(
  groupId: string,
  passengerId: string,
  amountPhp: number
): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: drivers }, { data: passenger }] = await Promise.all([
      admin
        .from("members")
        .select("user_id")
        .eq("group_id", groupId)
        .in("role", ["driver", "both"]),
      admin
        .from("passengers")
        .select("name")
        .eq("group_id", groupId)
        .eq("id", passengerId)
        .maybeSingle(),
    ]);
    const ids = (drivers ?? []).map((d) => d.user_id as string);
    const name = passenger?.name ?? "A passenger";
    await sendPushToUsers(ids, {
      title: "Payment claim received",
      body: `${name} marked ₱${amountPhp.toFixed(2)} as paid — confirm?`,
      url: "/payments",
      tag: `claim-${passengerId}`,
    });
  } catch (err) {
    console.error("payments claim notify failed", err);
  }
}

async function notifyConfirmToPassenger(
  groupId: string,
  passengerId: string,
  amountPhp: number
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: member } = await admin
      .from("members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("passenger_id", passengerId)
      .maybeSingle();
    if (!member?.user_id) return;
    await sendPushToUsers([member.user_id as string], {
      title: "Payment confirmed",
      body: `Your payment of ₱${amountPhp.toFixed(2)} has been confirmed.`,
      url: "/payments",
      tag: `confirm-${passengerId}`,
    });
  } catch (err) {
    console.error("payments confirm notify failed", err);
  }
}
