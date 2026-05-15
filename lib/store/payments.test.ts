import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { usePayments } from "./payments";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  usePayments.setState({ payments: [], hydrated: false });
});

describe("payments store", () => {
  it("hydrate loads from /api/payments", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { tripId: "t1", passengerId: "p1", amountPhp: 100, paid: false, paidAt: null, date: "2026-05-13" },
      ])
    );
    await usePayments.getState().hydrate();
    const state = usePayments.getState();
    expect(state.hydrated).toBe(true);
    expect(state.payments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/payments", { cache: "no-store" });
  });

  it("hydrate marks hydrated even on fetch failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await usePayments.getState().hydrate();
    expect(usePayments.getState().hydrated).toBe(true);
  });

  it("markPaid optimistically updates and PATCHes the API", async () => {
    usePayments.setState({
      payments: [
        { tripId: "t1", passengerId: "p1", amountPhp: 100, paid: false, paidAt: null, date: "2026-05-13" },
      ],
      hydrated: true,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await usePayments.getState().markPaid("t1", "p1", true);

    const row = usePayments.getState().payments[0];
    expect(row.paid).toBe(true);
    expect(row.paidAt).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/payments");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tripId: "t1",
      passengerId: "p1",
      paid: true,
    });
  });

  it("markPaid rehydrates on server error", async () => {
    usePayments.setState({
      payments: [
        { tripId: "t1", passengerId: "p1", amountPhp: 100, paid: false, paidAt: null, date: null },
      ],
      hydrated: true,
    });
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));

    await usePayments.getState().markPaid("t1", "p1", true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(usePayments.getState().payments).toEqual([]);
  });
});
