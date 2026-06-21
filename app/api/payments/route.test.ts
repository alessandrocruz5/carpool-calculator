import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

const rlBlocked = { value: false };
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () =>
    rlBlocked.value
      ? new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      : null
  ),
  getIdentifier: vi.fn(() => "user:u1"),
}));

// The GET expiry sweep uses the service-role client; default to "unconfigured"
// (throws → sweep skipped) unless a test installs an admin double.
const adminState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (!adminState.current) throw new Error("admin not configured");
    return adminState.current.client;
  }),
}));

import { GET, PATCH } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

beforeEach(() => {
  supaState.current = null;
  adminState.current = null;
  rlBlocked.value = false;
});

describe("GET /api/payments", () => {
  it("returns flat rows for default query", async () => {
    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              {
                trip_id: "t1",
                passenger_id: "p1",
                amount_php: "150",
                paid: false,
                paid_at: null,
                claimed_at: null,
                trips: { date: "2026-05-13" },
              },
            ],
            error: null,
          },
        ],
      },
    });
    const res = await GET(new Request("http://t/api/payments"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual([
      {
        tripId: "t1",
        passengerId: "p1",
        amountPhp: 150,
        paid: false,
        paidAt: null,
        claimedAt: null,
        claimActive: false,
        date: "2026-05-13",
      },
    ]);
  });

  it("derives an active claim for a recent unconfirmed payment", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              {
                trip_id: "t1",
                passenger_id: "p1",
                amount_php: "150",
                paid: false,
                paid_at: null,
                claimed_at: recent,
                trips: { date: "2026-05-13" },
              },
            ],
            error: null,
          },
        ],
      },
    });
    const body = await (await GET(new Request("http://t/api/payments"))).json();
    expect(body[0].claimedAt).toBe(recent);
    expect(body[0].claimActive).toBe(true);
  });

  it("an unconfirmed claim older than 24h reads as inactive", async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              {
                trip_id: "t1",
                passenger_id: "p1",
                amount_php: "150",
                paid: false,
                paid_at: null,
                claimed_at: stale,
                trips: { date: "2026-05-13" },
              },
            ],
            error: null,
          },
        ],
      },
    });
    const body = await (await GET(new Request("http://t/api/payments"))).json();
    expect(body[0].claimActive).toBe(false);
  });

  it("a confirmed payment is never claimActive", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              {
                trip_id: "t1",
                passenger_id: "p1",
                amount_php: "150",
                paid: true,
                paid_at: recent,
                claimed_at: recent,
                trips: { date: "2026-05-13" },
              },
            ],
            error: null,
          },
        ],
      },
    });
    const body = await (await GET(new Request("http://t/api/payments"))).json();
    expect(body[0].claimActive).toBe(false);
  });

  it("sweeps expired unconfirmed claims via the admin client on GET", async () => {
    adminState.current = makeSupabase({
      tables: { trip_payments: [{ data: null, error: null }] },
    });
    setSupa({ tables: { trip_payments: [{ data: [], error: null }] } });
    await GET(new Request("http://t/api/payments"));
    const sweep = adminState.current.callsFor("trip_payments")[0];
    expect(sweep.some((c) => c.method === "update")).toBe(true);
    expect(sweep.some((c) => c.method === "lt")).toBe(true);
  });

  it("aggregates summary view", async () => {
    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              { passenger_id: "p1", amount_php: 100, passengers: { name: "Ana" } },
              { passenger_id: "p1", amount_php: 50, passengers: { name: "Ana" } },
              { passenger_id: "p2", amount_php: 30, passengers: { name: "Ben" } },
            ],
            error: null,
          },
        ],
      },
    });
    const res = await GET(new Request("http://t/api/payments?summary=1"));
    const body = await res.json();
    expect(body).toEqual([
      { passenger_id: "p1", name: "Ana", unpaid_total_php: 150, unpaid_count: 2 },
      { passenger_id: "p2", name: "Ben", unpaid_total_php: 30, unpaid_count: 1 },
    ]);
  });

  it("returns empty array under RLS (no rows visible)", async () => {
    setSupa({
      tables: { trip_payments: [{ data: [], error: null }] },
    });
    const res = await GET(new Request("http://t/api/payments"));
    expect(await res.json()).toEqual([]);
  });

  it("propagates DB errors", async () => {
    setSupa({
      tables: { trip_payments: [{ data: null, error: { message: "rls denied" } }] },
    });
    const res = await GET(new Request("http://t/api/payments"));
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/payments", () => {
  it("marks a single payment paid", async () => {
    const supa = setSupa({
      tables: {
        trip_payments: [
          {
            data: {
              trip_id: "t1",
              passenger_id: "p1",
              amount_php: 100,
              paid: true,
              paid_at: "now",
              claimed_at: null,
            },
            error: null,
          },
        ],
      },
    });
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1", passengerId: "p1", paid: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paid).toBe(true);
    const updateCall = supa.callsFor("trip_payments")[0].find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect((updateCall!.args[0] as { paid: boolean }).paid).toBe(true);
  });

  it("denies a non-driver confirming a payment", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1", passengerId: "p1", paid: true }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("lets a passenger claim their own payment without touching paid", async () => {
    const supa = setSupa({
      auth: { userId: "u1", member: { role: "rider" } },
      rpcs: { is_own_passenger: [{ data: true, error: null }] },
      tables: {
        trip_payments: [
          {
            data: {
              trip_id: "t1",
              passenger_id: "p1",
              amount_php: 100,
              paid: false,
              paid_at: null,
              claimed_at: new Date().toISOString(),
            },
            error: null,
          },
        ],
      },
    });
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1", passengerId: "p1", claim: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claimedAt).toBeTruthy();
    expect(body.claimActive).toBe(true);
    expect(body.paid).toBe(false);
    const updateCall = supa.callsFor("trip_payments")[0].find((c) => c.method === "update");
    const patch = updateCall!.args[0] as { claimed_at?: string; paid?: boolean };
    expect(patch.claimed_at).toBeTruthy();
    expect(patch.paid).toBeUndefined();
  });

  it("denies a passenger claiming someone else's payment", async () => {
    setSupa({
      auth: { userId: "u1", member: { role: "rider" } },
      rpcs: { is_own_passenger: [{ data: false, error: null }] },
    });
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1", passengerId: "p2", claim: true }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("validates payload", async () => {
    setSupa({});
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    setSupa({});
    rlBlocked.value = true;
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1", passengerId: "p1", paid: true }),
      })
    );
    expect(res.status).toBe(429);
  });
});
