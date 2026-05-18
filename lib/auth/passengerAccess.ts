export type MemberRole = "driver" | "passenger";

// Tabs a passenger is allowed to see in the bottom navigation.
export const PASSENGER_TAB_HREFS = ["/", "/log", "/week"] as const;

// Routes only a driver may open. Passengers are redirected away from these.
export const DRIVER_ONLY_PATHS = ["/gas", "/mileage", "/settings"] as const;

export function isDriverOnlyPath(pathname: string): boolean {
  return DRIVER_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}
