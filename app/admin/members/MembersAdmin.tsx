"use client";
import { useCallback, useEffect, useState } from "react";
import type { MemberRole } from "@/lib/supabase/types";
import { useToast } from "@/components/Toast";

const ROLES: MemberRole[] = ["driver", "passenger", "both"];

interface MemberRow {
  userId: string;
  role: MemberRole;
  email: string | null;
  displayName: string | null;
  isSelf: boolean;
}

export function MembersAdmin() {
  const toast = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("passenger");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/members", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setMembers((await res.json()) as MemberRow[]);
    } catch (err) {
      console.error("members load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    const invited = email.trim();
    setBusy(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: invited, role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "failed to invite");
      }
      toast.show({
        message: `Invited ${invited} as ${role}. They join once they sign in.`,
        variant: "success",
      });
      setEmail("");
      await load();
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : "failed to invite",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, nextRole: MemberRole) {
    setBusy(true);
    try {
      const res = await fetch("/api/members", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role: nextRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "failed to change role");
      }
      toast.show({ message: `Role updated to ${nextRole}.`, variant: "success" });
      await load();
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : "failed to change role",
        variant: "error",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "failed to remove member");
      }
      toast.show({ message: "Member removed.", variant: "success" });
      await load();
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : "failed to remove member",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Members</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Invite member</h2>
        <p className="text-xs text-slate-500">
          Invite by email and role. Existing users join the group immediately;
          new users join once they sign in.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={invite}
            disabled={busy || !email.trim()}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
          >
            Invite
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-3">Current members</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-500">No members yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between py-2 text-sm gap-2"
              >
                <div className="min-w-0">
                  <div className="truncate">
                    {m.displayName ?? m.email ?? m.userId}
                    {m.isSelf && (
                      <span className="text-slate-400"> (you)</span>
                    )}
                  </div>
                  {m.displayName && m.email && (
                    <div className="text-xs text-slate-500 truncate">
                      {m.email}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      changeRole(m.userId, e.target.value as MemberRole)
                    }
                    disabled={busy}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeMember(m.userId)}
                    disabled={busy}
                    className="text-xs text-red-600 underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
