"use client";
import { useEffect, useState } from "react";
import { useGroups, type GroupItem } from "@/lib/store/groups";
import { roleCanDrive } from "@/lib/auth/passengerAccess";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function GroupsPage() {
  const {
    groups,
    activeGroupId,
    selfUserId,
    hydrated,
    hydrate,
    create,
    rename,
    remove,
    switchTo,
  } = useGroups();

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "something went wrong",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!newName.trim()) return;
    await run(async () => {
      await create(newName.trim());
      setNewName("");
    }, "Group created.");
  }

  async function onRename(g: GroupItem) {
    if (!editName.trim()) return;
    await run(async () => {
      await rename(g.id, editName.trim());
      setEditingId(null);
    }, "Group renamed.");
  }

  async function onDelete(g: GroupItem) {
    if (
      !confirm(
        `Delete "${g.name}"? This permanently removes all of its trips, ` +
          `members and data.`
      )
    )
      return;
    await run(() => remove(g.id), "Group deleted.");
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
            onClick={onCreate}
            disabled={busy || !newName.trim()}
            className="bg-brand-600 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-3">Your groups</h2>
        {hydrated && groups.length === 0 && (
          <p className="text-sm text-slate-500">
            You&apos;re not in any group yet. Create one above to get started.
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {groups.map((g) => {
            const isActive = g.id === activeGroupId;
            const isOwner = g.ownerUserId === selfUserId;
            const canRename = roleCanDrive(g.role);
            return (
              <li key={g.id} className="py-3 space-y-2">
                {editingId === g.id ? (
                  <div className="flex gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => onRename(g)}
                      disabled={busy}
                      className="text-xs bg-brand-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-600 underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{g.name}</span>
                      {isActive && (
                        <span className="ml-2 text-xs text-green-700">
                          active
                        </span>
                      )}
                      <div className="text-xs text-slate-500">
                        {g.role}
                        {isOwner ? " · owner" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() =>
                            run(() => switchTo(g.id), "Switching…")
                          }
                          disabled={busy}
                          className="text-brand-600 underline disabled:opacity-50"
                        >
                          Switch
                        </button>
                      )}
                      {canRename && (
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
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => onDelete(g)}
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
            );
          })}
        </ul>
      </section>

      {msg && (
        <p
          className={`text-sm ${
            msg.kind === "ok" ? "text-green-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
