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
import { useToast } from "@/components/Toast";
import { useIsDriver } from "@/lib/auth/useIsDriver";
import { rollingMileage } from "@/lib/mileage";
import { calcDay } from "@/lib/calc";
import { daysSince } from "@/lib/week";

export default function TodayPage() {
  const today = dayjs().format("YYYY-MM-DD");
  const { settings, gasPrice, gasPriceUpdatedAt } = useSettings();
  const { passengers } = useRoster();
  const { fillups } = useFillups();
  const { trips, upsert } = useTrips();
  const toast = useToast();
  const isDriver = useIsDriver();

  const existing = trips.find((t) => t.date === today);
  const [morning, setMorning] = useState<LegState>(
    existing?.morning ?? { route: "skyway", passengerIds: [] }
  );
  const [evening, setEvening] = useState<LegState>(
    existing?.evening ?? { route: "skyway", passengerIds: [] }
  );

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const measuredMileage = rollingMileage(fillups);
  const effectiveMileage = settings.mileageKmPerL || measuredMileage || 10.5;
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

  async function save() {
    try {
      await upsert({
        id: existing?.id ?? crypto.randomUUID(),
        date: today,
        gasPrice,
        parkingFee: settings.parkingFeePhp,
        morning,
        evening,
      });
      toast.show({ message: existing ? "Trip updated." : "Trip saved." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.show({
        message: /forbidden|403/i.test(msg)
          ? "Couldn't save — only the driver can log trips."
          : "Couldn't save trip. Check your connection and try again.",
      });
    }
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
        {isDriver && (
          <button
            onClick={save}
            className="bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {existing ? "Update" : "Save"}
          </button>
        )}
      </div>

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
        readOnly={!isDriver}
      />
      <LegCard
        leg="evening"
        state={evening}
        onChange={setEvening}
        passengers={activePassengers}
        gasPrice={gasPrice}
        settings={liveSettings}
        readOnly={!isDriver}
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
