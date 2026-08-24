(() => {
  "use strict";

  const DB_NAME = "MileageLoggerInspectionMedia";
  const DB_VERSION = 1;
  const STORE_NAME = "photos";
  const MAX_IMAGE_DIMENSION = 1600;
  const JPEG_QUALITY = 0.82;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Private photo storage is not supported by this browser."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("inspectionId", "inspectionId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Private photo storage could not be opened."));
    });
  }

  async function withStore(mode, callback) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;

      try {
        result = callback(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }

      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("The photo operation failed."));
      };
      transaction.onabort = transaction.onerror;
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("The photo request failed."));
    });
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `photo-${window.crypto.randomUUID()}`;
    }
    return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`The photo "${file.name || "image"}" could not be read.`));
      };
      image.src = url;
    });
  }

  async function compressImage(file) {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("The photo could not be compressed.")),
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    return { blob, width, height };
  }

  async function addPhoto(inspectionId, file) {
    if (!inspectionId) throw new Error("Start a trip or open an inspection before adding a photo.");
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Choose an image file.");
    }

    let prepared;
    try {
      prepared = await compressImage(file);
    } catch (error) {
      prepared = { blob: file, width: null, height: null };
    }

    const record = {
      id: makeId(),
      inspectionId,
      name: String(file.name || `inspection-photo-${Date.now()}.jpg`),
      type: prepared.blob.type || file.type || "image/jpeg",
      size: prepared.blob.size,
      width: prepared.width,
      height: prepared.height,
      createdISO: new Date().toISOString(),
      caption: "",
      blob: prepared.blob
    };

    await withStore("readwrite", (store) => store.put(record));
    return {
      id: record.id,
      name: record.name,
      type: record.type,
      size: record.size,
      width: record.width,
      height: record.height,
      createdISO: record.createdISO,
      caption: record.caption
    };
  }

  async function getPhoto(id) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      return await requestResult(transaction.objectStore(STORE_NAME).get(id));
    } finally {
      database.close();
    }
  }

  async function getAllPhotos() {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      return await requestResult(transaction.objectStore(STORE_NAME).getAll());
    } finally {
      database.close();
    }
  }

  async function getPhotosByOwner(ownerId) {
    if (!ownerId) return [];
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const index = transaction.objectStore(STORE_NAME).index("inspectionId");
      return await requestResult(index.getAll(IDBKeyRange.only(ownerId)));
    } finally {
      database.close();
    }
  }

  async function deletePhoto(id) {
    await withStore("readwrite", (store) => store.delete(id));
  }

  async function updatePhotoCaption(id, caption) {
    if (!id) return;
    const record = await getPhoto(id);
    if (!record) return;
    record.caption = String(caption || "");
    await withStore("readwrite", (store) => store.put(record));
  }

  async function deleteInspectionPhotos(inspectionId) {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const index = transaction.objectStore(STORE_NAME).index("inspectionId");
        const cursorRequest = index.openCursor(IDBKeyRange.only(inspectionId));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Photos could not be removed."));
      });
    } finally {
      database.close();
    }
  }

  async function replaceAllPhotos(records) {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        for (const record of records) store.put(record);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Photos could not be restored."));
      });
    } finally {
      database.close();
    }
  }

  window.MileageMediaStore = {
    addPhoto,
    getPhoto,
    getAllPhotos,
    getPhotosByOwner,
    updatePhotoCaption,
    deletePhoto,
    deleteInspectionPhotos,
    replaceAllPhotos
  };
})();

(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const PRIVATE_FILE_DB_NAME = "MileageLoggerPrivateFiles";
  const PRIVATE_FILE_DB_VERSION = 1;
  const PRIVATE_FILE_DB_STORE = "privateFiles";
  const INSPECTION_REPORT_TEMPLATE_KEY = "inspectionReportTemplate";

  function readState() {
    try {
      const state = JSON.parse(window.localStorage.getItem(STATE_KEY) || "{}");
      state.trips = Array.isArray(state.trips) ? state.trips : [];
      state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
      return state;
    } catch (error) {
      throw new Error(`Mileage Logger data could not be read: ${error.message}`);
    }
  }

  function getTripById(state, tripId) {
    if (!tripId) return null;
    if (state.activeTrip?.id === tripId) return state.activeTrip;
    return state.trips.find((trip) => trip.id === tripId) || null;
  }

  function reportPhotoReferences(state, inspection) {
    const seen = new Set();
    const references = [];
    const add = (photo, sourceTripId = "") => {
      if (!photo) return;
      const copy = { ...photo };
      if (sourceTripId && !copy.sourceTripId) copy.sourceTripId = sourceTripId;
      const id = String(copy.id || "").trim();
      const fallback = [copy.name, copy.createdISO, copy.caption]
        .map((value) => String(value || "").trim())
        .join("|");
      const key = id || fallback;
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      references.push(copy);
    };

    (Array.isArray(inspection?.photos) ? inspection.photos : [])
      .filter((photo) => photo && !photo.sourceTripId)
      .forEach((photo) => add(photo));

    const trip = getTripById(state, inspection?.tripId);
    (Array.isArray(trip?.photos) ? trip.photos : [])
      .forEach((photo) => add(photo, trip.id));

    (Array.isArray(inspection?.photos) ? inspection.photos : [])
      .filter((photo) => photo?.sourceTripId)
      .forEach((photo) => add(photo, photo.sourceTripId));

    return references;
  }

  function safeFilePart(value, fallback = "record") {
    const cleaned = String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 70);
    return cleaned || fallback;
  }

  function packageBaseName(inspection) {
    return [
      "Inspection",
      inspection.date || new Date().toISOString().slice(0, 10),
      inspection.vendor || inspection.inspectionLocation || "Facility",
      inspection.projectNumber || inspection.equipmentTag || "Record"
    ].map((part, index) => safeFilePart(part, index === 0 ? "Inspection" : "Record")).join("_");
  }

  async function loadReportPhotos(state, inspection) {
    if (!window.MileageMediaStore?.getAllPhotos) {
      throw new Error("Private photo storage is unavailable on this device.");
    }
    const references = reportPhotoReferences(state, inspection);
    const stored = await window.MileageMediaStore.getAllPhotos();
    const byId = new Map(stored.map((photo) => [photo.id, photo]));
    const missing = [];
    const photos = references.map((metadata, index) => {
      const id = String(metadata?.id || "").trim();
      const photo = id ? byId.get(id) : null;
      if (!photo?.blob) {
        missing.push(metadata?.caption || metadata?.name || id || `Photo ${index + 1}`);
        return null;
      }
      const sequence = String(index + 1).padStart(2, "0");
      const extension = String(photo.type || photo.blob?.type || "").toLowerCase() === "image/png" ? "png" : "jpg";
      const friendlyName = safeFilePart(
        metadata.caption || photo.caption || metadata.name || photo.name,
        `Inspection_Photo_${sequence}`
      );
      return {
        ...photo,
        ...metadata,
        blob: photo.blob,
        packagePath: `Photos/${sequence}_${friendlyName}.${extension}`
      };
    }).filter(Boolean);

    if (missing.length) {
      const preview = missing.slice(0, 3).join("; ");
      const more = missing.length > 3 ? `; +${missing.length - 3} more` : "";
      throw new Error(
        `${missing.length} of ${references.length} report photo${missing.length === 1 ? "" : "s"} could not be loaded on this device (${preview}${more}). ` +
        "The Word report was not exported so an incomplete report cannot be mistaken for a complete one."
      );
    }
    return photos;
  }

  function openTemplateDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(PRIVATE_FILE_DB_NAME, PRIVATE_FILE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PRIVATE_FILE_DB_STORE)) {
          db.createObjectStore(PRIVATE_FILE_DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Private Word template storage could not be opened."));
    });
  }

  async function readTemplateRecord() {
    const db = await openTemplateDatabase();
    if (!db) return null;
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(PRIVATE_FILE_DB_STORE, "readonly");
        const request = transaction.objectStore(PRIVATE_FILE_DB_STORE).get(INSPECTION_REPORT_TEMPLATE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Private Word template could not be read."));
      });
    } finally {
      db.close();
    }
  }

  async function buildWordReport(state, inspection) {
    const api = window.MileageInspectionReportTesting;
    if (!api?.buildInspectionDocx || !api?.buildSAndBInspectionDocx) {
      throw new Error("The Mileage Logger Word report engine is unavailable. Reload the app and try again.");
    }
    const photos = await loadReportPhotos(state, inspection);
    const baseName = packageBaseName(inspection);
    const filename = `${baseName}_Editable_Report.docx`;
    const template = await readTemplateRecord();
    const bytes = template?.bytes
      ? await api.buildSAndBInspectionDocx(template, inspection, photos, filename)
      : await api.buildInspectionDocx(inspection, photos);
    return { filename, bytes };
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 4000);
  }

  async function deliver(filename, bytes) {
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const blob = new Blob([bytes], { type });
    const file = new File([blob], filename, { type });
    const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches;
    const forceDownload = new URLSearchParams(window.location.search).get("download") === "1";
    if (!forceDownload && touchDevice && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        showToast("Word report ready to save or share.");
        return true;
      } catch (error) {
        if (error?.name === "AbortError") {
          showToast("Word report was not saved.");
          return false;
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Word report downloaded.");
    return true;
  }

  function markExported(inspectionId) {
    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
    if (!inspection) return;
    const exportedISO = new Date().toISOString();
    inspection.handoffExportedISO = exportedISO;
    inspection.handoffExportedModifiedISO = inspection.modifiedISO || inspection.createdISO || exportedISO;
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  async function exportWord(inspectionId, button) {
    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
    if (!inspection) throw new Error("The selected inspection could not be found.");
    const original = button?.textContent || "Export Word Report";
    if (button) {
      button.disabled = true;
      button.textContent = "Building Word Report...";
    }
    try {
      const report = await buildWordReport(state, inspection);
      const delivered = await deliver(report.filename, report.bytes);
      if (delivered) markExported(inspection.id);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-export-inspection], [data-preview-export-inspection]");
    if (!button) return;
    const inspectionId = button.dataset.exportInspection || button.dataset.previewExportInspection;
    if (!inspectionId) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    exportWord(inspectionId, button).catch((error) => {
      console.error("Inspection photo export failed:", error);
      window.alert(`The Word report could not be created.\n\n${error.message}`);
    });
  }, true);

  window.MileageInspectionPhotoExportHotfix = Object.freeze({
    reportPhotoReferences,
    loadReportPhotos
  });
})();
