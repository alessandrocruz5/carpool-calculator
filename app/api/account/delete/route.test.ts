import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeBuilder } from "@/lib/test/supabase-mock";

// Auth state for the user-scoped client
const authState: { userId: string | null } = { userId: "u1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () =>
        authState.userId ? { data: { claims: { sub: authState.userId } } } : { data: null }
      ),
      signOut: vi.fn(async () => ({})),
    },
    from: vi.fn(() => makeBuilder(() => ({ data: null, error: null }))),
  })),
}));

// Shared state for the admin client behavior
const adminGroups: unknown[] = [];
const adminMemberCount: { value: number } = { value: 0 };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "groups") {
        return makeBuilder(() => ({ data: adminGroups, error: null }));
      }
      if (table === "members") {
        // Return count: 0 by default; tests override via adminMemberCount
        return makeBuilder(() => ({
          data: null,
          error: null,
          count: adminMemberCount.value,
        }));
      }
      return makeBuilder(() => ({ data: null, error: null }));
    }),
    auth: {
      admin: {
        deleteUser: vi.fn(async () => ({ data: null, error: null })),
      },
    },
  })),
}));

// Mock Sentry to avoid import issues
vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
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

import { POST } from "./route";

beforeEach(() => {
  authState.userId = "u1";
  adminGroups.length = 0;
  adminMemberCount.value = 0;
  rlBlocked.value = false;
});

describe("POST /api/account/delete", () => {
  it("rejects unauthenticated requests with 401", async () => {
    authState.userId = null;
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit is exhausted", async () => {
    rlBlocked.value = true;
    const res = await POST();
    expect(res.status).toBe(429);
  });

  it("blocks deletion when user is sole owner of a group with other members", async () => {
    adminGroups.push({ id: "g1", name: "My Group" });
    adminMemberCount.value = 2;
    const res = await POST();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("sole_owner_with_members");
  });

  it("deletes account when user owns no groups", async () => {
    // adminGroups is empty → no sole-owner check → proceeds to delete
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
