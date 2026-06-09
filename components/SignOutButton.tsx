"use client";
import { useRef } from "react";

async function unsubscribePush() {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    try {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
        keepalive: true,
      });
    } catch {
      // network failure shouldn't block sign-out
    }
    try {
      await sub.unsubscribe();
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await unsubscribePush();
    formRef.current?.submit();
  }

  return (
    <form
      ref={formRef}
      action="/auth/signout"
      method="post"
      onSubmit={onSubmit}
    >
      <button type="submit" className={className ?? "hover:underline"}>
        {children ?? "Sign out"}
      </button>
    </form>
  );
}
