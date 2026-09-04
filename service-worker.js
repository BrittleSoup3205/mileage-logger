const CACHE_NAME = "mileage-logger-report-fixes-v106";

const ACTIVE_JOBS_MANAGEMENT_ASSET = "./active-jobs-management.js?v=xlsx-self-closing-cells-1";
const ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET = "./active-jobs-activity-export-fix.js?v=activity-feed-2";
const ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET = "./active-jobs-import-aj-identity-fix.js?v=aj-identity-1";
const MASTER_REPORT_DATA_IMPORT_ASSET = "./master-report-data-import.js?v=report-data-2";
const MASTER_REPORT_DATA_CAPTURE_FIX_ASSET = "./master-report-data-capture-fix.js?v=report-data-capture-1";
const SYNC_ENGINE_ASSET = "./sync-engine.js?v=authoritative-sync-2";
const INSPECTION_DELETE_SYNC_FIX_ASSET = "./inspection-delete-sync-fix.js?v=explicit-delete-2";
const INTEGRITY_SYNC_FIX_ASSET = "./integrity-sync-fix.js?v=integrity-sync-2";
const TRIP_DUPLICATE_INTEGRITY_FIX_ASSET = "./trip-duplicate-integrity-fix.js?v=trip-dedupe-2";
const BACKUP_CHECKPOINT_SYNC_V2_ASSET = "./backup-checkpoint-sync-v2.js?v=backup-checkpoint-3";
const LAST_ODOMETER_FIX_ASSET = "./last-odometer-derived-fix.js?v=derived-odometer-1";
const CLOUD_STATE_REFRESH_BRIDGE_ASSET = "./cloud-state-refresh-bridge.js?v=cloud-state-refresh-1";
const TRIP_INSPECTION_LINKS_ASSET = "./trip-inspection-links.js?v=trip-inspection-links-2";
const TRIP_LOG_DESKTOP_ASSET = "./trip-log-desktop.js?v=responsive-log-2";
const WORD_PHOTO_FIT_ASSET = "./word-photo-fit-fix.js?v=word-photo-fit-2";
const INSPECTION_ACTIVITY_RULES_ASSET = "./inspection-activity-rules.js?v=structural-pmi-1";
const REPORT_HEADER_AUTOFILL_ASSET = "./report-header-autofill.js?v=report-header-1";
const REPORT_TEMPLATE_V2_FIX_ASSET = "./report-template-v2-fix.js?v=revised-template-1";
const REPORT_TEMPLATE_FINAL_FIX_ASSET = "./report-template-final-fix.js?v=revised-template-final-2";
const REPORT_HEADER_AUTHORITATIVE_FIX_ASSET = "./report-header-authoritative-fix.js?v=report-header-authoritative-1";
const REPORT_DATA_CLOUD_REFRESH_ASSET = "./report-data-cloud-refresh.js?v=report-cloud-refresh-1";
const REPORT_EXPORT_FIX_ASSET = "./report-export-fixes.js?v=s-and-b-report-fixes-2";
const PHOTO_INDENT_FIX_ASSET = "./photo-indent-fix.js?v=s-and-b-photo-indent-2";
const PHOTO_CLOUD_ASSET = "./photo-cloud-sync.js?v=cloud-photos-2";
const AUTO_REPORT_TEXT_ASSET = "./auto-report-text.js?v=phrase-library-1";
const COATING_SYSTEM_LABEL_FIX_ASSET = "./coating-system-label-fix.js?v=coating-system-labels-1";
const INDEX_ASSET = "./index.html?v=report-fixes-34";

const APP_FILES = [
  "./",
  INDEX_ASSET,
  "./styles.css?v=full-upgrade-list-1",
  "./multi-device.css?v=multi-device-1",
  "./workflow-data.js?v=full-upgrade-list-1",
  LAST_ODOMETER_FIX_ASSET,
  CLOUD_STATE_REFRESH_BRIDGE_ASSET,
  "./app.js?v=full-upgrade-list-1",
  "./inspections.js?v=full-upgrade-list-1",
  WORD_PHOTO_FIT_ASSET,
  INSPECTION_ACTIVITY_RULES_ASSET,
  REPORT_HEADER_AUTOFILL_ASSET,
  REPORT_TEMPLATE_V2_FIX_ASSET,
  REPORT_TEMPLATE_FINAL_FIX_ASSET,
  REPORT_HEADER_AUTHORITATIVE_FIX_ASSET,
  REPORT_DATA_CLOUD_REFRESH_ASSET,
  TRIP_INSPECTION_LINKS_ASSET,
  TRIP_LOG_DESKTOP_ASSET,
  "./workflow-queues.js?v=full-upgrade-list-1",
  SYNC_ENGINE_ASSET,
  INSPECTION_DELETE_SYNC_FIX_ASSET,
  INTEGRITY_SYNC_FIX_ASSET,
  TRIP_DUPLICATE_INTEGRITY_FIX_ASSET,
  BACKUP_CHECKPOINT_SYNC_V2_ASSET,
  "./media-store.js?v=visit-workspace-5",
  "./active-jobs-data.js?v=visit-workspace-5",
  ACTIVE_JOBS_MANAGEMENT_ASSET,
  ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET,
  ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET,
  MASTER_REPORT_DATA_IMPORT_ASSET,
  MASTER_REPORT_DATA_CAPTURE_FIX_ASSET,
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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function scriptTag(asset) {
  return `<script src="${asset}"></script>`;
}

function injectAfter(html, anchor, asset) {
  if (html.includes(asset.split("?")[0].replace("./", ""))) return html;
  if (html.includes(anchor)) return html.replace(anchor, `${anchor}\n  ${scriptTag(asset)}`);
  return html.replace("</body>", `  ${scriptTag(asset)}\n</body>`);
}

function appendScript(html, asset) {
  if (html.includes(asset.split("?")[0].replace("./", ""))) return html;
  return html.replace("</body>", `  ${scriptTag(asset)}\n</body>`);
}

function hardenSyncEngineSource(source) {
  const oldScanBlock = `      } else if (existing.hash !== hash || existing.tombstone) {
        if (!options.remoteApplied) {
          existing.modifiedAt = timestamp;
          existing.syncedAt = Number(existing.syncedAt || 0);
        }
        existing.hash = hash;
        existing.tombstone = false;
        existing.deletionSource = "";
      }`;
  const newScanBlock = `      } else if (existing.tombstone) {
        // Preserve tombstone metadata until cloud reconciliation decides whether
        // a locally present copy is stale or genuinely newer.
      } else if (existing.hash !== hash) {
        existing.modifiedAt = timestamp;
        existing.syncedAt = Number(existing.syncedAt || 0);
        existing.hash = hash;
        existing.tombstone = false;
        existing.deletionSource = "";
      }`;

  const oldMergeAnchor = `      const localHash = hashValue(localRecord.payload);
      if (localHash === remoteHash) {`;
  const newMergeAnchor = `      const localHash = hashValue(localRecord.payload);

      // The active-trip singleton is reused for every trip. If another device
      // ended/cancelled this trip after it began, its newer cloud tombstone wins.
      // A truly new active trip that began after the tombstone remains local-dirty.
      if (remote.record_type === "active_trip" && remote.record_id === "current" && remote.tombstone) {
        const localStart = Date.parse(localRecord.payload?.startISO || "") || 0;
        if (!localStart || remoteTime >= localStart) {
          applyRemoteRecord(state, remote);
          setMetaFromRemote(meta, key, remote);
          changed = true;
          localRecords = extractRecords(state);
        } else {
          meta.records[key] = {
            hash: localHash,
            modifiedAt: localStart,
            syncedAt: remoteTime,
            tombstone: false,
            deletionSource: ""
          };
        }
        continue;
      }

      if (localHash === remoteHash) {`;

  let hardened = source;
  if (hardened.includes(oldScanBlock)) hardened = hardened.replace(oldScanBlock, newScanBlock);
  if (hardened.includes(oldMergeAnchor)) hardened = hardened.replace(oldMergeAnchor, newMergeAnchor);
  return hardened;
}

async function injectRuntimeLoaders(response) {
  if (!response) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  let html = await response.text();

  const appTag = '<script src="./app.js?v=full-upgrade-list-1"></script>';
  if (!html.includes("last-odometer-derived-fix.js")) {
    if (html.includes(appTag)) html = html.replace(appTag, `${scriptTag(LAST_ODOMETER_FIX_ASSET)}\n  ${scriptTag(CLOUD_STATE_REFRESH_BRIDGE_ASSET)}\n  ${appTag}`);
    else {
      html = appendScript(html, LAST_ODOMETER_FIX_ASSET);
      html = appendScript(html, CLOUD_STATE_REFRESH_BRIDGE_ASSET);
    }
  } else if (!html.includes("cloud-state-refresh-bridge.js")) {
    if (html.includes(appTag)) html = html.replace(appTag, `${scriptTag(CLOUD_STATE_REFRESH_BRIDGE_ASSET)}\n  ${appTag}`);
    else html = appendScript(html, CLOUD_STATE_REFRESH_BRIDGE_ASSET);
  }

  const inspectionsTag = '<script src="./inspections.js?v=full-upgrade-list-1"></script>';
  html = injectAfter(html, inspectionsTag, WORD_PHOTO_FIT_ASSET);
  html = injectAfter(html, scriptTag(WORD_PHOTO_FIT_ASSET), INSPECTION_ACTIVITY_RULES_ASSET);
  html = injectAfter(html, scriptTag(INSPECTION_ACTIVITY_RULES_ASSET), REPORT_HEADER_AUTOFILL_ASSET);
  html = injectAfter(html, scriptTag(REPORT_HEADER_AUTOFILL_ASSET), REPORT_TEMPLATE_V2_FIX_ASSET);
  html = injectAfter(html, scriptTag(REPORT_TEMPLATE_V2_FIX_ASSET), REPORT_TEMPLATE_FINAL_FIX_ASSET);
  html = injectAfter(html, scriptTag(REPORT_TEMPLATE_FINAL_FIX_ASSET), TRIP_INSPECTION_LINKS_ASSET);
  html = injectAfter(html, scriptTag(TRIP_INSPECTION_LINKS_ASSET), TRIP_LOG_DESKTOP_ASSET);

  const activeJobsDataTag = '<script src="./active-jobs-data.js?v=visit-workspace-5"></script>';
  html = injectAfter(html, activeJobsDataTag, ACTIVE_JOBS_ACTIVITY_EXPORT_FIX_ASSET);

  const activeJobsManagementTag = '<script src="./active-jobs-management.js?v=full-upgrade-list-1"></script>';
  html = injectAfter(html, activeJobsManagementTag, ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET);
  html = injectAfter(html, scriptTag(ACTIVE_JOBS_IMPORT_AJ_IDENTITY_FIX_ASSET), MASTER_REPORT_DATA_IMPORT_ASSET);

  const legacySyncTag = '<script src="./sync-engine.js?v=full-upgrade-list-1"></script>';
  if (!html.includes("sync-engine.js?v=authoritative-sync-2")) {
    if (html.includes(legacySyncTag)) html = html.replace(legacySyncTag, scriptTag(SYNC_ENGINE_ASSET));
    else {
      const priorAuthoritative = '<script src="./sync-engine.js?v=authoritative-sync-1"></script>';
      if (html.includes(priorAuthoritative)) html = html.replace(priorAuthoritative, scriptTag(SYNC_ENGINE_ASSET));
      else html = appendScript(html, SYNC_ENGINE_ASSET);
    }
  }
  html = injectAfter(html, scriptTag(SYNC_ENGINE_ASSET), INSPECTION_DELETE_SYNC_FIX_ASSET);
  html = injectAfter(html, scriptTag(INSPECTION_DELETE_SYNC_FIX_ASSET), INTEGRITY_SYNC_FIX_ASSET);
  html = injectAfter(html, scriptTag(INTEGRITY_SYNC_FIX_ASSET), TRIP_DUPLICATE_INTEGRITY_FIX_ASSET);
  html = injectAfter(html, scriptTag(TRIP_DUPLICATE_INTEGRITY_FIX_ASSET), BACKUP_CHECKPOINT_SYNC_V2_ASSET);

  const mediaTag = '<script src="./media-store.js?v=visit-workspace-5"></script>';
  if (!html.includes("report-export-fixes.js")) {
    if (html.includes(mediaTag)) html = html.replace(mediaTag, `${scriptTag(REPORT_EXPORT_FIX_ASSET)}\n  ${mediaTag}`);
    else html = appendScript(html, REPORT_EXPORT_FIX_ASSET);
  }

  html = appendScript(html, REPORT_HEADER_AUTHORITATIVE_FIX_ASSET);
  html = appendScript(html, REPORT_DATA_CLOUD_REFRESH_ASSET);
  html = appendScript(html, MASTER_REPORT_DATA_CAPTURE_FIX_ASSET);
  html = appendScript(html, PHOTO_CLOUD_ASSET);
  html = appendScript(html, PHOTO_INDENT_FIX_ASSET);
  html = appendScript(html, AUTO_REPORT_TEXT_ASSET);
  html = appendScript(html, COATING_SYSTEM_LABEL_FIX_ASSET);

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
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

  if (requestUrl.pathname.endsWith("/sync-engine.js")) {
    event.respondWith((async () => {
      let response;
      try {
        response = await fetch(event.request, { cache: "reload" });
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      } catch (_) {
        response = await caches.match(event.request) || await caches.match(SYNC_ENGINE_ASSET);
      }
      if (!response) return new Response("", { status: 503, statusText: "Sync engine unavailable" });
      const source = hardenSyncEngineSource(await response.text());
      return new Response(source, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
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