"use client";
import { useEffect, useState } from "react";
import { useGroups } from "@/lib/store/groups";
import { useProfile } from "@/lib/store/profile";
import { useCars } from "@/lib/store/cars";
import { applyGroupScope } from "@/lib/store/groupScope";
import { installOutbox, subscribe } from "@/lib/outbox";

export function HydrateStores() {
  const [pending, setPending] = useState(0);
  const activeGroupId = useGroups((s) => s.activeGroupId);

  useEffect(() => {
    useGroups.getState().hydrate();
    useProfile.getState().hydrate();
    useCars.getState().hydrate();
    installOutbox();
    const unsub = subscribe((s) => setPending(s.pending));
    return unsub;
  }, []);

  useEffect(() => {
    if (!activeGroupId) return;
    void applyGroupScope(activeGroupId);
  }, [activeGroupId]);

  if (pending <= 0) return null;
  return (
    <div className="fixed top-3 left-3 z-40 bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2 py-1 rounded-full shadow-sm">
      {pending} queued
    </div>
  );
}
