import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type AuthError = { name?: string; code?: string; message: string } | null;

const state: {
  exchange: AuthError;
  verify: AuthError;
  userId: string | null;
  memberships: unknown[];
} = { exchange: null, verify: null, userId: "user-1", memberships: [{ group_id: "g1" }] };

const exchangeCodeForSession = vi.fn(async (_code: string) => ({
  error: state.exchange,
}));
const verifyOtp = vi.fn(async (_args: unknown) => ({ error: state.verify }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
      verifyOtp,
      getUser: async () => ({
        data: { user: state.userId ? { id: state.userId } : null },
      }),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: () => ({
      select: () => ({
        eq: () => ({ limit: async () => ({ data: state.memberships, error: null }) }),
      }),
    }),
  })),
}));

const logWarn = vi.fn();
const logError = vi.fn();
vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: (...a: unknown[]) => logWarn(...a), error: (...a: unknown[]) => logError(...a) },
}));

import { GET } from "./route";

function get(query: string) {
  return GET(new NextRequest(`https://sabay.cc/auth/confirm${query}`));
}

/** The `?error=` code the route redirected the browser to. */
function errorCode(res: Response): string | null {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).searchParams.get("error") : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.exchange = null;
  state.verify = null;
  state.userId = "user-1";
  state.memberships = [{ group_id: "g1" }];
});

describe("GET /auth/confirm", () => {
  it("exchanges a PKCE code and redirects into the app", async () => {
    const res = await get("?code=abc123");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("verifies a token_hash link without needing the original browser", async () => {
    const res = await get("?token_hash=hash-1&type=magiclink");
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "hash-1",
    });
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("sends a brand-new user to onboarding", async () => {
    state.memberships = [];
    const res = await get("?code=abc123");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/onboarding");
  });

  // The reported bug. A missing verifier means the link was opened in a
  // different browser than the one that requested it; auth-js reports it as a
  // plain 400, so before this it was filed as `invalid` and the user was told
  // the link was mistyped — sending them to fix the wrong thing.
  describe("a missing PKCE verifier is not a bad link", () => {
    const missing = {
      name: "AuthPKCECodeVerifierMissingError",
      code: "pkce_code_verifier_not_found",
      message:
        "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared.",
    };

    it("reports wrong_browser rather than invalid", async () => {
      state.exchange = missing;
      expect(errorCode(await get("?code=abc123"))).toBe("wrong_browser");
    });

    it("recognises it by error code alone", async () => {
      state.exchange = { code: "pkce_code_verifier_not_found", message: "nope" };
      expect(errorCode(await get("?code=abc123"))).toBe("wrong_browser");
    });

    it("recognises it by message alone", async () => {
      state.exchange = { message: "Code verifier missing from storage" };
      expect(errorCode(await get("?code=abc123"))).toBe("wrong_browser");
    });

    it("logs it without escalating to Sentry", async () => {
      state.exchange = missing;
      await get("?code=abc123");
      expect(logError).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        "auth confirm failed: wrong_browser",
        expect.objectContaining({ stage: "exchange_code", grant: "code" })
      );
    });
  });

  describe("classification of the other failures", () => {
    it("maps an expired token to expired", async () => {
      state.exchange = { message: "Token has expired or is invalid" };
      expect(errorCode(await get("?code=abc123"))).toBe("expired");
    });

    it("maps an already-consumed token to used", async () => {
      state.verify = { message: "Token has already been used" };
      expect(errorCode(await get("?token_hash=h&type=email"))).toBe("used");
    });

    it("honours an error handed back on the redirect itself", async () => {
      const res = await get(
        "?error=access_denied&error_description=Email+link+is+invalid+or+has+expired"
      );
      expect(errorCode(res)).toBe("expired");
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("reports incomplete when the link carries no grant at all", async () => {
      const res = await get("");
      expect(errorCode(res)).toBe("incomplete");
      expect(logWarn).toHaveBeenCalledWith(
        "auth confirm failed: incomplete",
        expect.objectContaining({ stage: "no_grant", grant: "none" })
      );
    });

    it("treats a token_hash with no type as no grant", async () => {
      const res = await get("?token_hash=h");
      expect(verifyOtp).not.toHaveBeenCalled();
      expect(errorCode(res)).toBe("incomplete");
    });

    // The only bucket we cannot explain, so the only one that should page.
    it("escalates an unexplained rejection to error level", async () => {
      state.exchange = { message: "something we have never seen" };
      expect(errorCode(await get("?code=abc123"))).toBe("invalid");
      expect(logError).toHaveBeenCalledWith(
        "auth confirm failed: invalid",
        expect.objectContaining({ stage: "exchange_code" })
      );
    });
  });

  it("never puts the credential itself in the logs", async () => {
    state.exchange = { message: "boom" };
    await get("?code=super-secret-code");
    const logged = JSON.stringify([logWarn.mock.calls, logError.mock.calls]);
    expect(logged).not.toContain("super-secret-code");
  });
});
