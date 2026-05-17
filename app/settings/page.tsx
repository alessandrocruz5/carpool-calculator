"use client";
import { useState } from "react";
import { useSettings } from "@/lib/store/settings";
import { useRoster, type Passenger } from "@/lib/store/roster";
import { useToast } from "@/components/Toast";
import { EnablePushReminders } from "@/components/push/EnablePushReminders";

export default function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const { passengers, add, remove, toggleActive } = useRoster();
  const [newName, setNewName] = useState("");
  const toast = useToast();

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    try {
      await add(name);
    } catch {
      toast.show({ message: `Couldn't add ${name} — please try again.` });
    }
  }

  async function handleToggle(p: Passenger) {
    try {
      await toggleActive(p.id);
    } catch {
      toast.show({ message: `Couldn't update ${p.name} — please try again.` });
    }
  }

  async function handleRemove(p: Passenger) {
    if (!window.confirm(`Remove ${p.name} from the roster?`)) return;
    try {
      await remove(p.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.show({
        message: msg.includes("passenger_has_rides")
          ? "Can't remove — this coworker has logged rides. Disable them instead."
          : `Couldn't remove ${p.name} — please try again.`,
      });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

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
          label="Mileage (km/L)"
          value={settings.mileageKmPerL}
          onChange={(v) => setSettings({ mileageKmPerL: v })}
        />
        <Field
          label="Parking (net)"
          value={settings.parkingFeePhp}
          onChange={(v) => setSettings({ parkingFeePhp: v })}
        />
        <Field
          label="Toll Skyway"
          value={settings.tollSkywayPhp}
          onChange={(v) => setSettings({ tollSkywayPhp: v })}
        />
        <Field
          label="Toll SLEX"
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
      </section>

      <EnablePushReminders />
    </div>
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
  onChange: (n: number) => void;
  integer?: boolean;
}) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        step={integer ? "1" : "0.01"}
        onChange={(e) =>
          onChange(
            (integer
              ? parseInt(e.target.value, 10)
              : parseFloat(e.target.value)) || 0
          )
        }
        className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-right"
      />
    </label>
  );
}
