"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "error">(
    "idle"
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  function switchMode(next: "password" | "magic") {
    setMode(next);
    setStatus("idle");
    setErrMsg(null);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setErrMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      window.location.assign("/");
    } catch (err) {
      setStatus("error");
      setErrMsg(
        err instanceof Error && /invalid login credentials/i.test(err.message)
          ? "Wrong email or password. If you haven't set a password yet, use the email link option below."
          : err instanceof Error
          ? err.message
          : "Sign in failed."
      );
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    setErrMsg(null);
    try {
      const supabase = createClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${siteUrl}/auth/confirm` },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "failed to send link");
    }
  }

  if (status === "sent") {
    return (
      <div className="max-w-sm mx-auto mt-16 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">
          Check <span className="font-medium">{email}</span> for a sign-in link.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>

      {mode === "password" ? (
        <>
          <p className="text-sm text-slate-600">
            Enter your email and password.
          </p>
          <form onSubmit={signInWithPassword} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={status === "working"}
              className="w-full bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
            >
              {status === "working" ? "Signing in..." : "Sign in"}
            </button>
            {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
          </form>
          <button
            onClick={() => switchMode("magic")}
            className="text-sm text-brand-600 underline"
          >
            Email me a sign-in link instead
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            We&apos;ll email you a magic sign-in link. First time here, or
            forgot your password? Use this.
          </p>
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={status === "working"}
              className="w-full bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
            >
              {status === "working" ? "Sending..." : "Send magic link"}
            </button>
            {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
          </form>
          <button
            onClick={() => switchMode("password")}
            className="text-sm text-brand-600 underline"
          >
            Sign in with a password instead
          </button>
        </>
      )}
    </div>
  );
}
