import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabase } from "@/lib/test/supabase-mock";

const supaState: { current: ReturnType<typeof makeSupabase> | null } = {
  current: null,
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => supaState.current!.client),
}));

import { updateSession } from "./middleware";

beforeEach(() => {
  supaState.current = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon";
});

function setSupa(opts: Parameters<typeof makeSupabase>[0]) {
  supaState.current = makeSupabase(opts);
}

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(`http://localhost${pathname}`, {
    headers: Object.keys(headers).length ? headers : undefined,
  });
}

// NextResponse.next({ request: { headers } }) encodes the overridden request
// headers back onto the response as `x-middleware-request-<name>`; read them
// to assert what the middleware forwards to downstream RSCs.
function forwardedHeader(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

describe("updateSession /admin gate", () => {
  it("redirects unauthenticated users away from /admin to /auth/login", async () => {
    setSupa({ auth: { userId: null } });
    const res = await updateSession(makeRequest("/admin/members"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
  });

  it("redirects to /groups when admin route is hit without active group cookie", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "driver" } } });
    const res = await updateSession(makeRequest("/admin/members"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/groups");
  });

  it("redirects passengers from /admin/* to /?error=forbidden", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [
          { data: { role: "passenger" }, error: null },
          { data: { role: "passenger" }, error: null },
        ],
      },
    });
    const res = await updateSession(
      makeRequest("/admin/members", { "carpool-group": "g1" }),
    );
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/");
    expect(location).toContain("error=forbidden");
  });

  it("redirects users with no membership in the active group to /?error=forbidden", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
    });
    const res = await updateSession(
      makeRequest("/admin/members", { "carpool-group": "g1" }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("error=forbidden");
  });

  it("allows drivers into /admin/*", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [
          { data: { role: "driver" }, error: null },
          { data: { role: "driver" }, error: null },
        ],
      },
    });
    const res = await updateSession(
      makeRequest("/admin/members", { "carpool-group": "g1" }),
    );
    // No redirect — middleware returns NextResponse.next (status 200).
    expect(res.status).toBe(200);
  });

  it("allows 'both' role into /admin/*", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [
          { data: { role: "both" }, error: null },
          { data: { role: "both" }, error: null },
        ],
      },
    });
    const res = await updateSession(
      makeRequest("/admin/members", { "carpool-group": "g1" }),
    );
    expect(res.status).toBe(200);
  });

  it("scopes the admin role lookup to the active group", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [
          { data: { role: "driver" }, error: null },
          { data: { role: "driver" }, error: null },
        ],
      },
    });
    await updateSession(
      makeRequest("/admin/members", { "carpool-group": "g-active" }),
    );
    const calls = supaState.current!.callsFor("members");
    // Second members lookup is the admin gate; assert it filtered by group.
    const adminCallChain = calls[1] ?? [];
    const eqCalls = adminCallChain
      .filter((c) => c.method === "eq")
      .map((c) => c.args);
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["user_id", "u1"],
        ["group_id", "g-active"],
      ]),
    );
  });

  it("does not redirect to /onboarding when user has an active group cookie", async () => {
    // Regression: without group_id scoping the member query, maybeSingle()
    // failed for multi-group users (multiple rows), making memberExists=false.
    // Middleware redirected / → /onboarding; onboarding saw memberships and
    // redirected back to /, creating an infinite loop.
    setSupa({ auth: { userId: "u1", member: { role: "driver" } } });
    const res = await updateSession(
      makeRequest("/", { "carpool-group": "g1" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location") ?? "").not.toContain("onboarding");
  });

  it("redirects / to /onboarding when user has zero group memberships", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
    });
    const res = await updateSession(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/onboarding");
  });

  it("does not gate non-admin routes on driver role", async () => {
    setSupa({
      auth: { userId: "u1" },
      tables: {
        members: [{ data: { role: "passenger" }, error: null }],
      },
    });
    const res = await updateSession(
      makeRequest("/log", { "carpool-group": "g1" }),
    );
    expect(res.status).toBe(200);
  });
});

describe("updateSession public landing at /", () => {
  it("lets a signed-out visitor stay on / and flags the bare landing", async () => {
    setSupa({ auth: { userId: null } });
    const res = await updateSession(makeRequest("/"));
    // No redirect to login.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // Layout reads x-landing to render without the authed shell.
    expect(forwardedHeader(res, "x-landing")).toBe("1");
    // No user identity is forwarded for an anonymous visitor.
    expect(forwardedHeader(res, "x-user-id")).toBeNull();
  });

  it("strips a spoofed x-user-id on the signed-out landing", async () => {
    setSupa({ auth: { userId: null } });
    const res = await updateSession(
      makeRequest("/", {}, { "x-user-id": "attacker" }),
    );
    expect(res.status).toBe(200);
    // The spoofed header must not survive — page.tsx would otherwise treat the
    // visitor as authenticated and render the app home instead of the landing.
    expect(forwardedHeader(res, "x-user-id")).toBeNull();
    expect(forwardedHeader(res, "x-landing")).toBe("1");
  });

  it("forwards x-user-id and no x-landing for an authed user on /", async () => {
    setSupa({ auth: { userId: "u1", member: { role: "driver" } } });
    const res = await updateSession(
      makeRequest("/", { "carpool-group": "g1" }),
    );
    expect(res.status).toBe(200);
    expect(forwardedHeader(res, "x-user-id")).toBe("u1");
    // The authed home must never render as the bare landing.
    expect(forwardedHeader(res, "x-landing")).toBeNull();
  });

  it("still redirects signed-out users away from other protected paths", async () => {
    setSupa({ auth: { userId: null } });
    const res = await updateSession(makeRequest("/log"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
  });
});
