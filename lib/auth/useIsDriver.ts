"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readActiveGroupCookie } from "@/lib/auth/passengerAccess";

/**
 * True when the signed-in user can drive in the active group (role
 * `driver` or `both`). Pass an explicit group id to override the cookie.
 */
export function useIsDriver(groupId?: string): boolean {
  const [isDriver, setIsDriver] = useState(false);

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
      if (!cancelled) setIsDriver(role === "driver" || role === "both");
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return isDriver;
}
