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
 * @param supabase - A Supabase client (server or any compatible mock).
 *   Typed as `{ from(table: string): unknown }` to avoid triggering
 *   TypeScript's "excessively deep instantiation" error on the deeply-generic
 *   Supabase client while remaining compatible with test mocks.
 * @param userId   - The authenticated user's UUID
 * @param next     - The `?next=` param from the confirmation URL (default "/")
 */
export async function resolvePostConfirmRedirect({
  supabase,
  userId,
  next,
}: {
  supabase: { from(table: string): any };
  userId: string;
  next: string;
}): Promise<string> {
  // A single row is enough to determine whether any membership exists.
  // We cast to a known shape after awaiting; the loose parameter type above
  // prevents TS2589 ("excessively deep") on the real Supabase client.
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
