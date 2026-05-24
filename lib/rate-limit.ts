import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RatelimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export type RatelimiterOptions = {
  /** Number of requests allowed in the window. Defaults to 10. */
  requests?: number;
  /** Window as an Upstash duration string (e.g. "10 s", "1 m"). Defaults to "10 s". */
  window?: Parameters<typeof Ratelimit.slidingWindow>[1];
};

type Limiter = { limit: (identifier: string) => Promise<RatelimitResult> };

const NOOP_LIMITER: Limiter = {
  async limit() {
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  },
};

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cachedRedis = null;
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

/**
 * Build a rate limiter scoped by `key`. When Upstash env vars are unset, this
 * returns a no-op that always allows the request — keeps local dev working.
 */
export function ratelimiter(key: string, opts: RatelimiterOptions = {}): Limiter {
  const redis = getRedis();
  if (!redis) return NOOP_LIMITER;
  const requests = opts.requests ?? 10;
  const window = opts.window ?? "10 s";
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:${key}`,
    analytics: false,
  });
  return {
    async limit(identifier: string) {
      const r = await rl.limit(identifier);
      return {
        success: r.success,
        limit: r.limit,
        remaining: r.remaining,
        reset: r.reset,
      };
    },
  };
}

/**
 * Pick a stable identifier for rate-limiting: prefer the authenticated user id,
 * else the first IP from `x-forwarded-for`, else "anonymous".
 */
export function getIdentifier(
  req: { headers: Headers | { get(name: string): string | null } },
  userId?: string | null
): string {
  if (userId) return `user:${userId}`;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }
  return "anonymous";
}

/** Test-only: reset memoized Redis client so env changes take effect. */
export function __resetRateLimitForTests() {
  cachedRedis = undefined;
}
