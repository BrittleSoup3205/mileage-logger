(() => {
  "use strict";

  const BUCKET = "mileage-logger-photos";
  const STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const PHOTO_META_KEY = "mileage_logger_photo_cloud_meta_v1";
  const SYNC_INTERVAL_MS = 60000;
  const MAX_CONCURRENCY = 3;

  const media = window.MileageMediaStore;
  if (!media?.getAllPhotos || !media?.getPhoto) return;

  const original = {
    addPhoto: media.addPhoto?.bind(media),
    getPhoto: media.getPhoto.bind(media),
    getAllPhotos: media.getAllPhotos.bind(media)
  };

  let syncTimer = null;
  let syncInFlight = null;
  let lastStatus = { state: "idle", uploaded: 0, downloaded: 0, pending: 0, message: "Photo cloud sync is ready." };

  function safeJSONParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function readJSON(key, fallback) {
    return safeJSONParse(localStorage.getItem(key), fallback);
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadConfig() {
    const config = readJSON(CONFIG_KEY, {});
    return {
      enabled: config.enabled === undefined ? true : Boolean(config.enabled),
      projectUrl: String(config.projectUrl || "").trim().replace(/\/$/, ""),
      publishableKey: String(config.publishableKey || "").trim()
    };
  }

  function loadSession() {
    return readJSON(SESSION_KEY, null);
  }

  function saveSession(session) {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else writeJSON(SESSION_KEY, session);
  }

  function cloudMeta() {
    const meta = readJSON(PHOTO_META_KEY, {});
    return {
      uploaded: meta.uploaded && typeof meta.uploaded === "object" ? meta.uploaded : {},
      lastSyncISO: String(meta.lastSyncISO || "")
    };
  }

  function saveCloudMeta(meta) {
    writeJSON(PHOTO_META_KEY, {
      uploaded: meta.uploaded || {},
      lastSyncISO: meta.lastSyncISO || ""
    });
  }

  function configReady() {
    const config = loadConfig();
    return Boolean(config.enabled && /^https:\/\//i.test(config.projectUrl) && config.publishableKey);
  }

  function sessionReady(session = loadSession()) {
    return Boolean(session?.access_token && session?.refresh_token && session?.user?.id);
  }

  function isSecretKey(value) {
    const key = String(value || "").toLowerCase();
    return key.includes("service_role") || key.startsWith("sb_secret_");
  }

  async function validSession() {
    let session = loadSession();
    if (!sessionReady(session)) return null;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt - Date.now() > 60000) return session;

    const config = loadConfig();
    const response = await fetch(`${config.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const text = await response.text();
    const body = text ? safeJSONParse(text, {}) : {};
    if (!response.ok) {
      saveSession(null);
      throw new Error(body?.error_description || body?.msg || "Mileage Logger cloud sign-in expired.");
    }
    session = body;
    saveSession(session);
    return session;
  }

  function encodeObjectPath(userId, photoId) {
    return `${encodeURIComponent(String(userId))}/${encodeURIComponent(String(photoId))}`;
  }

  async function authorizedFetch(path, options = {}) {
    const config = loadConfig();
    if (!configReady()) throw new Error("Mileage Logger cloud sync is not configured.");
    if (isSecretKey(config.publishableKey)) throw new Error("A private Supabase secret key must never be used in the browser.");
    const session = await validSession();
    if (!session?.access_token || !session?.user?.id) throw new Error("Sign in to Mileage Logger sync first.");
    const headers = new Headers(options.headers || {});
    headers.set("apikey", config.publishableKey);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(`${config.projectUrl}${path}`, { ...options, headers });
  }

  async function responseError(response, fallback) {
    const text = await response.text();
    const body = text ? safeJSONParse(text, null) : null;
    return new Error(body?.message || body?.error || body?.msg || `${fallback} (${response.status})`);
  }

  function photoSignature(photo) {
    return `${Number(photo?.size || photo?.blob?.size || 0)}|${String(photo?.createdISO || "")}|${String(photo?.type || photo?.blob?.type || "")}`;
  }

  function readState() {
    const state = readJSON(STATE_KEY, {});
    state.trips = Array.isArray(state.trips) ? state.trips : [];
    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
    return state;
  }

  function referencedPhotoMap() {
    const state = readState();
    const refs = new Map();
    const add = (photo, ownerId, sourceTripId = "") => {
      if (!photo?.id || refs.has(photo.id)) return;
      refs.set(photo.id, {
        ...photo,
        ownerId: String(ownerId || photo.inspectionId || sourceTripId || "cloud"),
        sourceTripId: photo.sourceTripId || sourceTripId || ""
      });
    };

    if (state.activeTrip?.id) {
      (Array.isArray(state.activeTrip.photos) ? state.activeTrip.photos : []).forEach((photo) => add(photo, state.activeTrip.id, state.activeTrip.id));
    }
    state.trips.forEach((trip) => {
      (Array.isArray(trip?.photos) ? trip.photos : []).forEach((photo) => add(photo, trip.id, trip.id));
    });
    state.settings.inspections.forEach((inspection) => {
      (Array.isArray(inspection?.photos) ? inspection.photos : []).forEach((photo) => add(photo, inspection.id, photo.sourceTripId || ""));
    });
    return refs;
  }

  function openMediaDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("MileageLoggerInspectionMedia", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Photo cache could not be opened."));
    });
  }

  async function putLocalPhoto(record) {
    const db = await openMediaDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("photos", "readwrite");
        transaction.objectStore("photos").put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Downloaded photo could not be cached."));
      });
    } finally {
      db.close();
    }
  }

  async function uploadPhoto(photo) {
    if (!photo?.id || !photo?.blob) return false;
    const session = await validSession();
    if (!session?.user?.id) return false;
    const objectPath = encodeObjectPath(session.user.id, photo.id);
    const response = await authorizedFetch(`/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: {
        "Content-Type": photo.blob.type || photo.type || "image/jpeg",
        "Cache-Control": "3600",
        "x-upsert": "true"
      },
      body: photo.blob
    });
    if (!response.ok) throw await responseError(response, `Photo ${photo.id} could not be uploaded`);
    const meta = cloudMeta();
    meta.uploaded[photo.id] = photoSignature(photo);
    meta.lastSyncISO = new Date().toISOString();
    saveCloudMeta(meta);
    return true;
  }

  async function downloadPhoto(photoId, metadata = null) {
    if (!photoId) return null;
    const session = await validSession();
    if (!session?.user?.id) return null;
    const objectPath = encodeObjectPath(session.user.id, photoId);
    const response = await authorizedFetch(`/storage/v1/object/authenticated/${BUCKET}/${objectPath}`, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" }
    });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw await responseError(response, `Photo ${photoId} could not be downloaded`);
    const blob = await response.blob();
    const info = metadata || referencedPhotoMap().get(photoId) || {};
    const record = {
      id: photoId,
      inspectionId: String(info.ownerId || info.sourceTripId || "cloud"),
      name: String(info.name || `Mileage-Logger-${photoId}.jpg`),
      type: blob.type || info.type || "image/jpeg",
      size: blob.size,
      width: info.width ?? null,
      height: info.height ?? null,
      createdISO: info.createdISO || new Date().toISOString(),
      caption: String(info.caption || ""),
      blob
    };
    await putLocalPhoto(record);
    const meta = cloudMeta();
    meta.uploaded[photoId] = photoSignature(record);
    meta.lastSyncISO = new Date().toISOString();
    saveCloudMeta(meta);
    return record;
  }

  async function runPool(items, worker, concurrency = MAX_CONCURRENCY) {
    const queue = [...items];
    const results = [];
    const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          results.push({ item, value: await worker(item), error: null });
        } catch (error) {
          results.push({ item, value: null, error });
        }
      }
    });
    await Promise.all(runners);
    return results;
  }

  async function ensureReferencedPhotosLocal() {
    if (!navigator.onLine || !configReady() || !sessionReady()) return original.getAllPhotos();
    const local = await original.getAllPhotos();
    const localIds = new Set(local.map((photo) => photo.id));
    const refs = referencedPhotoMap();
    const missing = [...refs.entries()].filter(([id]) => !localIds.has(id));
    if (!missing.length) return local;
    await runPool(missing, async ([id, metadata]) => downloadPhoto(id, metadata));
    return original.getAllPhotos();
  }

  async function syncNow(options = {}) {
    if (syncInFlight) return syncInFlight;
    if (!navigator.onLine || !configReady() || !sessionReady()) return false;

    syncInFlight = (async () => {
      let uploaded = 0;
      let downloaded = 0;
      const errors = [];
      try {
        const session = await validSession();
        if (!session?.user?.id) return false;
        const local = await original.getAllPhotos();
        const meta = cloudMeta();
        const uploads = local.filter((photo) => meta.uploaded[photo.id] !== photoSignature(photo));
        const uploadResults = await runPool(uploads, uploadPhoto);
        uploadResults.forEach((result) => {
          if (result.error) errors.push(result.error);
          else if (result.value) uploaded += 1;
        });

        const localIds = new Set(local.map((photo) => photo.id));
        const refs = referencedPhotoMap();
        const downloads = [...refs.entries()].filter(([id]) => !localIds.has(id));
        const downloadResults = await runPool(downloads, async ([id, metadata]) => downloadPhoto(id, metadata));
        downloadResults.forEach((result) => {
          if (result.error) errors.push(result.error);
          else if (result.value) downloaded += 1;
        });

        const pending = errors.length;
        const message = pending
          ? `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded, ${downloaded} downloaded; ${pending} need retry.`
          : `${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded, ${downloaded} downloaded. Photo cloud sync is current.`;
        lastStatus = { state: pending ? "warn" : "ready", uploaded, downloaded, pending, message };
        const nextMeta = cloudMeta();
        nextMeta.lastSyncISO = new Date().toISOString();
        saveCloudMeta(nextMeta);
        window.dispatchEvent(new CustomEvent("mileage:photo-cloud-sync", { detail: { ...lastStatus, reason: options.reason || "automatic" } }));
        if (errors.length) console.warn("Mileage Logger photo cloud sync needs retry:", errors);
        return !errors.length;
      } catch (error) {
        lastStatus = { state: "error", uploaded, downloaded, pending: 1, message: error.message };
        console.warn("Mileage Logger photo cloud sync failed:", error);
        window.dispatchEvent(new CustomEvent("mileage:photo-cloud-sync", { detail: { ...lastStatus, reason: options.reason || "automatic" } }));
        return false;
      } finally {
        syncInFlight = null;
      }
    })();

    return syncInFlight;
  }

  function scheduleSync(delay = 2500) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow({ reason: "scheduled" }), delay);
  }

  if (original.addPhoto) {
    media.addPhoto = async function cloudAwareAddPhoto(ownerId, file) {
      const result = await original.addPhoto(ownerId, file);
      scheduleSync(250);
      return result;
    };
  }

  media.getPhoto = async function cloudAwareGetPhoto(id) {
    const local = await original.getPhoto(id);
    if (local?.blob || !navigator.onLine || !configReady() || !sessionReady()) return local;
    return downloadPhoto(id);
  };

  media.getAllPhotos = async function cloudAwareGetAllPhotos() {
    return ensureReferencedPhotosLocal();
  };

  window.MileagePhotoCloudSync = Object.freeze({
    bucket: BUCKET,
    syncNow,
    ensureReferencedPhotosLocal,
    downloadPhoto,
    getStatus: () => ({ ...lastStatus }),
    getCloudMeta: () => ({ ...cloudMeta(), uploaded: { ...cloudMeta().uploaded } })
  });

  window.addEventListener("online", () => scheduleSync(500));
  window.addEventListener("mileage:state-changed", () => scheduleSync(1500));
  window.addEventListener("storage", (event) => {
    if ([STATE_KEY, SESSION_KEY, CONFIG_KEY].includes(event.key)) scheduleSync(1000);
  });

  setTimeout(() => scheduleSync(500), 3500);
  setInterval(() => syncNow({ reason: "interval" }), SYNC_INTERVAL_MS);
})();