import { vi } from "vitest";

export type QueryResult = { data?: unknown; error?: unknown };

/**
 * Builds a chainable supabase query stub. Every chained method (.select, .eq, .order, etc.)
 * returns the same builder, so callers can compose arbitrary chains. Terminal awaits go
 * through `then`; `.single()` / `.maybeSingle()` also resolve to the same configured result.
 */
export interface BuilderCall {
  method: string;
  args: unknown[];
}

export function makeBuilder(getResult: () => QueryResult, calls: BuilderCall[] = []) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "then") {
        return (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(getResult()).then(resolve, reject);
      }
      if (prop === "single" || prop === "maybeSingle") {
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return Promise.resolve(getResult());
        };
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);
  return proxy;
}

export interface AuthState {
  /** when null/undefined, getClaims returns no user (unauthenticated) */
  userId?: string | null;
  /** role row returned for the members lookup. null = not a member */
  member?: { role: "driver" | "rider" } | null;
}

/**
 * Build a mock supabase client. Provide a per-table queue of results; each call to
 * `from('foo')` shifts the next entry. If a queue runs out, `{ data: null, error: null }`
 * is returned. The `members` table is auto-handled from `auth.member` unless overridden.
 */
export function makeSupabase(opts: {
  auth?: AuthState;
  tables?: Record<string, QueryResult[]>;
}) {
  const queues: Record<string, QueryResult[]> = { ...(opts.tables ?? {}) };
  const auth = opts.auth ?? { userId: "u1", member: { role: "driver" } };

  if (!queues.members) {
    // requireUser issues a single members lookup per request; default to authState
    queues.members = [{ data: auth.member ?? null, error: null }];
  }

  const callLog: Record<string, BuilderCall[][]> = {};

  const fromMock = vi.fn((table: string) => {
    const calls: BuilderCall[] = [];
    (callLog[table] ||= []).push(calls);
    return makeBuilder(() => {
      const q = queues[table];
      if (!q || q.length === 0) return { data: null, error: null };
      return q.shift()!;
    }, calls);
  });

  const getClaims = vi.fn(async () => {
    if (auth.userId == null) return { data: null };
    return { data: { claims: { sub: auth.userId } } };
  });

  return {
    client: {
      auth: { getClaims },
      from: fromMock,
    },
    fromMock,
    getClaims,
    /** push a result onto a table's queue (after creation) */
    enqueue(table: string, result: QueryResult) {
      (queues[table] ||= []).push(result);
    },
    /** remaining queued results for a table (for assertions) */
    remaining(table: string) {
      return queues[table]?.length ?? 0;
    },
    /** chained method calls grouped per from() invocation, for assertions */
    callsFor(table: string): BuilderCall[][] {
      return callLog[table] ?? [];
    },
  };
}
