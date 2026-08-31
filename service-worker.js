const CACHE_NAME = "mileage-logger-report-fixes-v96";
const ACTIVE_JOBS_MANAGEMENT_ASSET = "./active-jobs-management.js?v=xlsx-self-closing-cells-1";
const ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET = "./active-jobs-activity-export-fix.js?v=activity-feed-2";
const ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET = "./active-jobs-import-aj-identity-fix.js?v=aj-identity-1";
const MASTER_REPORT_DATA_IMPORT_ASSET = "./master-report-data-import.js?v=report-data-2";
const SYNC_VERIFIED_REPAIR_ASSET = "./sync-verified-repair-v2.js?v=verified-sync-2";
const LAST_ODOMETER_FIX_ASSET = "./last-odometer-derived-fix.js?v=derived-odometer-1";
const TRIP_INSPECTION_LINKS_ASSET = "./trip-inspection-links.js?v=trip-inspection-links-2";
const TRIP_LOG_DESKTOP_ASSET = "./trip-log-desktop.js?v=responsive-log-2";
const WORD_PHOTO_FIT_ASSET = "./word-photo-fit-fix.js?v=word-photo-fit-2";
const INSPECTION_ACTIVITY_RULES_ASSET = "./inspection-activity-rules.js?v=structural-pmi-1";
const REPORT_HEADER_AUTOFILL_ASSET = "./report-header-autofill.js?v=report-header-1";
const REPORT_TEMPLATE_V2_FIX_ASSET = "./report-template-v2-fix.js?v=revised-template-1";
const REPORT_TEMPLATE_FINAL_FIX_ASSET = "./report-template-final-fix.js?v=revised-template-final-2";
const REPORT_EXPORT_FIX_ASSET = "./report-export-fixes.js?v=s-and-b-report-fixes-2";
const PHOTO_INDENT_FIX_ASSET = "./photo-indent-fix.js?v=s-and-b-photo-indent-2";
const PHOTO_CLOUD_ASSET = "./photo-cloud-sync.js?v=cloud-photos-2";
const AUTO_REPORT_TEXT_ASSET = "./auto-report-text.js?v=phrase-library-1";
const COATING_SYSTEM_LABEL_FIX_ASSET = "./coating-system-label-fix.js?v=coating-system-labels-1";
const INDEX_ASSET = "./index.html?v=report-fixes-24";
const APP_FILES = [
  "./",
  INDEX_ASSET,
  "./styles.css?v=full-upgrade-list-1",
  "./multi-device.css?v=multi-device-1",
  "./workflow-data.js?v=full-upgrade-list-1",
  LAST_ODOMETER_FIX_ASSET,
  "./app.js?v=full-upgrade-list-1",
  "./inspections.js?v=full-upgrade-list-1",
  WORD_PHOTO_FIT_ASSET,
  INSPECTION_ACTIVITY_RULES_ASSET,
  REPORT_HEADER_AUTOFILL_ASSET,
  REPORT_TEMPLATE_V2_FIX_ASSET,
  REPORT_TEMPLATE_FINAL_FIX_ASSET,
  TRIP_INSPECTION_LINKS_ASSET,
  TRIP_LOG_DESKTOP_ASSET,
  "./workflow-queues.js?v=full-upgrade-list-1",
  "./sync-engine.js?v=full-upgrade-list-1",
  SYNC_VERIFIED_REPAIR_ASSET,
  "./media-store.js?v=visit-workspace-5",
  "./active-jobs-data.js?v=visit-workspace-5",
  ACTIVE_JOBS_MANAGEMENT_ASSET,
  ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET,
  ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET,
  MASTER_REPORT_DATA_IMPORT_ASSET,
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

  if (!html.includes("last-odometer-derived-fix.js")) {
    const appTag = '<script src="./app.js?v=full-upgrade-list-1"></script>';
    if (html.includes(appTag)) html = html.replace(appTag, `  <script src="${LAST_ODOMETER_FIX_ASSET}"></script>\n  ${appTag}`);
    else html = html.replace("</body>", `  <script src="${LAST_ODOMETER_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("word-photo-fit-fix.js")) {
    const inspectionsTag = '<script src="./inspections.js?v=full-upgrade-list-1"></script>';
    if (html.includes(inspectionsTag)) html = html.replace(inspectionsTag, `${inspectionsTag}\n  <script src="${WORD_PHOTO_FIT_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${WORD_PHOTO_FIT_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("inspection-activity-rules.js")) {
    const wordPhotoTag = `<script src="${WORD_PHOTO_FIT_ASSET}"></script>`;
    if (html.includes(wordPhotoTag)) html = html.replace(wordPhotoTag, `${wordPhotoTag}\n  <script src="${INSPECTION_ACTIVITY_RULES_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${INSPECTION_ACTIVITY_RULES_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("report-header-autofill.js")) {
    const activityRulesTag = `<script src="${INSPECTION_ACTIVITY_RULES_ASSET}"></script>`;
    if (html.includes(activityRulesTag)) html = html.replace(activityRulesTag, `${activityRulesTag}\n  <script src="${REPORT_HEADER_AUTOFILL_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${REPORT_HEADER_AUTOFILL_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("report-template-v2-fix.js")) {
    const reportHeaderTag = `<script src="${REPORT_HEADER_AUTOFILL_ASSET}"></script>`;
    if (html.includes(reportHeaderTag)) html = html.replace(reportHeaderTag, `${reportHeaderTag}\n  <script src="${REPORT_TEMPLATE_V2_FIX_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${REPORT_TEMPLATE_V2_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("report-template-final-fix.js")) {
    const reportTemplateTag = `<script src="${REPORT_TEMPLATE_V2_FIX_ASSET}"></script>`;
    if (html.includes(reportTemplateTag)) html = html.replace(reportTemplateTag, `${reportTemplateTag}\n  <script src="${REPORT_TEMPLATE_FINAL_FIX_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${REPORT_TEMPLATE_FINAL_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("trip-inspection-links.js")) {
    const reportFinalTag = `<script src="${REPORT_TEMPLATE_FINAL_FIX_ASSET}"></script>`;
    if (html.includes(reportFinalTag)) html = html.replace(reportFinalTag, `${reportFinalTag}\n  <script src="${TRIP_INSPECTION_LINKS_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${TRIP_INSPECTION_LINKS_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("trip-log-desktop.js")) {
    const tripInspectionTag = `<script src="${TRIP_INSPECTION_LINKS_ASSET}"></script>`;
    if (html.includes(tripInspectionTag)) html = html.replace(tripInspectionTag, `${tripInspectionTag}\n  <script src="${TRIP_LOG_DESKTOP_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${TRIP_LOG_DESKTOP_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("report-export-fixes.js")) {
    const mediaTag = '<script src="./media-store.js?v=visit-workspace-5"></script>';
    if (html.includes(mediaTag)) html = html.replace(mediaTag, `  <script src="${REPORT_EXPORT_FIX_ASSET}"></script>\n  ${mediaTag}`);
    else html = html.replace("</body>", `  <script src="${REPORT_EXPORT_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("active-jobs-activity-export-fix.js")) {
    const activeJobsDataTag = '<script src="./active-jobs-data.js?v=visit-workspace-5"></script>';
    if (html.includes(activeJobsDataTag)) html = html.replace(activeJobsDataTag, `${activeJobsDataTag}\n  <script src="${ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("active-jobs-import-aj-identity-fix.js")) {
    const activeJobsManagementTag = '<script src="./active-jobs-management.js?v=full-upgrade-list-1"></script>';
    if (html.includes(activeJobsManagementTag)) html = html.replace(activeJobsManagementTag, `${activeJobsManagementTag}\n  <script src="${ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("master-report-data-import.js")) {
    const identityTag = `<script src="${ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET}"></script>`;
    if (html.includes(identityTag)) html = html.replace(identityTag, `${identityTag}\n  <script src="${MASTER_REPORT_DATA_IMPORT_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${MASTER_REPORT_DATA_IMPORT_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("sync-verified-repair-v2.js")) {
    const syncTag = '<script src="./sync-engine.js?v=full-upgrade-list-1"></script>';
    if (html.includes(syncTag)) html = html.replace(syncTag, `${syncTag}\n  <script src="${SYNC_VERIFIED_REPAIR_ASSET}"></script>`);
    else html = html.replace("</body>", `  <script src="${SYNC_VERIFIED_REPAIR_ASSET}"></script>\n</body>`);
  }

  if (!html.includes("photo-cloud-sync.js")) html = html.replace("</body>", `  <script src="${PHOTO_CLOUD_ASSET}"></script>\n</body>`);
  if (!html.includes("photo-indent-fix.js")) html = html.replace("</body>", `  <script src="${PHOTO_INDENT_FIX_ASSET}"></script>\n</body>`);
  if (!html.includes("auto-report-text.js")) html = html.replace("</body>", `  <script src="${AUTO_REPORT_TEXT_ASSET}"></script>\n</body>`);
  if (!html.includes("coating-system-label-fix.js")) html = html.replace("</body>", `  <script src="${COATING_SYSTEM_LABEL_FIX_ASSET}"></script>\n</body>`);

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
        const cached = await caches.match(event.request) || await caches.match(INDEX_ASSET) || await caches.match("./");
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