import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

const rlBlocked = { value: false };
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () =>
    rlBlocked.value
      ? new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      : null
  ),
  getIdentifier: vi.fn(() => "user:u1"),
}));

import { POST } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

beforeEach(() => {
  supaState.current = null;
  rlBlocked.value = false;
});

describe("POST /api/groups/switch", () => {
  it("rejects unauthenticated", async () => {
    setSupa({ auth: { userId: null } });
    const res = await POST(
      new Request("http://t/api/groups/switch", {
        method: "POST",
        body: JSON.stringify({ groupId: "g1" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("requires groupId", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/groups/switch", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("denies non-members", async () => {
    setSupa({ tables: { members: [{ data: null, error: null }] } });
    const res = await POST(
      new Request("http://t/api/groups/switch", {
        method: "POST",
        body: JSON.stringify({ groupId: "g1" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("sets the carpool-group cookie for a member", async () => {
    setSupa({ tables: { members: [{ data: { user_id: "u1" }, error: null }] } });
    const res = await POST(
      new Request("http://t/api/groups/switch", {
        method: "POST",
        body: JSON.stringify({ groupId: "g1" }),
      })
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get("carpool-group")?.value).toBe("g1");
  });

  it("returns 429 when rate limited", async () => {
    setSupa({});
    rlBlocked.value = true;
    const res = await POST(
      new Request("http://t/api/groups/switch", {
        method: "POST",
        body: JSON.stringify({ groupId: "g1" }),
      })
    );
    expect(res.status).toBe(429);
  });
});
