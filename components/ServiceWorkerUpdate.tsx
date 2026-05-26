"use client";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

const DISMISS_KEY = "carpool.sw-update.dismissed";

export function ServiceWorkerUpdate() {
  const toast = useToast();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const promptForUpdate = (worker: ServiceWorker) => {
      if (promptedRef.current) return;
      promptedRef.current = true;
      toast.show({
        message: "New version available.",
        durationMs: 30000,
        action: {
          label: "Reload",
          onClick: () => {
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        promptForUpdate(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            promptForUpdate(installing);
          }
        });
      });
    });

    // Mark dismissed when toast auto-hides without action so we don't re-prompt
    // this session. We can't directly observe that, so use a delayed check:
    // if the user hasn't reloaded after the toast duration + buffer, treat as
    // dismissed for the session.
    const dismissTimer = setTimeout(() => {
      if (promptedRef.current) {
        sessionStorage.setItem(DISMISS_KEY, "1");
      }
    }, 35000);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      clearTimeout(dismissTimer);
    };
  }, [toast]);

  return null;
}
