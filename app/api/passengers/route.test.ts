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

const row = { id: "p1", name: "Ana", active: true, created_at: "x" };

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/passengers", () => {
  it("returns mapped rows", async () => {
    setSupa({ tables: { passengers: [{ data: [row], error: null }] } });
    const res = await GET();
    expect(await res.json()).toEqual([{ id: "p1", name: "Ana", active: true }]);
  });

  it("empty under RLS", async () => {
    setSupa({ tables: { passengers: [{ data: [], error: null }] } });
    expect(await (await GET()).json()).toEqual([]);
  });
});

describe("POST /api/passengers", () => {
  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await POST(
      new Request("http://t/api/passengers", { method: "POST", body: JSON.stringify({ name: "X" }) })
    );
    expect(res.status).toBe(403);
  });

  it("inserts trimmed name as driver", async () => {
    const supa = setSupa({ tables: { passengers: [{ data: row, error: null }] } });
    const res = await POST(
      new Request("http://t/api/passengers", {
        method: "POST",
        body: JSON.stringify({ name: " Ana " }),
      })
    );
    expect(res.status).toBe(200);
    const insert = supa.callsFor("passengers")[0].find((c) => c.method === "insert");
    expect((insert!.args[0] as { name: string }).name).toBe("Ana");
  });
});

describe("PATCH /api/passengers", () => {
  it("updates active flag as driver", async () => {
    setSupa({ tables: { passengers: [{ data: { ...row, active: false }, error: null }] } });
    const res = await PATCH(
      new Request("http://t/api/passengers", {
        method: "PATCH",
        body: JSON.stringify({ id: "p1", active: false }),
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/passengers", () => {
  it("requires id", async () => {
    setSupa({});
    expect(
      (await DELETE(new Request("http://t/api/passengers", { method: "DELETE" }))).status
    ).toBe(400);
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await DELETE(
      new Request("http://t/api/passengers?id=p1", { method: "DELETE" })
    );
    expect(res.status).toBe(403);
  });
});
