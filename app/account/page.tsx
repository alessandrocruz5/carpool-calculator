"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function AccountPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-slate-500">Loading account…</p>}
    >
      <AccountInner />
    </Suspense>
  );
}

function AccountInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mustComplete = searchParams.get("complete") === "1";

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savedName, setSavedName] = useState("");

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [profileBusy, setProfileBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      const p = profile as
        | { display_name: string | null; avatar_url: string | null }
        | null;
      setDisplayName(p?.display_name ?? "");
      setSavedName(p?.display_name ?? "");
      setAvatarUrl(p?.avatar_url ?? "");
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    const name = displayName.trim();
    if (!name) {
      setProfileMsg({ kind: "err", text: "Display name is required." });
      return;
    }
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: name,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      setSavedName(name);
      setProfileMsg({ kind: "ok", text: "Profile saved." });
      if (mustComplete) router.replace("/");
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
    if (password !== password2) {
      setPwMsg({ kind: "err", text: "Passwords do not match." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setPassword2("");
      setPwMsg({ kind: "ok", text: "Password updated." });
    } catch (err) {
      setPwMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to update password",
      });
    } finally {
      setPwBusy(false);
    }
  }

  if (loading)
    return <p className="text-sm text-slate-500">Loading account…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Account</h1>

      {mustComplete && !savedName && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
          Set a display name to finish setting up your account.
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Email</span>
          <input
            value={email}
            disabled
            className="mt-1 w-full border border-slate-200 bg-slate-50 text-slate-500 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Avatar URL</span>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        {avatarUrl.trim() && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl.trim()}
            alt="Avatar preview"
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
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Confirm password</span>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
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
