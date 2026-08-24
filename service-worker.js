const CACHE_NAME = "mileage-logger-photo-cloud-v70";
const ACTIVE_JOBS_MANAGEMENT_ASSET = "./active-jobs-management.js?v=xlsx-self-closing-cells-1";
const PHOTO_CLOUD_ASSET = "./photo-cloud-sync.js?v=cloud-photos-1";
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
  PHOTO_CLOUD_ASSET,
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

async function injectPhotoCloudLoader(response) {
  if (!response) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const html = await response.text();
  if (html.includes("photo-cloud-sync.js")) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const injected = html.replace("</body>", `  <script src="${PHOTO_CLOUD_ASSET}"></script>\n</body>`);
  return new Response(injected, { status: response.status, statusText: response.statusText, headers: response.headers });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (event.request.mode === "navigate" || requestUrl.pathname.endsWith("/index.html")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: "reload" });
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
        return injectPhotoCloudLoader(response);
      } catch (_) {
        const cached = await caches.match(event.request)
          || await caches.match("./index.html?v=full-upgrade-list-1")
          || await caches.match("./");
        return injectPhotoCloudLoader(cached);
      }
    })());
    return;
  }

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
      }).catch(() => caches.match("./index.html?v=full-upgrade-list-1"));
    })
  );
});