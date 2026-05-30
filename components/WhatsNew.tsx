"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "@/components/Toast";

const STORAGE_KEY = "carpool:lastSeenChangelog";

export function WhatsNew({ latestVersion }: { latestVersion: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!latestVersion) return;
    if (pathname === "/changelog") {
      try {
        localStorage.setItem(STORAGE_KEY, latestVersion);
      } catch {}
      return;
    }
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (seen === latestVersion) return;
    try {
      localStorage.setItem(STORAGE_KEY, latestVersion);
    } catch {}
    toast.show({
      message: `What's new in ${latestVersion}`,
      action: {
        label: "View",
        onClick: () => router.push("/changelog"),
      },
      durationMs: 8000,
    });
  }, [latestVersion, pathname, router, toast]);

  return null;
}
