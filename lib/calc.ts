export type Route = "skyway" | "slex";
export type LegName = "morning" | "evening";

export interface CalcSettings {
  roundTripKm: number;
  mileageKmPerL: number;
  /**
   * When true, the manual mileage override takes priority over the measured
   * rolling average. When false, the rolling average is preferred and the
   * override is only used as a fallback when no rolling average exists yet.
   */
  mileageOverrideEnabled: boolean;
  parkingFeePhp: number;
  tollSkywayPhp: number;
  tollSlexPhp: number;
  split1pDriver: number;
  split2pDriver: number;
  split3pDriver: number;
  split4pDriver: number;
}

export interface LegInput {
  leg: LegName;
  route: Route;
  passengerCount: number;
  distanceKm: number;
  /**
   * Model A per-rider detour distance, keyed by passenger id. Each rider's extra
   * km is converted to gas at the leg gas price and charged 100% to that rider on
   * top of the unchanged base split. Omit (or use 0) for riders with no detour.
   */
  extraKmByRider?: Record<string, number>;
}

export interface LegBreakdown {
  leg: LegName;
  route: Route;
  passengerCount: number;
  distanceKm: number;
  gasCost: number;
  tollCost: number;
  parkingCost: number;
  total: number;
  driverShare: number;
  passengerEach: number;
  /**
   * Per-rider detour gas (Model A), charged 100% to that rider on top of
   * `passengerEach`. Empty when no detours are supplied — base split is unchanged.
   */
  detourByRider: Record<string, number>;
}

export const DEFAULT_SETTINGS: CalcSettings = {
  roundTripKm: 42,
  mileageKmPerL: 10.5,
  mileageOverrideEnabled: false,
  parkingFeePhp: 90,
  tollSkywayPhp: 164,
  tollSlexPhp: 124,
  split1pDriver: 40,
  split2pDriver: 25,
  split3pDriver: 19,
  split4pDriver: 16,
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function driverRatio(passengerCount: number, settings: CalcSettings): number {
  if (passengerCount <= 0) return 1;
  if (passengerCount === 1) return settings.split1pDriver / 100;
  if (passengerCount === 2) return settings.split2pDriver / 100;
  if (passengerCount === 3) return settings.split3pDriver / 100;
  if (passengerCount === 4) return settings.split4pDriver / 100;
  return settings.split4pDriver / 100;
}

export function calcLeg(
  input: LegInput,
  gasPricePhpPerL: number,
  settings: CalcSettings
): LegBreakdown {
  const distance = input.distanceKm;
  const gasCost = (distance / settings.mileageKmPerL) * gasPricePhpPerL;
  const tollCost = input.route === "skyway" ? settings.tollSkywayPhp : settings.tollSlexPhp;
  const parkingCost = input.leg === "morning" ? settings.parkingFeePhp : 0;
  const total = gasCost + tollCost + parkingCost;

  const ratio = driverRatio(input.passengerCount, settings);
  const driverShare = total * ratio;
  const passengerEach =
    input.passengerCount > 0 ? (total - driverShare) / input.passengerCount : 0;

  // Model A: each rider's detour km is charged 100% to that rider, on top of the
  // base split above. Base fields (total/driverShare/passengerEach) are unchanged.
  const detourByRider: Record<string, number> = {};
  if (input.extraKmByRider) {
    for (const [id, km] of Object.entries(input.extraKmByRider)) {
      if (km > 0) {
        detourByRider[id] = round2((km / settings.mileageKmPerL) * gasPricePhpPerL);
      }
    }
  }

  return {
    leg: input.leg,
    route: input.route,
    passengerCount: input.passengerCount,
    distanceKm: input.distanceKm,
    gasCost: round2(gasCost),
    tollCost: round2(tollCost),
    parkingCost: round2(parkingCost),
    total: round2(total),
    driverShare: round2(driverShare),
    passengerEach: round2(passengerEach),
    detourByRider,
  };
}

export interface DayInput {
  date: string;
  gasPricePhpPerL: number;
  morning: { route: Route; passengerIds: string[]; distanceKm: number; extraKmByRider?: Record<string, number> };
  evening: { route: Route; passengerIds: string[]; distanceKm: number; extraKmByRider?: Record<string, number> };
}

export interface DayBreakdown {
  date: string;
  morning: LegBreakdown;
  evening: LegBreakdown;
  driverTotal: number;
  perPassenger: Record<string, number>;
}

export function calcDay(input: DayInput, settings: CalcSettings): DayBreakdown {
  const morning = calcLeg(
    { leg: "morning", route: input.morning.route, passengerCount: input.morning.passengerIds.length, distanceKm: input.morning.distanceKm, extraKmByRider: input.morning.extraKmByRider },
    input.gasPricePhpPerL,
    settings
  );
  const evening = calcLeg(
    { leg: "evening", route: input.evening.route, passengerCount: input.evening.passengerIds.length, distanceKm: input.evening.distanceKm, extraKmByRider: input.evening.extraKmByRider },
    input.gasPricePhpPerL,
    settings
  );

  const perPassenger: Record<string, number> = {};
  for (const id of input.morning.passengerIds) {
    perPassenger[id] = (perPassenger[id] ?? 0) + morning.passengerEach + (morning.detourByRider[id] ?? 0);
  }
  for (const id of input.evening.passengerIds) {
    perPassenger[id] = (perPassenger[id] ?? 0) + evening.passengerEach + (evening.detourByRider[id] ?? 0);
  }
  for (const id of Object.keys(perPassenger)) {
    perPassenger[id] = round2(perPassenger[id]);
  }

  return {
    date: input.date,
    morning,
    evening,
    driverTotal: round2(morning.driverShare + evening.driverShare),
    perPassenger,
  };
}

export function calcWeek(days: DayBreakdown[]): {
  driverTotal: number;
  perPassenger: Record<string, number>;
} {
  const perPassenger: Record<string, number> = {};
  let driverTotal = 0;
  for (const d of days) {
    driverTotal += d.driverTotal;
    for (const [id, amt] of Object.entries(d.perPassenger)) {
      perPassenger[id] = (perPassenger[id] ?? 0) + amt;
    }
  }
  for (const id of Object.keys(perPassenger)) {
    perPassenger[id] = round2(perPassenger[id]);
  }
  return { driverTotal: round2(driverTotal), perPassenger };
}
