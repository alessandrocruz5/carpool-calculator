"use client";
import { useState } from "react";

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(await res.text());
      const group = (await res.json()) as { id: string };
      await fetch("/api/groups/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      });
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Group name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily commute"
          autoFocus
          className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="w-full bg-brand-600 text-white text-sm font-medium rounded-lg px-3 py-2 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create group"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
