import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { useRoster, type Passenger } from "./roster";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const ana: Passenger = { id: "p1", name: "Ana", active: true };

beforeEach(() => {
  fetchMock.mockReset();
  useRoster.setState({ passengers: [], hydrated: false });
});

describe("roster store", () => {
  it("hydrate loads from /api/passengers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([ana]));
    await useRoster.getState().hydrate();
    expect(useRoster.getState().passengers).toEqual([ana]);
    expect(useRoster.getState().hydrated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/passengers", {
      cache: "no-store",
    });
  });

  it("hydrate flips hydrated even on failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await useRoster.getState().hydrate();
    expect(useRoster.getState().hydrated).toBe(true);
  });

  it("add optimistically appends and POSTs trimmed name", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useRoster.getState().add(" Ana ");
    const state = useRoster.getState();
    expect(state.passengers).toHaveLength(1);
    expect(state.passengers[0].name).toBe("Ana");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/passengers");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe("Ana");
    expect(body.active).toBe(true);
  });

  it("add rehydrates on server error", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));
    await expect(useRoster.getState().add("Ana")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useRoster.getState().passengers).toEqual([]);
  });

  it("remove optimistically drops and DELETEs", async () => {
    useRoster.setState({ passengers: [ana], hydrated: true });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useRoster.getState().remove("p1");
    expect(useRoster.getState().passengers).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/passengers?id=p1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("toggleActive flips active and PATCHes", async () => {
    useRoster.setState({ passengers: [ana], hydrated: true });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useRoster.getState().toggleActive("p1");
    expect(useRoster.getState().passengers[0].active).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/passengers");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      id: "p1",
      active: false,
    });
  });

  it("toggleActive rehydrates on failure", async () => {
    useRoster.setState({ passengers: [ana], hydrated: true });
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([ana]));
    await expect(useRoster.getState().toggleActive("p1")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useRoster.getState().passengers).toEqual([ana]);
  });
});
