"use client";
import { useEffect } from "react";

export function ServiceWorkerUpdate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const skipWaiting = (worker: ServiceWorker) => {
      worker.postMessage({ type: "SKIP_WAITING" });
    };

    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        skipWaiting(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            skipWaiting(installing);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
