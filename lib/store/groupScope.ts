"use client";
import { useRoster } from "./roster";
import { useTrips } from "./trips";
import { useSettings } from "./settings";
import { useFillups } from "./fillups";
import { usePayments } from "./payments";
import { useMembers } from "./members";

/**
 * Minimal shape shared by every group-scoped persisted store: it can be
 * reset to its initial state, re-pointed at a group-namespaced persist key,
 * rehydrated from storage, and refetched from the API.
 */
interface ScopedStore {
  getState(): { hydrate(): Promise<void> };
  getInitialState(): Record<string, unknown>;
  setState(state: Record<string, unknown>, replace: true): void;
  persist: {
    setOptions(opts: { name: string }): void;
    rehydrate(): Promise<void> | void;
  };
}

/**
 * Stores whose data belongs to a single carpool group. Their persist keys are
 * namespaced by the active group id so switching groups never mixes data.
 */
const GROUP_SCOPED: { store: ScopedStore; base: string }[] = [
  { store: useRoster as unknown as ScopedStore, base: "carpool-roster" },
  { store: useTrips as unknown as ScopedStore, base: "carpool-trips" },
  { store: useSettings as unknown as ScopedStore, base: "carpool-settings" },
  { store: useFillups as unknown as ScopedStore, base: "carpool-fillups" },
  { store: usePayments as unknown as ScopedStore, base: "carpool-payments" },
  { store: useMembers as unknown as ScopedStore, base: "carpool-members" },
];

/**
 * Re-scopes every group-scoped store to the given group: clears stale state,
 * points the persist key at the group's namespace, rehydrates from storage,
 * then refetches from the API.
 */
export async function applyGroupScope(groupId: string): Promise<void> {
  await Promise.all(
    GROUP_SCOPED.map(async ({ store, base }) => {
      store.setState(store.getInitialState(), true);
      store.persist.setOptions({ name: `${base}::${groupId}` });
      await store.persist.rehydrate();
      await store.getState().hydrate();
    })
  );
}
