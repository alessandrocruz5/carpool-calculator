import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeBuilder } from "@/lib/test/supabase-mock";

const authState: { userId: string | null } = { userId: "u1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () =>
        authState.userId ? { data: { claims: { sub: authState.userId } } } : { data: null }
      ),
    },
    from: vi.fn(() => makeBuilder(() => ({ data: null, error: null }))),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => makeBuilder(() => ({ data: [], error: null }))),
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { email: "u1@test.com" } },
          error: null,
        })),
      },
    },
  })),
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
}));

import { GET } from "./route";

beforeEach(() => {
  authState.userId = "u1";
  rlBlocked.value = false;
});

describe("GET /api/account/export", () => {
  it("rejects unauthenticated requests with 401", async () => {
    authState.userId = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit is exhausted", async () => {
    rlBlocked.value = true;
    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("returns a JSON download with the user's data", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/filename=/);
    const body = await res.json();
    expect(body.schema_version).toBe(1);
    expect(body.user.id).toBe("u1");
  });
});
