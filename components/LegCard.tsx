"use client";
import { useMemo } from "react";
import { calcLeg, type CalcSettings, type LegBreakdown, type LegName, type Route } from "@/lib/calc";
import { PassengerChips, type PassengerOption } from "./PassengerChips";
import { RouteToggle } from "./RouteToggle";
import { PHP } from "./PHP";

export interface LegState {
  route: Route;
  passengerIds: string[];
  distanceKm: number;
}

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
  const breakdown: LegBreakdown = useMemo(
    () =>
      calcLeg(
        { leg, route: state.route, passengerCount: state.passengerIds.length, distanceKm: state.distanceKm },
        gasPrice,
        settings
      ),
    [leg, state, gasPrice, settings]
  );

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold capitalize">{leg}</h2>
        <RouteToggle value={state.route} onChange={(r) => onChange({ ...state, route: r })} readOnly={readOnly} />
      </div>

      <label className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Distance (km)</span>
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
          onChange={(ids) => onChange({ ...state, passengerIds: ids })}
          readOnly={readOnly}
          maxPassengers={maxPassengers ?? undefined}
        />
      </div>

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
              Per passenger ×{state.passengerIds.length}
            </span>
            <span className="font-medium"><PHP value={breakdown.passengerEach} /></span>
          </div>
        )}
      </div>
    </section>
  );
}
