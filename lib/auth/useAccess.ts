"use client";
import { roleIsDriver, roleIsPassenger, type Access, type Role } from "./passengerAccess";
import { useMembers } from "@/lib/store/members";
import { useProfile } from "@/lib/store/profile";

export function useAccess(_groupId?: string): Access {
  const userId = useProfile((s) => s.profile?.userId ?? null);
  const { members, hydrated } = useMembers();
  const self = userId ? members.find((m) => m.userId === userId) : null;
  const role = (self?.role as Role | undefined) ?? null;
  return {
    role,
    isDriver: roleIsDriver(role),
    isPassenger: roleIsPassenger(role),
    loaded: hydrated,
  };
}

export function useIsPassenger(_groupId?: string): boolean {
  return useAccess().isPassenger;
}
