"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Car as CarIcon, ChevronRight } from "lucide-react";
import dayjs from "dayjs";
import { useSettings, type SaveResult } from "@/lib/store/settings";
import { useRoster, type Passenger } from "@/lib/store/roster";
import { useCars } from "@/lib/store/cars";
import { useFillups } from "@/lib/store/fillups";
import { rollingMileage, resolveEffectiveMileage } from "@/lib/mileage";
import { PHP } from "@/components/PHP";
import { Switch } from "@/components/Switch";
import { useToast } from "@/components/Toast";
import { EnablePushReminders } from "@/components/push/EnablePushReminders";
import { ONBOARDING_START_EVENT } from "@/components/OnboardingTour";

export default function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const { passengers, add, remove, toggleActive } = useRoster();
  const { cars } = useCars();
  const { fillups, add: addFillup, remove: removeFillup } = useFillups();
  const toast = useToast();
  const [newName, setNewName] = useState("");
  const [mileageDraft, setMileageDraft] = useState("");

  const [fillupDate, setFillupDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [fillupCarId, setFillupCarId] = useState("");
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [odo, setOdo] = useState("");

  const rolling = rollingMileage(fillups);
  const sortedFillups = [...fillups].sort((a, b) => a.odometerKm - b.odometerKm);
  const series: number[] = [];
  for (let i = 1; i < sortedFillups.length; i++) {
    const slice = sortedFillups.slice(0, i + 1);
    const v = rollingMileage(slice);
    if (v != null) series.push(v);
  }
  const override = settings.mileageKmPerL;
  const overrideEnabled = settings.mileageOverrideEnabled;
  const hasOverride = override > 0;
  const hasRolling = rolling != null && rolling > 0;
  // The override is what actually drives trips when it's switched on, or when
  // there's no rolling average to fall back to yet.
  const overrideInEffect = hasOverride && (overrideEnabled || !hasRolling);
  const effectiveMileage = resolveEffectiveMileage({
    override,
    overrideEnabled,
    rollingAvg: rolling,
  });
  const divergencePct =
    rolling && override ? Math.abs(override - rolling) / rolling : null;
  const overrideOff =
    overrideInEffect && divergencePct != null && divergencePct > 0.15;

  // Keep the draft in sync with the stored override (e.g. after hydration or a
  // committed save); the value only changes here on blur, so this never clobbers
  // mid-edit typing.
  useEffect(() => {
    setMileageDraft(override ? String(override) : "");
  }, [override]);

  async function commitMileage() {
    const next = parseFloat(mileageDraft) || 0;
    if (next === override) return;
    const res = await setSettings({ mileageKmPerL: next });
    toast.show(
      res.ok
        ? { message: "Mileage override saved.", variant: "success" }
        : {
            message: describeError(res.error, "Couldn't save mileage override."),
            variant: "error",
          }
    );
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    try {
      await add(name);
      toast.show({ message: `Added ${name}.`, variant: "success" });
    } catch (err) {
      toast.show({
        message: describeError(err, "Couldn't add coworker."),
        variant: "error",
      });
    }
  }

  async function handleToggle(p: Passenger) {
    try {
      await toggleActive(p.id);
      toast.show({
        message: p.active ? `Disabled ${p.name}.` : `Enabled ${p.name}.`,
        variant: "success",
      });
    } catch (err) {
      toast.show({
        message: describeError(err, `Couldn't update ${p.name}.`),
        variant: "error",
      });
    }
  }

  async function handleRemove(p: Passenger) {
    if (!window.confirm(`Remove ${p.name}? This can't be undone.`)) return;
    try {
      await remove(p.id);
      toast.show({ message: `Removed ${p.name}.`, variant: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.show({
        message: /foreign key|23503/i.test(msg)
          ? "Can't remove — this coworker has logged rides. Disable them instead."
          : describeError(err, "Couldn't remove coworker."),
        variant: "error",
      });
    }
  }

  const selectedCarId = fillupCarId || cars[0]?.id || "";

  async function submitFillup() {
    if (!liters || !total || !odo || !selectedCarId) return;
    const res = await addFillup({
      carId: selectedCarId,
      date: fillupDate,
      liters: parseFloat(liters),
      totalPhp: parseFloat(total),
      odometerKm: parseFloat(odo),
    });
    setLiters("");
    setTotal("");
    setOdo("");
    toast.show(
      res.ok
        ? { message: "Fill-up logged.", variant: "success" }
        : {
            message: describeError(res.error, "Couldn't log fill-up."),
            variant: "error",
          }
    );
  }

  async function handleRemoveFillup(id: string) {
    const res = await removeFillup(id);
    toast.show(
      res.ok
        ? { message: "Fill-up removed.", variant: "success" }
        : {
            message: describeError(res.error, "Couldn't remove fill-up."),
            variant: "error",
          }
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Link
        href="/cars"
        className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-4 hover:border-brand-500 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          <CarIcon className="h-5 w-5 text-slate-400" aria-hidden />
          Manage cars
        </span>
        <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
      </Link>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Roster</h2>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Coworker name"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handleAdd}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2"
          >
            Add
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {passengers.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span className={p.active ? "" : "text-slate-400 line-through"}>{p.name}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggle(p)}
                  className="text-xs text-slate-600 underline"
                >
                  {p.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleRemove(p)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Trip defaults</h2>
        <Field
          label="Round-trip km"
          value={settings.roundTripKm}
          onChange={(v) => setSettings({ roundTripKm: v })}
        />
        <Field
          label="Parking (net)"
          value={settings.parkingFeePhp}
          onChange={(v) => setSettings({ parkingFeePhp: v })}
        />
        <Field
          label="Toll Skyway (default)"
          value={settings.tollSkywayPhp}
          onChange={(v) => setSettings({ tollSkywayPhp: v })}
        />
        <Field
          label="Toll SLEX (default)"
          value={settings.tollSlexPhp}
          onChange={(v) => setSettings({ tollSlexPhp: v })}
        />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Split (driver %)</h2>
        <Field
          label="1 passenger"
          value={settings.split1pDriver}
          onChange={(v) => setSettings({ split1pDriver: v })}
          integer
        />
        <Field
          label="2 passengers"
          value={settings.split2pDriver}
          onChange={(v) => setSettings({ split2pDriver: v })}
          integer
        />
        <Field
          label="3 passengers"
          value={settings.split3pDriver}
          onChange={(v) => setSettings({ split3pDriver: v })}
          integer
        />
        <Field
          label="4 passengers"
          value={settings.split4pDriver}
          onChange={(v) => setSettings({ split4pDriver: v })}
          integer
        />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-2">Mileage</h2>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-500">Rolling avg (last 5)</span>
          <span className="font-medium">
            {rolling ? `${rolling.toFixed(2)} km/L` : "Need 2+ fill-ups"}
          </span>
        </div>
        {series.length >= 2 && (
          <Sparkline values={series} className="mt-1 mb-2" />
        )}
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-slate-500">Manual override</span>
          <div className="flex items-center gap-2">
            <input
              type="text" inputMode="decimal"
              step="0.01"
              placeholder="km/L"
              value={mileageDraft}
              onChange={(e) => setMileageDraft(e.target.value)}
              onBlur={commitMileage}
              className="w-24 border border-slate-300 rounded px-2 py-0.5 text-right"
            />
            <Switch
              checked={overrideEnabled}
              disabled={!hasOverride}
              label="Use manual override"
              onChange={(next) => setSettings({ mileageOverrideEnabled: next })}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {overrideInEffect
            ? `Using manual override — trips run at ${effectiveMileage.toFixed(2)} km/L.`
            : hasRolling
              ? `Using rolling average (${rolling!.toFixed(2)} km/L). Switch on to use the override${hasOverride ? "" : " once set"}.`
              : hasOverride
                ? `No rolling average yet — using the override (${override.toFixed(2)} km/L) until one is computed.`
                : "Add an override value and switch it on to use it instead of the rolling average."}
        </p>
        {overrideOff && (
          <div
            role="alert"
            data-testid="mileage-override-warning"
            className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900"
          >
            <span>
              Manual override is {(divergencePct! * 100).toFixed(0)}% off the rolling
              average ({rolling!.toFixed(2)} km/L). Consider updating it.
            </span>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Log fill-up</h2>
        {cars.length === 0 ? (
          <p className="text-sm text-slate-500">
            Add a car first to log a fill-up.
          </p>
        ) : (
          <label className="block text-sm">
            <span className="text-slate-600">Car</span>
            <select
              value={selectedCarId}
              onChange={(e) => setFillupCarId(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            >
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="text-slate-600">Date</span>
          <input
            type="date"
            value={fillupDate}
            onChange={(e) => setFillupDate(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Liters</span>
          <input
            type="text" inputMode="decimal"
            step="0.01"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Total ₱</span>
          <input
            type="text" inputMode="decimal"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Odometer (km)</span>
          <input
            type="text" inputMode="decimal"
            step="0.1"
            value={odo}
            onChange={(e) => setOdo(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <button
          onClick={submitFillup}
          disabled={!selectedCarId}
          className="w-full bg-brand-600 text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50"
        >
          Add fill-up
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-2">Fill-up history</h2>
        {fillups.length === 0 && (
          <p className="text-sm text-slate-500">No fill-ups logged.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {[...fillups]
            .sort((a, b) => b.odometerKm - a.odometerKm)
            .map((f) => (
              <li key={f.id} className="py-2 text-sm flex justify-between items-center">
                <div>
                  <div>{dayjs(f.date).format("MMM D")}</div>
                  <div className="text-xs text-slate-500">
                    {f.liters}L · {f.odometerKm.toFixed(1)} km
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <PHP value={f.totalPhp} />
                  <button
                    onClick={() => handleRemoveFillup(f.id)}
                    className="text-xs text-red-600 underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
        </ul>
      </section>

      <EnablePushReminders />

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <h2 className="font-semibold">App tour</h2>
        <p className="text-sm text-slate-600">
          Replay the first-visit walkthrough.
        </p>
        <button
          onClick={() => {
            try {
              localStorage.removeItem("cc:onboarding:done");
            } catch {}
            window.dispatchEvent(new Event(ONBOARDING_START_EVENT));
          }}
          className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2"
        >
          Show tour again
        </button>
      </section>
    </div>
  );
}

// Surfaces the real server error instead of masking everything as a
// connection problem. Genuine fetch failures throw a TypeError; anything
// else carries a server response body worth showing.
function describeError(err: unknown, prefix: string): string {
  if (err instanceof TypeError) {
    return `${prefix} Check your connection and try again.`;
  }
  const raw = err instanceof Error ? err.message : String(err ?? "");
  let detail = raw.trim();
  try {
    const parsed = JSON.parse(detail) as { error?: string };
    if (parsed?.error) detail = parsed.error;
  } catch {
    // not JSON — use the raw text
  }
  return detail ? `${prefix} ${detail}` : `${prefix} Please try again.`;
}

function Sparkline({
  values,
  className,
  width = 160,
  height = 32,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      role="img"
      aria-label="rolling mileage trend"
      data-testid="mileage-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-brand-600"
        points={points}
      />
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
  integer,
}: {
  label: string;
  value: number;
  onChange: (n: number) => Promise<SaveResult>;
  integer?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n =
      (integer ? parseInt(e.target.value, 10) : parseFloat(e.target.value)) || 0;
    const res = await onChange(n);
    if (!res.ok) return;
    // Non-toast confirmation for these auto-saving inputs; transient so rapid
    // edits don't pile up.
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  }

  return (
    <label className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-2">
        <span
          aria-live="polite"
          className={`text-xs text-emerald-600 transition-opacity ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved ✓
        </span>
        <input
          type="text" inputMode="decimal"
          value={value}
          step={integer ? "1" : "0.01"}
          onChange={handleChange}
          className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-right"
        />
      </span>
    </label>
  );
}
