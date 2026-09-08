import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const logError = vi.fn();
vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => logError(...a) },
}));

import { resolveSiteUrl } from "./siteUrl";

const original = process.env.NEXT_PUBLIC_SITE_URL;

function req(url: string) {
  return new Request(url, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("resolveSiteUrl", () => {
  it("falls back to the request origin when unset", () => {
    expect(resolveSiteUrl(req("https://www.sabay.cc/api/auth/magic-link"))).toBe(
      "https://www.sabay.cc"
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it("prefers the configured value over the request origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.sabay.cc";
    expect(resolveSiteUrl(req("https://www.sabay.cc/api/auth/magic-link"))).toBe(
      "https://www.sabay.cc"
    );
  });

  // A trailing slash used to concatenate into `https://host//auth/confirm`.
  it("normalises away a trailing slash or stray path", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.sabay.cc/";
    expect(resolveSiteUrl(req("https://www.sabay.cc/x"))).toBe(
      "https://www.sabay.cc"
    );
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.sabay.cc/app";
    expect(resolveSiteUrl(req("https://www.sabay.cc/x"))).toBe(
      "https://www.sabay.cc"
    );
  });

  // The bug this exists to catch: the app moved to a custom domain and the
  // env var stayed on the old *.vercel.app host, so every emailed link came
  // back to an origin holding no PKCE verifier cookie.
  it("escalates when the configured origin differs from the request origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL =
      "https://carpool-calculator-nine.vercel.app";
    const result = resolveSiteUrl(req("https://www.sabay.cc/api/auth/magic-link"));

    // Still returns the operator-controlled value — the Host header does not
    // get to redirect sign-in links on its own.
    expect(result).toBe("https://carpool-calculator-nine.vercel.app");
    expect(logError).toHaveBeenCalledWith(
      "emailed links point at a different origin than the request",
      expect.objectContaining({
        configuredOrigin: "https://carpool-calculator-nine.vercel.app",
        requestOrigin: "https://www.sabay.cc",
      })
    );
  });

  it("treats a differing subdomain as a mismatch", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://sabay.cc";
    resolveSiteUrl(req("https://www.sabay.cc/api/auth/magic-link"));
    expect(logError).toHaveBeenCalledOnce();
  });

  it("reports a malformed value and falls back rather than emitting a broken link", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "www.sabay.cc";
    expect(resolveSiteUrl(req("https://www.sabay.cc/x"))).toBe(
      "https://www.sabay.cc"
    );
    expect(logError).toHaveBeenCalledWith(
      "NEXT_PUBLIC_SITE_URL is not a valid absolute URL",
      expect.objectContaining({ configured: "www.sabay.cc" })
    );
  });
});
