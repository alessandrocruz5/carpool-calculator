import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { useTrips, type StoredTrip } from "./trips";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const trip: StoredTrip = {
  id: "t1",
  date: "2026-05-13",
  gasPrice: 65,
  parkingFee: 90,
  legs: [
    { route: "skyway", passengerIds: ["p1"], distanceKm: 21 },
    { route: "slex", passengerIds: ["p1"], distanceKm: 21 },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  useTrips.setState({ trips: [], hydrated: false });
});

describe("trips store", () => {
  it("hydrate populates from /api/trips", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([trip]));
    await useTrips.getState().hydrate();
    expect(useTrips.getState().trips).toHaveLength(1);
    expect(useTrips.getState().hydrated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/trips", { cache: "no-store" });
  });

  it("hydrate still flips hydrated when api fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await useTrips.getState().hydrate();
    expect(useTrips.getState().hydrated).toBe(true);
  });

  it("upsert optimistically adds the trip and POSTs, then rehydrates", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "t1", date: trip.date })) // POST
      .mockResolvedValueOnce(jsonResponse([trip])); // rehydrate

    await useTrips.getState().upsert(trip);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trips");
    expect((init as RequestInit).method).toBe("POST");
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.date).toBe(trip.date);
    expect(useTrips.getState().trips).toHaveLength(1);
  });

  it("upsert replaces an existing trip on the same date", async () => {
    useTrips.setState({ trips: [trip], hydrated: true });
    const updated: StoredTrip = { ...trip, parkingFee: 200 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "t1", date: updated.date }))
      .mockResolvedValueOnce(jsonResponse([updated]));
    await useTrips.getState().upsert(updated);
    const trips = useTrips.getState().trips;
    expect(trips).toHaveLength(1);
    expect(trips[0].parkingFee).toBe(200);
  });

  it("remove optimistically drops the trip and DELETEs", async () => {
    useTrips.setState({ trips: [trip], hydrated: true });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await useTrips.getState().remove("t1");

    expect(useTrips.getState().trips).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trips?id=t1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("remove rehydrates and rethrows when DELETE fails", async () => {
    useTrips.setState({ trips: [trip], hydrated: true });
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([trip])); // rehydrate restores it
    await expect(useTrips.getState().remove("t1")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useTrips.getState().trips).toEqual([trip]);
  });
});
