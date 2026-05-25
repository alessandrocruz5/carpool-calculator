import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client that bypasses RLS entirely.
 * ONLY use this when the caller has no user session (cron jobs, migration
 * scripts, test seeders) or must touch rows across multiple groups/users.
 * For all authenticated request handlers, prefer the user-scoped client
 * from @/lib/supabase/server instead.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured"
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
