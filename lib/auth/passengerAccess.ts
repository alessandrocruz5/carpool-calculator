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

export type Role = "driver" | "passenger" | "both";

export interface Access {
  /** Resolved role, or null while loading / when not a member. */
  role: Role | null;
  /** Can drive — role `driver` or `both`. */
  isDriver: boolean;
  /** Can ride — role `passenger` or `both`. */
  isPassenger: boolean;
  loaded: boolean;
}

/** True when `role` grants driver access (`driver` or `both`). */
export function roleIsDriver(role?: Role | null): boolean {
  return role === "driver" || role === "both";
}

/** True when `role` grants passenger access (`passenger` or `both`). */
export function roleIsPassenger(role?: Role | null): boolean {
  return role === "passenger" || role === "both";
}

/**
 * Resolve the signed-in user's role in the active group. A `both` user is
 * reported as having both driver and passenger access, so the nav surfaces
 * every tab. Pass an explicit group id to override the cookie.
 */
export function useAccess(groupId?: string): Access {
  const [role, setRole] = useState<Role | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: claims } = await supabase.auth.getClaims();
      const userId = (claims?.claims as { sub?: string } | undefined)?.sub;
      if (!userId) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const gid = groupId ?? readActiveGroupCookie();
      let query = supabase.from("members").select("role").eq("user_id", userId);
      if (gid) query = query.eq("group_id", gid);
      const { data } = await query.maybeSingle();
      if (!cancelled) {
        setRole((data?.role as Role | undefined) ?? null);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return {
    role,
    isDriver: roleIsDriver(role),
    isPassenger: roleIsPassenger(role),
    loaded,
  };
}

/**
 * True when the signed-in user can ride as a passenger in the active group
 * (role `passenger` or `both`). Pass an explicit group id to override the
 * cookie.
 */
export function useIsPassenger(groupId?: string): boolean {
  return useAccess(groupId).isPassenger;
}
