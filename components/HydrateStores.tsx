"use client";
import { useEffect, useState } from "react";
import { useFillups } from "@/lib/store/fillups";
import { useRoster } from "@/lib/store/roster";
import { useSettings } from "@/lib/store/settings";
import { useTrips } from "@/lib/store/trips";
import { usePayments } from "@/lib/store/payments";
import { installOutbox, subscribe } from "@/lib/outbox";

export function HydrateStores() {
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    useFillups.getState().hydrate();
    useRoster.getState().hydrate();
    useSettings.getState().hydrate();
    useTrips.getState().hydrate();
    usePayments.getState().hydrate();
    installOutbox();
    const unsub = subscribe((n) => setQueued(n));
    return unsub;
  }, []);

  if (queued <= 0) return null;
  return (
    <div className="fixed top-3 right-3 z-50 bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2 py-1 rounded-full shadow-sm">
      {queued} queued
    </div>
  );
}
