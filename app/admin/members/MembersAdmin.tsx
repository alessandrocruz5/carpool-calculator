"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface MemberRow {
  user_id: string;
  role: "driver" | "passenger";
  passenger_id: string | null;
  created_at: string;
  email: string | null;
}

interface PassengerRow {
  id: string;
  name: string;
}

export function MembersAdmin({
  initialMembers,
  passengers,
}: {
  initialMembers: MemberRow[];
  passengers: PassengerRow[];
}) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"driver" | "passenger">("passenger");
  const [passengerId, setPassengerId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const passengerName = (id: string | null) =>
    id ? passengers.find((p) => p.id === id)?.name ?? id : "—";

  async function inviteAndLink() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("link_member_by_email", {
        p_email: email.trim(),
        p_role: role,
        p_passenger_id: role === "passenger" && passengerId ? passengerId : null,
      });
      if (error) throw error;

      const result = data as { pending?: boolean; user_id?: string } & MemberRow;
      if (result.pending) {
        // User hasn't signed in yet — invite stored, now send the magic link.
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        });
        if (otpError) throw otpError;
        setMsg({
          kind: "ok",
          text: `Invite saved and sign-in link sent to ${email}. They'll be linked automatically when they sign in.`,
        });
      } else {
        // User already existed in auth — linked immediately.
        const row = { ...(result as MemberRow), email: email.trim() };
        setMembers((prev) => {
          const others = prev.filter((m) => m.user_id !== row.user_id);
          return [...others, row];
        });
        setMsg({ kind: "ok", text: `Linked ${email} as ${role}.` });
      }
      setEmail("");
      setPassengerId("");
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to invite member",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const target = members.find((m) => m.user_id === userId);
      const driverCount = members.filter((m) => m.role === "driver").length;
      if (target?.role === "driver" && driverCount <= 1) {
        setMsg({
          kind: "err",
          text: "Can't remove the last driver. Link another driver first.",
        });
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("members")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to remove member",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Members</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Invite / link member</h2>
        <p className="text-xs text-slate-500">
          Enter the member&apos;s email, pick their role (and passenger for riders),
          then click Invite. A sign-in link is sent automatically and their account
          is linked the moment they sign in.
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
            onChange={(e) =>
              setRole(e.target.value as "driver" | "passenger")
            }
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
          >
            <option value="passenger">passenger</option>
            <option value="driver">driver</option>
          </select>
          {role === "passenger" && (
            <select
              value={passengerId}
              onChange={(e) => setPassengerId(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-2 py-2 text-sm"
            >
              <option value="">— pick passenger —</option>
              {passengers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={inviteAndLink}
            disabled={busy || !email}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
          >
            Invite &amp; link
          </button>
        </div>
        {msg && (
          <p
            className={`text-sm ${
              msg.kind === "ok" ? "text-green-700" : "text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-3">Current members</h2>
        <ul className="divide-y divide-slate-100">
          {members.length === 0 && (
            <li className="text-sm text-slate-500 py-2">No members yet.</li>
          )}
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div>
                <div className="text-xs text-slate-500">
                  {m.email ?? m.user_id}
                </div>
                <div>
                  <span className="font-medium">{m.role}</span>
                  {m.role === "passenger" && (
                    <span className="text-slate-500">
                      {" "}
                      → {passengerName(m.passenger_id)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeMember(m.user_id)}
                disabled={busy}
                className="text-xs text-red-600 underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
