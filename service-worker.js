const CACHE_NAME = "mileage-logger-inspection-word-preview-v65";
const APP_FILES = [
  "./",
  "./index.html?v=workflow-upgrades-2",
  "./styles.css?v=workflow-upgrades-2",
  "./multi-device.css?v=multi-device-1",
  "./workflow-data.js?v=workflow-upgrades-2",
  "./app.js?v=workflow-upgrades-2",
  "./inspections.js?v=inspection-word-preview-5",
  "./workflow-queues.js?v=workflow-upgrades-2",
  "./sync-engine.js?v=active-jobs-bootstrap-3",
  "./media-store.js?v=visit-workspace-5",
  "./active-jobs-data.js?v=visit-workspace-5",
  "./active-jobs-management.js?v=active-jobs-open-status-hotfix-1",
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
