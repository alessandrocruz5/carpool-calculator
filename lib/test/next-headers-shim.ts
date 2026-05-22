// Shim for `next/headers` so route/server modules can be imported in vitest
// outside of a real request scope. Returns empty cookie/header stores.
export function cookies() {
  return {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  };
}

export function headers() {
  return new Headers();
}

export function draftMode() {
  return { isEnabled: false, enable: () => {}, disable: () => {} };
}
