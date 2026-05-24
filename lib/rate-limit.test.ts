import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getIdentifier,
  ratelimiter,
  __resetRateLimitForTests,
} from "./rate-limit";

function makeReq(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

describe("getIdentifier", () => {
  it("prefers authenticated user id", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    expect(getIdentifier(req, "user-abc")).toBe("user:user-abc");
  });

  it("falls back to first x-forwarded-for IP when no user id", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(getIdentifier(req)).toBe("ip:1.2.3.4");
  });

  it("trims whitespace around the first forwarded IP", () => {
    const req = makeReq({ "x-forwarded-for": "  5.6.7.8 ,  9.9.9.9" });
    expect(getIdentifier(req)).toBe("ip:5.6.7.8");
  });

  it("returns 'anonymous' when neither user id nor xff is present", () => {
    expect(getIdentifier(makeReq({}))).toBe("anonymous");
  });

  it("treats empty user id as missing", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4" });
    expect(getIdentifier(req, "")).toBe("ip:1.2.3.4");
    expect(getIdentifier(req, null)).toBe("ip:1.2.3.4");
  });
});

describe("ratelimiter no-op fallback", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimitForTests();
  });

  afterEach(() => {
    if (originalUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    __resetRateLimitForTests();
  });

  it("allows every request when env vars are unset", async () => {
    const rl = ratelimiter("test");
    for (let i = 0; i < 25; i++) {
      const r = await rl.limit("user:anyone");
      expect(r.success).toBe(true);
    }
  });

  it("still no-ops when only one of the two env vars is set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    __resetRateLimitForTests();
    const rl = ratelimiter("partial");
    const r = await rl.limit("user:x");
    expect(r.success).toBe(true);
  });
});
