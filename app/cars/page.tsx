"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCars, type Car } from "@/lib/store/cars";
import { useFillups } from "@/lib/store/fillups";
import { rollingMileage } from "@/lib/mileage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Car as CarIcon } from "lucide-react";

export const dynamic = "force-dynamic";

function numOrNull(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function isPositiveNumberInput(v: string): boolean {
  if (v.trim() === "") return true;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0;
}

function isPositiveIntegerInput(v: string): boolean {
  if (v.trim() === "") return true;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0;
}

function intOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function CarsPage() {
  const { cars, add, update, remove } = useCars();
  const { fillups } = useFillups();

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [kml, setKml] = useState("");
  const [tank, setTank] = useState("");
  const [maxPax, setMaxPax] = useState("");

  const kmlValid = isPositiveNumberInput(kml);
  const tankValid = isPositiveNumberInput(tank);
  const maxPaxValid = isPositiveIntegerInput(maxPax);
  const canAdd = name.trim().length > 0 && kmlValid && tankValid && maxPaxValid;

  function addCar() {
    if (!canAdd) return;
    add({
      name: name.trim(),
      fuelEfficiencyKml: numOrNull(kml),
      tankSizeLiters: numOrNull(tank),
      maxPassengers: intOrNull(maxPax),
    });
    setName("");
    setKml("");
    setTank("");
    setMaxPax("");
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cars</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Add a car</h2>
        <input
          ref={nameInputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Car name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              value={kml}
              onChange={(e) => setKml(e.target.value)}
              inputMode="decimal"
              placeholder="km/L"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            {!kmlValid && (
              <p className="text-red-600 text-xs mt-1">
                Must be a number greater than 0
              </p>
            )}
          </div>
          <div className="flex-1">
            <input
              value={tank}
              onChange={(e) => setTank(e.target.value)}
              inputMode="decimal"
              placeholder="Tank (L)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            {!tankValid && (
              <p className="text-red-600 text-xs mt-1">
                Must be a number greater than 0
              </p>
            )}
          </div>
          <div className="flex-1">
            <input
              value={maxPax}
              onChange={(e) => setMaxPax(e.target.value)}
              inputMode="numeric"
              placeholder="Max pax"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            {!maxPaxValid && (
              <p className="text-red-600 text-xs mt-1">
                Must be a whole number greater than 0
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={addCar}
            disabled={!canAdd}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50 self-start"
          >
            Add
          </button>
        </div>
      </section>

      {cars.length === 0 && (
        <EmptyState
          icon={CarIcon}
          headline="Add your first car"
          cta={{
            label: "Add a car",
            onClick: () => nameInputRef.current?.focus(),
          }}
        />
      )}

      {cars.map((car) => (
        <CarCard
          key={car.id}
          car={car}
          measured={rollingMileage(
            fillups.filter((f) => f.carId === car.id),
            5,
            car.id
          )}
          onUpdate={(patch) => update(car.id, patch)}
          onRemove={() => remove(car.id)}
        />
      ))}
    </div>
  );
}

function CarCard({
  car,
  measured,
  onUpdate,
  onRemove,
}: {
  car: Car;
  measured: number | null;
  onUpdate: (
    patch: Partial<Pick<Car, "name" | "fuelEfficiencyKml" | "tankSizeLiters" | "maxPassengers">>
  ) => void;
  onRemove: () => Promise<
    { ok: true } | { ok: false; status: number; tripCount?: number }
  >;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(car.name);
  const [kml, setKml] = useState(car.fuelEfficiencyKml?.toString() ?? "");
  const [tank, setTank] = useState(car.tankSizeLiters?.toString() ?? "");
  const [maxPax, setMaxPax] = useState(car.maxPassengers?.toString() ?? "");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const kmlValid = isPositiveNumberInput(kml);
  const tankValid = isPositiveNumberInput(tank);
  const maxPaxValid = isPositiveIntegerInput(maxPax);
  const canSave = kmlValid && tankValid && maxPaxValid;

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

  function saveEdit() {
    if (!canSave) return;
    onUpdate({
      name: name.trim() || car.name,
      fuelEfficiencyKml: numOrNull(kml),
      tankSizeLiters: numOrNull(tank),
      maxPassengers: intOrNull(maxPax),
    });
    setEditing(false);
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
            <div className="flex-1">
              <input
                value={kml}
                onChange={(e) => setKml(e.target.value)}
                inputMode="decimal"
                placeholder="km/L"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              {!kmlValid && (
                <p className="text-red-600 text-xs mt-1">
                  Must be a number greater than 0
                </p>
              )}
            </div>
            <div className="flex-1">
              <input
                value={tank}
                onChange={(e) => setTank(e.target.value)}
                inputMode="decimal"
                placeholder="Tank (L)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              {!tankValid && (
                <p className="text-red-600 text-xs mt-1">
                  Must be a number greater than 0
                </p>
              )}
            </div>
            <div className="flex-1">
              <input
                value={maxPax}
                onChange={(e) => setMaxPax(e.target.value)}
                inputMode="numeric"
                placeholder="Max pax"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              {!maxPaxValid && (
                <p className="text-red-600 text-xs mt-1">
                  Must be a whole number greater than 0
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={!canSave}
              className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
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
              Measured {measured != null ? `${measured.toFixed(2)} km/L` : "—"}
              {" · "}
              {car.maxPassengers != null ? `${car.maxPassengers} passengers` : "pax not set"}
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
            <Link
              href={`/cars/${car.id}`}
              className="text-slate-600 underline"
            >
              Fill-ups
            </Link>
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

      {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
    </section>
  );
}
