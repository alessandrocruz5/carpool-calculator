import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { makeSupabase } from "@/lib/test/supabase-mock";

type OtpResult = { error: { message: string; status?: number } | null };

const supaState: {
  client: { auth: { signInWithOtp: ReturnType<typeof vi.fn> } } | null;
} = { client: null };

// Controls whether the (mocked) rate limiter short-circuits with a 429.
const rlState: { limited: NextResponse | null } = { limited: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.client),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => rlState.limited),
}));

import { POST } from "./route";

/** Build a mock client whose signInWithOtp resolves to `result`. */
function setSupa(result: OtpResult = { error: null }) {
  const base = makeSupabase({});
  const signInWithOtp = vi.fn(async (_args: unknown) => result);
  const client = {
    ...base.client,
    auth: { ...base.client.auth, signInWithOtp },
  };
  supaState.client = client;
  return signInWithOtp;
}

function post(body: unknown) {
  return POST(
    new Request("http://t/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  supaState.client = null;
  rlState.limited = null;
});

describe("POST /api/auth/magic-link", () => {
  it("rejects an invalid email before touching Supabase", async () => {
    const otp = setSupa();
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(otp).not.toHaveBeenCalled();
  });

  it("forwards the captchaToken to signInWithOtp", async () => {
    const otp = setSupa();
    const res = await post({ email: "Ana@Example.com", captchaToken: "tok-123" });
    expect(res.status).toBe(200);
    expect(otp).toHaveBeenCalledTimes(1);
    const arg = otp.mock.calls[0][0] as {
      email: string;
      options: { captchaToken?: string; emailRedirectTo: string };
    };
    // email is normalized to lowercase, token is passed through untouched
    expect(arg.email).toBe("ana@example.com");
    expect(arg.options.captchaToken).toBe("tok-123");
    expect(arg.options.emailRedirectTo).toMatch(/\/auth\/confirm$/);
  });

  it("omits the token (undefined) when the client sends none", async () => {
    const otp = setSupa();
    const res = await post({ email: "ana@example.com" });
    expect(res.status).toBe(200);
    const arg = otp.mock.calls[0][0] as {
      options: { captchaToken?: string };
    };
    expect(arg.options.captchaToken).toBeUndefined();
  });

  it("keeps the rate limit: a limited request 429s before Supabase", async () => {
    const otp = setSupa();
    rlState.limited = NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const res = await post({ email: "ana@example.com", captchaToken: "tok" });
    expect(res.status).toBe(429);
    expect(otp).not.toHaveBeenCalled();
  });

  it("forwards a Supabase 4xx (e.g. rejected captcha) instead of 500", async () => {
    setSupa({ error: { message: "captcha protection: invalid token", status: 400 } });
    const res = await post({ email: "ana@example.com", captchaToken: "bad" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("captcha protection: invalid token");
  });

  it("maps a status-less Supabase error to a 500", async () => {
    setSupa({ error: { message: "boom" } });
    const res = await post({ email: "ana@example.com" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
