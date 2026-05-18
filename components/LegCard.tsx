"use client";
import { useMemo } from "react";
import { calcLeg, type CalcSettings, type LegBreakdown, type LegName, type Route } from "@/lib/calc";
import { PassengerChips, type PassengerOption } from "./PassengerChips";
import { RouteToggle } from "./RouteToggle";
import { PHP } from "./PHP";

export interface LegState {
  route: Route;
  passengerIds: string[];
}

export function LegCard({
  leg,
  state,
  onChange,
  passengers,
  gasPrice,
  settings,
  readOnly = false,
}: {
  leg: LegName;
  state: LegState;
  onChange: (s: LegState) => void;
  passengers: PassengerOption[];
  gasPrice: number;
  settings: CalcSettings;
  readOnly?: boolean;
}) {
  const breakdown: LegBreakdown = useMemo(
    () =>
      calcLeg(
        { leg, route: state.route, passengerCount: state.passengerIds.length },
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

      <div>
        <p className="text-xs text-slate-500 mb-2">Passengers ({state.passengerIds.length}{readOnly ? "" : "/3"})</p>
        <PassengerChips
          options={passengers}
          selected={state.passengerIds}
          onChange={(ids) => onChange({ ...state, passengerIds: ids })}
          readOnly={readOnly}
        />
      </div>

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
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
