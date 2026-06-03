export interface Fillup {
  id: string;
  carId?: string | null;
  date: string;
  liters: number;
  totalPhp: number;
  odometerKm: number;
}

/**
 * Resolve the mileage (km/L) to use for a trip, applying a single precedence
 * shared by the trip UI and the server-side payment split:
 *
 *   car efficiency  →  enabled manual override  →  rolling average  →
 *   manual override (fallback when no rolling average yet)  →  default
 *
 * The override only beats the rolling average when `overrideEnabled` is true;
 * otherwise it merely backstops the rolling average so a brand-new group with
 * no fill-ups still has a usable figure.
 */
export function resolveEffectiveMileage(opts: {
  carEfficiency?: number | null;
  override?: number | null;
  overrideEnabled?: boolean;
  rollingAvg?: number | null;
  fallback?: number;
}): number {
  const { carEfficiency, override, overrideEnabled, rollingAvg, fallback = 10.5 } = opts;
  if (carEfficiency && carEfficiency > 0) return carEfficiency;
  const hasOverride = override != null && override > 0;
  if (overrideEnabled && hasOverride) return override as number;
  if (rollingAvg && rollingAvg > 0) return rollingAvg;
  if (hasOverride) return override as number;
  return fallback;
}

export function rollingMileage(
  fillups: Fillup[],
  window = 5,
  carId?: string
): number | null {
  const scoped =
    carId != null ? fillups.filter((f) => f.carId === carId) : fillups;
  if (scoped.length < 2) return null;
  const sorted = [...scoped].sort((a, b) => a.odometerKm - b.odometerKm);
  const recent = sorted.slice(-Math.max(2, window + 1));
  let totalKm = 0;
  let totalL = 0;
  for (let i = 1; i < recent.length; i++) {
    totalKm += recent[i].odometerKm - recent[i - 1].odometerKm;
    totalL += recent[i].liters;
  }
  if (totalL <= 0) return null;
  return totalKm / totalL;
}
