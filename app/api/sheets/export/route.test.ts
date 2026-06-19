import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

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
