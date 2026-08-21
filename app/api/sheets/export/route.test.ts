import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";
import { calcLeg, type CalcSettings, type Route } from "@/lib/calc";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

const appendRows = vi.fn().mockResolvedValue(2);
const replaceRows = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/sheets", () => ({
  appendRows: (...a: unknown[]) => appendRows(...a),
  replaceRows: (...a: unknown[]) => replaceRows(...a),
}));

import { GET, POST } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

const body = {
  weekStart: "2026-05-11",
  trips: [
    {
      date: "2026-05-13",
      gasPrice: 65.5,
      parkingFee: 90,
      legs: [
        { route: "skyway", passengerIds: ["p1"], distanceKm: 21 },
        { route: "slex", passengerIds: ["p1"], distanceKm: 21 },
      ],
    },
  ],
  passengers: [{ id: "p1", name: "Ana" }],
  settings: {
    mileageKmPerL: 10.5,
    roundTripKm: 42,
    parkingFeePhp: 90,
    tollSkywayPhp: 164,
    tollSlexPhp: 124,
    split1pDriver: 40,
    split2pDriver: 25,
    split3pDriver: 19,
  },
};

const origEnv = { ...process.env };

beforeEach(() => {
  supaState.current = null;
  appendRows.mockClear();
  replaceRows.mockClear();
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "svc@example.com";
  process.env.GOOGLE_PRIVATE_KEY = "key";
  process.env.GOOGLE_SHEET_ID = "sheet";
});

afterEach(() => {
  process.env = { ...origEnv };
});

describe("GET /api/sheets/export", () => {
  it("reports configured when env is set", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ configured: true });
  });

  it("reports not-configured when env missing", async () => {
    delete process.env.GOOGLE_SHEET_ID;
    const res = await GET();
    expect(await res.json()).toEqual({ configured: false });
  });
});

describe("POST /api/sheets/export", () => {
  it("returns 503 when sheets is not configured (auth-denied-equivalent)", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const res = await POST(
      new Request("http://t/api/sheets/export", { method: "POST", body: JSON.stringify(body) })
    );
    expect(res.status).toBe(503);
    expect(appendRows).not.toHaveBeenCalled();
  });

  it("writes the weekly tab and refreshes the payments tab", async () => {
    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              {
                trip_id: "t1",
                passenger_id: "p1",
                amount_php: 100,
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
    const res = await POST(
      new Request("http://t/api/sheets/export", { method: "POST", body: JSON.stringify(body) })
    );
    expect(res.status).toBe(200);
    expect(appendRows).toHaveBeenCalledOnce();
    expect(appendRows.mock.calls[0][0]).toBe("2026-05"); // monthly tab
    expect(replaceRows).toHaveBeenCalledOnce();
    expect(replaceRows.mock.calls[0][0]).toBe("Payments-2026-05");
  });

  it("prices the Legs tab from the per-trip snapshot mileage so shares equal the frozen payments", async () => {
    // Backfilled trip: its frozen snapshot mileage (7 km/L) differs from the
    // live group mileage in settings (10.5 km/L). The Legs recompute must use
    // the snapshot, so the exported shares equal the frozen trip_payments.
    const liveSettings = body.settings as CalcSettings;
    const snapshotMileage = 7;
    const snapSettings: CalcSettings = { ...liveSettings, mileageKmPerL: snapshotMileage };
    const gasPrice = body.trips[0].gasPrice;

    const legInputs = body.trips[0].legs;
    const expected = legInputs.map((leg, i) =>
      calcLeg(
        { leg: null, route: leg.route as Route, passengerCount: leg.passengerIds.length, distanceKm: leg.distanceKm, tollPhp: undefined },
        gasPrice,
        snapSettings,
        i === 0
      )
    );
    // Same computation with live mileage — proves the snapshot (not settings) is used.
    const live = legInputs.map((leg, i) =>
      calcLeg(
        { leg: null, route: leg.route as Route, passengerCount: leg.passengerIds.length, distanceKm: leg.distanceKm, tollPhp: undefined },
        gasPrice,
        liveSettings,
        i === 0
      )
    );
    expect(expected[0].passengerEach).not.toBe(live[0].passengerEach);

    // Ana's frozen payment for this trip = her share summed across both legs.
    const anaPayment = expected[0].passengerEach + expected[1].passengerEach;

    setSupa({
      tables: {
        trip_payments: [
          {
            data: [
              {
                trip_id: "t1",
                passenger_id: "p1",
                amount_php: anaPayment,
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

    const snapBody = {
      ...body,
      trips: [{ ...body.trips[0], mileageKml: snapshotMileage }],
    };
    const res = await POST(
      new Request("http://t/api/sheets/export", { method: "POST", body: JSON.stringify(snapBody) })
    );
    expect(res.status).toBe(200);

    const legRows = appendRows.mock.calls[0][1] as Array<{
      driver_share: number;
      passenger_shares: Record<string, number>;
    }>;
    expect(legRows).toHaveLength(2);
    legRows.forEach((row, i) => {
      expect(row.driver_share).toBe(expected[i].driverShare);
      expect(row.passenger_shares.Ana).toBe(expected[i].passengerEach);
    });

    // Exported Legs shares for Ana sum to her frozen Payments-tab amount.
    const anaLegsTotal = legRows.reduce((sum, r) => sum + r.passenger_shares.Ana, 0);
    const paymentsRows = replaceRows.mock.calls[0][2] as Array<{ passenger: string; amount_php: number }>;
    const anaRow = paymentsRows.find((r) => r.passenger === "Ana")!;
    expect(anaLegsTotal).toBe(anaRow.amount_php);
  });

  it("still returns ok when payments query fails (RLS)", async () => {
    setSupa({
      tables: {
        trip_payments: [{ data: null, error: { message: "denied" } }],
      },
    });
    const res = await POST(
      new Request("http://t/api/sheets/export", { method: "POST", body: JSON.stringify(body) })
    );
    expect(res.status).toBe(200);
    expect(appendRows).toHaveBeenCalledOnce();
    expect(replaceRows).not.toHaveBeenCalled();
  });
});
