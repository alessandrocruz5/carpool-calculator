"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  readActiveGroupCookie,
  roleIsDriver,
  roleIsPassenger,
  type Access,
  type Role,
} from "./passengerAccess";

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

export function useIsPassenger(groupId?: string): boolean {
  return useAccess(groupId).isPassenger;
}
