import { describe, it, expect } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";
import {
  isSafeRedirect,
  resolvePostConfirmRedirect,
} from "./resolvePostConfirmRedirect";

// ---------------------------------------------------------------------------
// isSafeRedirect
// ---------------------------------------------------------------------------

describe("isSafeRedirect", () => {
  it("accepts ordinary relative paths", () => {
    expect(isSafeRedirect("/")).toBe(true);
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/groups/123/trips")).toBe(true);
    expect(isSafeRedirect("/onboarding")).toBe(true);
  });

  it("rejects protocol-relative URLs (open-redirect risk)", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com/path")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("http://phish.io")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeRedirect("")).toBe(false);
  });

  it("rejects paths without leading slash", () => {
    expect(isSafeRedirect("dashboard")).toBe(false);
    expect(isSafeRedirect("evil.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePostConfirmRedirect
// ---------------------------------------------------------------------------

/** Convenience wrapper: build a mock client with an explicit members queue. */
function makeClient(memberRows: unknown[]) {
  return makeSupabase({
    tables: {
      members: [{ data: memberRows, error: null }],
    },
  }).client;
}

/** A mock client whose members query returns an error. */
function makeErrorClient() {
  return makeSupabase({
    tables: {
      members: [{ data: null, error: { message: "db error" } }],
    },
  }).client;
}

describe("resolvePostConfirmRedirect", () => {
  // ----- zero memberships (new user) ----------------------------------------

  it("routes to /onboarding when user has no group memberships", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeClient([]),
      userId: "u1",
      next: "/",
    });
    expect(result).toBe("/onboarding");
  });

  it("routes to /onboarding even when a specific next param is provided", async () => {
    // A pending-invite flow might pass ?next=/some-page; zero memberships
    // still wins — the user needs to onboard first.
    const result = await resolvePostConfirmRedirect({
      supabase: makeClient([]),
      userId: "u1",
      next: "/some-page",
    });
    expect(result).toBe("/onboarding");
  });

  // ----- one or more memberships (returning / just-invited user) ------------

  it("routes to / when user has memberships and next is /", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeClient([{ group_id: "g1" }]),
      userId: "u1",
      next: "/",
    });
    expect(result).toBe("/");
  });

  it("honours a safe next param when the user has memberships", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeClient([{ group_id: "g1" }]),
      userId: "u1",
      next: "/trips/2024-01-01",
    });
    expect(result).toBe("/trips/2024-01-01");
  });

  it("ignores an unsafe (protocol-relative) next and falls back to /", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeClient([{ group_id: "g1" }]),
      userId: "u1",
      next: "//evil.com/steal-session",
    });
    expect(result).toBe("/");
  });

  it("ignores an absolute-URL next and falls back to /", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeClient([{ group_id: "g1" }]),
      userId: "u1",
      next: "https://attacker.example/steal",
    });
    expect(result).toBe("/");
  });

  // ----- database error -------------------------------------------------------

  it("falls back to next (if safe) when the members query errors", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeErrorClient(),
      userId: "u1",
      next: "/dashboard",
    });
    expect(result).toBe("/dashboard");
  });

  it("falls back to / when the members query errors and next is unsafe", async () => {
    const result = await resolvePostConfirmRedirect({
      supabase: makeErrorClient(),
      userId: "u1",
      next: "//evil.com",
    });
    expect(result).toBe("/");
  });
});
