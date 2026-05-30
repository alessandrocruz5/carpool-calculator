// Custom service worker injected by next-pwa via customWorkerSrc.
// next-pwa wraps Workbox around this file and registers it as the SW.
// SW_VERSION: 2 — bump to force browsers to detect an update during dev testing.

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Carpool", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Carpool Calculator";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    data: { url: data.url || "/gas" },
    tag: data.tag || "carpool-push",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/gas";
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsArr) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === url || clientUrl.pathname.startsWith(url)) {
            await client.focus();
            return;
          }
        } catch {}
      }
      if (clientsArr[0]) {
        await clientsArr[0].focus();
        if ("navigate" in clientsArr[0]) {
          try {
            await clientsArr[0].navigate(url);
            return;
          } catch {}
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
