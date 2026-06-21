import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.current!.client),
}));

// Rate-limit mock — pass-through by default
const rlBlocked = { value: false };
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => {
    if (rlBlocked.value) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    }
    return null;
  }),
  getIdentifier: vi.fn(() => "user:u1"),
}));

import { PATCH } from "./route";

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
  return supaState.current;
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  supaState.current = null;
  rlBlocked.value = false;
});

describe("PATCH /api/disputes/[id]", () => {
  it("rejects non-drivers with 403", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "passenger" } } });
    const res = await PATCH(
      new Request("http://t/api/disputes/d1", {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolutionNote: "ok" }),
      }),
      makeCtx("d1")
    );
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    setSupa({});
    rlBlocked.value = true;
    const res = await PATCH(
      new Request("http://t/api/disputes/d1", {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolutionNote: "ok" }),
      }),
      makeCtx("d1")
    );
    expect(res.status).toBe(429);
  });

  it("rejects invalid status", async () => {
    setSupa({});
    const res = await PATCH(
      new Request("http://t/api/disputes/d1", {
        method: "PATCH",
        body: JSON.stringify({ status: "open" }),
      }),
      makeCtx("d1")
    );
    expect(res.status).toBe(400);
  });

  it("requires resolutionNote when dismissing", async () => {
    setSupa({});
    const res = await PATCH(
      new Request("http://t/api/disputes/d1", {
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed", resolutionNote: "" }),
      }),
      makeCtx("d1")
    );
    expect(res.status).toBe(400);
  });

  it("resolves a dispute", async () => {
    const row = {
      id: "d1",
      group_id: "g1",
      trip_id: "t1",
      reporter_user_id: "u2",
      reason: "wrong amount",
      status: "resolved",
      resolution_note: "checked and fixed",
      created_at: "x",
      resolved_at: "y",
      resolved_by: "u1",
    };
    setSupa({ tables: { trip_disputes: [{ data: row, error: null }] } });
    const res = await PATCH(
      new Request("http://t/api/disputes/d1", {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolutionNote: "checked and fixed" }),
      }),
      makeCtx("d1")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("resolved");
  });
});
