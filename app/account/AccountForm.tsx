"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NotificationsToggle } from "@/components/push/NotificationsToggle";
import { useProfile } from "@/lib/store/profile";
import { useToast } from "@/components/Toast";

export default function AccountForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null);
    });
  }, []);

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
      <NameSection />
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

      <NotificationsToggle />

      <ChangeEmailSection currentEmail={currentEmail} />
      <ExportDataSection />
      <DeleteAccountSection currentEmail={currentEmail} />
    </div>
  );
}

function NameSection() {
  const profile = useProfile((s) => s.profile);
  const hydrated = useProfile((s) => s.hydrated);
  const update = useProfile((s) => s.update);
  const toast = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the inputs from the profile once it has hydrated.
  useEffect(() => {
    if (seeded || !hydrated || !profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setSeeded(true);
  }, [seeded, hydrated, profile]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first) {
      toast.show({ message: "Enter your first name.", variant: "info" });
      return;
    }
    setSaving(true);
    try {
      await update({ firstName: first, lastName: last });
      toast.show({ message: "Name saved.", variant: "success" });
    } catch {
      toast.show({ message: "Couldn't save your name.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="font-semibold">Your name</h2>
      <p className="text-sm text-slate-600">
        Shown to the rest of your carpool instead of your email.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="text"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving || !hydrated}
          className="w-full bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save name"}
        </button>
      </form>
    </section>
  );
}

function ChangeEmailSection({
  currentEmail,
}: {
  currentEmail: string | null;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "working" | "pending" | "error">(
    "idle"
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingFor, setPendingFor] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setState("working");
    try {
      const res = await fetch("/api/account/change-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        pending_email?: string;
      };
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Too many email changes. Try again in an hour.");
        }
        throw new Error(body.error ?? "Couldn't start email change.");
      }
      setPendingFor(body.pending_email ?? email);
      setState("pending");
      setEmail("");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Failed.");
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="font-semibold">Change email</h2>
      <p className="text-sm text-slate-600">
        Current: <span className="font-mono">{currentEmail ?? "—"}</span>
      </p>
      {state === "pending" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm">
          Pending confirmation. Check both <strong>{currentEmail}</strong> and{" "}
          <strong>{pendingFor}</strong> &mdash; Supabase needs you to click the
          link in each inbox before the change takes effect.
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="new@example.com"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state === "working"}
          className="w-full bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {state === "working" ? "Sending..." : "Send confirmation"}
        </button>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </form>
    </section>
  );
}

function ExportDataSection() {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="font-semibold">Download my data</h2>
      <p className="text-sm text-slate-600">
        Get a JSON copy of your profile, group memberships, cars, fillups,
        trips and payments. Other members&rsquo; personal details are redacted.
      </p>
      <a
        href="/api/account/export"
        download
        className="inline-block w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2"
      >
        Download JSON
      </a>
    </section>
  );
}

function DeleteAccountSection({
  currentEmail,
}: {
  currentEmail: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const canConfirm =
    !!currentEmail && typed.trim().toLowerCase() === currentEmail.toLowerCase();

  async function onConfirm() {
    setState("working");
    setMsg(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          body.message ?? body.error ?? "Couldn't delete the account."
        );
      }
      try {
        await createClient().auth.signOut();
      } catch {
        // ignore
      }
      toast.show({ message: "Account deleted." });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Failed.");
    }
  }

  return (
    <section className="bg-white rounded-xl border border-red-200 p-4 space-y-3">
      <h2 className="font-semibold text-red-700">Delete account</h2>
      <p className="text-sm text-slate-600">
        Permanently delete your account, group memberships, push
        subscriptions and fillups you own. This cannot be undone.
      </p>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2 hover:bg-red-50"
        >
          Delete account&hellip;
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Type{" "}
            <span className="font-mono">{currentEmail ?? "your email"}</span>{" "}
            to confirm.
          </p>
          <input
            type="email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setOpen(false);
                setTyped("");
                setState("idle");
                setMsg(null);
              }}
              className="flex-1 border border-slate-300 text-sm rounded-lg px-3 py-2"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!canConfirm || state === "working"}
              className="flex-1 bg-red-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {state === "working" ? "Deleting…" : "Delete forever"}
            </button>
          </div>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
        </div>
      )}
    </section>
  );
}
