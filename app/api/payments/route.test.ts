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

import { GET, PATCH } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

beforeEach(() => {
  supaState.current = null;
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
        date: "2026-05-13",
      },
    ]);
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

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await PATCH(
      new Request("http://t/api/payments", {
        method: "PATCH",
        body: JSON.stringify({ tripId: "t1", passengerId: "p1", paid: true }),
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
