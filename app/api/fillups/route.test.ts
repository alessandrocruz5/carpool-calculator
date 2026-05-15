import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, POST, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

const fillupRow = {
  id: "f1",
  date: "2026-05-13",
  liters: 30,
  total_php: 2000,
  odometer_km: 10000,
  created_at: "x",
};

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/fillups", () => {
  it("maps fillup rows", async () => {
    setSupa({ tables: { fillups: [{ data: [fillupRow], error: null }] } });
    const res = await GET();
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "f1", liters: 30, totalPhp: 2000, odometerKm: 10000 });
  });

  it("returns empty under RLS", async () => {
    setSupa({ tables: { fillups: [{ data: [], error: null }] } });
    const res = await GET();
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /api/fillups", () => {
  it("inserts as driver", async () => {
    setSupa({ tables: { fillups: [{ data: fillupRow, error: null }] } });
    const res = await POST(
      new Request("http://t/api/fillups", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-13", liters: 30, totalPhp: 2000, odometerKm: 10000 }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await POST(
      new Request("http://t/api/fillups", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-13", liters: 30, totalPhp: 2000, odometerKm: 10000 }),
      })
    );
    expect(res.status).toBe(403);
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
