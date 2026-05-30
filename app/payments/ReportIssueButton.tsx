"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useDisputes } from "@/lib/store/disputes";
import { useToast } from "@/components/Toast";

export function ReportIssueButton({
  tripId,
  tripDate,
}: {
  tripId: string;
  tripDate: string | null;
}) {
  const { open } = useDisputes();
  const toast = useToast();
  const [showing, setShowing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = reason.trim();
    if (!text) return;
    setBusy(true);
    try {
      await open(tripId, text);
      toast.show({ message: "Issue reported. A driver will review it." });
      setShowing(false);
      setReason("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to report";
      toast.show({ message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowing(true)}
        className="text-[11px] text-amber-700 underline"
      >
        Report issue
      </button>
      {showing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && setShowing(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-sm w-full p-4 space-y-3"
          >
            <h3 className="font-medium text-sm">
              Report an issue with{" "}
              {tripDate ? dayjs(tripDate).format("ddd, MMM D, YYYY") : "this trip"}
            </h3>
            <p className="text-xs text-slate-500">
              Describe what looks wrong — wrong route, missing passenger, incorrect
              fee, etc. A driver will review and follow up.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="What's wrong?"
              className="w-full border rounded-lg p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowing(false)}
                className="px-3 py-1.5 text-sm border rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || reason.trim().length === 0}
                onClick={submit}
                className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
