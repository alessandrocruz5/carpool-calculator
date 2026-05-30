import "server-only";
import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// `React.cache` ships with the React build Next.js bundles, but not with the
// stable `react` package the unit-test runner resolves. Fall back to an
// identity wrapper there: same behavior as before (one round-trip per call),
// just without the cross-helper request-scoped dedupe.
type CacheFn = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;
const cache: CacheFn =
  (React as unknown as { cache?: CacheFn }).cache ?? ((fn) => fn);

/**
 * Resolve the caller's user id, memoized for the duration of a single server
 * request via React `cache()`.
 *
 * Several helpers need the user id on the same request — e.g. a mutating route
 * handler resolves the active group (`getActiveGroupId`) *and* checks the
 * caller's role (`requireGroupMember`), and each previously made its own
 * `supabase.auth.getClaims()` round-trip. Because `createClient()` yields one
 * client instance per request and that same instance is passed to every helper,
 * `cache()` keyed on it collapses those into a single `getClaims()` call.
 */
export const getRequestUserId = cache(
  async (supabase: SupabaseClient): Promise<string | null> => {
    const { data } = await supabase.auth.getClaims();
    return (data?.claims as { sub?: string } | undefined)?.sub ?? null;
  }
);
