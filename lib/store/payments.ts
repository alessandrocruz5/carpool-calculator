"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resilientFetch } from "@/lib/outbox";

export interface PaymentRow {
  tripId: string;
  passengerId: string;
  amountPhp: number;
  paid: boolean;
  paidAt: string | null;
  /** When the passenger last marked "I paid" (null = never / expired-swept). */
  claimedAt: string | null;
  /** Derived server-side: claim within 24h and not yet confirmed. */
  claimActive: boolean;
  date: string | null;
}

interface PaymentsStore {
  payments: PaymentRow[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markPaid: (tripId: string, passengerId: string, paid: boolean) => Promise<void>;
  markManyPaid: (
    items: { tripId: string; passengerId: string }[],
    paid: boolean
  ) => Promise<void>;
  /** Passenger marks their own payment as "I paid", pending driver confirmation. */
  claim: (tripId: string, passengerId: string) => Promise<void>;
}

export const usePayments = create<PaymentsStore>()(
  persist(
    (set, get) => ({
      payments: [],
      hydrated: false,
      hydrate: async () => {
        try {
          const res = await fetch("/api/payments", { cache: "no-store" });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as PaymentRow[];
          set({ payments: data, hydrated: true });
        } catch (err) {
          console.error("payments.hydrate failed", err);
          set({ hydrated: true });
        }
      },
      markPaid: async (tripId, passengerId, paid) => {
        const now = new Date().toISOString();
        set((s) => ({
          payments: s.payments.map((p) =>
            p.tripId === tripId && p.passengerId === passengerId
              ? { ...p, paid, paidAt: paid ? now : null, claimActive: paid ? false : p.claimActive }
              : p
          ),
        }));
        try {
          const res = await resilientFetch("/api/payments", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tripId, passengerId, paid }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("payments.markPaid failed", err);
          await get().hydrate();
        }
      },
      markManyPaid: async (items, paid) => {
        if (items.length === 0) return;
        const now = new Date().toISOString();
        const keys = new Set(items.map((i) => `${i.tripId}:${i.passengerId}`));
        set((s) => ({
          payments: s.payments.map((p) =>
            keys.has(`${p.tripId}:${p.passengerId}`)
              ? { ...p, paid, paidAt: paid ? now : null, claimActive: paid ? false : p.claimActive }
              : p
          ),
        }));
        try {
          const res = await resilientFetch("/api/payments", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              items: items.map((i) => ({ ...i, paid })),
            }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("payments.markManyPaid failed", err);
          await get().hydrate();
        }
      },
      claim: async (tripId, passengerId) => {
        const now = new Date().toISOString();
        set((s) => ({
          payments: s.payments.map((p) =>
            p.tripId === tripId && p.passengerId === passengerId
              ? { ...p, claimedAt: now, claimActive: true }
              : p
          ),
        }));
        try {
          const res = await resilientFetch("/api/payments", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tripId, passengerId, claim: true }),
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          console.error("payments.claim failed", err);
          await get().hydrate();
        }
      },
    }),
    { name: "carpool-payments", partialize: (s) => ({ payments: s.payments }) }
  )
);
