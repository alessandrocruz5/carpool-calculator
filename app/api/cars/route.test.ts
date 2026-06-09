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

const carRow = {
  id: "c1",
  owner_user_id: "u1",
  name: "Civic",
  fuel_efficiency_kml: 12.5,
  tank_size_liters: 45,
  max_passengers: null,
  created_at: "x",
};

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/cars", () => {
  it("returns the caller's mapped cars", async () => {
    const supa = setSupa({ tables: { cars: [{ data: [carRow], error: null }] } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: "c1",
        ownerUserId: "u1",
        name: "Civic",
        fuelEfficiencyKml: 12.5,
        tankSizeLiters: 45,
        maxPassengers: null,
      },
    ]);
    const eqArgs = supa
      .callsFor("cars")[0]
      .filter((c) => c.method === "eq")
      .map((c) => c.args);
    expect(eqArgs).toContainEqual(["owner_user_id", "u1"]);
  });

  it("denies unauthenticated requests", async () => {
    setSupa({ auth: { userId: null } });
    expect((await GET()).status).toBe(401);
  });
});

describe("POST /api/cars", () => {
  it("requires a name", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/cars", { method: "POST", body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
  });

  it("inserts a car scoped to the caller", async () => {
    const supa = setSupa({ tables: { cars: [{ data: carRow, error: null }] } });
    const res = await POST(
      new Request("http://t/api/cars", {
        method: "POST",
        body: JSON.stringify({ name: " Civic ", fuelEfficiencyKml: 12.5 }),
      })
    );
    expect(res.status).toBe(200);
    const insert = supa.callsFor("cars")[0].find((c) => c.method === "insert");
    expect(insert!.args[0]).toMatchObject({ name: "Civic", owner_user_id: "u1" });
  });

  it("denies unauthenticated requests", async () => {
    setSupa({ auth: { userId: null } });
    const res = await POST(
      new Request("http://t/api/cars", { method: "POST", body: JSON.stringify({ name: "X" }) })
    );
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/cars", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await PATCH(
      new Request("http://t/api/cars", { method: "PATCH", body: JSON.stringify({ name: "X" }) })
    );
    expect(res.status).toBe(400);
  });

  it("updates a car scoped to the caller", async () => {
    const supa = setSupa({ tables: { cars: [{ data: carRow, error: null }] } });
    const res = await PATCH(
      new Request("http://t/api/cars", {
        method: "PATCH",
        body: JSON.stringify({ id: "c1", fuelEfficiencyKml: 13 }),
      })
    );
    expect(res.status).toBe(200);
    const eqArgs = supa
      .callsFor("cars")[0]
      .filter((c) => c.method === "eq")
      .map((c) => c.args);
    expect(eqArgs).toContainEqual(["owner_user_id", "u1"]);
  });
});

describe("DELETE /api/cars", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await DELETE(new Request("http://t/api/cars", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });

  it("deletes a car scoped to the caller when no trips reference it", async () => {
    const supa = setSupa({
      tables: {
        trips: [{ data: [], error: null }],
        cars: [{ data: null, error: null }],
      },
    });
    const res = await DELETE(
      new Request("http://t/api/cars?id=c1", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
    const tripEq = supa
      .callsFor("trips")[0]
      .filter((c) => c.method === "eq")
      .map((c) => c.args);
    expect(tripEq).toContainEqual(["car_id", "c1"]);
  });

  it("returns 409 with tripCount when the car is in use", async () => {
    setSupa({
      tables: {
        trips: [{ data: [{ id: "t1" }, { id: "t2" }], error: null }],
      },
    });
    const res = await DELETE(
      new Request("http://t/api/cars?id=c1", { method: "DELETE" })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "in_use", tripCount: 2 });
  });
});
