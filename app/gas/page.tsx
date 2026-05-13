"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useGasPrice } from "@/lib/hooks/useGasPrice";
import { PHP } from "@/components/PHP";
import { daysSince, isTuesday } from "@/lib/week";

export default function GasPage() {
  const { gasPrice, updatedAt, set, loading } = useGasPrice();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const updated = updatedAt ? dayjs(updatedAt) : null;
  const age = updatedAt ? daysSince(updatedAt) : null;
  const stale = age === null || age > 7;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Gas price</h1>
      <p className="text-sm text-slate-500">
        Petron, Commerce Ave, Muntinlupa · update every Tuesday
      </p>

      {isTuesday() && (
        <div className="bg-brand-50 border border-brand-500 text-brand-700 text-sm rounded-lg p-3">
          It's Tuesday — time for the weekly price update.
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Current</span>
          <span className="font-medium">
            {loading ? "…" : <><PHP value={gasPrice} /> /L</>}
          </span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Last updated</span>
          <span className={stale ? "text-amber-700" : ""}>
            {updated ? `${updated.format("MMM D")} (${age}d ago)` : "never"}
          </span>
        </div>

        <label className="block">
          <span className="text-sm text-slate-600">New price (₱/L)</span>
          <input
            type="number"
            step="0.01"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <button
          disabled={busy || !draft}
          onClick={async () => {
            setBusy(true);
            try {
              await set(dayjs().format("YYYY-MM-DD"), parseFloat(draft));
              setDraft("");
            } finally {
              setBusy(false);
            }
          }}
          className="w-full bg-brand-600 text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </section>
    </div>
  );
}
