import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, POST } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/gas-prices", () => {
  it("returns the latest price", async () => {
    setSupa({
      tables: {
        gas_prices: [
          {
            data: [
              {
                id: "g1",
                effective_date: "2026-05-13",
                price_per_liter: 65.5,
                station_name: null,
                created_at: "2026-05-13T03:00:00Z",
              },
            ],
            error: null,
          },
        ],
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(body.gasPrice).toBe(65.5);
  });

  it("returns null when none visible (RLS empty)", async () => {
    setSupa({ tables: { gas_prices: [{ data: [], error: null }] } });
    const res = await GET();
    expect(await res.json()).toBeNull();
  });
});

describe("POST /api/gas-prices", () => {
  it("upserts a new gas price as driver", async () => {
    const supa = setSupa({
      tables: {
        gas_prices: [
          {
            data: {
              id: "g2",
              effective_date: "2026-05-13",
              price_per_liter: 70,
              station_name: null,
              created_at: "2026-05-13T03:00:00Z",
            },
            error: null,
          },
        ],
      },
    });
    const res = await POST(
      new Request("http://t/api/gas-prices", {
        method: "POST",
        body: JSON.stringify({ price: 70, effectiveDate: "2026-05-13" }),
      })
    );
    expect(res.status).toBe(200);
    const upsert = supa.callsFor("gas_prices")[0].find((c) => c.method === "upsert");
    expect(upsert!.args[0]).toMatchObject({ effective_date: "2026-05-13", price_per_liter: 70 });
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await POST(
      new Request("http://t/api/gas-prices", {
        method: "POST",
        body: JSON.stringify({ price: 70 }),
      })
    );
    expect(res.status).toBe(403);
  });
});
