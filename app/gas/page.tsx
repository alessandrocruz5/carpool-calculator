"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useSettings } from "@/lib/store/settings";
import { PHP } from "@/components/PHP";
import { useToast } from "@/components/Toast";
import { daysSince, isTuesday } from "@/lib/week";

export default function GasPage() {
  const { gasPrice, gasPriceUpdatedAt, setGasPrice } = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useState(gasPrice.toString());
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await setGasPrice(parseFloat(draft) || 0);
    setSaving(false);
    toast.show(
      res.ok
        ? { message: "Gas price saved.", variant: "success" }
        : {
            message: "Couldn't save gas price. Please try again.",
            variant: "error",
          }
    );
  }

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
            type="text" inputMode="decimal"
            step="0.01"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-brand-600 text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </section>
    </div>
  );
}
