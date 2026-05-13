"use client";
import { useEffect } from "react";
import { useFillups } from "@/lib/store/fillups";
import { useRoster } from "@/lib/store/roster";
import { useSettings } from "@/lib/store/settings";
import { useTrips } from "@/lib/store/trips";

export function HydrateStores() {
  useEffect(() => {
    useFillups.getState().hydrate();
    useRoster.getState().hydrate();
    useSettings.getState().hydrate();
    useTrips.getState().hydrate();
  }, []);
  return null;
}
