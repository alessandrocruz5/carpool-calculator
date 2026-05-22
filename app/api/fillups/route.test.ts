import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, POST, PATCH, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

const fillupRow = {
  id: "f1",
  car_id: "c1",
  owner_user_id: "u1",
  date: "2026-05-13",
  liters: 30,
  total_php: 2000,
  odometer_km: 10000,
  created_at: "x",
};

const ownedCar = { data: { owner_user_id: "u1" }, error: null };

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/fillups", () => {
  it("maps fillup rows", async () => {
    setSupa({ tables: { fillups: [{ data: [fillupRow], error: null }] } });
    const res = await GET(new Request("http://t/api/fillups"));
    const body = await res.json();
    expect(body[0]).toMatchObject({
      id: "f1",
      carId: "c1",
      liters: 30,
      totalPhp: 2000,
      odometerKm: 10000,
    });
  });

  it("returns empty under RLS", async () => {
    setSupa({ tables: { fillups: [{ data: [], error: null }] } });
    const res = await GET(new Request("http://t/api/fillups"));
    expect(await res.json()).toEqual([]);
  });

  it("filters by car_id query param", async () => {
    const supa = setSupa({ tables: { fillups: [{ data: [fillupRow], error: null }] } });
    await GET(new Request("http://t/api/fillups?car_id=c1"));
    const eqArgs = supa
      .callsFor("fillups")[0]
      .filter((c) => c.method === "eq")
      .map((c) => c.args);
    expect(eqArgs).toContainEqual(["car_id", "c1"]);
  });
});

describe("POST /api/fillups", () => {
  it("requires car_id", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/fillups", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-13", liters: 30, totalPhp: 2000, odometerKm: 10000 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a car the caller does not own", async () => {
    setSupa({ tables: { cars: [{ data: { owner_user_id: "other" }, error: null }] } });
    const res = await POST(
      new Request("http://t/api/fillups", {
        method: "POST",
        body: JSON.stringify({ carId: "c1", date: "2026-05-13", liters: 30, totalPhp: 2000, odometerKm: 10000 }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("inserts as driver, stamping owner", async () => {
    const supa = setSupa({
      tables: { cars: [ownedCar], fillups: [{ data: fillupRow, error: null }] },
    });
    const res = await POST(
      new Request("http://t/api/fillups", {
        method: "POST",
        body: JSON.stringify({ carId: "c1", date: "2026-05-13", liters: 30, totalPhp: 2000, odometerKm: 10000 }),
      })
    );
    expect(res.status).toBe(200);
    const insert = supa.callsFor("fillups")[0].find((c) => c.method === "insert");
    expect(insert!.args[0]).toMatchObject({ car_id: "c1", owner_user_id: "u1" });
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await POST(
      new Request("http://t/api/fillups", {
        method: "POST",
        body: JSON.stringify({ carId: "c1", date: "2026-05-13", liters: 30, totalPhp: 2000, odometerKm: 10000 }),
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/fillups", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await PATCH(
      new Request("http://t/api/fillups", {
        method: "PATCH",
        body: JSON.stringify({ carId: "c1", liters: 31 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("requires car_id", async () => {
    setSupa({});
    const res = await PATCH(
      new Request("http://t/api/fillups", {
        method: "PATCH",
        body: JSON.stringify({ id: "f1", liters: 31 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("updates fields as driver", async () => {
    setSupa({
      tables: { cars: [ownedCar], fillups: [{ data: fillupRow, error: null }] },
    });
    const res = await PATCH(
      new Request("http://t/api/fillups", {
        method: "PATCH",
        body: JSON.stringify({ id: "f1", carId: "c1", liters: 31 }),
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/fillups", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await DELETE(new Request("http://t/api/fillups", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await DELETE(
      new Request("http://t/api/fillups?id=f1", { method: "DELETE" })
    );
    expect(res.status).toBe(403);
  });

  it("deletes when driver", async () => {
    setSupa({ tables: { fillups: [{ data: null, error: null }] } });
    const res = await DELETE(
      new Request("http://t/api/fillups?id=f1", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
  });
});
