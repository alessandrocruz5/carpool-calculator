"use client";
import type { Route } from "@/lib/calc";

export function RouteToggle({
  value,
  onChange,
}: {
  value: Route;
  onChange: (r: Route) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
      {(["skyway", "slex"] as Route[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={
            "px-3 py-1.5 capitalize " +
            (value === r
              ? "bg-brand-600 text-white"
              : "bg-white text-slate-700 hover:bg-slate-50")
          }
        >
          {r}
        </button>
      ))}
    </div>
  );
}
