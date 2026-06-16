"use client";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/store/profile";
import { useToast } from "@/components/Toast";

const DISMISSED_KEY = "cc:name-prompt:dismissed";

// One-time prompt shown after sign-in when the signed-in user has no name on
// their profile yet. Once saved or dismissed it never re-appears (localStorage
// flag), even if the user skips entering a name. Writes via the profile store
// (SABAY-15 `/api/profile`).
export function NamePrompt() {
  const profile = useProfile((s) => s.profile);
  const hydrated = useProfile((s) => s.hydrated);
  const update = useProfile((s) => s.update);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated || !profile) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    const hasName = !!(profile.firstName || profile.lastName);
    if (!hasName) setOpen(true);
  }, [hydrated, profile]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setOpen(false);
  }

  async function save() {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first) {
      toast.show({ message: "Enter your first name.", variant: "info" });
      return;
    }
    setBusy(true);
    try {
      await update({ firstName: first, lastName: last });
      localStorage.setItem(DISMISSED_KEY, "1");
      setOpen(false);
      toast.show({ message: "Name saved.", variant: "success" });
    } catch {
      toast.show({ message: "Couldn't save your name.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !busy && dismiss()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl max-w-sm w-full p-4 space-y-3"
      >
        <h3 className="font-semibold">What&rsquo;s your name?</h3>
        <p className="text-sm text-slate-600">
          Add your name so the rest of the carpool sees who you are instead of
          your email.
        </p>
        <div className="space-y-2">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            autoComplete="given-name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            autoComplete="family-name"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={dismiss}
            className="text-sm text-slate-600 rounded-lg px-3 py-2 disabled:opacity-60"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save name"}
          </button>
        </div>
      </div>
    </div>
  );
}
