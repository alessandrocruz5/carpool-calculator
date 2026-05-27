"use client";
import { create } from "zustand";
import type { DbTripDispute, TripDisputeStatus } from "@/lib/supabase/types";

export interface DisputeRow {
  id: string;
  tripId: string;
  reporterUserId: string;
  reason: string;
  status: TripDisputeStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

function fromDb(r: DbTripDispute): DisputeRow {
  return {
    id: r.id,
    tripId: r.trip_id,
    reporterUserId: r.reporter_user_id,
    reason: r.reason,
    status: r.status,
    resolutionNote: r.resolution_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
  };
}

interface DisputesStore {
  disputes: DisputeRow[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  open: (tripId: string, reason: string) => Promise<void>;
  resolve: (
    id: string,
    status: "resolved" | "dismissed",
    resolutionNote?: string
  ) => Promise<void>;
}

export const useDisputes = create<DisputesStore>((set, get) => ({
  disputes: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/disputes", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as DbTripDispute[];
      set({ disputes: data.map(fromDb), hydrated: true });
    } catch (err) {
      console.error("disputes.hydrate failed", err);
      set({ hydrated: true });
    }
  },
  open: async (tripId, reason) => {
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId, reason }),
    });
    if (!res.ok) throw new Error(await res.text());
    const row = fromDb((await res.json()) as DbTripDispute);
    set((s) => ({ disputes: [row, ...s.disputes] }));
  },
  resolve: async (id, status, resolutionNote) => {
    const res = await fetch(`/api/disputes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, resolutionNote }),
    });
    if (!res.ok) throw new Error(await res.text());
    const row = fromDb((await res.json()) as DbTripDispute);
    set((s) => ({
      disputes: s.disputes.map((d) => (d.id === id ? row : d)),
    }));
    void get().hydrate();
  },
}));
