"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useCars, type Car } from "@/lib/store/cars";
import { useFillups } from "@/lib/store/fillups";
import { rollingMileage } from "@/lib/mileage";
import { PHP } from "@/components/PHP";

function numOrNull(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function CarsPage() {
  const { cars, add } = useCars();
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

  return (
    <div className="space-y-4">
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
          <label className="flex-1 text-sm">
            <span className="text-slate-600">Efficiency (km/L)</span>
            <input
              type="number"
              step="0.01"
              value={kml}
              onChange={(e) => setKml(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="text-slate-600">Tank (L)</span>
            <input
              type="number"
              step="0.1"
              value={tank}
              onChange={(e) => setTank(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={addCar}
          disabled={!name.trim()}
          className="bg-brand-600 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
        >
          Add car
        </button>
      </section>

      {cars.length === 0 && (
        <p className="text-sm text-slate-500">No cars yet.</p>
      )}
      {cars.map((car) => (
        <CarCard key={car.id} car={car} />
      ))}
    </div>
  );
}

function CarCard({ car }: { car: Car }) {
  const { update, remove } = useCars();
  const { fillups, add: addFillup, remove: removeFillup } = useFillups();

  const [name, setName] = useState(car.name);
  const [kml, setKml] = useState(
    car.fuelEfficiencyKml != null ? String(car.fuelEfficiencyKml) : ""
  );
  const [tank, setTank] = useState(
    car.tankSizeLiters != null ? String(car.tankSizeLiters) : ""
  );

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [odo, setOdo] = useState("");

  const carFillups = fillups
    .filter((f) => f.carId === car.id)
    .sort((a, b) => b.odometerKm - a.odometerKm);
  const measured = rollingMileage(fillups, 5, car.id);

  function saveCar() {
    update(car.id, {
      name: name.trim() || car.name,
      fuelEfficiencyKml: numOrNull(kml),
      tankSizeLiters: numOrNull(tank),
    });
  }

  function logFillup() {
    if (!liters || !total || !odo) return;
    addFillup({
      carId: car.id,
      date,
      liters: parseFloat(liters),
      totalPhp: parseFloat(total),
      odometerKm: parseFloat(odo),
    });
    setLiters("");
    setTotal("");
    setOdo("");
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-semibold border-b border-transparent focus:border-slate-300 outline-none"
        />
        <button
          type="button"
          onClick={() => remove(car.id)}
          className="text-xs text-red-600 underline"
        >
          Delete
        </button>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-sm">
          <span className="text-slate-600">Efficiency (km/L)</span>
          <input
            type="number"
            step="0.01"
            value={kml}
            onChange={(e) => setKml(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="text-slate-600">Tank (L)</span>
          <input
            type="number"
            step="0.1"
            value={tank}
            onChange={(e) => setTank(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={saveCar}
        className="bg-slate-200 text-slate-800 text-sm rounded-lg px-3 py-1.5"
      >
        Save changes
      </button>

      <div className="border-t border-slate-100 pt-3">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-500">Measured mileage (rolling)</span>
          <span className="font-medium">
            {measured ? `${measured.toFixed(2)} km/L` : "Need 2+ fill-ups"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <label>
            <span className="text-slate-600 text-xs">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5"
            />
          </label>
          <label>
            <span className="text-slate-600 text-xs">Odometer (km)</span>
            <input
              type="number"
              step="0.1"
              value={odo}
              onChange={(e) => setOdo(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5"
            />
          </label>
          <label>
            <span className="text-slate-600 text-xs">Liters</span>
            <input
              type="number"
              step="0.01"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5"
            />
          </label>
          <label>
            <span className="text-slate-600 text-xs">Total ₱</span>
            <input
              type="number"
              step="0.01"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={logFillup}
          disabled={!liters || !total || !odo}
          className="mt-2 bg-brand-600 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          Log fill-up
        </button>

        <ul className="divide-y divide-slate-100 mt-2">
          {carFillups.length === 0 && (
            <li className="text-xs text-slate-500 py-2">
              No fill-ups for this car.
            </li>
          )}
          {carFillups.map((f) => (
            <li
              key={f.id}
              className="py-2 text-sm flex items-center justify-between"
            >
              <div>
                <div>{dayjs(f.date).format("MMM D")}</div>
                <div className="text-xs text-slate-500">
                  {f.liters}L · {f.odometerKm.toFixed(1)} km
                </div>
              </div>
              <div className="flex items-center gap-3">
                <PHP value={f.totalPhp} />
                <button
                  type="button"
                  onClick={() => removeFillup(f.id)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
