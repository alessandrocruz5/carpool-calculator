"use client";
import { useState } from "react";
import { useSettings } from "@/lib/store/settings";
import { useRoster } from "@/lib/store/roster";

export default function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const { passengers, add, remove, toggleActive } = useRoster();
  const [newName, setNewName] = useState("");

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
            onClick={() => {
              if (newName.trim()) {
                add(newName);
                setNewName("");
              }
            }}
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
                  onClick={() => toggleActive(p.id)}
                  className="text-xs text-slate-600 underline"
                >
                  {p.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => remove(p.id)}
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
        />
        <Field
          label="2 passengers"
          value={settings.split2pDriver}
          onChange={(v) => setSettings({ split2pDriver: v })}
        />
        <Field
          label="3 passengers"
          value={settings.split3pDriver}
          onChange={(v) => setSettings({ split3pDriver: v })}
        />
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        step="0.01"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-right"
      />
    </label>
  );
}
