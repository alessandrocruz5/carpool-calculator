"use client";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import Link from "next/link";
import { LegCard, type LegState } from "@/components/LegCard";
import { PHP } from "@/components/PHP";
import { useSettings } from "@/lib/store/settings";
import { useRoster } from "@/lib/store/roster";
import { useTrips } from "@/lib/store/trips";
import { useFillups } from "@/lib/store/fillups";
import { useCars } from "@/lib/store/cars";
import { rollingMileage } from "@/lib/mileage";
import { calcDay } from "@/lib/calc";
import { daysSince } from "@/lib/week";
import { createClient } from "@/lib/supabase/client";

export default function TodayPage() {
  const today = dayjs().format("YYYY-MM-DD");
  const { settings, gasPrice, gasPriceUpdatedAt } = useSettings();
  const { passengers } = useRoster();
  const { fillups } = useFillups();
  const { cars } = useCars();
  const { trips, upsert } = useTrips();

  const existing = trips.find((t) => t.date === today);
  const [morning, setMorning] = useState<LegState>(
    existing?.morning ?? { route: "skyway", passengerIds: [] }
  );
  const [evening, setEvening] = useState<LegState>(
    existing?.evening ?? { route: "skyway", passengerIds: [] }
  );
  const [carId, setCarId] = useState<string>(existing?.carId ?? "");
  const [userId, setUserId] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getClaims();
      setUserId((data?.claims as { sub?: string } | undefined)?.sub ?? null);
    })();
  }, []);

  const selectedCar = cars.find((c) => c.id === carId) ?? null;
  const carMileage =
    selectedCar?.fuelEfficiencyKml && selectedCar.fuelEfficiencyKml > 0
      ? selectedCar.fuelEfficiencyKml
      : null;
  const measuredMileage = rollingMileage(fillups, 5, carId || undefined);
  const effectiveMileage =
    carMileage || settings.mileageKmPerL || measuredMileage || 10.5;
  const liveSettings = { ...settings, mileageKmPerL: effectiveMileage };

  const activePassengers = passengers.filter((p) => p.active);
  const stale = gasPriceUpdatedAt ? daysSince(gasPriceUpdatedAt) > 7 : true;

  const day = calcDay(
    {
      date: today,
      gasPricePhpPerL: gasPrice,
      morning: { route: morning.route, passengerIds: morning.passengerIds },
      evening: { route: evening.route, passengerIds: evening.passengerIds },
    },
    liveSettings
  );

  // car_id and driver_user_id must be persisted together (the trips API
  // rejects one without the other).
  const attachCar = carId && userId ? { carId, driverUserId: userId } : {};

  function save() {
    upsert({
      id: existing?.id ?? crypto.randomUUID(),
      date: today,
      gasPrice,
      parkingFee: settings.parkingFeePhp,
      morning,
      evening,
      ...attachCar,
    });
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{dayjs().format("ddd, MMM D")}</h1>
          <p className="text-xs text-slate-500">
            Gas <PHP value={gasPrice} />/L · Mileage {effectiveMileage.toFixed(2)} km/L
          </p>
        </div>
        <button
          onClick={save}
          className="bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {existing ? "Update" : "Save"}
        </button>
      </div>

      {cars.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Car for this trip</span>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">— none —</option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {selectedCar && (
            <p className="text-xs text-slate-500 mt-1">
              {carMileage
                ? `Using ${carMileage.toFixed(2)} km/L from this car.`
                : "This car has no efficiency set — using group default."}
            </p>
          )}
        </section>
      )}

      {stale && (
        <Link
          href="/gas"
          className="block bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3"
        >
          ⛽ Gas price is {gasPriceUpdatedAt ? `${daysSince(gasPriceUpdatedAt)} days` : "never"} old —
          update for Tuesday →
        </Link>
      )}

      <LegCard
        leg="morning"
        state={morning}
        onChange={setMorning}
        passengers={activePassengers}
        gasPrice={gasPrice}
        settings={liveSettings}
        carName={selectedCar?.name}
      />
      <LegCard
        leg="evening"
        state={evening}
        onChange={setEvening}
        passengers={activePassengers}
        gasPrice={gasPrice}
        settings={liveSettings}
        carName={selectedCar?.name}
      />

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-2">Day total</h2>
        <dl className="text-sm space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-500">Driver collects</dt>
            <dd className="font-medium"><PHP value={day.driverTotal} /></dd>
          </div>
          {Object.entries(day.perPassenger).map(([id, amt]) => {
            const p = passengers.find((x) => x.id === id);
            return (
              <div key={id} className="flex justify-between">
                <dt className="text-slate-500">{p?.name ?? id}</dt>
                <dd className="font-medium"><PHP value={amt} /></dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}
