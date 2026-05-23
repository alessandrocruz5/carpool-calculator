export type MemberRole = "driver" | "passenger";

// Tabs a passenger is allowed to see in the bottom navigation.
export const PASSENGER_TAB_HREFS = ["/", "/log"] as const;

// Routes only a driver may open. Passengers are redirected away from these.
export const DRIVER_ONLY_PATHS = ["/gas", "/settings"] as const;

export function isDriverOnlyPath(pathname: string): boolean {
  return DRIVER_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

/** Name of the cookie that holds the caller's active group id. */
export const GROUP_COOKIE = "carpool-group";

/** Read the active group id from the browser cookie jar (client-side). */
export function readActiveGroupCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)carpool-group=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export type Role = "driver" | "passenger" | "both";

export interface Access {
  role: Role | null;
  isDriver: boolean;
  isPassenger: boolean;
  loaded: boolean;
}

export function roleIsDriver(role?: Role | null): boolean {
  return role === "driver" || role === "both";
}

export function roleIsPassenger(role?: Role | null): boolean {
  return role === "passenger" || role === "both";
}

export { useAccess, useIsPassenger } from "./useAccess";
