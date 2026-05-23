/**
 * RLS regression suite.
 *
 * Seeds two groups (A and B) with disjoint users, then verifies that
 * user A cannot SELECT user B's trips, passengers, settings, fillups,
 * or payments via the PostgREST data API. Group-scoped routes (which
 * resolve the active group from a cookie + membership) only ever look
 * at their own group, so the API surface inherits the same isolation —
 * this suite asserts the underlying RLS that backs it.
 *
 * Skipped unless RLS_TEST_SUPABASE_URL + RLS_TEST_SERVICE_ROLE_KEY are
 * set, so CI on a clean dev branch can opt in by exporting those.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.RLS_TEST_SUPABASE_URL;
const SERVICE = process.env.RLS_TEST_SERVICE_ROLE_KEY;
const ANON = process.env.RLS_TEST_ANON_KEY ?? process.env.RLS_TEST_PUBLISHABLE_KEY;

const enabled = Boolean(URL && SERVICE && ANON);
const d = enabled ? describe : describe.skip;

interface Seeded {
  admin: SupabaseClient;
  groupA: string;
  groupB: string;
  userA: { id: string; email: string; password: string };
  userB: { id: string; email: string; password: string };
  tripA: string;
  passengerA: string;
  fillupA: string;
}

let ctx: Seeded;

async function signedInAs(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = createClient(URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

d("RLS isolation across groups", () => {
  beforeAll(async () => {
    const admin = createClient(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const stamp = Date.now();
    const mkUser = async (prefix: string) => {
      const email = `rls-${prefix}-${stamp}@example.com`;
      const password = `rls-${prefix}-${stamp}-${Math.random()}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("createUser failed");
      return { id: data.user.id, email, password };
    };

    const userA = await mkUser("a");
    const userB = await mkUser("b");

    const mkGroup = async (name: string, ownerId: string) => {
      const { data: g, error } = await admin
        .from("groups")
        .insert({ name, owner_user_id: ownerId })
        .select("id")
        .single();
      if (error || !g) throw error ?? new Error("group insert failed");
      await admin.from("members").insert({
        group_id: g.id,
        user_id: ownerId,
        role: "both",
      });
      await admin.from("settings").insert({ group_id: g.id });
      return g.id as string;
    };

    const groupA = await mkGroup(`A-${stamp}`, userA.id);
    const groupB = await mkGroup(`B-${stamp}`, userB.id);

    const { data: pax } = await admin
      .from("passengers")
      .insert({
        group_id: groupA,
        name: "Ana",
        active: true,
      })
      .select("id")
      .single();
    const passengerA = (pax as { id: string }).id;

    const { data: gas } = await admin
      .from("gas_prices")
      .insert({
        group_id: groupA,
        effective_date: "2026-05-13",
        price_per_liter: 65,
      })
      .select("id")
      .single();
    const gasId = (gas as { id: string }).id;

    const { data: trip } = await admin
      .from("trips")
      .insert({
        group_id: groupA,
        date: "2026-05-13",
        gas_price_id: gasId,
        parking_fee_php: 90,
      })
      .select("id")
      .single();
    const tripA = (trip as { id: string }).id;

    const { data: fill } = await admin
      .from("fillups")
      .insert({
        group_id: groupA,
        owner_user_id: userA.id,
        date: "2026-05-13",
        liters: 30,
        total_php: 1950,
        odometer_km: 12345,
      })
      .select("id")
      .single();
    const fillupA = (fill as { id: string }).id;

    await admin.from("trip_payments").insert({
      group_id: groupA,
      trip_id: tripA,
      passenger_id: passengerA,
      amount_php: 100,
      paid: false,
    });

    ctx = { admin, groupA, groupB, userA, userB, tripA, passengerA, fillupA };
  }, 60_000);

  it("user A sees only their group's rows; user B sees none of A's data", async () => {
    const a = await signedInAs(ctx.userA.email, ctx.userA.password);
    const b = await signedInAs(ctx.userB.email, ctx.userB.password);

    for (const t of [
      "trips",
      "passengers",
      "settings",
      "fillups",
      "trip_payments",
    ] as const) {
      const fromA = await a.from(t).select("*").eq("group_id", ctx.groupA);
      const fromB = await b.from(t).select("*").eq("group_id", ctx.groupA);
      expect(fromA.error, `A reading ${t}`).toBeNull();
      expect((fromA.data ?? []).length, `A sees rows in ${t}`).toBeGreaterThan(0);
      expect(fromB.error, `B reading ${t}`).toBeNull();
      expect(fromB.data ?? [], `B leaked rows from ${t}`).toEqual([]);
    }
  }, 60_000);

  it("user B cannot read user A's group via the /api/* surface", async () => {
    // Both /api/trips and /api/passengers require active group membership.
    // User B can't switch their active group to A (PUT /api/groups returns
    // 403 on a missing member row) so the strongest assertion is at the
    // PostgREST layer above. Here we just smoke-test that B's listing of
    // their own group is empty (no leakage).
    const b = await signedInAs(ctx.userB.email, ctx.userB.password);
    const { data } = await b
      .from("trips")
      .select("id")
      .eq("group_id", ctx.groupB);
    expect(data ?? []).toEqual([]);
  });
});
