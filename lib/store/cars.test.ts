import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { useCars, type Car } from "./cars";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const car: Car = {
  id: "c1",
  ownerUserId: "u1",
  name: "Civic",
  fuelEfficiencyKml: 12.5,
  tankSizeLiters: 45,
};

beforeEach(() => {
  fetchMock.mockReset();
  useCars.setState({ cars: [], hydrated: false });
});

describe("cars store", () => {
  it("hydrate loads from /api/cars", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([car]));
    await useCars.getState().hydrate();
    expect(useCars.getState().cars).toEqual([car]);
    expect(useCars.getState().hydrated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/cars", { cache: "no-store" });
  });

  it("hydrate still flips hydrated when api fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await useCars.getState().hydrate();
    expect(useCars.getState().hydrated).toBe(true);
  });

  it("add optimistically appends and POSTs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useCars.getState().add({ name: " Civic ", fuelEfficiencyKml: 12.5 });
    expect(useCars.getState().cars).toHaveLength(1);
    expect(useCars.getState().cars[0].name).toBe("Civic");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cars");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("add rehydrates on server error", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));
    await useCars.getState().add({ name: "Civic" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useCars.getState().cars).toEqual([]);
  });

  it("update optimistically patches and PATCHes", async () => {
    useCars.setState({ cars: [car], hydrated: true });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useCars.getState().update("c1", { fuelEfficiencyKml: 13 });
    expect(useCars.getState().cars[0].fuelEfficiencyKml).toBe(13);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cars");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      id: "c1",
      fuelEfficiencyKml: 13,
    });
  });

  it("remove drops only after DELETE succeeds", async () => {
    useCars.setState({ cars: [car], hydrated: true });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const result = await useCars.getState().remove("c1");
    expect(result).toEqual({ ok: true });
    expect(useCars.getState().cars).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cars?id=c1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("remove keeps the car and returns 409 when in use", async () => {
    useCars.setState({ cars: [car], hydrated: true });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "in_use", tripCount: 3 }), {
        status: 409,
        headers: { "content-type": "application/json" },
      })
    );
    const result = await useCars.getState().remove("c1");
    expect(result).toEqual({ ok: false, status: 409, tripCount: 3 });
    expect(useCars.getState().cars).toEqual([car]);
  });

  it("remove keeps the car on generic server error", async () => {
    useCars.setState({ cars: [car], hydrated: true });
    fetchMock.mockResolvedValueOnce(new Response("err", { status: 500 }));
    const result = await useCars.getState().remove("c1");
    expect(result.ok).toBe(false);
    expect(useCars.getState().cars).toEqual([car]);
  });
});
