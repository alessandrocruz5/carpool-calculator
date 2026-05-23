import { describe, it, expect, vi, beforeEach } from "vitest";
import { installDomShim } from "@/lib/test/dom-shim";

installDomShim();

import { useSettings } from "./settings";
import { DEFAULT_SETTINGS } from "@/lib/calc";

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
  useSettings.setState({
    settings: DEFAULT_SETTINGS,
    gasPrice: 90,
    gasPriceUpdatedAt: null,
    hydrated: false,
  });
});

describe("settings store", () => {
  it("hydrate loads settings and gas price", async () => {
    const next = { ...DEFAULT_SETTINGS, parkingFeePhp: 999 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(next))
      .mockResolvedValueOnce(
        jsonResponse({ gasPrice: 65.5, gasPriceUpdatedAt: "2026-05-13T00:00:00Z" })
      );
    await useSettings.getState().hydrate();
    const s = useSettings.getState();
    expect(s.hydrated).toBe(true);
    expect(s.settings.parkingFeePhp).toBe(999);
    expect(s.gasPrice).toBe(65.5);
    expect(s.gasPriceUpdatedAt).toBe("2026-05-13T00:00:00Z");
  });

  it("hydrate flips hydrated even when both requests fail", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await useSettings.getState().hydrate();
    expect(useSettings.getState().hydrated).toBe(true);
  });

  it("setSettings PATCHes partial diff and merges into state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await useSettings.getState().setSettings({ parkingFeePhp: 150 });
    expect(useSettings.getState().settings.parkingFeePhp).toBe(150);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/settings");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      parkingFeePhp: 150,
    });
  });

  it("setGasPrice POSTs and updates state from server echo", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ gasPrice: 70, gasPriceUpdatedAt: "2026-05-13T01:00:00Z" })
    );
    await useSettings.getState().setGasPrice(70);
    const s = useSettings.getState();
    expect(s.gasPrice).toBe(70);
    expect(s.gasPriceUpdatedAt).toBe("2026-05-13T01:00:00Z");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gas-prices");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ price: 70 });
  });
});
