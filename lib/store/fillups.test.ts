import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { useFillups } from "./fillups";
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
});
