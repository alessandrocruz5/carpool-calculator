"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useSettings } from "@/lib/store/settings";
import { PHP } from "@/components/PHP";
import { daysSince, isTuesday } from "@/lib/week";

export default function GasPage() {
  const { gasPrice, gasPriceUpdatedAt, setGasPrice } = useSettings();
  const [draft, setDraft] = useState(gasPrice.toString());

  const updated = gasPriceUpdatedAt ? dayjs(gasPriceUpdatedAt) : null;
  const age = gasPriceUpdatedAt ? daysSince(gasPriceUpdatedAt) : null;
  const stale = age === null || age > 7;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Gas price</h1>
      <p className="text-sm text-slate-500">
        Petron, Commerce Ave, Muntinlupa · update every Tuesday
      </p>

      {isTuesday() && (
        <div className="bg-brand-50 border border-brand-500 text-brand-700 text-sm rounded-lg p-3">
          It&apos;s Tuesday — time for the weekly price update.
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Current</span>
          <span className="font-medium"><PHP value={gasPrice} /> /L</span>
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
          onClick={() => setGasPrice(parseFloat(draft) || 0)}
          className="w-full bg-brand-600 text-white rounded-lg px-3 py-2 font-medium"
        >
          Save
        </button>
      </section>
    </div>
  );
}
