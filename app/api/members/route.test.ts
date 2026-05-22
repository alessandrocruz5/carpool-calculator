import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};
const groupState: { id: string | null } = { id: "g1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

vi.mock("@/lib/auth/activeGroup", () => ({
  ACTIVE_GROUP_COOKIE: "carpool-group",
  getActiveGroupId: vi.fn(async () => groupState.id),
}));

import { GET, POST, PATCH, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

const row = {
  group_id: "g1",
  user_id: "u2",
  role: "passenger",
  passenger_id: null,
  created_at: "x",
};

beforeEach(() => {
  supaState.current = null;
  groupState.id = "g1";
});

describe("GET /api/members", () => {
  it("returns mapped members of the active group", async () => {
    setSupa({ tables: { members: [{ data: [row], error: null }] } });
    const res = await GET();
    expect(await res.json()).toEqual([
      {
        userId: "u2",
        groupId: "g1",
        role: "passenger",
        passengerId: null,
        createdAt: "x",
      },
    ]);
  });

  it("returns empty when no active group", async () => {
    groupState.id = null;
    setSupa({});
    expect(await (await GET()).json()).toEqual([]);
  });
});

describe("POST /api/members", () => {
  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "rider" } } });
    const res = await POST(
      new Request("http://t/api/members", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", role: "passenger" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("invites via link_member_by_email with trimmed email", async () => {
    const supa = setSupa({
      rpcs: { link_member_by_email: [{ data: null, error: null }] },
    });
    const res = await POST(
      new Request("http://t/api/members", {
        method: "POST",
        body: JSON.stringify({ email: " a@b.com ", role: "both" }),
      })
    );
    expect(res.status).toBe(200);
    expect(supa.rpcCalls()[0]).toEqual({
      name: "link_member_by_email",
      args: { p_group_id: "g1", p_email: "a@b.com", p_role: "both" },
    });
  });
});

describe("PATCH /api/members", () => {
  it("changes role as driver", async () => {
    setSupa({
      tables: {
        members: [
          { data: { role: "driver" }, error: null },
          { data: { ...row, role: "both" }, error: null },
        ],
      },
    });
    const res = await PATCH(
      new Request("http://t/api/members", {
        method: "PATCH",
        body: JSON.stringify({ userId: "u2", role: "both" }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe("both");
  });
});

describe("DELETE /api/members", () => {
  it("requires userId", async () => {
    setSupa({});
    expect(
      (await DELETE(new Request("http://t/api/members", { method: "DELETE" })))
        .status
    ).toBe(400);
  });

  it("blocks removing the last driver", async () => {
    setSupa({
      tables: {
        members: [
          { data: { role: "driver" }, error: null },
          { data: [{ user_id: "u1", role: "driver" }], error: null },
        ],
      },
    });
    const res = await DELETE(
      new Request("http://t/api/members?userId=u1", { method: "DELETE" })
    );
    expect(res.status).toBe(400);
  });

  it("removes a non-last member", async () => {
    setSupa({
      tables: {
        members: [
          { data: { role: "driver" }, error: null },
          {
            data: [
              { user_id: "u1", role: "driver" },
              { user_id: "u2", role: "passenger" },
            ],
            error: null,
          },
          { data: null, error: null },
        ],
      },
    });
    const res = await DELETE(
      new Request("http://t/api/members?userId=u2", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
  });
});
