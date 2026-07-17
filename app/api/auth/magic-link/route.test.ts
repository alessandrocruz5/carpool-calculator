import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabase } from "@/lib/test/supabase-mock";

type OtpResult = { error: { message: string } | null };

const supaState: {
  client: { auth: { signInWithOtp: ReturnType<typeof vi.fn> } } | null;
} = { client: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supaState.client),
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

  it("surfaces a Supabase error as a 500", async () => {
    setSupa({ error: { message: "captcha verification failed" } });
    const res = await post({ email: "ana@example.com", captchaToken: "bad" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("captcha verification failed");
  });
});
