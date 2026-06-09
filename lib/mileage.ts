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
 *   enabled manual override  →  car efficiency  →  rolling average  →
 *   manual override (fallback when no rolling average yet)  →  default
 *
 * An explicitly enabled override beats even the car's own efficiency, so
 * "use this km/L" means exactly that. When the toggle is off, the override
 * merely backstops the rolling average so a brand-new group still has a
 * usable figure.
 */
export function resolveEffectiveMileage(opts: {
  carEfficiency?: number | null;
  override?: number | null;
  overrideEnabled?: boolean;
  rollingAvg?: number | null;
  fallback?: number;
}): number {
  const { carEfficiency, override, overrideEnabled, rollingAvg, fallback = 10.5 } = opts;
  const hasOverride = override != null && override > 0;
  if (overrideEnabled && hasOverride) return override as number;
  if (carEfficiency && carEfficiency > 0) return carEfficiency;
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
