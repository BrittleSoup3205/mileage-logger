const CACHE_NAME = "mileage-logger-full-upgrade-list-v66";
const APP_FILES = [
  "./",
  "./index.html?v=full-upgrade-list-1",
  "./styles.css?v=full-upgrade-list-1",
  "./multi-device.css?v=multi-device-1",
  "./workflow-data.js?v=full-upgrade-list-1",
  "./app.js?v=full-upgrade-list-1",
  "./inspections.js?v=full-upgrade-list-1",
  "./workflow-queues.js?v=full-upgrade-list-1",
  "./sync-engine.js?v=full-upgrade-list-1",
  "./media-store.js?v=visit-workspace-5",
  "./active-jobs-data.js?v=visit-workspace-5",
  "./active-jobs-management.js?v=full-upgrade-list-1",
  "./vendor/pdf-lib.min.js",
  "./vendor/fflate.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
