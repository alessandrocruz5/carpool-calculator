"use client";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useCars, type Car } from "@/lib/store/cars";
import { useFillups } from "@/lib/store/fillups";
import { rollingMileage } from "@/lib/mileage";
import { PHP } from "@/components/PHP";

export const dynamic = "force-dynamic";

function numOrNull(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function CarsPage() {
  const { cars, add, update, remove } = useCars();
  const { fillups, add: addFillup, remove: removeFillup } = useFillups();

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [name, setName] = useState("");
  const [kml, setKml] = useState("");
  const [tank, setTank] = useState("");

  function addCar() {
    if (!name.trim()) return;
    add({
      name: name.trim(),
      fuelEfficiencyKml: numOrNull(kml),
      tankSizeLiters: numOrNull(tank),
    });
    setName("");
    setKml("");
    setTank("");
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cars</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Add a car</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Car name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={kml}
            onChange={(e) => setKml(e.target.value)}
            inputMode="decimal"
            placeholder="km/L"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={tank}
            onChange={(e) => setTank(e.target.value)}
            inputMode="decimal"
            placeholder="Tank (L)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCar}
            disabled={!name.trim()}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      {cars.length === 0 && (
        <p className="text-sm text-slate-500">No cars yet. Add one above.</p>
      )}

      {cars.map((car) => (
        <CarCard
          key={car.id}
          car={car}
          fillups={fillups.filter((f) => f.carId === car.id)}
          onUpdate={(patch) => update(car.id, patch)}
          onRemove={() => remove(car.id)}
          onAddFillup={(f) => addFillup({ ...f, carId: car.id })}
          onRemoveFillup={removeFillup}
        />
      ))}
    </div>
  );
}

function CarCard({
  car,
  fillups,
  onUpdate,
  onRemove,
  onAddFillup,
  onRemoveFillup,
}: {
  car: Car;
  fillups: { id: string; date: string; liters: number; totalPhp: number; odometerKm: number }[];
  onUpdate: (
    patch: Partial<Pick<Car, "name" | "fuelEfficiencyKml" | "tankSizeLiters">>
  ) => void;
  onRemove: () => Promise<
    { ok: true } | { ok: false; status: number; tripCount?: number }
  >;
  onAddFillup: (f: {
    date: string;
    liters: number;
    totalPhp: number;
    odometerKm: number;
  }) => void;
  onRemoveFillup: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(car.name);
  const [kml, setKml] = useState(car.fuelEfficiencyKml?.toString() ?? "");
  const [tank, setTank] = useState(car.tankSizeLiters?.toString() ?? "");

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [odo, setOdo] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleRemove() {
    if (!window.confirm("Delete this car?")) return;
    const result = await onRemove();
    if (result.ok) {
      setDeleteError(null);
      return;
    }
    if (result.status === 409) {
      const n = result.tripCount ?? 0;
      setDeleteError(
        `Can't delete — used by ${n} trip(s). Remove it from those trips first.`
      );
    } else {
      setDeleteError("Couldn't delete this car. Please try again.");
    }
  }

  const measured = rollingMileage(
    fillups.map((f) => ({ ...f, carId: car.id })),
    5,
    car.id
  );
  const sorted = [...fillups].sort((a, b) => b.odometerKm - a.odometerKm);

  function saveEdit() {
    onUpdate({
      name: name.trim() || car.name,
      fuelEfficiencyKml: numOrNull(kml),
      tankSizeLiters: numOrNull(tank),
    });
    setEditing(false);
  }

  function submitFillup() {
    const l = parseFloat(liters);
    const t = parseFloat(total);
    const o = parseFloat(odo);
    if (!Number.isFinite(l) || !Number.isFinite(t) || !Number.isFinite(o))
      return;
    onAddFillup({ date, liters: l, totalPhp: t, odometerKm: o });
    setLiters("");
    setTotal("");
    setOdo("");
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      {editing ? (
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={kml}
              onChange={(e) => setKml(e.target.value)}
              inputMode="decimal"
              placeholder="km/L"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={tank}
              onChange={(e) => setTank(e.target.value)}
              inputMode="decimal"
              placeholder="Tank (L)"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-slate-600 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold">{car.name}</div>
            <div className="text-xs text-slate-500">
              Rated{" "}
              {car.fuelEfficiencyKml != null
                ? `${car.fuelEfficiencyKml} km/L`
                : "—"}
              {" · "}
              Tank{" "}
              {car.tankSizeLiters != null
                ? `${car.tankSizeLiters} L`
                : "—"}
            </div>
            <div className="text-xs text-slate-500">
              Measured{" "}
              {measured != null ? `${measured.toFixed(2)} km/L` : "—"}
            </div>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-slate-600 underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="text-red-600 underline"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {deleteError && (
        <p className="text-xs text-red-600">{deleteError}</p>
      )}

      <div className="border-t border-slate-100 pt-3 space-y-2">
        <h3 className="text-sm font-medium">Fill-ups</h3>
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
                  onClick={() => onRemoveFillup(f.id)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
