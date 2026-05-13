"use client";
import { useState } from "react";
import { useSettings } from "@/lib/hooks/useSettings";
import { usePassengers } from "@/lib/hooks/usePassengers";
import type { DbSettings } from "@/lib/supabase/types";

export default function SettingsPage() {
  const { raw, update } = useSettings();
  const { passengers, add, remove, toggleActive } = usePassengers();
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
            onClick={async () => {
              if (newName.trim()) {
                await add(newName);
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
                  onClick={() => toggleActive(p.id, !p.active)}
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

      {raw && (
        <>
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold">Trip defaults</h2>
            <DbField label="Round-trip km" field="round_trip_km" raw={raw} update={update} />
            <DbField label="Parking (net)" field="parking_fee_php" raw={raw} update={update} />
            <DbField label="Toll Skyway" field="toll_skyway_php" raw={raw} update={update} />
            <DbField label="Toll SLEX" field="toll_slex_php" raw={raw} update={update} />
          </section>

          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold">Split (driver %)</h2>
            <DbField label="1 passenger" field="split_1p_driver" raw={raw} update={update} />
            <DbField label="2 passengers" field="split_2p_driver" raw={raw} update={update} />
            <DbField label="3 passengers" field="split_3p_driver" raw={raw} update={update} />
          </section>
        </>
      )}
    </div>
  );
}

function DbField({
  label,
  field,
  raw,
  update,
}: {
  label: string;
  field: keyof DbSettings;
  raw: DbSettings;
  update: (patch: Partial<DbSettings>) => Promise<void>;
}) {
  const value = raw[field];
  return (
    <label className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        defaultValue={value as number}
        step="0.01"
        onBlur={(e) => update({ [field]: parseFloat(e.target.value) || 0 } as Partial<DbSettings>)}
        className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-right"
      />
    </label>
  );
}
