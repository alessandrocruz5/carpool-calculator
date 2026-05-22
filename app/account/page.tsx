"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Msg = { kind: "ok" | "err"; text: string } | null;

function AccountForm() {
  const router = useRouter();
  const search = useSearchParams();
  const completing = search.get("complete") === "1";

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (res.ok) {
          const p = (await res.json()) as {
            displayName: string | null;
            avatarUrl: string | null;
          };
          setDisplayName(p.displayName ?? "");
          setAvatarUrl(p.avatarUrl ?? "");
        }
      } catch (err) {
        console.error("load profile failed", err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function saveProfile() {
    if (!displayName.trim()) {
      setProfileMsg({ kind: "err", text: "Display name is required." });
      return;
    }
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          avatarUrl: avatarUrl.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setProfileMsg({ kind: "ok", text: "Profile saved." });
      if (completing) {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setProfileMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to save profile",
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword() {
    if (password.length < 8) {
      setPwMsg({ kind: "err", text: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setPwMsg({ kind: "err", text: "Passwords do not match." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPwMsg({ kind: "ok", text: "Password updated." });
      setPassword("");
      setConfirm("");
    } catch (err) {
      setPwMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to update password",
      });
    } finally {
      setPwBusy(false);
    }
  }

  if (!loaded) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Account</h1>

      {completing && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
          Welcome! Set your display name to finish setting up your account.
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Avatar URL</span>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        {avatarUrl.trim() && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl.trim()}
            alt="avatar preview"
            className="h-16 w-16 rounded-full object-cover border border-slate-200"
          />
        )}
        <button
          type="button"
          onClick={saveProfile}
          disabled={profileBusy}
          className="bg-brand-600 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
        >
          Save profile
        </button>
        {profileMsg && (
          <p
            className={`text-sm ${
              profileMsg.kind === "ok" ? "text-green-700" : "text-red-600"
            }`}
          >
            {profileMsg.text}
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <label className="block text-sm">
          <span className="text-slate-600">New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={changePassword}
          disabled={pwBusy}
          className="bg-slate-200 text-slate-800 text-sm rounded-lg px-4 py-2 disabled:opacity-50"
        >
          Update password
        </button>
        {pwMsg && (
          <p
            className={`text-sm ${
              pwMsg.kind === "ok" ? "text-green-700" : "text-red-600"
            }`}
          >
            {pwMsg.text}
          </p>
        )}
      </section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <AccountForm />
    </Suspense>
  );
}
