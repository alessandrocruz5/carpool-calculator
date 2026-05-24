"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dayjs from "dayjs";
import { useCars } from "@/lib/store/cars";
import { useFillups } from "@/lib/store/fillups";
import { rollingMileage } from "@/lib/mileage";
import { PHP } from "@/components/PHP";

export const dynamic = "force-dynamic";

export default function CarFillupsPage() {
  const params = useParams<{ carId: string }>();
  const carId = params.carId;

  const { cars } = useCars();
  const { fillups, add: addFillup, remove: removeFillup } = useFillups();

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [odo, setOdo] = useState("");

  if (!hydrated) return null;

  const car = cars.find((c) => c.id === carId);

  if (!car) {
    return (
      <div className="space-y-4">
        <Link href="/cars" className="text-sm text-slate-600 underline">
          ← Back to cars
        </Link>
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <h1 className="font-semibold">Car not found</h1>
          <p className="text-sm text-slate-500">
            That car doesn&apos;t exist or isn&apos;t in your garage.
          </p>
        </section>
      </div>
    );
  }

  const carFillups = fillups.filter((f) => f.carId === car.id);
  const measured = rollingMileage(carFillups, 5, car.id);
  const sorted = [...carFillups].sort((a, b) => b.odometerKm - a.odometerKm);

  function submitFillup() {
    const l = parseFloat(liters);
    const t = parseFloat(total);
    const o = parseFloat(odo);
    if (!Number.isFinite(l) || !Number.isFinite(t) || !Number.isFinite(o))
      return;
    addFillup({ carId: car!.id, date, liters: l, totalPhp: t, odometerKm: o });
    setLiters("");
    setTotal("");
    setOdo("");
  }

  return (
    <div className="space-y-4">
      <Link href="/cars" className="text-sm text-slate-600 underline">
        ← Back to cars
      </Link>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-1">
        <h1 className="text-xl font-semibold">{car.name}</h1>
        <div className="text-xs text-slate-500">
          Rated{" "}
          {car.fuelEfficiencyKml != null
            ? `${car.fuelEfficiencyKml} km/L`
            : "—"}
          {" · "}
          Measured {measured != null ? `${measured.toFixed(2)} km/L` : "—"}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Log a fill-up</h2>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <input
            value={odo}
            onChange={(e) => setOdo(e.target.value)}
            inputMode="decimal"
            placeholder="Odometer km"
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <input
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            inputMode="decimal"
            placeholder="Liters"
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="decimal"
            placeholder="Total ₱"
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={submitFillup}
          className="bg-slate-200 text-slate-800 text-sm rounded-lg px-3 py-1.5"
        >
          Log fill-up
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <h2 className="font-semibold">Fill-ups</h2>
        {sorted.length === 0 ? (
          <p className="text-xs text-slate-500">No fill-ups logged.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span>
                  {dayjs(f.date).format("MMM D")} · {f.odometerKm} km ·{" "}
                  {f.liters} L · <PHP value={f.totalPhp} />
                </span>
                <button
                  type="button"
                  onClick={() => removeFillup(f.id)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
