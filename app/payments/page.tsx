"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import { usePayments } from "@/lib/store/payments";
import { useRoster } from "@/lib/store/roster";
import { PHP } from "@/components/PHP";
import { useIsDriver } from "@/lib/auth/useIsDriver";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckCircle2 } from "lucide-react";

export default function PaymentsPage() {
  const { payments, markPaid, markManyPaid } = usePayments();
  const { passengers } = useRoster();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isDriver = useIsDriver();

  const byPassenger = useMemo(() => {
    const m = new Map<
      string,
      {
        unpaidTotal: number;
        unpaidCount: number;
        rows: typeof payments;
      }
    >();
    for (const p of payments) {
      if (p.paid) continue;
      const cur = m.get(p.passengerId) ?? {
        unpaidTotal: 0,
        unpaidCount: 0,
        rows: [],
      };
      cur.unpaidTotal += p.amountPhp;
      cur.unpaidCount += 1;
      cur.rows.push(p);
      m.set(p.passengerId, cur);
    }
    for (const v of m.values()) {
      v.rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    }
    return m;
  }, [payments]);

  const entries = useMemo(
    () =>
      Array.from(byPassenger.entries())
        .map(([passengerId, info]) => ({
          passengerId,
          name:
            passengers.find((p) => p.id === passengerId)?.name ?? passengerId,
          ...info,
        }))
        .sort((a, b) => b.unpaidTotal - a.unpaidTotal),
    [byPassenger, passengers]
  );

  const grandTotal = entries.reduce((sum, e) => sum + e.unpaidTotal, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Payments</h1>
        <Link
          href="/log"
          className="text-sm text-brand-600 hover:underline"
        >
          Log →
        </Link>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={CheckCircle2} headline="No outstanding payments" />
      ) : (
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Total outstanding</span>
            <PHP value={grandTotal} />
          </div>
          <p className="text-xs text-slate-500">
            {entries.length} passenger{entries.length === 1 ? "" : "s"} with
            unpaid balances.
          </p>
        </section>
      )}

      {entries.map((e) => {
        const open = expanded[e.passengerId] ?? false;
        return (
          <section
            key={e.passengerId}
            className="bg-white rounded-xl border border-slate-200 p-4 space-y-2"
          >
            <button
              onClick={() =>
                setExpanded((s) => ({ ...s, [e.passengerId]: !open }))
              }
              className="w-full flex items-center justify-between text-left"
            >
              <span className="font-medium">
                <span className="mr-2 text-slate-400">{open ? "▾" : "▸"}</span>
                {e.name}
              </span>
              <span className="text-sm">
                <span className="text-slate-500 mr-2">
                  {e.unpaidCount} unpaid
                </span>
                <PHP value={e.unpaidTotal} className="font-medium" />
              </span>
            </button>

            {isDriver && (
              <button
                onClick={() =>
                  markManyPaid(
                    e.rows.map((r) => ({
                      tripId: r.tripId,
                      passengerId: r.passengerId,
                    })),
                    true
                  )
                }
                className="w-full bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                Pay all outstanding
              </button>
            )}

            {open && (
              <ul className="text-xs divide-y divide-slate-100">
                {e.rows.map((r) => (
                  <li
                    key={`${r.tripId}-${r.passengerId}`}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-slate-600">
                      {r.date ? dayjs(r.date).format("ddd, MMM D, YYYY") : "—"}
                    </span>
                    <span className="flex items-center gap-2">
                      <PHP value={r.amountPhp} />
                      {isDriver && (
                        <button
                          onClick={() =>
                            markPaid(r.tripId, r.passengerId, true)
                          }
                          className="px-2 py-0.5 rounded border bg-brand-600 text-white border-brand-600 text-[11px]"
                        >
                          Mark paid
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {!isDriver && entries.length > 0 && (
        <p className="text-[11px] text-slate-500 text-center">
          Only drivers can mark payments. Ask a driver to grant you driver
          access from the Members admin page.
        </p>
      )}
    </div>
  );
}
