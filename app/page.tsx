"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dayjs from "dayjs";
import Link from "next/link";
import { LegCard, type LegState } from "@/components/LegCard";
import { PHP } from "@/components/PHP";
import { useSettings } from "@/lib/store/settings";
import { useRoster } from "@/lib/store/roster";
import { useTrips } from "@/lib/store/trips";
import { useFillups } from "@/lib/store/fillups";
import { useCars } from "@/lib/store/cars";
import { useMembers } from "@/lib/store/members";
import { useGroups } from "@/lib/store/groups";
import { useProfile } from "@/lib/store/profile";
import { NamePrompt } from "@/components/NamePrompt";
import { useToast } from "@/components/Toast";
import { useIsDriver } from "@/lib/auth/useIsDriver";
import { DriverSelect } from "@/components/DriverSelect";
import { rollingMileage, resolveEffectiveMileage } from "@/lib/mileage";
import { calcDay } from "@/lib/calc";
import { daysSince } from "@/lib/week";

export default function TodayPage() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const isValidDate = dateParam != null && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
  const today = isValidDate ? (dateParam as string) : dayjs().format("YYYY-MM-DD");
  const isPastEdit = isValidDate && today !== dayjs().format("YYYY-MM-DD");
  const { settings, gasPrice, gasPriceUpdatedAt } = useSettings();
  const { passengers } = useRoster();
  const { fillups } = useFillups();
  const { cars } = useCars();
  const { trips, upsert } = useTrips();
  const { members } = useMembers();
  const activeGroupId = useGroups((s) => s.activeGroupId);
  const userId = useProfile((s) => s.profile?.userId ?? null);
  const toast = useToast();
  const isDriver = useIsDriver();

  const existing = trips.find((t) => t.date === today);
  // A fresh leg defaults to skyway, no riders, half the round-trip distance.
  const newLeg = (): LegState => ({
    route: "skyway",
    passengerIds: [],
    distanceKm: settings.roundTripKm / 2,
  });
  const [legs, setLegs] = useState<LegState[]>(
    existing?.legs ?? [newLeg(), newLeg()]
  );
  const [carId, setCarId] = useState<string>(existing?.carId ?? "");
  const [driverUserId, setDriverUserId] = useState<string | null>(
    existing?.driverUserId ?? null
  );

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const t = trips.find((x) => x.date === today);
    if (!t) return;
    setLegs(t.legs);
    setCarId(t.carId ?? "");
    setDriverUserId(t.driverUserId ?? null);
    // Reload state only when navigating to a different date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Default the car picker to the trip's saved car, else the only car.
  useEffect(() => {
    if (carId) return;
    if (existing?.carId) setCarId(existing.carId);
    else if (cars.length === 1) setCarId(cars[0].id);
  }, [cars, existing, carId]);

  // Default driver to current user when they're a driver; otherwise leave blank.
  useEffect(() => {
    if (driverUserId !== null) return;
    if (existing?.driverUserId) {
      setDriverUserId(existing.driverUserId);
      return;
    }
    if (!userId) return;
    const self = members.find((m) => m.userId === userId);
    if (self && (self.role === "driver" || self.role === "both")) {
      setDriverUserId(userId);
    }
  }, [members, existing, userId, driverUserId]);

  const selectedCar = cars.find((c) => c.id === carId);
  // A chosen car contributes its efficiency, but an enabled group-level override
  // always beats even the car's own rated value.
  const carMeasured = carId ? rollingMileage(fillups, 5, carId) : null;
  const carEfficiency =
    selectedCar?.fuelEfficiencyKml || carMeasured || null;
  const measuredMileage = rollingMileage(fillups);
  const effectiveMileage = resolveEffectiveMileage({
    carEfficiency,
    override: settings.mileageKmPerL,
    overrideEnabled: settings.mileageOverrideEnabled,
    rollingAvg: measuredMileage,
  });
  const liveSettings = { ...settings, mileageKmPerL: effectiveMileage };
  // Use the car's max_passengers from the DB; fall back to undefined (no cap)
  // so the passenger roster size becomes the practical limit instead of 3.
  const maxPassengers = selectedCar?.maxPassengers ?? undefined;

  const activePassengers = passengers.filter((p) => p.active);
  const stale = gasPriceUpdatedAt ? daysSince(gasPriceUpdatedAt) > 7 : true;

  const day = calcDay(
    {
      date: today,
      gasPricePhpPerL: gasPrice,
      legs,
    },
    liveSettings
  );

  // Update a single leg in place; add appends a default leg; remove drops the
  // last (kept at a minimum of 1).
  const updateLeg = (i: number, next: LegState) =>
    setLegs((prev) => prev.map((leg, idx) => (idx === i ? next : leg)));
  const addLeg = () => setLegs((prev) => [...prev, newLeg()]);
  const removeLeg = () => setLegs((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  async function save() {
    if (legs.some((leg) => !(leg.distanceKm > 0))) {
      toast.show({ message: "Enter a distance (km) for every leg.", variant: "info" });
      return;
    }
    try {
      const pair =
        driverUserId && carId
          ? { driverUserId, carId }
          : { driverUserId: null, carId: null };
      await upsert({
        id: existing?.id ?? crypto.randomUUID(),
        date: today,
        gasPrice,
        parkingFee: settings.parkingFeePhp,
        legs,
        ...pair,
      });
      toast.show({
        message: existing ? "Trip updated." : "Trip saved.",
        variant: "success",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.show({
        variant: "error",
        message: /forbidden|403/i.test(msg)
          ? "Couldn't save — only the driver can log trips."
          : "Couldn't save trip. Check your connection and try again.",
      });
    }
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-4">
      <NamePrompt />
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div>
          <h1 className="text-xl font-semibold">{dayjs(today).format("ddd, MMM D")}</h1>
          {isPastEdit && (
            <p className="text-[11px] text-amber-700">Editing past trip</p>
          )}
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

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Driver</h2>
          <DriverSelect
            value={driverUserId}
            onChange={(next) => {
              setDriverUserId(next);
              if (next !== userId) setCarId("");
            }}
            activeGroupId={activeGroupId}
            currentUserId={userId}
          />
        </div>

        {!driverUserId && (
          <p className="text-xs text-slate-500">Pick a driver first.</p>
        )}

        {driverUserId && driverUserId === userId && cars.length === 0 && (
          <p className="text-xs text-slate-500">
            You have no cars yet —{" "}
            <Link href="/cars" className="text-brand-600 underline">
              Add one
            </Link>
            .
          </p>
        )}

        {driverUserId && driverUserId === userId && cars.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Car</span>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">— no car —</option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {driverUserId &&
          driverUserId === userId &&
          cars.length > 0 &&
          selectedCar && (
            <p className="text-xs text-slate-500">
              {carEfficiency
                ? `Using ${effectiveMileage.toFixed(2)} km/L for ${selectedCar.name}`
                : `${selectedCar.name} has no efficiency data — using ${effectiveMileage.toFixed(2)} km/L`}
            </p>
          )}

        {driverUserId && driverUserId !== userId && (
          <p className="text-sm text-slate-600">
            Car: chosen by {
              members.find((m) => m.userId === driverUserId)?.displayName ?? driverUserId
            }
          </p>
        )}
      </section>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Legs ({legs.length})</h2>
        {isDriver && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={removeLeg}
              disabled={legs.length <= 1}
              aria-label="Remove leg"
              className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={addLeg}
              aria-label="Add leg"
              className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700"
            >
              +
            </button>
          </div>
        )}
      </div>

      {legs.map((leg, i) => (
        <LegCard
          key={`leg-${i}-${today}`}
          label={`Leg ${i + 1}`}
          applyParking={i === 0}
          state={leg}
          onChange={(next) => updateLeg(i, next)}
          passengers={activePassengers}
          gasPrice={gasPrice}
          settings={liveSettings}
          readOnly={!isDriver}
          maxPassengers={maxPassengers}
        />
      ))}

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
