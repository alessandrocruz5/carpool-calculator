import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

// Stub the admin client (email / display name enrichment) so the route runs
// in this test environment without service-role credentials.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: { users: [{ id: "u1", email: "u1@example.com" }] },
          error: null,
        })),
      },
    },
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [{ user_id: "u1", display_name: "Ana" }],
            error: null,
          }),
      }),
    }),
  }),
}));

import { GET, POST, PATCH, DELETE } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  const built = makeSupabase(opts);
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  (built.client as unknown as { rpc: typeof rpc }).rpc = rpc;
  supaState.current = built;
  return Object.assign(built, { rpc });
}

beforeEach(() => {
  supaState.current = null;
});

describe("GET /api/members", () => {
  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "passenger" } } });
    expect((await GET()).status).toBe(403);
  });

  it("returns mapped roster with self flag", async () => {
    setSupa({
      tables: {
        members: [
          { data: { group_id: "g1" }, error: null },
          { data: { role: "driver" }, error: null },
          {
            data: [
              { user_id: "u1", role: "both", created_at: "x" },
              { user_id: "u2", role: "passenger", created_at: "y" },
            ],
            error: null,
          },
        ],
      },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      userId: string;
      isSelf: boolean;
      email: string | null;
      displayName: string | null;
    }>;
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      userId: "u1",
      isSelf: true,
      email: "u1@example.com",
      displayName: "Ana",
    });
    expect(body[1]).toMatchObject({ userId: "u2", isSelf: false });
  });
});

describe("POST /api/members", () => {
  it("rejects missing email and invalid role", async () => {
    setSupa({});
    expect(
      (
        await POST(
          new Request("http://t/api/members", {
            method: "POST",
            body: JSON.stringify({ role: "driver" }),
          })
        )
      ).status
    ).toBe(400);
    setSupa({});
    expect(
      (
        await POST(
          new Request("http://t/api/members", {
            method: "POST",
            body: JSON.stringify({ email: "x@y.z", role: "viewer" }),
          })
        )
      ).status
    ).toBe(400);
  });

  it("calls link_member_by_email RPC", async () => {
    const supa = setSupa({});
    const res = await POST(
      new Request("http://t/api/members", {
        method: "POST",
        body: JSON.stringify({ email: "ana@example.com", role: "both" }),
      })
    );
    expect(res.status).toBe(200);
    expect(supa.rpc).toHaveBeenCalledWith("link_member_by_email", {
      p_group_id: "g1",
      p_email: "ana@example.com",
      p_role: "both",
    });
  });

  it("denies non-driver", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "passenger" } } });
    const res = await POST(
      new Request("http://t/api/members", {
        method: "POST",
        body: JSON.stringify({ email: "x@y.z", role: "driver" }),
      })
    );
    expect(res.status).toBe(403);
  });
});

// Every .from("members") shifts the queue, including the two lookups that
// requireActiveGroupId + requireGroupDriver do before the route's own
// listing query. These helpers pad the queue accordingly.
const AUTH_MEMBER_ROWS: Array<{ data: unknown; error: null }> = [
  { data: { group_id: "g1" }, error: null }, // requireActiveGroupId
  { data: { role: "driver" }, error: null }, // requireGroupDriver
];

function membersTable(...rest: Array<{ data: unknown; error: null }>) {
  return { members: [...AUTH_MEMBER_ROWS, ...rest] };
}

describe("PATCH /api/members", () => {
  it("rejects unknown member", async () => {
    setSupa({
      tables: membersTable({ data: [], error: null }),
    });
    const res = await PATCH(
      new Request("http://t/api/members", {
        method: "PATCH",
        body: JSON.stringify({ userId: "uX", role: "driver" }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("prevents demoting the last driver", async () => {
    setSupa({
      tables: membersTable({
        data: [
          { user_id: "u1", role: "driver" },
          { user_id: "u2", role: "passenger" },
        ],
        error: null,
      }),
    });
    const res = await PATCH(
      new Request("http://t/api/members", {
        method: "PATCH",
        body: JSON.stringify({ userId: "u1", role: "passenger" }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("last driver"),
    });
  });

  it("updates role when another driver exists", async () => {
    setSupa({
      tables: membersTable(
        {
          data: [
            { user_id: "u1", role: "driver" },
            { user_id: "u2", role: "driver" },
          ],
          error: null,
        },
        { data: null, error: null }
      ),
    });
    const res = await PATCH(
      new Request("http://t/api/members", {
        method: "PATCH",
        body: JSON.stringify({ userId: "u2", role: "passenger" }),
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/members", () => {
  it("requires userId", async () => {
    setSupa({});
    const res = await DELETE(new Request("http://t/api/members", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });

  it("prevents removing the last driver", async () => {
    setSupa({
      tables: membersTable({
        data: [
          { user_id: "u1", role: "driver" },
          { user_id: "u2", role: "passenger" },
        ],
        error: null,
      }),
    });
    const res = await DELETE(
      new Request("http://t/api/members?userId=u1", { method: "DELETE" })
    );
    expect(res.status).toBe(400);
  });

  it("removes a passenger", async () => {
    setSupa({
      tables: membersTable(
        {
          data: [
            { user_id: "u1", role: "driver" },
            { user_id: "u2", role: "passenger" },
          ],
          error: null,
        },
        { data: null, error: null }
      ),
    });
    const res = await DELETE(
      new Request("http://t/api/members?userId=u2", { method: "DELETE" })
    );
    expect(res.status).toBe(200);
  });
});
