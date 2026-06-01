"use client";
import { useMembers } from "@/lib/store/members";
import { useProfile } from "@/lib/store/profile";

export function useIsDriver(_groupId?: string): boolean {
  const userId = useProfile((s) => s.profile?.userId ?? null);
  const { members } = useMembers();
  if (!userId) return false;
  const self = members.find((m) => m.userId === userId);
  return self?.role === "driver" || self?.role === "both";
}
