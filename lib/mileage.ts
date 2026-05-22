export interface Fillup {
  id: string;
  carId?: string | null;
  date: string;
  liters: number;
  totalPhp: number;
  odometerKm: number;
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
