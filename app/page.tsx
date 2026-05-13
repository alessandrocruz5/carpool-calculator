"use client";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import Link from "next/link";
import { LegCard, type LegState } from "@/components/LegCard";
import { PHP } from "@/components/PHP";
import { usePassengers } from "@/lib/hooks/usePassengers";
import { useGasPrice } from "@/lib/hooks/useGasPrice";
import { useFillups } from "@/lib/hooks/useFillups";
import { useSettings } from "@/lib/hooks/useSettings";
import { useTrip } from "@/lib/hooks/useTrips";
import { getLatestGasPrice } from "@/lib/db/gasPrices";
import { rollingMileage } from "@/lib/mileage";
import { calcDay } from "@/lib/calc";
import { daysSince } from "@/lib/week";

export default function TodayPage() {
  const today = dayjs().format("YYYY-MM-DD");
  const { settings } = useSettings();
  const { passengers } = usePassengers();
  const { fillups } = useFillups();
  const { gasPrice, updatedAt } = useGasPrice();
  const { trip, save } = useTrip(today);

  const [morning, setMorning] = useState<LegState>({ route: "skyway", passengerIds: [] });
  const [evening, setEvening] = useState<LegState>({ route: "skyway", passengerIds: [] });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (trip) {
      setMorning(trip.morning);
      setEvening(trip.evening);
    }
  }, [trip]);

  const measuredMileage = rollingMileage(fillups);
  const effectiveMileage = settings.mileageKmPerL || measuredMileage || 10.5;
  const liveSettings = { ...settings, mileageKmPerL: effectiveMileage };

  const activePassengers = passengers
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name }));
  const stale = updatedAt ? daysSince(updatedAt) > 7 : true;

  const day = calcDay(
    {
      date: today,
      gasPricePhpPerL: gasPrice,
      morning,
      evening,
    },
    liveSettings
  );

  async function handleSave() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const latest = await getLatestGasPrice();
      if (!latest) {
        setSavedMsg("Set a gas price first.");
        return;
      }
      await save({
        date: today,
        gas_price_id: latest.id,
        parking_fee_php: settings.parkingFeePhp,
        morning,
        evening,
      });
      setSavedMsg("Saved.");
    } catch (e) {
      setSavedMsg(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

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
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : trip ? "Update" : "Save"}
        </button>
      </div>
      {savedMsg && <p className="text-xs text-slate-500">{savedMsg}</p>}

      {stale && (
        <Link
          href="/gas"
          className="block bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3"
        >
          ⛽ Gas price is {updatedAt ? `${daysSince(updatedAt)} days` : "never"} old —
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
      />
      <LegCard
        leg="evening"
        state={evening}
        onChange={setEvening}
        passengers={activePassengers}
        gasPrice={gasPrice}
        settings={liveSettings}
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
