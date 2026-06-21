import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

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

describe("POST /api/admin/archive-trips", () => {
  it("rejects non-drivers with 403", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "passenger" } } });
    const res = await POST(
      new Request("http://t/api/admin/archive-trips", {
        method: "POST",
        body: JSON.stringify({ olderThanDays: 30 }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid olderThanDays", async () => {
    setSupa({});
    const res = await POST(
      new Request("http://t/api/admin/archive-trips", {
        method: "POST",
        body: JSON.stringify({ olderThanDays: 0 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limited", async () => {
    setSupa({});
    rlBlocked.value = true;
    const res = await POST(
      new Request("http://t/api/admin/archive-trips", {
        method: "POST",
        body: JSON.stringify({ olderThanDays: 30 }),
      })
    );
    expect(res.status).toBe(429);
  });

  it("archives trips and returns count", async () => {
    setSupa({ rpcs: { archive_old_trips: [{ data: 5, error: null }] } });
    const res = await POST(
      new Request("http://t/api/admin/archive-trips", {
        method: "POST",
        body: JSON.stringify({ olderThanDays: 30 }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ archived: 5 });
  });
});
