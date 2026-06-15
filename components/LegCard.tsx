"use client";
import { useMemo, useState } from "react";
import { calcLeg, type CalcSettings, type LegBreakdown, type LegName, type Route } from "@/lib/calc";
import { PassengerChips, type PassengerOption } from "./PassengerChips";
import { RouteToggle } from "./RouteToggle";
import { PHP } from "./PHP";

export interface LegState {
  route: Route;
  passengerIds: string[];
  distanceKm: number;
  /** Model A per-rider detour distance (km), keyed by passenger id. */
  extraKmByRider?: Record<string, number>;
}

type Tab = "simple" | "detours";

export function LegCard({
  leg,
  state,
  onChange,
  passengers,
  gasPrice,
  settings,
  readOnly = false,
  maxPassengers,
}: {
  leg: LegName;
  state: LegState;
  onChange: (s: LegState) => void;
  passengers: PassengerOption[];
  gasPrice: number;
  settings: CalcSettings;
  readOnly?: boolean;
  maxPassengers?: number | null;
}) {
  const extraKmByRider = state.extraKmByRider ?? {};
  const [tab, setTab] = useState<Tab>(() =>
    Object.values(extraKmByRider).some((km) => km > 0) ? "detours" : "simple"
  );

  const breakdown: LegBreakdown = useMemo(
    () =>
      calcLeg(
        {
          leg,
          route: state.route,
          passengerCount: state.passengerIds.length,
          distanceKm: state.distanceKm,
          extraKmByRider: state.extraKmByRider,
        },
        gasPrice,
        settings
      ),
    [leg, state, gasPrice, settings]
  );

  function switchTab(next: Tab) {
    // Leaving Detours discards detours so the saved data matches what's shown.
    if (next === "simple" && Object.keys(extraKmByRider).length > 0) {
      onChange({ ...state, extraKmByRider: {} });
    }
    setTab(next);
  }

  function setExtra(id: string, km: number) {
    const next = { ...extraKmByRider };
    if (km > 0) next[id] = km;
    else delete next[id];
    onChange({ ...state, extraKmByRider: next });
  }

  function setPassengers(ids: string[]) {
    // Drop detour entries for riders no longer on this leg.
    const pruned = { ...extraKmByRider };
    for (const id of Object.keys(pruned)) {
      if (!ids.includes(id)) delete pruned[id];
    }
    onChange({ ...state, passengerIds: ids, extraKmByRider: pruned });
  }

  const selectedPassengers = passengers.filter((p) => state.passengerIds.includes(p.id));

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold capitalize">{leg}</h2>
        <RouteToggle value={state.route} onChange={(r) => onChange({ ...state, route: r })} readOnly={readOnly} />
      </div>

      <div
        data-tour="tour-detours"
        className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm"
      >
        {(["simple", "detours"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            disabled={readOnly}
            className={
              "px-3 py-1.5 capitalize disabled:cursor-default " +
              (tab === t
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-700 " + (readOnly ? "" : "hover:bg-slate-50"))
            }
          >
            {t}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{tab === "detours" ? "Base distance (km)" : "Distance (km)"}</span>
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={state.distanceKm}
          onChange={(e) => onChange({ ...state, distanceKm: Number(e.target.value) })}
          disabled={readOnly}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24 text-right disabled:bg-slate-50 disabled:text-slate-500"
        />
      </label>

      <div>
        <p className="text-xs text-slate-500 mb-2">
          Passengers ({state.passengerIds.length}
          {!readOnly && maxPassengers != null ? `/${maxPassengers}` : ""})
        </p>
        <PassengerChips
          options={passengers}
          selected={state.passengerIds}
          onChange={setPassengers}
          readOnly={readOnly}
          maxPassengers={maxPassengers ?? undefined}
        />
      </div>

      {tab === "detours" && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Extra distance per passenger (km)</p>
          {selectedPassengers.length === 0 ? (
            <p className="text-sm text-slate-500">Select passengers to add detours.</p>
          ) : (
            <ul className="space-y-2">
              {selectedPassengers.map((p) => {
                const detour = breakdown.detourByRider[p.id] ?? 0;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-slate-500">
                      <PHP value={breakdown.passengerEach + detour} />
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      value={extraKmByRider[p.id] ?? 0}
                      onChange={(e) => setExtra(p.id, Number(e.target.value))}
                      disabled={readOnly}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-20 text-right disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-slate-500">Distance</dt>
        <dd className="text-right">{breakdown.distanceKm} km</dd>
        <dt className="text-slate-500">Gas</dt>
        <dd className="text-right"><PHP value={breakdown.gasCost} /></dd>
        <dt className="text-slate-500">Toll ({state.route})</dt>
        <dd className="text-right"><PHP value={breakdown.tollCost} /></dd>
        {breakdown.parkingCost > 0 && (
          <>
            <dt className="text-slate-500">Parking</dt>
            <dd className="text-right"><PHP value={breakdown.parkingCost} /></dd>
          </>
        )}
        <dt className="font-medium pt-1 border-t border-slate-100">Leg total</dt>
        <dd className="text-right font-medium pt-1 border-t border-slate-100">
          <PHP value={breakdown.total} />
        </dd>
      </dl>

      <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Driver share</span>
          <span className="font-medium"><PHP value={breakdown.driverShare} /></span>
        </div>
        {state.passengerIds.length > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">
              {tab === "detours" ? "Base per passenger" : "Per passenger"} ×{state.passengerIds.length}
            </span>
            <span className="font-medium"><PHP value={breakdown.passengerEach} /></span>
          </div>
        )}
      </div>
    </section>
  );
}
