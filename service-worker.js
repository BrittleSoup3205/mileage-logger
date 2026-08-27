const CACHE_NAME = "mileage-logger-report-fixes-v82";
const ACTIVE_JOBS_MANAGEMENT_ASSET = "./active-jobs-management.js?v=xlsx-self-closing-cells-1";
const ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET = "./active-jobs-activity-export-fix.js?v=activity-feed-2";
const ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET = "./active-jobs-import-aj-identity-fix.js?v=aj-identity-1";
const SYNC_VERIFIED_REPAIR_ASSET = "./sync-verified-repair.js?v=verified-sync-1";
const REPORT_EXPORT_FIX_ASSET = "./report-export-fixes.js?v=s-and-b-report-fixes-1";
const PHOTO_INDENT_FIX_ASSET = "./photo-indent-fix.js?v=s-and-b-photo-indent-2";
const PHOTO_CLOUD_ASSET = "./photo-cloud-sync.js?v=cloud-photos-2";
const AUTO_REPORT_TEXT_ASSET = "./auto-report-text.js?v=phrase-library-1";
const COATING_SYSTEM_LABEL_FIX_ASSET = "./coating-system-label-fix.js?v=coating-system-labels-1";
const INDEX_ASSET = "./index.html?v=report-fixes-10";
const APP_FILES = [
  "./",
  INDEX_ASSET,
  "./styles.css?v=full-upgrade-list-1",
  "./multi-device.css?v=multi-device-1",
  "./workflow-data.js?v=full-upgrade-list-1",
  "./app.js?v=full-upgrade-list-1",
  "./inspections.js?v=full-upgrade-list-1",
  "./workflow-queues.js?v=full-upgrade-list-1",
  "./sync-engine.js?v=full-upgrade-list-1",
  SYNC_VERIFIED_REPAIR_ASSET,
  "./media-store.js?v=visit-workspace-5",
  "./active-jobs-data.js?v=visit-workspace-5",
  ACTIVE_JOBS_MANAGEMENT_ASSET,
  ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET,
  ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET,
  REPORT_EXPORT_FIX_ASSET,
  PHOTO_INDENT_FIX_ASSET,
  PHOTO_CLOUD_ASSET,
  AUTO_REPORT_TEXT_ASSET,
  COATING_SYSTEM_LABEL_FIX_ASSET,
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

async function injectRuntimeLoaders(response) {
  if (!response) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  let html = await response.text();

  if (!html.includes("report-export-fixes.js")) {
    const mediaTag = '<script src="./media-store.js?v=visit-workspace-5"></script>';
    if (html.includes(mediaTag)) {
      html = html.replace(mediaTag, `  <script src="${REPORT_EXPORT_FIX_ASSET}"></script>\n  ${mediaTag}`);
    } else {
      html = html.replace("</body>", `  <script src="${REPORT_EXPORT_FIX_ASSET}"></script>\n</body>`);
    }
  }

  if (!html.includes("active-jobs-activity-export-fix.js")) {
    const activeJobsDataTag = '<script src="./active-jobs-data.js?v=visit-workspace-5"></script>';
    if (html.includes(activeJobsDataTag)) {
      html = html.replace(activeJobsDataTag, `${activeJobsDataTag}\n  <script src="${ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET}"></script>`);
    } else {
      html = html.replace("</body>", `  <script src="${ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET}"></script>\n</body>`);
    }
  }

  if (!html.includes("active-jobs-import-aj-identity-fix.js")) {
    const activeJobsManagementTag = '<script src="./active-jobs-management.js?v=full-upgrade-list-1"></script>';
    if (html.includes(activeJobsManagementTag)) {
      html = html.replace(activeJobsManagementTag, `${activeJobsManagementTag}\n  <script src="${ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET}"></script>`);
    } else {
      html = html.replace("</body>", `  <script src="${ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET}"></script>\n</body>`);
    }
  }

  if (!html.includes("sync-verified-repair.js")) {
    const syncTag = '<script src="./sync-engine.js?v=full-upgrade-list-1"></script>';
    if (html.includes(syncTag)) {
      html = html.replace(syncTag, `${syncTag}\n  <script src="${SYNC_VERIFIED_REPAIR_ASSET}"></script>`);
    } else {
      html = html.replace("</body>", `  <script src="${SYNC_VERIFIED_REPAIR_ASSET}"></script>\n</body>`);
    }
  }

  if (!html.includes("photo-cloud-sync.js")) {
    html = html.replace("</body>", `  <script src="${PHOTO_CLOUD_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("photo-indent-fix.js")) {
    html = html.replace("</body>", `  <script src="${PHOTO_INDENT_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("auto-report-text.js")) {
    html = html.replace("</body>", `  <script src="${AUTO_REPORT_TEXT_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("coating-system-label-fix.js")) {
    html = html.replace("</body>", `  <script src="${COATING_SYSTEM_LABEL_FIX_ASSET}"></script>\n</body>`);
  }

  return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
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
        return injectRuntimeLoaders(response);
      } catch (_) {
        const cached = await caches.match(event.request)
          || await caches.match(INDEX_ASSET)
          || await caches.match("./");
        return injectRuntimeLoaders(cached);
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
      }).catch(() => caches.match(INDEX_ASSET));
    })
  );
});