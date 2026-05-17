"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useTrips, type StoredTrip } from "@/lib/store/trips";
import { useRoster } from "@/lib/store/roster";
import { useSettings } from "@/lib/store/settings";
import { calcDay } from "@/lib/calc";
import { PHP } from "@/components/PHP";
import { useToast } from "@/components/Toast";

export default function LogPage() {
  const { trips, remove, upsert } = useTrips();
  const { passengers } = useRoster();
  const { settings, gasPrice } = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();

  const sorted = [...trips].sort((a, b) => (a.date < b.date ? 1 : -1));
  const mostRecent = sorted[0];

  function copyYesterday() {
    if (!mostRecent) return;
    const today = dayjs().format("YYYY-MM-DD");
    const newTrip: StoredTrip = {
      ...mostRecent,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      date: today,
      gasPrice,
    };
    upsert(newTrip);
    toast.show({ message: `Copied ${dayjs(mostRecent.date).format("MMM D")} → today` });
  }

  async function handleDelete(t: StoredTrip) {
    const snapshot = t;
    await remove(t.id);
    toast.show({
      message: `Deleted trip for ${dayjs(snapshot.date).format("MMM D")}`,
      action: {
        label: "Undo",
        onClick: () => {
          upsert(snapshot);
        },
      },
      durationMs: 5000,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Trip log</h1>
        {mostRecent && (
          <button
            onClick={copyYesterday}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            Copy yesterday&apos;s trip
          </button>
        )}
      </div>
      {sorted.length === 0 && (
        <p className="text-sm text-slate-500">No trips saved yet.</p>
      )}
      <ul className="space-y-2">
        {sorted.map((t) => {
          const liveSettings = { ...settings, mileageKmPerL: settings.mileageKmPerL || 10.5 };
          const day = calcDay(
            {
              date: t.date,
              gasPricePhpPerL: t.gasPrice,
              morning: t.morning,
              evening: t.evening,
            },
            liveSettings
          );
          const isOpen = open === t.id;
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
                <PHP value={day.driverTotal + Object.values(day.perPassenger).reduce((a, b) => a + b, 0)} />
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
                    AM: {t.morning.route} · PM: {t.evening.route} · Gas <PHP value={t.gasPrice} />/L
                  </div>
                  <button
                    onClick={() => handleDelete(t)}
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
