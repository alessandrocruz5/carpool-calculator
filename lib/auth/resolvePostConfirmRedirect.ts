/**
 * Minimal slice of the Supabase client needed to count group memberships.
 * Using a structural interface keeps this module free of Supabase package
 * imports and makes it easy to test with any compatible mock.
 */
export interface MembersQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * Returns `true` when `next` is a safe same-origin relative path.
 *
 * Rules:
 *  - Must start with "/"
 *  - Must NOT start with "//" (protocol-relative URLs enable open-redirect)
 */
export function isSafeRedirect(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

/**
 * Resolves where to send the user after a successful magic-link / OTP
 * confirmation.
 *
 * After `claim_member_invite()` runs, query the members table to decide:
 *
 *   - 0 memberships  → `/onboarding`  (new user, no group yet)
 *   - ≥1 memberships → `next` if present and safe, otherwise `/`
 *
 * @param supabase - A Supabase client (server or any compatible mock)
 * @param userId   - The authenticated user's UUID
 * @param next     - The `?next=` param from the confirmation URL (default "/")
 */
export async function resolvePostConfirmRedirect({
  supabase,
  userId,
  next,
}: {
  supabase: MembersQueryClient;
  userId: string;
  next: string;
}): Promise<string> {
  // A single row is enough to determine whether any membership exists.
  const { data, error } = (await supabase
    .from("members")
    .select("group_id")
    .eq("user_id", userId)
    .limit(1)) as { data: unknown; error: unknown };

  if (error) {
    // On a query failure fall back gracefully to the requested destination
    // rather than always bouncing the user to /onboarding.
    return isSafeRedirect(next) ? next : "/";
  }

  const hasMembership = Array.isArray(data) ? data.length > 0 : data !== null;

  if (!hasMembership) {
    return "/onboarding";
  }

  // User belongs to at least one group — honour the next param if safe.
  if (isSafeRedirect(next) && next !== "/") {
    return next;
  }

  return "/";
}
