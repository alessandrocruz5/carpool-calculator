import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

// next/headers is shimmed (vitest.config alias), so setActiveGroupCookie's
// res.cookies.set call still resolves but is a no-op for the cookie store.
import { GET, POST, PUT, PATCH, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  const built = makeSupabase(opts);
  // Attach an rpc spy onto the same client object so route code can call
  // supabase.rpc(...) — the makeSupabase factory doesn't add it by default.
  const rpcImpl = vi.fn(async () => ({ data: null as unknown, error: null }));
  (built.client as unknown as { rpc: typeof rpcImpl }).rpc = rpcImpl;
  supaState.current = built;
  return Object.assign(built, { rpc: rpcImpl });
}

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/groups", () => {
  it("denies unauthenticated requests", async () => {
    setSupa({ auth: { userId: null } });
    expect((await GET()).status).toBe(401);
  });

  it("returns the caller's memberships with role and ownership flags", async () => {
    setSupa({
      tables: {
        members: [
          {
            data: [
              {
                group_id: "g1",
                role: "both",
                groups: { id: "g1", name: "Crew", owner_user_id: "u1" },
              },
              {
                group_id: "g2",
                role: "passenger",
                groups: { id: "g2", name: "Other", owner_user_id: "u9" },
              },
            ],
            error: null,
          },
        ],
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      groups: Array<{ id: string; isOwner: boolean; role: string }>;
    };
    expect(body.groups).toHaveLength(2);
    expect(body.groups[0]).toMatchObject({ id: "g1", role: "both", isOwner: true });
    expect(body.groups[1]).toMatchObject({ id: "g2", role: "passenger", isOwner: false });
  });
});

describe("POST /api/groups", () => {
  it("requires a name", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/groups", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("calls create_group RPC and returns the new id", async () => {
    const supa = setSupa({});
    supa.rpc.mockResolvedValueOnce({ data: "g-new", error: null });
    const res = await POST(
      new Request("http://t/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: " Squad " }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "g-new", name: "Squad" });
    expect(supa.rpc).toHaveBeenCalledWith("create_group", { p_name: "Squad" });
  });

  it("denies unauthenticated requests", async () => {
    setSupa({ auth: { userId: null } });
    const res = await POST(
      new Request("http://t/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: "X" }),
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/groups", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await PUT(
      new Request("http://t/api/groups", {
        method: "PUT",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("rejects switching to a group the caller isn't a member of", async () => {
    setSupa({
      tables: {
        members: [{ data: null, error: null }],
      },
    });
    const res = await PUT(
      new Request("http://t/api/groups", {
        method: "PUT",
        body: JSON.stringify({ id: "g999" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("switches the active group when membership exists", async () => {
    setSupa({
      tables: {
        members: [{ data: { group_id: "g2" }, error: null }],
      },
    });
    const res = await PUT(
      new Request("http://t/api/groups", {
        method: "PUT",
        body: JSON.stringify({ id: "g2" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, activeId: "g2" });
  });
});

describe("PATCH /api/groups", () => {
  it("requires id and name", async () => {
    setSupa({});
    expect(
      (
        await PATCH(
          new Request("http://t/api/groups", {
            method: "PATCH",
            body: JSON.stringify({ name: "x" }),
          })
        )
      ).status
    ).toBe(400);
    setSupa({});
    expect(
      (
        await PATCH(
          new Request("http://t/api/groups", {
            method: "PATCH",
            body: JSON.stringify({ id: "g1" }),
          })
        )
      ).status
    ).toBe(400);
  });

  it("delegates to rename_group RPC", async () => {
    const supa = setSupa({});
    const res = await PATCH(
      new Request("http://t/api/groups", {
        method: "PATCH",
        body: JSON.stringify({ id: "g1", name: " Newname " }),
      })
    );
    expect(res.status).toBe(200);
    expect(supa.rpc).toHaveBeenCalledWith("rename_group", {
      p_group_id: "g1",
      p_name: "Newname",
    });
  });
});

describe("DELETE /api/groups", () => {
  it("requires id", async () => {
    setSupa({});
    const res = await DELETE(new Request("http://t/api/groups", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });

  it("forbids non-owner", async () => {
    setSupa({
      tables: {
        groups: [{ data: { owner_user_id: "u9" }, error: null }],
      },
    });
    const res = await DELETE(
      new Request("http://t/api/groups?id=g1", { method: "DELETE" })
    );
    expect(res.status).toBe(403);
  });

  it("404s when the group doesn't exist", async () => {
    setSupa({
      tables: { groups: [{ data: null, error: null }] },
    });
    const res = await DELETE(
      new Request("http://t/api/groups?id=g1", { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });

  it("deletes when owner", async () => {
    setSupa({
      tables: {
        groups: [
          { data: { owner_user_id: "u1" }, error: null },
          { data: null, error: null }, // final delete
        ],
      },
    });
    const res = await DELETE(
      new Request("http://t/api/groups?id=g1", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
  });
});
