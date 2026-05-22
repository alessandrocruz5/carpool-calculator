"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Name of the cookie that holds the caller's active group id. */
export const GROUP_COOKIE = "carpool-group";

/** Read the active group id from the browser cookie jar (client-side). */
export function readActiveGroupCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)carpool-group=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * True when the signed-in user can ride as a passenger in the active group
 * (role `passenger` or `both`). Pass an explicit group id to override the
 * cookie.
 */
export function useIsPassenger(groupId?: string): boolean {
  const [isPassenger, setIsPassenger] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const userId = (claims?.claims as { sub?: string } | undefined)?.sub;
      if (!userId) return;
      const gid = groupId ?? readActiveGroupCookie();
      let query = supabase.from("members").select("role").eq("user_id", userId);
      if (gid) query = query.eq("group_id", gid);
      const { data } = await query.maybeSingle();
      const role = data?.role;
      if (!cancelled) setIsPassenger(role === "passenger" || role === "both");
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return isPassenger;
}
