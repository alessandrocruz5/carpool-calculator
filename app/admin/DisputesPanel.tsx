"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { useDisputes, type DisputeRow } from "@/lib/store/disputes";
import { useTrips } from "@/lib/store/trips";
import { useToast } from "@/components/Toast";

export function DisputesPanel() {
  const router = useRouter();
  const { disputes, hydrated, hydrate, resolve } = useDisputes();
  const { trips, hydrate: hydrateTrips } = useTrips();
  const toast = useToast();

  useEffect(() => {
    hydrate();
    hydrateTrips();
  }, [hydrate, hydrateTrips]);

  const pending = useMemo(
    () => disputes.filter((d) => d.status === "open"),
    [disputes]
  );

  return (
    <section id="disputes" className="border rounded p-4 space-y-3">
      <h2 className="text-lg font-medium">Trip disputes</h2>
      <p className="text-sm text-slate-600">
        Passengers can flag trips that look wrong. Accept to open the trip
        editor, or dismiss with a reason.
      </p>
      {!hydrated && <p className="text-sm text-slate-500">Loading…</p>}
      {hydrated && pending.length === 0 && (
        <p className="text-sm text-slate-500">No pending disputes.</p>
      )}
      <ul className="space-y-3">
        {pending.map((d) => {
          const trip = trips.find((t) => t.id === d.tripId);
          return (
            <DisputeItem
              key={d.id}
              dispute={d}
              tripDate={trip?.date ?? null}
              onAccept={() => {
                const dateParam = trip?.date;
                resolve(d.id, "resolved").catch((err) =>
                  toast.show({
                    message: err instanceof Error ? err.message : "Failed",
                  })
                );
                router.push(dateParam ? `/?date=${dateParam}` : "/");
              }}
              onDismiss={async (note) => {
                try {
                  await resolve(d.id, "dismissed", note);
                  toast.show({ message: "Dispute dismissed." });
                } catch (err) {
                  toast.show({
                    message: err instanceof Error ? err.message : "Failed",
                  });
                }
              }}
            />
          );
        })}
      </ul>
    </section>
  );
}

function DisputeItem({
  dispute,
  tripDate,
  onAccept,
  onDismiss,
}: {
  dispute: DisputeRow;
  tripDate: string | null;
  onAccept: () => void;
  onDismiss: (note: string) => Promise<void>;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <li className="border rounded p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">
          Trip{" "}
          {tripDate
            ? dayjs(tripDate).format("ddd, MMM D, YYYY")
            : dispute.tripId.slice(0, 8)}
        </div>
        <div className="text-xs text-slate-500">
          opened {dayjs(dispute.createdAt).format("MMM D, h:mm A")}
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">{dispute.reason}</p>

      {!dismissing && (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="px-3 py-1 text-sm rounded-lg bg-brand-600 text-white"
          >
            Accept (edit trip)
          </button>
          <button
            onClick={() => setDismissing(true)}
            className="px-3 py-1 text-sm rounded-lg border"
          >
            Dismiss
          </button>
        </div>
      )}

      {dismissing && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Reason for dismissing (required)"
            className="w-full border rounded-lg p-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDismissing(false);
                setNote("");
              }}
              className="px-3 py-1 text-sm border rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || note.trim().length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDismiss(note.trim());
                } finally {
                  setBusy(false);
                }
              }}
              className="px-3 py-1 text-sm rounded-lg bg-brand-600 text-white disabled:opacity-50"
            >
              {busy ? "Dismissing…" : "Confirm dismiss"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
