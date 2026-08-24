const CACHE_NAME = "mileage-logger-full-upgrade-list-v69";
const ACTIVE_JOBS_MANAGEMENT_ASSET = "./active-jobs-management.js?v=xlsx-self-closing-cells-1";
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
  ACTIVE_JOBS_MANAGEMENT_ASSET,
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

  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.endsWith("/active-jobs-management.js")) {
    const activeJobsUrl = new URL(ACTIVE_JOBS_MANAGEMENT_ASSET, self.registration.scope).href;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(activeJobsUrl);
        if (cached) return cached;
        const response = await fetch(activeJobsUrl, { cache: "reload" });
        await cache.put(activeJobsUrl, response.clone());
        return response;
      })
    );
    return;
  }

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
