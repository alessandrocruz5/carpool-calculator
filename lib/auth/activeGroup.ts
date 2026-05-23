import "server-only";
import { cookies } from "next/headers";

export const ACTIVE_GROUP_COOKIE = "carpool-group";

/** Reads the active carpool group id from the request cookie, if any. */
export async function getActiveGroupId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_GROUP_COOKIE)?.value ?? null;
}
