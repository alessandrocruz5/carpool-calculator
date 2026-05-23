"use client";
import { useCallback, useEffect, useState } from "react";
import type { MemberRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface GroupItem {
  id: string;
  name: string;
  role: MemberRole;
  isOwner: boolean;
  isActive: boolean;
}

type Msg = { kind: "ok" | "err"; text: string } | null;

function isDriver(role: MemberRole) {
  return role === "driver" || role === "both";
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/groups", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setGroups((await res.json()) as GroupItem[]);
    } catch (err) {
      console.error("groups load failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const group = (await res.json()) as { id: string };
      // Switch to the newly created group so the active-group cookie is set.
      await fetch("/api/groups/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      });
      setNewName("");
      window.location.assign("/");
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to create group",
      });
      setBusy(false);
    }
  }

  async function switchGroup(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/groups/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: id }),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.assign("/");
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to switch group",
      });
      setBusy(false);
    }
  }

  async function renameGroup(id: string) {
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/groups", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingId(null);
      await load();
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to rename group",
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(id: string, name: string) {
    if (!window.confirm(`Delete group "${name}"? This cannot be undone.`))
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/groups?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "failed to delete group",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Groups</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Create a group</h2>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group name"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createGroup}
            disabled={busy || !newName.trim()}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-3">Your groups</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            You aren&apos;t in any groups yet. Create one above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.id} className="py-3 space-y-2">
                {editingId === g.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => renameGroup(g.id)}
                      disabled={busy}
                      className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-sm text-slate-600 underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {g.name}
                        {g.isActive && (
                          <span className="ml-2 text-xs bg-brand-50 text-brand-700 rounded-full px-2 py-0.5">
                            active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {g.role}
                        {g.isOwner ? " · owner" : ""}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                      {!g.isActive && (
                        <button
                          type="button"
                          onClick={() => switchGroup(g.id)}
                          disabled={busy}
                          className="text-brand-600 underline disabled:opacity-50"
                        >
                          Switch
                        </button>
                      )}
                      {isDriver(g.role) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(g.id);
                            setEditName(g.name);
                          }}
                          className="text-slate-600 underline"
                        >
                          Rename
                        </button>
                      )}
                      {g.isOwner && (
                        <button
                          type="button"
                          onClick={() => deleteGroup(g.id, g.name)}
                          disabled={busy}
                          className="text-red-600 underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {msg && (
          <p
            className={`mt-3 text-sm ${
              msg.kind === "ok" ? "text-green-700" : "text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
      </section>
    </div>
  );
}
