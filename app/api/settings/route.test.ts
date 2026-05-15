import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, PATCH } from "./route";

const dbRow = {
  id: 1,
  mileage_kml_override: 10.5,
  round_trip_km: 42,
  parking_fee_php: 90,
  toll_skyway_php: 164,
  toll_slex_php: 124,
  split_1p_driver: 40,
  split_2p_driver: 25,
  split_3p_driver: 19,
  updated_at: "x",
};

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/settings", () => {
  it("maps the db row to camelCase", async () => {
    setSupa({ tables: { settings: [{ data: dbRow, error: null }] } });
    const res = await GET();
    const body = await res.json();
    expect(body.mileageKmPerL).toBe(10.5);
    expect(body.parkingFeePhp).toBe(90);
  });

  it("returns null when no settings row visible (RLS empty)", async () => {
    setSupa({ tables: { settings: [{ data: null, error: null }] } });
    const res = await GET();
    expect(await res.json()).toBeNull();
  });

  it("returns 500 on db error", async () => {
    setSupa({ tables: { settings: [{ data: null, error: { message: "bad" } }] } });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/settings", () => {
  it("converts patch to snake_case and applies", async () => {
    const supa = setSupa({
      tables: { settings: [{ data: { ...dbRow, parking_fee_php: 100 }, error: null }] },
    });
    const res = await PATCH(
      new Request("http://t/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ parkingFeePhp: 100 }),
      })
    );
    expect(res.status).toBe(200);
    const updateCall = supa.callsFor("settings")[0].find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall!.args[0]).toMatchObject({ parking_fee_php: 100 });
  });

  it("denies non-driver members (RLS proxy)", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await PATCH(
      new Request("http://t/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ parkingFeePhp: 100 }),
      })
    );
    expect(res.status).toBe(403);
  });
});
