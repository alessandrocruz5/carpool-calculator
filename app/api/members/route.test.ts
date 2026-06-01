import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};
const groupState: { id: string | null } = { id: "g1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

const adminEmails: { current: Record<string, string | null> } = { current: {} };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: { email: adminEmails.current[id] ?? null } },
          error: null,
        })),
      },
    },
  })),
}));

vi.mock("@/lib/auth/activeGroup", () => ({
  ACTIVE_GROUP_COOKIE: "carpool-group",
  getActiveGroupId: vi.fn(async () => groupState.id),
}));

vi.mock("@/lib/group", () => ({
  getActiveGroupId: vi.fn(async () => {
    if (groupState.id === null) throw new Error("no group");
    return groupState.id;
  }),
  requireActiveGroupId: vi.fn(async () => {
    if (groupState.id === null) {
      return {
        ok: false as const,
        response: new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      };
    }
    return { ok: true as const, groupId: groupState.id };
  }),
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
  adminEmails.current = {};
});

describe("GET /api/members", () => {
  it("returns members enriched with displayName, email, and isSelf", async () => {
    adminEmails.current = { u2: "bob@test.com" };
    setSupa({
      auth: { userId: "u1", email: "driver@test.com" },
      tables: {
        members: [{ data: [row], error: null }],
        profiles: [{ data: [{ user_id: "u2", display_name: "Bob" }], error: null }],
      },
    });
    const res = await GET();
    expect(await res.json()).toEqual([
      expect.objectContaining({
        userId: "u2",
        groupId: "g1",
        role: "passenger",
        passengerId: null,
        createdAt: "x",
        displayName: "Bob",
        email: "bob@test.com",   // fetched for all members
        isSelf: false,
      }),
    ]);
  });

  it("shows email for members with no profile instead of a raw id", async () => {
    adminEmails.current = { u2: "noprofile@test.com" };
    setSupa({
      auth: { userId: "u1", email: "driver@test.com" },
      tables: {
        members: [{ data: [row], error: null }],
        profiles: [{ data: [], error: null }],
      },
    });
    const res = await GET();
    expect((await res.json())[0]).toMatchObject({
      userId: "u2",
      displayName: null,
      email: "noprofile@test.com",
      isSelf: false,
    });
  });

  it("marks isSelf and exposes email for the current user", async () => {
    const selfRow = { ...row, user_id: "u1" };
    setSupa({
      auth: { userId: "u1", email: "me@test.com" },
      tables: {
        members: [{ data: [selfRow], error: null }],
        profiles: [{ data: [{ user_id: "u1", display_name: "Me" }], error: null }],
      },
    });
    const res = await GET();
    const body = await res.json();
    expect(body[0]).toMatchObject({
      userId: "u1",
      isSelf: true,
      email: "me@test.com",
      displayName: "Me",
    });
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
          { data: { role: "driver", passenger_id: null }, error: null },
          { data: [{ user_id: "u1" }], error: null },
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
          { data: { role: "passenger", passenger_id: null }, error: null },
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
