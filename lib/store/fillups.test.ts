import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { useFillups } from "./fillups";
import { useCars } from "./cars";
import type { Fillup } from "@/lib/mileage";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const fillup: Fillup = {
  id: "f1",
  carId: "c1",
  date: "2026-05-13",
  liters: 30,
  totalPhp: 2000,
  odometerKm: 12345,
};

beforeEach(() => {
  fetchMock.mockReset();
  useFillups.setState({ fillups: [], hydrated: false });
  useCars.setState({ cars: [], hydrated: false });
});

describe("fillups store", () => {
  it("hydrate loads from /api/fillups", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([fillup]));
    await useFillups.getState().hydrate();
    expect(useFillups.getState().fillups).toEqual([fillup]);
    expect(useFillups.getState().hydrated).toBe(true);
  });

  it("hydrate flips hydrated on failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await useFillups.getState().hydrate();
    expect(useFillups.getState().hydrated).toBe(true);
  });

  it("add optimistically appends and POSTs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { id: _drop, ...input } = fillup;
    void _drop;
    await useFillups.getState().add(input);
    expect(useFillups.getState().fillups).toHaveLength(1);
    expect(useFillups.getState().fillups[0].date).toBe(fillup.date);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/fillups");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("remove optimistically drops and DELETEs", async () => {
    useFillups.setState({ fillups: [fillup], hydrated: true });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useFillups.getState().remove("f1");
    expect(useFillups.getState().fillups).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/fillups?id=f1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("remove rehydrates on failure", async () => {
    useFillups.setState({ fillups: [fillup], hydrated: true });
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([fillup]));
    await useFillups.getState().remove("f1");
    expect(useFillups.getState().fillups).toEqual([fillup]);
  });

  it("writes rolling average back to car.fuelEfficiencyKml when a second fill-up for the same car arrives", async () => {
    const first: Fillup = { id: "f0", carId: "c1", date: "2026-05-01", liters: 30, totalPhp: 2000, odometerKm: 12000 };
    useFillups.setState({ fillups: [first], hydrated: true });
    useCars.setState({
      cars: [{ id: "c1", name: "Jazz", fuelEfficiencyKml: 10.5, tankSizeLiters: null, maxPassengers: null, ownerUserId: "u1" }],
      hydrated: true,
    });
    // Both the fillup POST and the car PATCH return ok
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const { id: _drop, ...input } = {
      id: "f1", carId: "c1", date: "2026-05-15", liters: 25, totalPhp: 1800, odometerKm: 12300,
    };
    void _drop;
    await useFillups.getState().add(input);

    // Rolling avg: (12300 - 12000) / 25 = 12 km/L — local state updated immediately
    expect(useCars.getState().cars[0].fuelEfficiencyKml).toBe(12);

    // PATCH /api/cars should have been called with the measured efficiency
    await vi.waitFor(() => {
      const carPatch = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/cars" && (init as RequestInit).method === "PATCH"
      );
      expect(carPatch).toBeTruthy();
      const body = JSON.parse((carPatch![1] as RequestInit).body as string);
      expect(body.id).toBe("c1");
      expect(body.fuelEfficiencyKml).toBe(12);
    });
  });
});
