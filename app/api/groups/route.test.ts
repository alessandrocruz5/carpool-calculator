import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

import { GET, POST, PATCH, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

const row = { id: "g1", name: "Trip", owner_user_id: "u1", created_at: "x" };

// Row returned by the members+groups join in GET /api/groups
const memberWithGroup = {
  group_id: "g1",
  role: "driver",
  groups: { id: "g1", name: "Trip", owner_user_id: "u1", created_at: "x" },
};

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/groups", () => {
  it("returns mapped rows", async () => {
    setSupa({ tables: { members: [{ data: [memberWithGroup], error: null }] } });
    const res = await GET();
    expect(await res.json()).toEqual([
      {
        id: "g1",
        name: "Trip",
        ownerUserId: "u1",
        createdAt: "x",
        role: "driver",
        isOwner: true,   // owner_user_id "u1" === default auth userId "u1"
        isActive: false, // no cookie in test env
      },
    ]);
  });

  it("empty under RLS", async () => {
    setSupa({ tables: { members: [{ data: [], error: null }] } });
    expect(await (await GET()).json()).toEqual([]);
  });
});

describe("POST /api/groups", () => {
  it("rejects unauthenticated", async () => {
    setSupa({ auth: { userId: null } });
    const res = await POST(
      new Request("http://t/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: "X" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("requires a name", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: "   " }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates via create_group RPC with trimmed name", async () => {
    const supa = setSupa({
      rpcs: { create_group: [{ data: "g1", error: null }] },
      tables: { groups: [{ data: row, error: null }] },
    });
    const res = await POST(
      new Request("http://t/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: " Trip " }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "g1",
      name: "Trip",
      ownerUserId: "u1",
      createdAt: "x",
    });
    expect(supa.rpcCalls()[0]).toEqual({
      name: "create_group",
      args: { p_name: "Trip" },
    });
  });
});

describe("PATCH /api/groups", () => {
  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await PATCH(
      new Request("http://t/api/groups", {
        method: "PATCH",
        body: JSON.stringify({ id: "g1", name: "New" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("renames as driver", async () => {
    setSupa({ tables: { groups: [{ data: { ...row, name: "New" }, error: null }] } });
    const res = await PATCH(
      new Request("http://t/api/groups", {
        method: "PATCH",
        body: JSON.stringify({ id: "g1", name: "New" }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("New");
  });
});

describe("DELETE /api/groups", () => {
  it("requires id", async () => {
    setSupa({});
    expect(
      (await DELETE(new Request("http://t/api/groups", { method: "DELETE" })))
        .status
    ).toBe(400);
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await DELETE(
      new Request("http://t/api/groups?id=g1", { method: "DELETE" })
    );
    expect(res.status).toBe(403);
  });
});
