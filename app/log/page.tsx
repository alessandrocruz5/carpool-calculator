"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useAllTrips } from "@/lib/hooks/useTrips";
import { usePassengers } from "@/lib/hooks/usePassengers";
import { useSettings } from "@/lib/hooks/useSettings";
import { calcDay } from "@/lib/calc";
import { PHP } from "@/components/PHP";

export default function LogPage() {
  const { trips, remove, loading } = useAllTrips();
  const { passengers } = usePassengers();
  const { settings } = useSettings();
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Trip log</h1>
      {trips.length === 0 && (
        <p className="text-sm text-slate-500">No trips saved yet.</p>
      )}
      <ul className="space-y-2">
        {trips.map((t) => {
          const liveSettings = { ...settings, mileageKmPerL: settings.mileageKmPerL || 10.5 };
          const day = calcDay(
            {
              date: t.date,
              gasPricePhpPerL: t.gas_price,
              morning: t.morning,
              evening: t.evening,
            },
            liveSettings
          );
          const isOpen = open === t.id;
          const totalCollected =
            day.driverTotal + Object.values(day.perPassenger).reduce((a, b) => a + b, 0);
          return (
            <li key={t.id} className="bg-white rounded-xl border border-slate-200">
              <button
                onClick={() => setOpen(isOpen ? null : t.id)}
                className="w-full px-4 py-3 flex justify-between items-center text-left"
              >
                <div>
                  <div className="font-medium">{dayjs(t.date).format("ddd, MMM D")}</div>
                  <div className="text-xs text-slate-500">
                    AM {t.morning.passengerIds.length}p · PM {t.evening.passengerIds.length}p
                  </div>
                </div>
                <PHP value={totalCollected} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-2 text-sm">
                  <Row label="Driver collects" value={day.driverTotal} />
                  {Object.entries(day.perPassenger).map(([id, amt]) => (
                    <Row
                      key={id}
                      label={passengers.find((p) => p.id === id)?.name ?? id}
                      value={amt}
                    />
                  ))}
                  <div className="text-xs text-slate-500 pt-2">
                    AM: {t.morning.route} · PM: {t.evening.route} · Gas <PHP value={t.gas_price} />/L
                  </div>
                  <button
                    onClick={() => remove(t.id)}
                    className="text-xs text-red-600 underline"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium"><PHP value={value} /></span>
    </div>
  );
}
