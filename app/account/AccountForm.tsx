"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AccountForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg(null);
    if (password.length < 8) {
      setStatus("error");
      setErrMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setErrMsg("Passwords don't match.");
      return;
    }
    setStatus("saving");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("saved");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setStatus("error");
      setErrMsg(
        err instanceof Error ? err.message : "Couldn't update password."
      );
    }
  }

  return (
    <div className="max-w-sm mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Account</h1>
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Password</h2>
        <p className="text-sm text-slate-600">
          Set a password so you can sign in instantly next time, without
          waiting for an email link.
        </p>
        {status === "saved" && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">
            Password saved. You can now sign in with your email and password.
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={status === "saving"}
            className="w-full bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
          >
            {status === "saving" ? "Saving..." : "Save password"}
          </button>
          {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
        </form>
      </section>
    </div>
  );
}
