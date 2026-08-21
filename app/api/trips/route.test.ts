import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";
import { calcDay } from "@/lib/calc";
import { fromDbSettings } from "@/lib/supabase/mappers";
import type { DbSettings } from "@/lib/supabase/types";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, POST, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

// 2026-08-20 is a Thursday; the Sunday-anchored backfill window is
// [2026-08-16 → 2026-08-20]. Freeze time to noon Manila (04:00Z) so the retro
// guard resolves the same window regardless of the CI runner's timezone.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T04:00:00Z"));
  supaState.current = null;
});
afterEach(() => {
  vi.useRealTimers();
});

const baseTrip = {
  id: "ignored",
  // In-window date so create-path tests pass the retro guard.
  date: "2026-08-19",
  gasPrice: 65.5,
  parkingFee: 90,
  legs: [
    { route: "skyway" as const, passengerIds: ["p1"], distanceKm: 21 },
    { route: "slex" as const, passengerIds: ["p1"], distanceKm: 21 },
  ],
  notes: null,
};

const driverSettings = {
  data: {
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
  },
  error: null,
};

// The existing-trip lookup that precedes every upsert. `null` = create path.
const noExistingTrip = { data: null, error: null };

describe("GET /api/trips", () => {
  it("returns mapped trips with their gas price snapshot", async () => {
    setSupa({
      tables: {
        trips: [
          {
            data: [
              {
                id: "t1",
                date: "2026-05-13",
                gas_price_id: "g1",
                parking_fee_php: 90,
                notes: null,
                trip_legs: [
                  {
                    id: "l1",
                    trip_id: "t1",
                    leg: "morning",
                    route: "skyway",
                    trip_leg_riders: [{ trip_leg_id: "l1", passenger_id: "p1" }],
                  },
                  {
                    id: "l2",
                    trip_id: "t1",
                    leg: "evening",
                    route: "slex",
                    trip_leg_riders: [],
                  },
                ],
              },
            ],
            error: null,
          },
        ],
        gas_prices: [
          { data: [{ id: "g1", effective_date: "2026-05-13", price_per_liter: 65.5 }], error: null },
        ],
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].gasPrice).toBe(65.5);
    expect(body[0].legs[0].passengerIds).toEqual(["p1"]);
  });

  it("sources gasPrice + mileageKml from the per-trip snapshot when present", async () => {
    setSupa({
      tables: {
        trips: [
          {
            data: [
              {
                id: "t1",
                date: "2026-08-17",
                gas_price_id: "g1",
                parking_fee_php: 90,
                notes: null,
                // Frozen snapshot differs from the linked gas row to prove it wins.
                mileage_kml: 10.5,
                gas_price_php: 50,
                trip_legs: [
                  {
                    id: "l1",
                    trip_id: "t1",
                    leg: "morning",
                    position: 0,
                    route: "skyway",
                    trip_leg_riders: [{ trip_leg_id: "l1", passenger_id: "p1" }],
                  },
                ],
              },
            ],
            error: null,
          },
        ],
        gas_prices: [
          { data: [{ id: "g1", effective_date: "2026-08-17", price_per_liter: 65.5 }], error: null },
        ],
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body[0].gasPrice).toBe(50); // frozen snapshot, not the linked 65.5
    expect(body[0].mileageKml).toBe(10.5);
  });

  it("surfaces auth-scoped empty results (RLS hides rows)", async () => {
    setSupa({
      tables: {
        trips: [{ data: [], error: null }],
        gas_prices: [{ data: [], error: null }],
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns 500 on db error", async () => {
    setSupa({
      tables: {
        trips: [{ data: null, error: { message: "boom" } }],
      },
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/trips auth", () => {
  it("denies non-driver members", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(baseTrip) })
    );
    expect(res.status).toBe(403);
  });

  it("denies unauthenticated requests", async () => {
    setSupa({ auth: { userId: null } });
    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(baseTrip) })
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/trips retro window guard", () => {
  it("rejects creating a trip for a date before the Sunday window", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/trips", {
        method: "POST",
        // 2026-08-15 is the Saturday of the previous week — outside the window.
        body: JSON.stringify({ ...baseTrip, date: "2026-08-15" }),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/window/i);
  });

  it("rejects creating a trip in the future", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/trips", {
        method: "POST",
        body: JSON.stringify({ ...baseTrip, date: "2026-08-21" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("allows editing an already-existing trip whose date is outside the window", async () => {
    const supa = setSupa({
      tables: {
        // Existing legacy trip (null snapshot) dated well before the window.
        trips: [
          { data: { id: "t-old", mileage_kml: null, gas_price_php: null }, error: null },
          { data: { id: "t-old" }, error: null },
        ],
        gas_prices: [{ data: { id: "g-existing", price_per_liter: 60 }, error: null }],
        trip_legs: [
          { data: null, error: null },
          { data: [{ id: "lm", position: 0 }, { id: "le", position: 1 }], error: null },
        ],
        trip_leg_riders: [{ data: null, error: null }],
        settings: [driverSettings],
        trip_payments: [
          { data: null, error: null },
          { data: [], error: null },
          { data: null, error: null },
        ],
      },
    });
    const res = await POST(
      new Request("http://t/api/trips", {
        method: "POST",
        body: JSON.stringify({ ...baseTrip, date: "2026-05-13" }),
      })
    );
    expect(res.status).toBe(200);
    // A legacy edit preserves the null snapshot (recomputes live).
    const upsert = supa.callsFor("trips")[1].find((c) => c.method === "upsert");
    expect(upsert!.args[0]).toMatchObject({ mileage_kml: null, gas_price_php: null });
  });
});

describe("POST /api/trips gas snapshot", () => {
  it("re-uses an existing gas_prices row when one already exists for the date", async () => {
    const supa = setSupa({
      tables: {
        trips: [noExistingTrip, { data: { id: "t1" }, error: null }],
        gas_prices: [{ data: { id: "g-existing", price_per_liter: 65.5 }, error: null }],
        trip_legs: [
          { data: null, error: null },
          {
            data: [
              { id: "lm", leg: "morning", position: 0 },
              { id: "le", leg: "evening", position: 1 },
            ],
            error: null,
          },
        ],
        trip_leg_riders: [{ data: null, error: null }],
        settings: [driverSettings],
        trip_payments: [
          { data: null, error: null },
          { data: [], error: null },
          { data: null, error: null },
        ],
      },
    });

    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(baseTrip) })
    );
    expect(res.status).toBe(200);
    // gas_prices queue should have been consumed only once (no insert)
    expect(supa.remaining("gas_prices")).toBe(0);
    const body = await res.json();
    expect(body.id).toBe("t1");
  });

  it("inserts a snapshot gas_prices row when none exists for the date and links it", async () => {
    const supa = setSupa({
      tables: {
        gas_prices: [
          { data: null, error: null }, // lookup returns nothing
          { data: { id: "g-new" }, error: null }, // insert returns new id
        ],
        trips: [noExistingTrip, { data: { id: "t1" }, error: null }],
        trip_legs: [
          { data: null, error: null },
          {
            data: [
              { id: "lm", leg: "morning", position: 0 },
              { id: "le", leg: "evening", position: 1 },
            ],
            error: null,
          },
        ],
        trip_leg_riders: [{ data: null, error: null }],
        settings: [driverSettings],
        trip_payments: [
          { data: null, error: null },
          { data: [], error: null },
          { data: null, error: null },
        ],
      },
    });

    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(baseTrip) })
    );
    expect(res.status).toBe(200);
    // Both gas_prices queue entries should have been consumed (lookup + insert).
    expect(supa.remaining("gas_prices")).toBe(0);

    // The second gas_prices builder call must be an insert that snapshots the trip's price.
    const gpChains = supa.callsFor("gas_prices");
    expect(gpChains).toHaveLength(2);
    const insertChain = gpChains[1];
    const insertCall = insertChain.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toMatchObject({
      effective_date: baseTrip.date,
      price_per_liter: baseTrip.gasPrice,
    });

    // The trips upsert (2nd trips call, after the existence lookup) must carry the
    // newly minted gas_price_id, not null.
    const tripsChains = supa.callsFor("trips");
    expect(tripsChains).toHaveLength(2);
    const upsertCall = tripsChains[1].find((c) => c.method === "upsert");
    expect(upsertCall).toBeDefined();
    expect((upsertCall!.args[0] as { gas_price_id: string }).gas_price_id).toBe("g-new");
  });
});

describe("POST /api/trips snapshot freeze (SABAY-47)", () => {
  // A single-leg, single-passenger trip keeps the hand-calc simple.
  const backfillTrip = {
    ...baseTrip,
    date: "2026-08-17", // within window, but in the past
    legs: [{ route: "skyway" as const, passengerIds: ["p1"], distanceKm: 21 }],
  };

  // Fill-ups: two dated on/before the trip date give a rolling avg of 10 km/L;
  // a later fill-up (after the trip date) would drag the live avg to 16 km/L.
  const fillups = [
    { id: "f1", car_id: null, date: "2026-08-10", liters: 40, total_php: 2000, odometer_km: 1000 },
    { id: "f2", car_id: null, date: "2026-08-16", liters: 40, total_php: 2000, odometer_km: 1400 },
    { id: "f3", car_id: null, date: "2026-08-19", liters: 10, total_php: 500, odometer_km: 1800 },
  ];

  function snapshotTables(gasLookup: { id: string; price_per_liter: number | null } | null) {
    return {
      trips: [noExistingTrip, { data: { id: "t1" }, error: null }],
      gas_prices: [{ data: gasLookup, error: null }],
      fillups: [{ data: fillups, error: null }],
      trip_legs: [
        { data: null, error: null },
        { data: [{ id: "lm", position: 0 }], error: null },
      ],
      trip_leg_riders: [{ data: null, error: null }],
      settings: [driverSettings],
      trip_payments: [
        { data: null, error: null }, // delete not-in
        { data: [], error: null }, // existing
        { data: null, error: null }, // upsert
      ],
    } as Parameters<typeof makeSupabase>[0]["tables"];
  }

  it("freezes the day's mileage (fill-ups ≤ date) and gas price, and prices from them", async () => {
    // Effective gas row for 2026-08-17 is the historical 50, not body.gasPrice 65.5.
    const supa = setSupa({ tables: snapshotTables({ id: "g-hist", price_per_liter: 50 }) });

    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(backfillTrip) })
    );
    expect(res.status).toBe(200);

    // The trips upsert freezes mileage 10 (only fill-ups ≤ 2026-08-17) and gas 50.
    const upsert = supa.callsFor("trips")[1].find((c) => c.method === "upsert");
    expect(upsert!.args[0]).toMatchObject({ mileage_kml: 10, gas_price_php: 50 });

    // Payments equal a hand-calc at the frozen day's gas + mileage.
    const settings = { ...fromDbSettings(driverSettings.data as unknown as DbSettings), mileageKmPerL: 10 };
    const expected = calcDay(
      { date: backfillTrip.date, gasPricePhpPerL: 50, legs: backfillTrip.legs },
      settings
    );
    const payUpsert = supa
      .callsFor("trip_payments")
      .flat()
      .find((c) => c.method === "upsert");
    const payments = payUpsert!.args[0] as Array<{ passenger_id: string; amount_php: number }>;
    const p1 = payments.find((p) => p.passenger_id === "p1")!;
    expect(p1.amount_php).toBe(expected.perPassenger["p1"]);

    // And it must NOT match the (buggy) split at today's gas + live mileage.
    const wrong = calcDay(
      { date: backfillTrip.date, gasPricePhpPerL: 65.5, legs: backfillTrip.legs },
      { ...fromDbSettings(driverSettings.data as unknown as DbSettings), mileageKmPerL: 16 }
    );
    expect(p1.amount_php).not.toBe(wrong.perPassenger["p1"]);
  });

  it("keeps a today trip numerically identical to live gas + live mileage", async () => {
    // Effective gas row equals body.gasPrice for a today trip.
    const todayTrip = { ...backfillTrip, date: "2026-08-20" };
    const supa = setSupa({ tables: snapshotTables({ id: "g-now", price_per_liter: 65.5 }) });

    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(todayTrip) })
    );
    expect(res.status).toBe(200);

    // All fill-ups are ≤ today, so the frozen mileage equals the live avg (16).
    const upsert = supa.callsFor("trips")[1].find((c) => c.method === "upsert");
    expect(upsert!.args[0]).toMatchObject({ mileage_kml: 16, gas_price_php: 65.5 });

    const settings = { ...fromDbSettings(driverSettings.data as unknown as DbSettings), mileageKmPerL: 16 };
    const expected = calcDay(
      { date: todayTrip.date, gasPricePhpPerL: 65.5, legs: todayTrip.legs },
      settings
    );
    const payUpsert = supa
      .callsFor("trip_payments")
      .flat()
      .find((c) => c.method === "upsert");
    const payments = payUpsert!.args[0] as Array<{ passenger_id: string; amount_php: number }>;
    expect(payments.find((p) => p.passenger_id === "p1")!.amount_php).toBe(
      expected.perPassenger["p1"]
    );
  });

  it("freezes the effective gas row, not a diverging body.gasPrice (stale client)", async () => {
    // Intended semantics: the split stops trusting the client's gas price and
    // uses the row effective as of the trip date. Here they disagree (client 65.5
    // vs effective 70) and the frozen effective price must win.
    const todayTrip = { ...backfillTrip, date: "2026-08-20", gasPrice: 65.5 };
    const supa = setSupa({ tables: snapshotTables({ id: "g-eff", price_per_liter: 70 }) });

    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(todayTrip) })
    );
    expect(res.status).toBe(200);

    const upsert = supa.callsFor("trips")[1].find((c) => c.method === "upsert");
    expect(upsert!.args[0]).toMatchObject({ gas_price_php: 70 });

    const settings = { ...fromDbSettings(driverSettings.data as unknown as DbSettings), mileageKmPerL: 16 };
    const expected = calcDay(
      { date: todayTrip.date, gasPricePhpPerL: 70, legs: todayTrip.legs },
      settings
    );
    const payUpsert = supa
      .callsFor("trip_payments")
      .flat()
      .find((c) => c.method === "upsert");
    const payments = payUpsert!.args[0] as Array<{ passenger_id: string; amount_php: number }>;
    expect(payments.find((p) => p.passenger_id === "p1")!.amount_php).toBe(
      expected.perPassenger["p1"]
    );
  });
});

describe("POST /api/trips N legs", () => {
  const threeLegTrip = {
    ...baseTrip,
    legs: [
      { route: "skyway" as const, passengerIds: ["p1", "p2"], distanceKm: 21 },
      { route: "slex" as const, passengerIds: ["p1"], distanceKm: 25 },
      { route: "slex" as const, passengerIds: ["p3"], distanceKm: 12 },
    ],
  };

  it("persists every leg with its position and attaches riders + payments per leg", async () => {
    const supa = setSupa({
      tables: {
        trips: [noExistingTrip, { data: { id: "t1" }, error: null }],
        gas_prices: [{ data: { id: "g-existing", price_per_liter: 65.5 }, error: null }],
        trip_legs: [
          { data: null, error: null }, // delete
          {
            data: [
              { id: "lm", position: 0 },
              { id: "le", position: 1 },
              { id: "l3", position: 2 },
            ],
            error: null,
          },
        ],
        trip_leg_riders: [{ data: null, error: null }],
        settings: [driverSettings],
        trip_payments: [
          { data: null, error: null }, // delete not-in
          { data: [], error: null }, // existing
          { data: null, error: null }, // upsert
        ],
      },
    });

    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(threeLegTrip) })
    );
    expect(res.status).toBe(200);

    // Three legs inserted, ordered by position, first two named morning/evening.
    const legInsert = supa
      .callsFor("trip_legs")
      .flat()
      .find((c) => c.method === "insert");
    expect(legInsert).toBeDefined();
    const insertedLegs = legInsert!.args[0] as Array<{
      leg: string | null;
      position: number;
      distance_km: number;
    }>;
    expect(insertedLegs).toHaveLength(3);
    expect(insertedLegs.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(insertedLegs.map((l) => l.leg)).toEqual(["morning", "evening", null]);
    expect(insertedLegs.map((l) => l.distance_km)).toEqual([21, 25, 12]);

    // Riders attach to the correct leg id (matched by position, not row order).
    const riderInsert = supa
      .callsFor("trip_leg_riders")
      .flat()
      .find((c) => c.method === "insert");
    const riders = riderInsert!.args[0] as Array<{ trip_leg_id: string; passenger_id: string }>;
    expect(riders).toHaveLength(4);
    expect(riders).toEqual(
      expect.arrayContaining([
        { group_id: "g1", trip_leg_id: "lm", passenger_id: "p1", extra_distance_km: 0 },
        { group_id: "g1", trip_leg_id: "lm", passenger_id: "p2", extra_distance_km: 0 },
        { group_id: "g1", trip_leg_id: "le", passenger_id: "p1", extra_distance_km: 0 },
        { group_id: "g1", trip_leg_id: "l3", passenger_id: "p3", extra_distance_km: 0 },
      ])
    );

    // Payments reflect every leg: p1 (legs 0+1), p2 (leg 0), p3 (leg 2).
    const payUpsert = supa
      .callsFor("trip_payments")
      .flat()
      .find((c) => c.method === "upsert");
    const payments = payUpsert!.args[0] as Array<{ passenger_id: string; amount_php: number }>;
    expect(payments.map((p) => p.passenger_id).sort()).toEqual(["p1", "p2", "p3"]);
    // p1 rides two legs, so owes strictly more than p2/p3 who ride one each.
    const amt = (id: string) => payments.find((p) => p.passenger_id === id)!.amount_php;
    expect(amt("p1")).toBeGreaterThan(amt("p2"));
    expect(amt("p1")).toBeGreaterThan(amt("p3"));
  });

  it("rejects a leg with non-positive distance", async () => {
    setSupa({});
    const bad = {
      ...baseTrip,
      legs: [
        { route: "skyway" as const, passengerIds: ["p1"], distanceKm: 21 },
        { route: "slex" as const, passengerIds: ["p1"], distanceKm: 0 },
      ],
    };
    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(bad) })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/trips car + driver attachment", () => {
  const tripWithCar = { ...baseTrip, carId: "car1", driverUserId: "u-driver" };

  function fullTables(extra: Record<string, unknown[]>) {
    return {
      trips: [noExistingTrip, { data: { id: "t1" }, error: null }],
      gas_prices: [{ data: { id: "g-existing", price_per_liter: 65.5 }, error: null }],
      trip_legs: [
        { data: null, error: null },
        { data: [{ id: "lm", leg: "morning", position: 0 }, { id: "le", leg: "evening", position: 1 }], error: null },
      ],
      trip_leg_riders: [{ data: null, error: null }],
      settings: [driverSettings],
      trip_payments: [
        { data: null, error: null },
        { data: [], error: null },
        { data: null, error: null },
      ],
      ...extra,
    } as Parameters<typeof makeSupabase>[0]["tables"];
  }

  it("rejects car_id without driver_user_id", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/trips", {
        method: "POST",
        body: JSON.stringify({ ...baseTrip, carId: "car1" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a driver_user_id that is not a driver of the group", async () => {
    setSupa({
      tables: {
        members: [
          { data: { group_id: "g1", role: "driver" }, error: null },
          { data: { group_id: "g1", role: "driver" }, error: null },
          { data: { role: "passenger" }, error: null },
        ],
      },
    });
    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(tripWithCar) })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a car not owned by the driver", async () => {
    setSupa({
      tables: { cars: [{ data: { owner_user_id: "someone-else", fuel_efficiency_kml: 14 }, error: null }] },
    });
    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(tripWithCar) })
    );
    expect(res.status).toBe(400);
  });

  it("stamps car_id + driver_user_id when valid", async () => {
    const supa = setSupa({
      tables: fullTables({
        cars: [{ data: { owner_user_id: "u-driver", fuel_efficiency_kml: 14 }, error: null }],
      }),
    });
    const res = await POST(
      new Request("http://t/api/trips", { method: "POST", body: JSON.stringify(tripWithCar) })
    );
    expect(res.status).toBe(200);
    const upsert = supa.callsFor("trips")[1].find((c) => c.method === "upsert");
    expect(upsert!.args[0]).toMatchObject({ car_id: "car1", driver_user_id: "u-driver" });
  });
});

describe("DELETE /api/trips", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await DELETE(new Request("http://t/api/trips", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });

  it("deletes when caller is driver", async () => {
    setSupa({ tables: { trips: [{ data: null, error: null }] } });
    const res = await DELETE(
      new Request("http://t/api/trips?id=t1", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await DELETE(
      new Request("http://t/api/trips?id=t1", { method: "DELETE" })
    );
    expect(res.status).toBe(403);
  });
});
