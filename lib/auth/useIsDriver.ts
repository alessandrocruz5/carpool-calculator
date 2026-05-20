"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useIsDriver(): boolean {
  const [isDriver, setIsDriver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("members")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) setIsDriver(data?.role === "driver");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return isDriver;
}
