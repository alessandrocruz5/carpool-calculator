"use client";
import { useMembers } from "@/lib/store/members";

interface DriverSelectProps {
  value: string | null;
  onChange: (driverUserId: string | null) => void;
  activeGroupId: string | null;
  currentUserId: string | null;
}

export function DriverSelect({
  value,
  onChange,
  activeGroupId,
  currentUserId,
}: DriverSelectProps) {
  const members = useMembers((s) => s.members);
  const drivers = members.filter(
    (m) =>
      (!activeGroupId || m.groupId === activeGroupId) &&
      (m.role === "driver" || m.role === "both")
  );

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
    >
      <option value="">— pick a driver —</option>
      {drivers.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.userId === currentUserId ? "You" : m.userId}
        </option>
      ))}
    </select>
  );
}
