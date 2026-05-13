"use client";

const STORAGE_KEY = "carpool-driver-key";
const URL_PARAM = "key";

export function getDriverKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDriverKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function clearDriverKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function captureDriverKeyFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const key = url.searchParams.get(URL_PARAM);
  if (!key) return false;
  setDriverKey(key);
  url.searchParams.delete(URL_PARAM);
  const newUrl =
    url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
  window.history.replaceState({}, "", newUrl);
  return true;
}

export async function fetchWithDriverKey(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const key = getDriverKey();
  const headers = new Headers(init.headers ?? {});
  if (key) headers.set("x-driver-key", key);
  return fetch(input, { ...init, headers });
}
