/* Stockly minimal service worker — online-first, installability only.
 * Does not cache auth or server actions. Navigations always hit the network.
 */
const SW_VERSION = "stockly-pwa-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("stockly-") && key !== SW_VERSION)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept auth or Next.js server-action style posts (GET only above).
  if (url.pathname.startsWith("/api/auth")) return;

  // Navigations: network-only so attendants always get fresh HTML/session.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            "<!doctype html><title>Stockly offline</title><p>Stockly needs an internet connection.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          ),
      ),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
