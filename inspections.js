(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const INSPECTION_SCHEMA_VERSION = 5;
  const WORKFLOW_DATA = window.MileageWorkflowData || {};
  const REFRESH_INTERVAL_MS = 1200;
  const INSPECTION_PHOTO_WARNING = 30;
  const INSPECTION_PHOTO_LIMIT = 50;
  const PRIVATE_FILE_DB_NAME = "MileageLoggerPrivateFiles";
  const PRIVATE_FILE_DB_VERSION = 1;
  const PRIVATE_FILE_DB_STORE = "privateFiles";
  const INSPECTION_REPORT_TEMPLATE_KEY = "inspectionReportTemplate";
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
  const $ = (id) => document.getElementById(id);

  let editingInspectionId = null;
  let editingInspectionWasExisting = false;
  let currentTripId = "";
  let currentPhotos = [];
  let originalPhotoIds = new Set();
  let photoObjectUrls = [];
  let linkedTripPhotoObjectUrls = [];
  let workspacePhotoObjectUrls = [];
  let inspectionListObjectUrls = [];
  let inspectionPreviewObjectUrls = [];
  let previewInspectionId = "";
  let activeView = "inspections";
  const selectedInspectionIds = new Set();
  let lastStateSignature = "";
  let inspectionTemplateInstalled = false;
  let inspectionAutosaveTimer = null;
  let inspectionAutosaveInProgress = false;
  const ACTIVE_JOB_DATA = window.MileageActiveJobsData || {};
  const SEED_ACTIVE_JOBS = Array.isArray(ACTIVE_JOB_DATA.activeJobs)
    ? ACTIVE_JOB_DATA.activeJobs.map((job) => ACTIVE_JOB_DATA.normalizedJob ? ACTIVE_JOB_DATA.normalizedJob(job) : { ...job })
    : [];
  const COATING_SYSTEMS = ACTIVE_JOB_DATA.coatingSystems || {};

  const INSPECTION_TYPES = [
    "Inspection",
    "Pre-Fab Meeting",
    "Material Inspection",
    "Fit-up Inspection",
    "Welding Surveillance",
    "NDE Review",
    "Hydro Test",
    "Coating Inspection",
    "Structural Steel — Shop Visual",
    "Structural Steel — Dimensional",
    "Structural Steel — Post-Galvanizing",
    "Structural Steel — Final / Release",
    "Final Inspection",
    "Document Review",
    "Phone / Coordination",
    "Other"
  ];

  const INSPECTION_STATUSES = ["Draft", "Complete", "In Progress", "Pending", "Released", "Hold"];
  const ACCEPTANCE_STATUSES = [
    "Not Determined",
    "Accepted",
    "Accepted with Follow-up",
    "Released",
    "Hold",
    "Rejected"
  ];
  const INSPECTION_ACTIVITIES = Array.isArray(WORKFLOW_DATA.INSPECTION_ACTIVITIES)
    ? WORKFLOW_DATA.INSPECTION_ACTIVITIES
    : [
      "Hydro / Pressure Test",
      "Visual / Final Inspection",
      "Dimensional Inspection",
      "Coating Inspection",
      "NDE Review",
      "Material / MTR / PMI Review",
      "Documentation Review",
      "Inspection Release",
      "Structural Steel Inspection"
    ];

  function makeId(prefix = "inspection") {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[\",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function openInspectionPrivateFileDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("This browser does not support private local file storage."));
        return;
      }
      const request = indexedDB.open(PRIVATE_FILE_DB_NAME, PRIVATE_FILE_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PRIVATE_FILE_DB_STORE)) {
          database.createObjectStore(PRIVATE_FILE_DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        request.error || new Error("The private file database could not be opened.")
      );
    });
  }

  async function readInspectionReportTemplateRecord() {
    const database = await openInspectionPrivateFileDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PRIVATE_FILE_DB_STORE, "readonly");
      const request = transaction.objectStore(PRIVATE_FILE_DB_STORE).get(INSPECTION_REPORT_TEMPLATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(
        request.error || new Error("The private S&B report template could not be read.")
      );
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("The private template transaction failed."));
      };
    });
  }

  async function writeInspectionReportTemplateRecord(record) {
    const database = await openInspectionPrivateFileDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PRIVATE_FILE_DB_STORE, "readwrite");
      transaction.objectStore(PRIVATE_FILE_DB_STORE).put(record);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("The private S&B report template could not be saved."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("Saving the private S&B report template was canceled."));
      };
    });
  }

  async function deleteInspectionReportTemplateRecord() {
    const database = await openInspectionPrivateFileDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PRIVATE_FILE_DB_STORE, "readwrite");
      transaction.objectStore(PRIVATE_FILE_DB_STORE).delete(INSPECTION_REPORT_TEMPLATE_KEY);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("The private S&B report template could not be removed."));
      };
    });
  }

  function privateFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} bytes`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function validateInspectionReportTemplateBytes(bytes) {
    if (!window.fflate) throw new Error("The Word document component is unavailable.");
    let files;
    try {
      files = window.fflate.unzipSync(bytes);
    } catch (error) {
      throw new Error("This file is not a readable Word .docx document.");
    }
    const requiredParts = [
      "word/document.xml",
      "word/header1.xml",
      "word/footer1.xml",
      "word/_rels/document.xml.rels",
      "[Content_Types].xml"
    ];
    const missing = requiredParts.filter((path) => !files[path]);
    if (missing.length) {
      throw new Error(`This Word file is missing required template parts: ${missing.join(", ")}.`);
    }
    const documentXml = parseWordXml(files["word/document.xml"], "word/document.xml");
    const headerXml = parseWordXml(files["word/header1.xml"], "word/header1.xml");
    const documentText = wordNodeText(documentXml);
    const headerText = wordNodeText(headerXml);
    const requiredDocumentLabels = ["VENDOR:", "ACTION ITEMS:", "ATTACHMENTS:", "Figure 1"];
    const requiredHeaderLabels = ["SOURCE INSPECTION REPORT", "CLIENT PROJECT NUMBER:", "DATE OF REPORT:"];
    const missingLabels = [
      ...requiredDocumentLabels.filter((label) => !documentText.includes(label)),
      ...requiredHeaderLabels.filter((label) => !headerText.includes(label))
    ];
    if (missingLabels.length) {
      throw new Error(`This does not appear to be the approved S&B blank inspection report. Missing: ${missingLabels.join(", ")}.`);
    }
  }

  async function importInspectionReportTemplate(file) {
    if (!file || !String(file.name || "").toLowerCase().endsWith(".docx")) {
      throw new Error("Choose the approved blank S&B inspection report in Word .docx format.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    validateInspectionReportTemplateBytes(bytes);
    await writeInspectionReportTemplateRecord({
      id: INSPECTION_REPORT_TEMPLATE_KEY,
      name: file.name,
      type: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: file.size || bytes.byteLength,
      importedISO: nowISO(),
      bytes: arrayBuffer
    });
  }

  async function refreshInspectionReportTemplateStatus() {
    const status = $("inspectionTemplateStatus");
    const pill = $("inspectionTemplatePill");
    const importButton = $("importInspectionTemplateBtn");
    const removeButton = $("removeInspectionTemplateBtn");
    if (!status || !pill || !importButton || !removeButton) return false;
    try {
      const record = await readInspectionReportTemplateRecord();
      inspectionTemplateInstalled = Boolean(record?.bytes);
      if (!inspectionTemplateInstalled) {
        status.textContent = "No private S&B Word template is installed. Exports will use the standard editable report.";
        status.className = "private-master-status warning";
        pill.textContent = "NOT INSTALLED";
        pill.className = "pill active";
        importButton.textContent = "Import S&B Word Template";
        removeButton.disabled = true;
        return false;
      }
      const imported = record.importedISO ? new Date(record.importedISO).toLocaleString() : "date unavailable";
      status.innerHTML = `<strong>${escapeHTML(record.name || "S&B inspection report template")}</strong><br>Stored privately on this device • ${escapeHTML(privateFileSize(record.size))} • imported ${escapeHTML(imported)}`;
      status.className = "private-master-status installed";
      pill.textContent = "INSTALLED";
      pill.className = "pill ready";
      importButton.textContent = "Replace S&B Word Template";
      removeButton.disabled = false;
      return true;
    } catch (error) {
      inspectionTemplateInstalled = false;
      status.textContent = `Private template storage error: ${error.message}`;
      status.className = "private-master-status error";
      pill.textContent = "ERROR";
      pill.className = "pill active";
      removeButton.disabled = true;
      return false;
    }
  }

  function readState() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STATE_KEY) || "{}");
      parsed.trips = Array.isArray(parsed.trips) ? parsed.trips : [];
      parsed.settings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
      parsed.settings.inspections = Array.isArray(parsed.settings.inspections)
        ? parsed.settings.inspections.map((inspection) => (
          typeof WORKFLOW_DATA.migrateInspection === "function"
            ? WORKFLOW_DATA.migrateInspection(inspection)
            : inspection
        ))
        : [];
      parsed.settings.inspectionIgnoredTripIds = Array.isArray(parsed.settings.inspectionIgnoredTripIds)
        ? parsed.settings.inspectionIgnoredTripIds
        : [];
      parsed.settings.inspectionSchemaVersion = INSPECTION_SCHEMA_VERSION;
      parsed.backup = parsed.backup && typeof parsed.backup === "object" ? parsed.backup : {};
      return window.MileageActiveJobsManagement?.migrateState(parsed, SEED_ACTIVE_JOBS) || parsed;
    } catch (error) {
      console.error("Inspection database could not read mileage state:", error);
      return {
        trips: [],
        settings: {
          inspections: [],
          inspectionIgnoredTripIds: [],
          inspectionSchemaVersion: INSPECTION_SCHEMA_VERSION
        },
        backup: {}
      };
    }
  }

  function writeState(state) {
    state.settings = state.settings || {};
    state.settings.inspections = Array.isArray(state.settings.inspections)
      ? state.settings.inspections.map((inspection) => (
        typeof WORKFLOW_DATA.migrateInspection === "function"
          ? WORKFLOW_DATA.migrateInspection(inspection)
          : inspection
      ))
      : [];
    state.settings.inspectionIgnoredTripIds = Array.isArray(state.settings.inspectionIgnoredTripIds)
      ? state.settings.inspectionIgnoredTripIds
      : [];
    state.settings.inspectionSchemaVersion = INSPECTION_SCHEMA_VERSION;
    nativeSetItem(STATE_KEY, JSON.stringify(state));

    // A same-page localStorage write does not produce a native storage event.
    // Notify the main mileage app explicitly so its backup view and package
    // always include the latest inspection records and photo references.
    window.dispatchEvent(new CustomEvent("mileage:state-changed"));
    lastStateSignature = "";
    refreshFromState(true);
  }

  function updateState(mutator, options = {}) {
    const state = readState();
    mutator(state);
    state.settings.inspectionLastChangedISO = nowISO();
    state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
    const pendingChanges = Math.max(0, Number(state.backup.pendingChangeCount || 0));
    state.backup.pendingChangeCount = options.coalesceBackup ? Math.max(1, pendingChanges) : pendingChanges + 1;
    state.backup.lastRequiredISO = state.settings.inspectionLastChangedISO;
    writeState(state);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function todayInputValue() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function inputDateFromTrip(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[1]}-${match[2]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return todayInputValue();
  }

  function displayDate(value) {
    if (!value) return "—";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[2]}/${match[3]}/${match[1]}`;
    return String(value);
  }

  function formatMiles(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)} mi` : "—";
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function parseTimeToMinutes(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    const twentyFourHour = text.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFourHour) {
      const hour = Number(twentyFourHour[1]);
      const minute = Number(twentyFourHour[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
    }

    const twelveHour = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!twelveHour) return null;
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (hour === 12) hour = 0;
    if (twelveHour[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + minute;
  }

  function calculateHours(start, end) {
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (startMinutes === null || endMinutes === null) return "";
    let difference = endMinutes - startMinutes;
    if (difference < 0) difference += 24 * 60;
    return (difference / 60).toFixed(2);
  }

  function mapLink(location, label) {
    if (!location) return "";
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
    return `https://maps.apple.com/?ll=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&q=${encodeURIComponent(label || "Location")}`;
  }

  function getTripById(state, tripId) {
    if (!tripId) return null;
    if (state.activeTrip?.id === tripId) return state.activeTrip;
    return state.trips.find((trip) => trip.id === tripId) || null;
  }

  function isActiveTrip(state, trip) {
    return Boolean(trip?.id && state.activeTrip?.id === trip.id);
  }

  function inspectionTrips(state) {
    const trips = [...state.trips];
    if (state.activeTrip?.id && !trips.some((trip) => trip.id === state.activeTrip.id)) {
      trips.unshift(state.activeTrip);
    }
    return trips;
  }

  function tripSnapshot(trip) {
    if (!trip) return null;
    const inProgress = !trip.endISO && !trip.endTime && (trip.endOdometer === undefined || trip.endOdometer === "");
    return {
      tripId: trip.id,
      inProgress,
      date: trip.date || "",
      startTime: trip.startTime || "",
      endTime: trip.endTime || "",
      startOdometer: trip.startOdometer ?? "",
      endOdometer: trip.endOdometer ?? "",
      miles: Number(trip.miles || 0),
      gpsRouteMiles: Number(trip.gpsRouteMiles || 0),
      startLocation: trip.startLocation || null,
      endLocation: trip.endLocation || null,
      staGenerated: Boolean(trip.staGenerated),
      staFileName: trip.staFileName || ""
    };
  }

  function inspectionSearchText(inspection) {
    const followUps = Array.isArray(inspection.followUps) ? inspection.followUps : [];
    return [
      inspection.date,
      inspection.customer,
      inspection.vendor,
      inspection.reportingVendor,
      inspection.inspectionLocation,
      inspection.activeJobId,
      inspection.sbInspectionNo,
      inspection.projectName,
      inspection.projectNumber,
      inspection.purchaseOrderJob,
      inspection.equipmentTag,
      inspection.isoDrawingNumber,
      inspection.vendorJobNumber,
      inspection.pieceSpoolNumber,
      inspection.vendorLoadNumber,
      inspection.inspectionType,
      ...inspectionActivities(inspection),
      inspection.activity,
      inspection.status,
      inspection.summary,
      inspection.quickNote,
      inspection.generatedReportLanguage,
      inspection.observations,
      inspection.deficiencies,
      inspection.acceptanceStatus,
      ...inspectionLoads(inspection).flatMap((load) => [load.identifier, load.status, load.notes, load.deficiencyFollowUp]),
      ...followUps.flatMap((item) => [item.action, item.responsibleParty, item.status])
    ].join(" ").toLowerCase();
  }

  function latestInspectionChangeISO(inspections) {
    return inspections.reduce((latest, inspection) => {
      const candidate = inspection.modifiedISO || inspection.createdISO || "";
      return candidate > latest ? candidate : latest;
    }, "");
  }

  function inspectionBackupIsCurrent(state) {
    const latestChange = state.settings.inspectionLastChangedISO
      || latestInspectionChangeISO(state.settings.inspections);
    if (!latestChange) return true;
    const confirmed = state.backup?.lastConfirmedISO || "";
    return Boolean(confirmed && confirmed >= latestChange);
  }

  function createOptionList(values, selectedValue) {
    return values.map((value) => (
      `<option value="${escapeHTML(value)}"${value === selectedValue ? " selected" : ""}>${escapeHTML(value)}</option>`
    )).join("");
  }

  function inspectionActivities(inspection) {
    if (typeof WORKFLOW_DATA.inspectionActivities === "function") {
      return WORKFLOW_DATA.inspectionActivities(inspection);
    }
    return Array.isArray(inspection?.activities) ? [...new Set(inspection.activities.filter(Boolean))] : [];
  }

  function activitiesMarkup(selected = []) {
    const selectedSet = new Set(selected);
    return INSPECTION_ACTIVITIES.map((activity) => `
      <label class="inspection-activity-option"><input type="checkbox" data-inspection-activity value="${escapeHTML(activity)}"${selectedSet.has(activity) ? " checked" : ""}><span>${escapeHTML(activity)}</span></label>
    `).join("");
  }

  function collectInspectionActivities() {
    return [...document.querySelectorAll("[data-inspection-activity]:checked")].map((input) => input.value);
  }

  function hasInspectionActivity(inspection, pattern) {
    return inspectionActivities(inspection).some((activity) => pattern.test(activity))
      || pattern.test(String(inspection?.inspectionType || ""));
  }

  function injectStyles() {
    if ($("inspectionDatabaseStyles")) return;
    const style = document.createElement("style");
    style.id = "inspectionDatabaseStyles";
    style.textContent = `
      .inspection-prompt-card { border: 2px solid var(--info); }
      .inspection-prompt-card.current-trip-secondary { border-width: 1px; border-color: var(--line); background: color-mix(in srgb, var(--card), var(--bg) 24%); }
      .inspection-prompt-card .inspection-prompt-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
      .inspection-button { color: #ffffff; background: #1d4ed8; }
      body.dark .inspection-button { color: #0b1220; background: #93c5fd; }
      .inspection-dashboard { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 15px; }
      .inspection-metric { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--card), var(--bg) 35%); }
      .inspection-metric span { display: block; color: var(--muted); font-size: .78rem; font-weight: 700; }
      .inspection-metric strong { display: block; margin-top: 4px; font-size: 1.3rem; }
      .inspection-toolbar { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 13px; }
      .inspection-toolbar .active-view { outline: 3px solid color-mix(in srgb, var(--info), transparent 65%); }
      .inspection-handoff-note { display: grid; gap: 3px; margin: -2px 0 14px; padding: 11px 13px; border-left: 4px solid var(--info); border-radius: 9px; color: var(--muted); background: color-mix(in srgb, var(--info), transparent 94%); }
      .inspection-handoff-note strong { color: var(--text); }
      .inspection-backup-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; padding: 12px; border: 1px solid var(--warning); border-radius: 12px; color: var(--warning); background: color-mix(in srgb, var(--warning), transparent 94%); }
      .inspection-backup-notice.current { color: var(--success); border-color: var(--success); background: color-mix(in srgb, var(--success), transparent 94%); }
      .inspection-template-panel { margin: 12px 0 15px; padding: 13px; border: 1px solid var(--line); border-radius: 13px; background: color-mix(in srgb, var(--card), var(--bg) 28%); }
      .inspection-template-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
      .inspection-template-heading h3 { margin: 1px 0 0; }
      .inspection-form-panel { margin: 13px 0 16px; padding: 14px; border: 2px solid var(--info); border-radius: 14px; background: color-mix(in srgb, var(--info), transparent 96%); }
      .inspection-form-open #inspectionDashboard,
      .inspection-form-open #inspectionBackupNotice,
      .inspection-form-open .inspection-template-panel,
      .inspection-form-open .inspection-toolbar,
      .inspection-form-open .log-toolbar,
      .inspection-form-open #inspectionList { display: none; }
      .inspection-form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
      .inspection-form-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .inspection-form-grid .full { grid-column: 1 / -1; }
      .inspection-list { display: grid; gap: 12px; }
      .inspection-record { padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in srgb, var(--card), var(--bg) 28%); }
      .inspection-record-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .inspection-record-heading h3 { margin: 2px 0 4px; }
      .inspection-record-select { display: flex; align-items: flex-start; gap: 10px; }
      .inspection-record-select input { width: auto; margin-top: 4px; }
      .inspection-record-pills { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
      .inspection-backup-current { color: var(--success); border-color: var(--success); }
      .inspection-backup-pending { color: var(--warning); border-color: var(--warning); }
      .inspection-backup-never { color: var(--muted); }
      .inspection-export-current { color: var(--info); border-color: var(--info); }
      .inspection-export-pending { color: var(--warning); border-color: var(--warning); }
      .inspection-export-never { color: var(--muted); }
      .inspection-batch-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 13px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--card), var(--bg) 28%); }
      .inspection-batch-toolbar label { display: flex; align-items: center; gap: 8px; margin: 0; }
      .inspection-batch-toolbar input { width: auto; }
      .inspection-batch-count { color: var(--muted); font-size: .9rem; }
      .inspection-meta { display: flex; flex-wrap: wrap; gap: 7px 12px; margin: 9px 0; color: var(--muted); font-size: .88rem; }
      .inspection-summary { margin: 10px 0; line-height: 1.45; white-space: pre-wrap; }
      .inspection-record-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px; }
      .inspection-photo-list { display: grid; gap: 11px; margin: 11px 0 16px; }
      .inspection-photo-card { display: grid; grid-template-columns: minmax(110px, 160px) 1fr; gap: 11px; padding: 11px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
      .inspection-photo-preview, .inspection-photo-thumbnails button { padding: 0; overflow: hidden; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--card), var(--bg) 40%); cursor: pointer; }
      .inspection-photo-preview { min-height: 120px; }
      .inspection-photo-preview img, .inspection-photo-thumbnails img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .inspection-photo-loading { display: grid; min-height: 120px; place-items: center; padding: 8px; color: var(--muted); }
      .inspection-photo-details { display: grid; align-content: start; gap: 7px; }
      .inspection-photo-details small { color: var(--muted); }
      .inspection-photo-thumbnails { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
      .inspection-photo-thumbnails button { width: 78px; height: 78px; }
      .inspection-photo-thumbnails button span { display: grid; height: 100%; place-items: center; color: var(--muted); }
      .inspection-photo-more { display: grid; min-width: 78px; min-height: 78px; place-items: center; color: var(--muted); font-weight: 700; }
      .inspection-followups { display: grid; gap: 8px; margin-top: 10px; }
      .inspection-followup { padding: 10px; border-left: 4px solid var(--warning); border-radius: 9px; background: color-mix(in srgb, var(--warning), transparent 95%); }
      .inspection-followup.closed { border-left-color: var(--success); background: color-mix(in srgb, var(--success), transparent 95%); }
      .followup-editor-list { display: grid; gap: 10px; }
      .followup-editor { padding: 11px; border: 1px solid var(--line); border-radius: 11px; background: var(--card); }
      .followup-editor-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; align-items: end; }
      .inspection-linked-trip { padding: 10px; border: 1px dashed var(--line); border-radius: 10px; background: var(--card); }
      .active-jobs-workspace { margin: 16px 0; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in srgb, var(--accent), transparent 97%); }
      .visit-current-context { display: grid; gap: 3px; margin: 10px 0 12px; padding: 13px; border: 3px solid var(--accent); border-radius: 13px; background: var(--card); box-shadow: 0 4px 14px rgba(0,0,0,.09); }
      .visit-current-context strong { font-size: 1.05rem; }
      .visit-current-context small { color: var(--muted); }
      .visit-workspace-selectors { display: grid; grid-template-columns: minmax(190px, .8fr) minmax(260px, 1.2fr); gap: 11px; }
      .visit-summary { margin: 11px 0; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
      .visit-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .visit-summary-grid > div { display: grid; align-content: start; gap: 3px; padding: 9px; border-radius: 9px; background: color-mix(in srgb, var(--card), var(--bg) 38%); }
      .visit-summary-grid span, .visit-summary-grid small { color: var(--muted); font-size: .78rem; }
      .visit-linked-inspections, .visit-notes-photos { margin: 11px 0; }
      .visit-panel-heading, .visit-workspace-job-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 7px 0; }
      .visit-panel-heading span, .visit-workspace-job-heading span { color: var(--muted); font-size: .82rem; }
      .visit-inspection-switcher { display: flex; gap: 8px; overflow-x: auto; padding: 2px 1px 8px; scroll-snap-type: x proximity; }
      .visit-inspection-chip { display: grid; flex: 0 0 min(250px, 78vw); gap: 3px; min-height: 88px; padding: 10px; color: var(--text); text-align: left; border: 1px solid var(--line); border-radius: 11px; background: var(--card); scroll-snap-align: start; }
      .visit-inspection-chip.current { border: 3px solid var(--accent); }
      .visit-inspection-chip span, .visit-inspection-chip small { color: var(--muted); }
      .visit-notes-photos { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 12px; }
      .visit-notes-photos > section { min-width: 0; padding: 11px; border: 1px solid var(--line); border-radius: 11px; background: var(--card); }
      .visit-quick-notes { display: grid; gap: 7px; }
      .visit-quick-notes article { padding: 8px; border-left: 3px solid var(--info); border-radius: 8px; background: color-mix(in srgb, var(--info), transparent 95%); }
      .visit-quick-notes small { color: var(--muted); font-weight: 700; }
      .visit-quick-notes p { margin: 3px 0 0; white-space: pre-wrap; }
      .visit-workspace-photos { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
      .visit-photo-card { display: grid; flex: 0 0 130px; gap: 4px; min-width: 0; }
      .visit-photo-card button { width: 130px; height: 92px; padding: 0; overflow: hidden; border: 0; border-radius: 9px; background: color-mix(in srgb, var(--card), var(--bg) 42%); }
      .visit-photo-card img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .visit-photo-card small { color: var(--muted); }
      .visit-photo-card strong { overflow-wrap: anywhere; font-size: .83rem; }
      .active-job-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .active-job-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
      .active-job-card.current { border: 3px solid var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent), transparent 80%); }
      .active-job-card h4 { margin: 3px 0 6px; }
      .active-job-card p { margin: 3px 0; }
      .active-job-current-banner { position: sticky; top: 8px; z-index: 4; margin-bottom: 12px; padding: 13px; border: 3px solid var(--accent); border-radius: 13px; background: var(--card); box-shadow: 0 5px 18px rgba(0,0,0,.12); }
      .active-job-current-banner strong { display: block; font-size: 1.05rem; }
      .active-job-current-banner.no-job { border-color: var(--warning); }
      .active-job-conflict { margin: 10px 0; padding: 11px; border: 1px solid var(--warning); border-radius: 10px; background: color-mix(in srgb, var(--warning), transparent 90%); }
      .active-job-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
      .active-job-fact { padding: 8px; border-radius: 9px; background: color-mix(in srgb, var(--accent), transparent 94%); }
      .active-job-fact small { display: block; color: var(--muted); font-weight: 700; text-transform: uppercase; }
      .inspection-workflow-panel { margin: 14px 0; padding: 13px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--accent), transparent 97%); }
      .inspection-check-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
      .inspection-activity-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 9px; }
      .inspection-activity-option { display: flex; align-items: center; gap: 8px; min-height: 44px; margin: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--card); }
      .inspection-activity-option input { flex: 0 0 auto; width: auto; margin: 0; }
      .inspection-form-section { margin: 14px 0; padding: 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
      .inspection-form-section > h3 { margin: 0 0 4px; }
      .inspection-form-section > p { margin: 0 0 11px; }
      .visit-hierarchy { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: stretch; gap: 8px; margin: 10px 0; }
      .visit-hierarchy-step { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
      .visit-hierarchy-step span { color: var(--muted); font-size: .75rem; font-weight: 800; }
      .visit-hierarchy-arrow { display: grid; place-items: center; color: var(--muted); font-weight: 800; }
      .inspection-report-preview { margin: 12px 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
      .inspection-preview-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; align-items: start; justify-items: center; overflow-y: auto; padding: 24px; background: rgba(5, 12, 24, .72); }
      .inspection-preview-overlay.hidden { display: none; }
      .inspection-preview-dialog { width: min(980px, 100%); margin: 0 auto; border: 1px solid var(--line); border-radius: 16px; background: var(--card); box-shadow: 0 24px 70px rgba(0,0,0,.3); }
      .inspection-preview-header, .inspection-preview-actions { position: sticky; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; background: var(--card); }
      .inspection-preview-header { top: 0; border-bottom: 1px solid var(--line); border-radius: 16px 16px 0 0; }
      .inspection-preview-header h2 { margin: 2px 0 4px; }
      .inspection-preview-body { display: grid; gap: 16px; padding: 18px; }
      .inspection-preview-section { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--card), var(--bg) 25%); }
      .inspection-preview-section h3 { margin: 0 0 10px; }
      .inspection-preview-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .inspection-preview-fact { min-width: 0; }
      .inspection-preview-fact small { display: block; color: var(--muted); font-weight: 700; }
      .inspection-preview-fact span, .inspection-preview-text { display: block; margin-top: 3px; overflow-wrap: anywhere; white-space: pre-wrap; }
      .inspection-preview-list { display: grid; gap: 9px; }
      .inspection-preview-item { padding: 10px; border-left: 4px solid var(--info); border-radius: 8px; background: var(--card); }
      .inspection-preview-item p { margin: 5px 0 0; white-space: pre-wrap; }
      .inspection-preview-photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .inspection-preview-photo { margin: 0; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
      .inspection-preview-photo img { display: block; width: 100%; max-height: 460px; object-fit: contain; border-radius: 8px; background: color-mix(in srgb, var(--card), var(--bg) 35%); }
      .inspection-preview-photo figcaption { margin-top: 8px; overflow-wrap: anywhere; }
      .inspection-preview-photo small { display: block; margin-top: 3px; color: var(--muted); }
      .inspection-preview-actions { bottom: 0; flex-wrap: wrap; justify-content: flex-end; border-top: 1px solid var(--line); border-radius: 0 0 16px 16px; }
      .inspection-autosave-status { color: var(--muted); font-size: .86rem; }
      .inspection-empty { padding: 18px; color: var(--muted); text-align: center; border: 1px dashed var(--line); border-radius: 12px; }
      .inspection-pill-open { color: var(--warning); background: color-mix(in srgb, var(--warning), transparent 88%); }
      .inspection-pill-complete { color: var(--success); background: color-mix(in srgb, var(--success), transparent 88%); }
      .bottom-nav.inspection-nav-enabled { grid-template-columns: repeat(6, 1fr); }
      .bottom-nav.inspection-nav-enabled button { font-size: .76rem; }
      @media (max-width: 760px) {
        .inspection-dashboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .visit-workspace-selectors, .visit-summary-grid, .visit-notes-photos, .active-job-card-grid, .active-job-facts, .inspection-check-grid, .inspection-activity-grid { grid-template-columns: 1fr; }
        .visit-hierarchy { grid-template-columns: 1fr; }
        .visit-hierarchy-arrow { transform: rotate(90deg); min-height: 20px; }
        .visit-panel-heading, .visit-workspace-job-heading { align-items: flex-start; flex-direction: column; }
        .inspection-form-grid, .inspection-form-grid.two { grid-template-columns: 1fr; }
        .followup-editor-grid { grid-template-columns: 1fr; }
        .inspection-photo-card { grid-template-columns: 1fr; }
        .inspection-photo-preview { min-height: 180px; }
        .inspection-record-heading, .inspection-backup-notice, .inspection-template-heading { flex-direction: column; }
        .inspection-preview-overlay { padding: 0; }
        .inspection-preview-dialog { min-height: 100%; border: 0; border-radius: 0; }
        .inspection-preview-header { border-radius: 0; }
        .inspection-preview-facts, .inspection-preview-photos { grid-template-columns: 1fr; }
        .inspection-preview-actions { border-radius: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectInterface() {
    injectStyles();

    const quickActions = document.querySelector(".quick-actions");
    if (quickActions && !$('inspectionBtn')) {
      const button = document.createElement("button");
      button.id = "inspectionBtn";
      button.className = "button inspection-button button-large";
      button.type = "button";
      button.textContent = "Visits & Inspections";
      quickActions.appendChild(button);
    }

    const bottomNav = document.querySelector(".bottom-nav");
    if (bottomNav && !$('inspectionNavBtn')) {
      const button = document.createElement("button");
      button.id = "inspectionNavBtn";
      button.type = "button";
      button.textContent = "Visits";
      bottomNav.appendChild(button);
      bottomNav.classList.add("inspection-nav-enabled");
    }

    const backupCard = $("backupCard");
    if (backupCard && !$('inspectionPromptCard')) {
      const prompt = document.createElement("section");
      prompt.id = "inspectionPromptCard";
      prompt.className = "card inspection-prompt-card hidden";
      prompt.setAttribute("aria-live", "polite");
      backupCard.insertAdjacentElement("afterend", prompt);
    }

    if (!$('inspectionSection')) {
      const section = document.createElement("section");
      section.id = "inspectionSection";
      section.className = "card collapsible hidden";
      section.setAttribute("aria-labelledby", "inspectionTitle");
      section.innerHTML = `
        <div class="section-heading">
          <div>
            <p class="eyebrow">Visit-centered work</p>
            <h2 id="inspectionTitle">Visits &amp; Inspections</h2>
            <p class="muted">Mileage stays on one trip while every linked Active Job keeps its own inspection record.</p>
          </div>
          <button id="closeInspectionSection" class="button button-quiet button-small" type="button">Close</button>
        </div>

        <div id="inspectionDashboard" class="inspection-dashboard"></div>
        <div id="inspectionBackupNotice" class="inspection-backup-notice"></div>

        <section class="active-jobs-workspace visit-workspace" aria-labelledby="activeJobsWorkspaceTitle">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">Vendor visit workspace</p>
              <h3 id="activeJobsWorkspaceTitle">One Visit, All Linked Work</h3>
              <p class="muted">Choose a vendor and visit once, then switch between its linked jobs and inspections without leaving this workspace.</p>
            </div>
          </div>
          <div id="activeJobsConflict" class="active-job-conflict hidden"></div>
          <details class="inspection-form-section">
            <summary><strong>How this works</strong></summary>
            <p><strong>Start / End</strong> records mileage. A <strong>Visit</strong> is the vendor trip. An <strong>Active Job</strong> is the reporting identity. An <strong>Inspection</strong> is the work performed. One visit can contain multiple inspections; mileage is counted once. Administrative queues do not affect inspection completion or synchronization.</p>
          </details>
          <div id="visitCurrentContext" class="visit-current-context"></div>
          <div id="visitHierarchy" class="visit-hierarchy"></div>
          <div class="visit-workspace-selectors">
            <label>
              Vendor / known inspection location
              <select id="activeJobsVendor"></select>
            </label>
            <label>
              Visit / mileage trip
              <select id="activeJobsVisit"></select>
            </label>
          </div>
          <div id="visitSummary" class="visit-summary"></div>
          <div id="visitLinkedInspections" class="visit-linked-inspections"></div>
          <div id="visitNotesPhotos" class="visit-notes-photos"></div>
          <div class="visit-workspace-job-heading"><strong>Active Jobs at this vendor</strong><span>Open a specific inspection or create another inspection for the same AJ and visit.</span></div>
          <div id="activeJobsCards" class="active-job-card-grid"></div>
        </section>

        <section class="inspection-template-panel" aria-labelledby="inspectionTemplateTitle">
          <div class="inspection-template-heading">
            <div>
              <p class="eyebrow">Stored only on this device</p>
              <h3 id="inspectionTemplateTitle">Private S&B Word Report Template</h3>
            </div>
            <span id="inspectionTemplatePill" class="pill">CHECKING</span>
          </div>
          <div id="inspectionTemplateStatus" class="private-master-status">
            Checking this device for an imported S&B Word template…
          </div>
          <div class="form-actions wrap">
            <button id="importInspectionTemplateBtn" class="button inspection-button button-small" type="button">Import S&B Word Template</button>
            <button id="removeInspectionTemplateBtn" class="button button-danger-outline button-small" type="button" disabled>Remove Private Template</button>
            <input id="inspectionTemplateFileInput" class="hidden" type="file" accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx">
          </div>
          <p class="privacy-note compact-note">
            The S&B template is not uploaded to GitHub or included in backups. When installed, Send to Inspection Notes uses it for the editable Word report.
          </p>
        </section>

        <div class="inspection-toolbar">
          <button id="newInspectionBtn" class="button inspection-button" type="button">Add Inspection to Visit</button>
          <button id="standaloneInspectionBtn" class="button button-secondary" type="button">Standalone Inspection</button>
          <button id="inspectionListViewBtn" class="button button-secondary active-view" type="button">Inspection History</button>
          <button id="followUpViewBtn" class="button button-secondary" type="button">Open Follow-ups</button>
          <button id="exportInspectionsBtn" class="button button-secondary" type="button">Export Inspection CSV</button>
        </div>
        <div class="inspection-handoff-note">
          <strong>Word-first inspection reports</strong>
          <span>The default export is one editable Word document with every inspection photo embedded once. PDF is not generated. Use Word + Photos ZIP only when separate image files are specifically needed.</span>
        </div>
        <div id="inspectionBatchToolbar" class="inspection-batch-toolbar">
          <label><input id="selectAllVisibleInspections" type="checkbox"> Select all shown</label>
          <span id="inspectionBatchCount" class="inspection-batch-count">0 selected</span>
          <button id="exportSelectedInspectionsBtn" class="button inspection-button button-small" type="button" disabled>Export Selected (ZIP)</button>
          <button id="clearSelectedInspectionsBtn" class="button button-secondary button-small" type="button" disabled>Clear</button>
        </div>

        <div id="inspectionFormPanel" class="inspection-form-panel hidden"></div>

        <div class="log-toolbar">
          <input id="inspectionSearch" class="search-input" placeholder="Search project, vendor, type, summary, or follow-up">
          <select id="inspectionFilter" aria-label="Filter inspections">
            <option value="all">All inspections</option>
              <option value="needs-backup">Needs data backup</option>
            <option value="not-exported">Not exported</option>
            <option value="export-outdated">Changed since export</option>
            <option value="incomplete">Incomplete or on hold</option>
            <option value="open-followups">Has open follow-ups</option>
          </select>
          <button id="clearInspectionSearch" class="button button-secondary button-small" type="button">Clear Search</button>
          <span id="inspectionResultCount" class="inspection-batch-count"></span>
        </div>

        <div id="inspectionList" class="inspection-list"></div>
      `;

      const settingsSection = $("settingsSection");
      const main = document.querySelector("main");
      if (settingsSection) settingsSection.insertAdjacentElement("beforebegin", section);
      else if (main) main.appendChild(section);
      else document.body.appendChild(section);
    }

    if (!$("inspectionPreviewOverlay")) {
      const preview = document.createElement("div");
      preview.id = "inspectionPreviewOverlay";
      preview.className = "inspection-preview-overlay hidden";
      preview.setAttribute("role", "dialog");
      preview.setAttribute("aria-modal", "true");
      preview.setAttribute("aria-labelledby", "inspectionPreviewTitle");
      preview.innerHTML = `<article class="inspection-preview-dialog"><div id="inspectionPreviewContent"></div></article>`;
      document.body.appendChild(preview);
    }

    const helpCard = document.querySelector(".help-card");
    if (helpCard && !$('inspectionLinkExample')) {
      const code = document.createElement("code");
      code.id = "inspectionLinkExample";
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      code.textContent = `${url.toString()}?action=inspection`;
      helpCard.appendChild(code);
    }
  }

  function activeJobsForState(state = readState()) {
    const jobs = window.MileageActiveJobsManagement?.getActiveJobs(state) || SEED_ACTIVE_JOBS;
    return jobs.map((job) => ACTIVE_JOB_DATA.normalizedJob ? ACTIVE_JOB_DATA.normalizedJob(job) : { ...job });
  }

  function activeJobById(activeJobId, state = readState()) {
    return activeJobsForState(state).find((job) => job.aj === activeJobId) || null;
  }

  function facilityProfilesForState(state = readState()) {
    return window.MileageActiveJobsManagement?.getFacilityProfiles(state) || [];
  }

  function facilityProfileById(state, id) {
    return facilityProfilesForState(state).find((profile) => profile.id === id) || null;
  }

  function facilityProfileOptions(state, selectedId = "", job = null) {
    const profiles = job && window.MileageActiveJobsManagement?.facilityProfilesForJob
      ? window.MileageActiveJobsManagement.facilityProfilesForJob(state, job)
      : facilityProfilesForState(state).filter((profile) => (
        !job || !profile.reportingVendor || sameLocation(profile.reportingVendor, job.reportingVendor) || profile.id === job.defaultFacilityProfileId
      ));
    return `<option value="">Temporary visit values only</option>${profiles.map((profile) => {
      const preferred = Boolean(job?.defaultFacilityProfileId && profile.id === job.defaultFacilityProfileId);
      const label = profile.name || profile.shopFacilityName || profile.reportingVendor || profile.id;
      return `<option value="${escapeHTML(profile.id)}"${profile.id === selectedId ? " selected" : ""}>${escapeHTML(label)}${preferred ? " — Preferred" : ""}</option>`;
    }).join("")}`;
  }

  function activeJobLocations(state, job) {
    const locations = new Set([job.reportingVendor].filter(Boolean));
    const profile = window.MileageActiveJobsManagement?.facilityProfileForJob(state, job);
    [profile?.name, profile?.shopFacilityName, profile?.normalInspectionLocation, ...(profile?.aliases || [])]
      .filter(Boolean)
      .forEach((location) => locations.add(location));
    state.settings.inspections.forEach((inspection) => {
      if (inspection.activeJobId !== job.aj) return;
      if (inspection.inspectionLocation || inspection.vendor) {
        locations.add(inspection.inspectionLocation || inspection.vendor);
      }
    });
    return locations;
  }

  function sameLocation(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function workspaceTripsForVendor(state, vendor) {
    if (!vendor) return [];
    return inspectionTrips(state)
      .filter((trip) => {
        if (sameLocation(trip.vendor, vendor)) return true;
        return state.settings.inspections.some((inspection) => (
          inspection.tripId === trip.id
          && (sameLocation(inspection.inspectionLocation || inspection.vendor, vendor)
            || sameLocation(inspection.reportingVendor, vendor))
        ));
      })
      .sort((a, b) => String(b.endISO || b.startISO || b.date || "").localeCompare(String(a.endISO || a.startISO || a.date || "")));
  }

  async function renderWorkspacePhotos(trip, inspections) {
    const container = $("visitWorkspacePhotos");
    workspacePhotoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    workspacePhotoObjectUrls = [];
    if (!container) return;
    const entries = [
      ...(trip?.photos || []).map((photo) => ({ photo, label: "Trip / visit" })),
      ...inspections.flatMap((inspection) => (inspection.photos || [])
        .filter((photo) => !photo.sourceTripId)
        .map((photo) => ({ photo, label: inspection.activeJobId || "Standalone inspection" })))
    ];
    if (!entries.length) {
      container.innerHTML = `<div class="inspection-empty compact">No visit or inspection photos attached.</div>`;
      return;
    }
    container.innerHTML = entries.map(({ photo, label }) => `
      <article class="visit-photo-card">
        <button type="button" data-view-photo="${escapeHTML(photo.id)}" aria-label="Open ${escapeHTML(photo.caption || photo.name || "photo")}"><span>Loading…</span></button>
        <small>${escapeHTML(label)}</small>
        <strong>${escapeHTML(photo.caption || photo.name || "Photo")}</strong>
      </article>
    `).join("");
    await Promise.all(entries.map(async ({ photo }) => {
      try {
        const stored = await window.MileageMediaStore?.getPhoto(photo.id);
        if (!stored?.blob || !$("visitWorkspacePhotos")) return;
        const button = container.querySelector(`[data-view-photo="${CSS.escape(photo.id)}"]`);
        if (!button) return;
        const url = URL.createObjectURL(stored.blob);
        workspacePhotoObjectUrls.push(url);
        button.dataset.photoUrl = url;
        button.innerHTML = `<img src="${url}" alt="${escapeHTML(photo.caption || photo.name || "Visit photo")}">`;
      } catch (error) {
        console.warn("Could not load a Visit Workspace photo:", error);
      }
    }));
  }

  function renderActiveJobsWorkspace(state = readState()) {
    const vendorSelect = $("activeJobsVendor");
    const visitSelect = $("activeJobsVisit");
    const cards = $("activeJobsCards");
    const conflict = $("activeJobsConflict");
    const context = $("visitCurrentContext");
    const hierarchy = $("visitHierarchy");
    const summary = $("visitSummary");
    const linkedPanel = $("visitLinkedInspections");
    const notesPhotos = $("visitNotesPhotos");
    if (!vendorSelect || !visitSelect || !cards || !conflict || !context || !hierarchy || !summary || !linkedPanel || !notesPhotos) return;

    const catalog = activeJobsForState(state);
    const currentJob = activeJobById(state.settings.currentActiveJobId, state);
    const vendors = new Set();
    catalog.filter((job) => String(job.openClosed || "").toLowerCase() === "open").forEach((job) => {
      activeJobLocations(state, job).forEach((location) => vendors.add(location));
    });
    inspectionTrips(state).forEach((trip) => {
      if (trip.vendor) vendors.add(trip.vendor);
    });
    const savedTrip = getTripById(state, state.settings.activeJobsWorkspaceTripId);
    const selectedVendor = savedTrip?.vendor || state.settings.activeJobsWorkspaceVendor || currentJob?.reportingVendor || "";
    vendorSelect.innerHTML = `<option value="">Choose vendor/location…</option>${[...vendors].sort().map((vendor) => `<option value="${escapeHTML(vendor)}"${vendor === selectedVendor ? " selected" : ""}>${escapeHTML(vendor)}</option>`).join("")}`;

    const visits = workspaceTripsForVendor(state, selectedVendor);
    const standaloneSelected = state.settings.activeJobsWorkspaceTripId === "__standalone__";
    const selectedTripId = standaloneSelected
      ? ""
      : (visits.some((trip) => trip.id === state.settings.activeJobsWorkspaceTripId)
        ? state.settings.activeJobsWorkspaceTripId
        : (visits[0]?.id || ""));
    const selectedTrip = getTripById(state, selectedTripId);
    const selectedTripIsActive = isActiveTrip(state, selectedTrip);
    visitSelect.innerHTML = `<option value=""${standaloneSelected ? " selected" : ""}>Standalone / no mileage trip</option>${visits.map((trip) => {
      const active = isActiveTrip(state, trip);
      const label = active
        ? `ACTIVE TRIP — ${trip.date || "Today"} — ${trip.purpose || "Visit"} — in progress`
        : `${trip.date || "Saved visit"} — ${trip.purpose || "Visit"} — ${formatMiles(trip.miles)}`;
      return `<option value="${escapeHTML(trip.id)}"${trip.id === selectedTripId ? " selected" : ""}>${escapeHTML(label)}</option>`;
    }).join("")}`;

    const linkedInspections = state.settings.inspections
      .filter((inspection) => selectedTrip
        ? inspection.tripId === selectedTrip.id
        : (!inspection.tripId && selectedVendor && (
          sameLocation(inspection.inspectionLocation || inspection.vendor, selectedVendor)
          || sameLocation(inspection.reportingVendor, selectedVendor)
        )))
      .sort((a, b) => String(b.modifiedISO || b.createdISO || "").localeCompare(String(a.modifiedISO || a.createdISO || "")));
    const editingInspection = state.settings.inspections.find((inspection) => inspection.id === editingInspectionId) || null;
    const contextJob = activeJobById(editingInspection?.activeJobId || currentJob?.aj, state);
    context.innerHTML = `
      <span class="eyebrow">CURRENT VISIT</span>
      <strong>${selectedTrip ? `${escapeHTML(selectedTrip.vendor || "Vendor visit")} — ${escapeHTML(selectedTrip.date || "Saved visit")}` : (selectedVendor ? `${escapeHTML(selectedVendor)} — standalone work` : "Choose a vendor and visit")}</strong>
      <small>${contextJob ? `${escapeHTML(contextJob.aj)} — ${escapeHTML(contextJob.projectName)}` : "No Active Job selected"}${selectedTrip ? (selectedTripIsActive ? " • Active trip in progress — mileage finalizes at End Trip" : ` • Mileage counted once: ${escapeHTML(formatMiles(selectedTrip.miles))}`) : " • No trip mileage attached"}</small>`;
    hierarchy.innerHTML = `
      <div class="visit-hierarchy-step"><span>VISIT</span><strong>${selectedTrip ? `${escapeHTML(selectedTrip.vendor || "Vendor")} — ${escapeHTML(selectedTrip.date || "Date")}` : (selectedVendor ? `${escapeHTML(selectedVendor)} — standalone` : "Choose a visit")}</strong></div>
      <div class="visit-hierarchy-arrow" aria-hidden="true">→</div>
      <div class="visit-hierarchy-step"><span>ACTIVE JOB</span><strong>${contextJob ? `${escapeHTML(contextJob.aj)} — ${escapeHTML(contextJob.inspectionNo)}` : "Choose a job"}</strong></div>
      <div class="visit-hierarchy-arrow" aria-hidden="true">→</div>
      <div class="visit-hierarchy-step"><span>INSPECTIONS</span><strong>${linkedInspections.length} linked record${linkedInspections.length === 1 ? "" : "s"}</strong></div>`;

    if (selectedTrip) {
      const startMap = mapLink(selectedTrip.startLocation, "Trip Start");
      const endMap = mapLink(selectedTrip.endLocation, "Trip End");
      summary.innerHTML = `
        <div class="visit-summary-grid">
          <div><span>Date / time</span><strong>${escapeHTML(selectedTrip.date || "—")}<br>${escapeHTML(selectedTrip.startTime || "—")}–${selectedTripIsActive ? "In progress" : escapeHTML(selectedTrip.endTime || "—")}</strong></div>
          <div><span>Mileage</span><strong>${selectedTripIsActive ? "In progress" : escapeHTML(formatMiles(selectedTrip.miles))}</strong><small>${selectedTripIsActive ? "Finalizes when End Trip is saved" : "Counted once for this visit"}</small></div>
          <div><span>Client / project</span><strong>${escapeHTML(selectedTrip.customer || "—")}<br>${escapeHTML(selectedTrip.projectNumber || "—")}</strong></div>
          <div><span>Purpose</span><strong>${escapeHTML(selectedTrip.purpose || "—")}</strong></div>
        </div>
        <div class="form-actions wrap">
          ${selectedTripIsActive ? `<span class="pill active">ACTIVE TRIP — INSPECTION WORK AVAILABLE</span>` : `<button class="button button-secondary button-small" type="button" data-edit-workspace-trip="${escapeHTML(selectedTrip.id)}">Edit Trip &amp; Photos</button>`}
          ${startMap ? `<a class="button button-secondary button-small" href="${startMap}" target="_blank" rel="noopener">Start Map</a>` : ""}
          ${endMap ? `<a class="button button-secondary button-small" href="${endMap}" target="_blank" rel="noopener">End Map</a>` : ""}
        </div>`;
    } else {
      summary.innerHTML = `<div class="inspection-empty compact">Standalone mode keeps an inspection available when no mileage trip exists. Choose a saved visit above to link mileage and GPS.</div>`;
    }

    linkedPanel.innerHTML = `
      <div class="visit-panel-heading"><strong>Linked inspections</strong><span>${linkedInspections.length} record${linkedInspections.length === 1 ? "" : "s"}</span></div>
      <div class="visit-inspection-switcher">${linkedInspections.length ? linkedInspections.map((inspection) => `
        <button class="visit-inspection-chip${inspection.id === editingInspectionId ? " current" : ""}" type="button" data-open-workspace-inspection="${escapeHTML(inspection.id)}">
          <span>${escapeHTML(inspection.activeJobId || "Standalone")}</span>
          <strong>${escapeHTML(inspection.activity || inspection.inspectionType || "Inspection")}</strong>
          <small>${escapeHTML(inspection.status || "Draft")} • ${escapeHTML(inspection.quickNote || "No quick note")}</small>
        </button>`).join("") : `<div class="inspection-empty compact">No inspections are linked to this ${selectedTrip ? "visit" : "vendor context"} yet.</div>`}</div>`;

    const quickNotes = [
      selectedTrip?.notes ? { label: "Trip / visit note", text: selectedTrip.notes } : null,
      ...linkedInspections.filter((inspection) => inspection.quickNote).map((inspection) => ({ label: inspection.activeJobId || "Standalone inspection", text: inspection.quickNote }))
    ].filter(Boolean);
    notesPhotos.innerHTML = `
      <section><div class="visit-panel-heading"><strong>Quick notes</strong><span>${quickNotes.length}</span></div><div class="visit-quick-notes">${quickNotes.length ? quickNotes.map((note) => `<article><small>${escapeHTML(note.label)}</small><p>${escapeHTML(note.text)}</p></article>`).join("") : `<div class="inspection-empty compact">No quick notes entered.</div>`}</div></section>
      <section><div class="visit-panel-heading"><strong>Photos</strong><span>Trip and inspection ownership shown separately</span></div><div id="visitWorkspacePhotos" class="visit-workspace-photos"></div></section>`;
    renderWorkspacePhotos(selectedTrip, linkedInspections);

    const conflicts = typeof ACTIVE_JOB_DATA.reportingUnitConflicts === "function"
      ? ACTIVE_JOB_DATA.reportingUnitConflicts(catalog)
      : [];
    if (conflicts.length) {
      conflict.classList.remove("hidden");
      conflict.innerHTML = `<strong>Active Jobs Master review flag — no data was changed:</strong> ${conflicts.map((group) => `${escapeHTML(group.map((job) => job.aj).join(" / "))} share ${escapeHTML(group[0].inspectionNo)} + ${escapeHTML(group[0].reportingVendor)}`).join("; ")}. Keep these authoritative rows separate until the master is deliberately reviewed.`;
    } else {
      conflict.classList.add("hidden");
      conflict.textContent = "";
    }

    const openJobs = catalog.filter((job) => String(job.openClosed || "").toLowerCase() === "open");
    const matchedJobs = window.MileageActiveJobsManagement?.matchingJobsForVisit
      ? window.MileageActiveJobsManagement.matchingJobsForVisit(state, selectedTrip, selectedVendor)
      : openJobs.filter((job) => selectedVendor && (
        activeJobLocations(state, job).has(selectedVendor)
        || (selectedTrip?.projectNumber && sameLocation(job.inspectionNo, selectedTrip.projectNumber))
      ));
    const jobs = matchedJobs;
    cards.innerHTML = jobs.length ? jobs.map((job) => {
      const current = job.aj === contextJob?.aj;
      const visitRecords = linkedInspections.filter((inspection) => inspection.activeJobId === job.aj);
      const draftCount = visitRecords.filter((inspection) => inspection.status === "Draft").length;
      const inspectionActions = visitRecords.map((inspection) => `<button class="button button-secondary button-small" type="button" data-open-workspace-inspection="${escapeHTML(inspection.id)}">Open ${escapeHTML(inspection.activity || inspection.inspectionType || "Inspection")}</button>`).join("");
      return `<article class="active-job-card${current ? " current" : ""}">
        <p class="eyebrow">${escapeHTML(job.aj)}${current ? " • CURRENT JOB" : ""}</p>
        <h4>${escapeHTML(job.inspectionNo)} — ${escapeHTML(job.projectName)}</h4>
        <p><strong>Reporting vendor:</strong> ${escapeHTML(job.reportingVendor)}</p>
        <p><strong>Vendor job:</strong> ${escapeHTML(job.vendorJobs || "—")}</p>
        <p><strong>Status:</strong> ${escapeHTML(job.status || "Not entered")}</p>
        <p><strong>Next action:</strong> ${escapeHTML(job.nextAction || "Not entered")}</p>
        <p class="inspection-autosave-status">${visitRecords.length ? `${visitRecords.length} linked inspection${visitRecords.length === 1 ? "" : "s"}${draftCount ? ` • ${draftCount} draft` : ""}` : (selectedTrip ? "Not yet linked to this visit" : "Standalone available")}</p>
        <div class="inspection-record-actions">${inspectionActions}<button class="button inspection-button button-small" type="button" data-new-workspace-inspection="${escapeHTML(job.aj)}">${visitRecords.length ? `+ New Inspection for ${escapeHTML(job.aj)}` : (selectedTrip ? `Create Inspection for ${escapeHTML(job.aj)}` : `Start Standalone Inspection for ${escapeHTML(job.aj)}`)}</button></div>
      </article>`;
    }).join("") : `<div class="active-job-no-match">
      <p class="eyebrow">NO ACTIVE JOB FOUND</p>
      <strong>No reasonable Active Job match was found for ${escapeHTML(selectedVendor || selectedTrip?.vendor || "this visit")}.</strong>
      <p>Unrelated open jobs are intentionally not suggested. You can continue without an AJ and assign the saved inspection later.</p>
      <button id="workPendingJobBtn" class="button inspection-button" type="button">Work as Pending / Unassigned Job</button>
    </div>`;
    if ($("newInspectionBtn")) $("newInspectionBtn").textContent = selectedTrip ? "Add Inspection to Visit" : "New Inspection in This Context";
  }

  function switchActiveJob(activeJobId) {
    const job = activeJobById(activeJobId);
    if (!job) return;
    if ($("inspectionForm") && editingInspectionId) saveInspectionDraft({ silent: true });
    const state = readState();
    state.settings.currentActiveJobId = job.aj;
    state.settings.activeJobsWorkspaceVendor = $("activeJobsVendor")?.value || job.reportingVendor;
    state.settings.activeJobsWorkspaceTripId = $("activeJobsVisit")?.value || "__standalone__";
    writeState(state);
    const tripId = state.settings.activeJobsWorkspaceTripId === "__standalone__" ? "" : (state.settings.activeJobsWorkspaceTripId || "");
    const linked = state.settings.inspections
      .filter((inspection) => inspection.activeJobId === job.aj && (inspection.tripId || "") === tripId)
      .sort((a, b) => String(b.modifiedISO || "").localeCompare(String(a.modifiedISO || "")))[0] || null;
    openInspectionForm(linked, linked ? "" : tripId, { activeJobId: job.aj, fastSwitch: true });
  }

  function showInspectionSection(openNew = false, tripId = "") {
    ["startSection", "endSection", "staSection", "logSection", "workflowQueuesSection"].forEach((id) => {
      $(id)?.classList.add("hidden");
    });
    $("inspectionSection")?.classList.remove("hidden");
    if (tripId) {
      const state = readState();
      const trip = getTripById(state, tripId);
      state.settings.activeJobsWorkspaceTripId = tripId;
      if (trip?.vendor) state.settings.activeJobsWorkspaceVendor = trip.vendor;
      writeState(state);
    }
    renderActiveJobsWorkspace();
    refreshInspectionReportTemplateStatus();
    if (openNew) openInspectionForm(null, tripId);
    setTimeout(() => $("inspectionSection")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function hideInspectionSection() {
    $("inspectionSection")?.classList.add("hidden");
    closeInspectionForm();
  }

  function renderActiveTripInspectionAction(state) {
    const details = $("activeDetails");
    if (!details) return;
    const existing = $("workCurrentInspectionBtn");
    if (!state.activeTrip) {
      existing?.remove();
      return;
    }
    const controls = details.querySelector(".active-controls");
    if (!controls || existing) return;
    const button = document.createElement("button");
    button.id = "workCurrentInspectionBtn";
    button.className = "button inspection-button button-small";
    button.type = "button";
    button.textContent = "Work Current Inspection";
    button.title = "Open this active mileage trip as the current inspection visit without ending the trip.";
    controls.insertAdjacentElement("afterbegin", button);
  }

  function renderPrompt(state) {
    const card = $("inspectionPromptCard");
    if (!card) return;

    const inspectionTripIds = new Set(
      state.settings.inspections.map((inspection) => inspection.tripId).filter(Boolean)
    );
    const ignored = new Set(state.settings.inspectionIgnoredTripIds);
    const candidate = [...state.trips]
      .sort((a, b) => String(b.endISO || "").localeCompare(String(a.endISO || "")))
      .find((trip) => trip.id && !inspectionTripIds.has(trip.id) && !ignored.has(trip.id));

    const backupPending = Number(state.backup?.pendingTripCount || 0) > 0;
    if (!candidate || backupPending) {
      card.classList.add("hidden");
      card.innerHTML = "";
      return;
    }

    const currentTripActive = Boolean(state.activeTrip);
    card.classList.toggle("current-trip-secondary", currentTripActive);
    card.innerHTML = `
      <p class="eyebrow">${currentTripActive ? "Past trip needs review" : "Completed trip ready"}</p>
      <h2>${currentTripActive ? "Review the earlier trip when ready" : "Create an inspection record?"}</h2>
      <p>
        <strong>${escapeHTML(candidate.vendor || "Destination")}</strong>
        ${candidate.projectNumber ? `• ${escapeHTML(candidate.projectNumber)}` : ""}<br>
        ${escapeHTML(candidate.date || "")}${candidate.miles !== undefined ? ` • ${formatMiles(candidate.miles)}` : ""}
      </p>
      <div class="inspection-prompt-actions">
        <button class="button ${currentTripActive ? "button-secondary" : "inspection-button"}" type="button" data-create-inspection-trip="${escapeHTML(candidate.id)}">${currentTripActive ? "Review Past Trip" : "Create Inspection Record"}</button>
        <button class="button button-secondary" type="button" data-ignore-inspection-trip="${escapeHTML(candidate.id)}">Not an Inspection</button>
      </div>
    `;
    card.classList.remove("hidden");
  }

  function renderDashboard(state) {
    const inspections = state.settings.inspections;
    const openFollowUps = inspections.reduce((count, inspection) => (
      count + (inspection.followUps || []).filter((item) => item.status !== "Closed").length
    ), 0);
    const linked = inspections.filter((inspection) => inspection.tripId).length;
    const standalone = inspections.length - linked;

    $("inspectionDashboard").innerHTML = `
      <div class="inspection-metric"><span>Total inspections</span><strong>${inspections.length}</strong></div>
      <div class="inspection-metric"><span>Open follow-ups</span><strong>${openFollowUps}</strong></div>
      <div class="inspection-metric"><span>Trip-linked</span><strong>${linked}</strong></div>
      <div class="inspection-metric"><span>Standalone</span><strong>${standalone}</strong></div>
    `;

    const notice = $("inspectionBackupNotice");
    const current = inspectionBackupIsCurrent(state);
    notice.classList.toggle("current", current);
    notice.innerHTML = current
      ? `<div><strong>Inspection data backup is current.</strong><br><small>Record details, photo filenames, and descriptions are included. Actual images are not included; retain originals in iPhone Photos.</small></div>`
      : `<div><strong>Inspection changes need a data backup.</strong><br><small>Save the small data ZIP now. Actual images are not included; retain originals in iPhone Photos.</small></div>
         <button id="backupInspectionChangesBtn" class="button button-backup button-small" type="button">Back Up Inspection Data</button>`;
  }

  function renderTripOptions(state, selectedTripId) {
    const sortedTrips = inspectionTrips(state).sort((a, b) => String(b.endISO || b.startISO || "").localeCompare(String(a.endISO || a.startISO || "")));
    return [
      `<option value="">Standalone inspection — no mileage trip</option>`,
      ...sortedTrips.map((trip) => {
        const active = isActiveTrip(state, trip);
        const label = active
          ? ["ACTIVE TRIP", trip.date, trip.vendor, trip.projectNumber, "in progress"].filter(Boolean).join(" • ")
          : [trip.date, trip.vendor, trip.projectNumber, formatMiles(trip.miles)].filter(Boolean).join(" • ");
        return `<option value="${escapeHTML(trip.id)}"${trip.id === selectedTripId ? " selected" : ""}>${escapeHTML(label)}</option>`;
      })
    ].join("");
  }

  function renderFollowUpEditors(followUps) {
    const list = $("followUpEditorList");
    if (!list) return;
    const items = followUps.length ? followUps : [];
    list.innerHTML = items.map((item) => `
      <div class="followup-editor" data-followup-id="${escapeHTML(item.id || makeId("followup"))}">
        <div class="followup-editor-grid">
          <label>Action item<input class="followup-action" value="${escapeHTML(item.action || "")}" placeholder="Required follow-up"></label>
          <label>Responsible party<input class="followup-owner" value="${escapeHTML(item.responsibleParty || "")}" placeholder="Vendor, client, inspector"></label>
          <label>Due date<input class="followup-due" type="date" value="${escapeHTML(item.dueDate || "")}"></label>
          <label>Status<select class="followup-status"><option${item.status !== "Closed" ? " selected" : ""}>Open</option><option${item.status === "Closed" ? " selected" : ""}>Closed</option></select></label>
          <button class="button button-danger-outline button-small remove-followup-btn" type="button">Remove</button>
        </div>
      </div>
    `).join("");
  }

  function inspectionLoads(inspection) {
    if (typeof WORKFLOW_DATA.inspectionLoads === "function") {
      return WORKFLOW_DATA.inspectionLoads(inspection);
    }
    const legacy = String(inspection?.vendorLoadNumber || "").trim();
    return legacy ? [{ id: `${inspection?.id || "inspection"}-load-1`, identifier: legacy, status: "Not Recorded", notes: "", deficiencyFollowUp: "", photoIds: [] }] : [];
  }

  function loadIdentifiers(inspection) {
    return inspectionLoads(inspection).map((load) => load.identifier).filter(Boolean);
  }

  function loadDetailsText(inspection) {
    const photoLabels = new Map((inspection?.photos || []).map((photo) => [photo.id, photo.caption || photo.name || photo.id]));
    return inspectionLoads(inspection).map((load) => [
      load.identifier || "Unidentified load",
      load.status || "Not Recorded",
      load.notes,
      load.deficiencyFollowUp ? `Follow-up: ${load.deficiencyFollowUp}` : "",
      load.photoIds?.length ? `Photos: ${load.photoIds.map((id) => photoLabels.get(id) || id).join(" | ")}` : ""
    ].filter(Boolean).join(" — ")).join("\n");
  }

  function loadPhotoOptions(selectedIds = []) {
    const selected = new Set(selectedIds);
    return currentPhotos.map((photo) => {
      const label = photo.caption || photo.name || "Inspection photo";
      return `<option value="${escapeHTML(photo.id)}"${selected.has(photo.id) ? " selected" : ""}>${escapeHTML(label)}</option>`;
    }).join("");
  }

  function renderLoadEditors(loads) {
    const list = $("inspectionLoadEditorList");
    if (!list) return;
    const items = Array.isArray(loads) ? loads : [];
    list.innerHTML = items.length ? items.map((load) => `
      <article class="load-editor" data-load-id="${escapeHTML(load.id || makeId("load"))}">
        <div class="load-editor-routine">
          <label>Vendor Load #<input class="load-identifier" value="${escapeHTML(load.identifier || "")}" placeholder="Enter exactly as assigned"></label>
          <label>Status / result<select class="load-status">${createOptionList(WORKFLOW_DATA.LOAD_STATUSES || ["Not Recorded", "Accepted", "Accepted with Follow-up", "Released", "Hold", "Rejected"], load.status || "Not Recorded")}</select></label>
          <button class="button button-danger-outline button-small remove-load-btn" type="button">Remove</button>
        </div>
        <details class="load-exception-details"${load.notes || load.deficiencyFollowUp || load.photoIds?.length ? " open" : ""}>
          <summary>Optional notes, follow-up, and photos</summary>
          <div class="inspection-form-grid">
            <label class="full">Load notes<textarea class="load-notes" rows="2" placeholder="Optional details for this load">${escapeHTML(load.notes || "")}</textarea></label>
            <label class="full">Deficiency / follow-up<textarea class="load-deficiency" rows="2" placeholder="Only when an exception needs tracking">${escapeHTML(load.deficiencyFollowUp || "")}</textarea></label>
            <label class="full">Associated inspection photos<select class="load-photo-ids" multiple size="${Math.max(2, Math.min(5, currentPhotos.length || 2))}">${loadPhotoOptions(load.photoIds || [])}</select><small>${currentPhotos.length ? "Select one or more photos for this load." : "Add inspection photos first, then associate them here."}</small></label>
          </div>
        </details>
      </article>
    `).join("") : `<div class="inspection-empty compact">No vendor loads entered. Add a load only when the vendor assigned an identifier.</div>`;
  }

  function collectLoads() {
    const existingLoads = new Map(inspectionLoads(
      readState().settings.inspections.find((inspection) => inspection.id === editingInspectionId)
    ).map((load) => [load.id, load]));
    return [...document.querySelectorAll("#inspectionLoadEditorList .load-editor")].map((row) => {
      const previous = existingLoads.get(row.dataset.loadId) || {};
      return {
        id: row.dataset.loadId || makeId("load"),
        identifier: row.querySelector(".load-identifier")?.value.trim() || "",
        status: row.querySelector(".load-status")?.value || "Not Recorded",
        notes: row.querySelector(".load-notes")?.value.trim() || "",
        deficiencyFollowUp: row.querySelector(".load-deficiency")?.value.trim() || "",
        photoIds: [...(row.querySelector(".load-photo-ids")?.selectedOptions || [])].map((option) => option.value),
        createdISO: previous.createdISO || nowISO(),
        modifiedISO: nowISO()
      };
    }).filter((load) => load.identifier || load.notes || load.deficiencyFollowUp || load.photoIds.length);
  }

  function refreshLoadPhotoOptions() {
    document.querySelectorAll("#inspectionLoadEditorList .load-photo-ids").forEach((select) => {
      const selected = [...select.selectedOptions].map((option) => option.value);
      select.innerHTML = loadPhotoOptions(selected);
      select.size = Math.max(2, Math.min(5, currentPhotos.length || 2));
    });
  }

  function priorLoadHistoryMarkup(state, activeJobId, currentInspectionId) {
    if (!activeJobId) return `<div class="inspection-empty compact">Link an Active Job to see its prior vendor loads.</div>`;
    const prior = state.settings.inspections
      .filter((inspection) => inspection.activeJobId === activeJobId && inspection.id !== currentInspectionId)
      .sort((a, b) => String(b.date || b.modifiedISO || "").localeCompare(String(a.date || a.modifiedISO || "")))
      .flatMap((inspection) => inspectionLoads(inspection).map((load) => ({ inspection, load })));
    if (!prior.length) return `<div class="inspection-empty compact">No prior vendor loads are recorded for ${escapeHTML(activeJobId)}.</div>`;
    return `<div class="prior-load-history">${prior.map(({ inspection, load }) => `
      <article>
        <div><strong>${escapeHTML(load.identifier)}</strong><span>${escapeHTML(load.status || "Not Recorded")}</span></div>
        <small>${escapeHTML(displayDate(inspection.date))} • ${escapeHTML(inspection.status || "Draft")}${inspection.activity ? ` • ${escapeHTML(inspection.activity)}` : ""}</small>
        ${load.deficiencyFollowUp ? `<p><strong>Follow-up:</strong> ${escapeHTML(load.deficiencyFollowUp)}</p>` : ""}
      </article>`).join("")}</div>`;
  }

  function collectPhotoMetadata() {
    const captions = new Map(
      [...document.querySelectorAll("#inspectionPhotoList [data-photo-caption]")].map((input) => [
        input.dataset.photoCaption,
        input.value.trim()
      ])
    );
    const layouts = new Map(
      [...document.querySelectorAll("#inspectionPhotoList [data-photo-layout]")].map((input) => [
        input.dataset.photoLayout,
        input.value === "fit" ? "fit" : "fill"
      ])
    );
    const rotations = new Map(
      [...document.querySelectorAll("#inspectionPhotoList [data-photo-rotation]")].map((input) => [
        input.dataset.photoRotation,
        ["left", "right"].includes(input.value) ? input.value : "none"
      ])
    );
    return currentPhotos.map((photo) => ({
      ...photo,
      caption: captions.get(photo.id) ?? photo.caption ?? "",
      reportLayout: layouts.get(photo.id) ?? photo.reportLayout ?? "fill",
      reportRotation: rotations.get(photo.id) ?? photo.reportRotation ?? "none"
    }));
  }

  async function renderPhotoEditors() {
    const list = $("inspectionPhotoList");
    const count = $("inspectionPhotoCount");
    if (!list || !count) return;
    photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls = [];
    count.textContent = `${currentPhotos.length} of ${INSPECTION_PHOTO_LIMIT}`;

    if (!currentPhotos.length) {
      list.innerHTML = `<div class="inspection-empty compact">No photos attached.</div>`;
      refreshLoadPhotoOptions();
      return;
    }

    list.innerHTML = currentPhotos.map((photo) => `
      <article class="inspection-photo-card">
        <button class="inspection-photo-preview" type="button" data-view-photo="${escapeHTML(photo.id)}" aria-label="Open photo">
          <span class="inspection-photo-loading">Loading photo…</span>
        </button>
        <div class="inspection-photo-details">
          <strong>${escapeHTML(photo.name || "Inspection photo")}</strong>
          <small>${Number(photo.size || 0) > 0 ? `${Math.max(1, Math.round(Number(photo.size) / 1024))} KB` : ""}</small>
          <label>Caption<input data-photo-caption="${escapeHTML(photo.id)}" value="${escapeHTML(photo.caption || "")}" placeholder="What does this photo show?"></label>
          <label>Word layout<select data-photo-layout="${escapeHTML(photo.id)}"><option value="fill"${photo.reportLayout !== "fit" ? " selected" : ""}>Landscape Fill (default)</option><option value="fit"${photo.reportLayout === "fit" ? " selected" : ""}>Fit Entire Photo</option></select></label>
          <label>Word rotation<select data-photo-rotation="${escapeHTML(photo.id)}"><option value="none"${!["left", "right"].includes(photo.reportRotation) ? " selected" : ""}>No Rotation</option><option value="left"${photo.reportRotation === "left" ? " selected" : ""}>Rotate Left</option><option value="right"${photo.reportRotation === "right" ? " selected" : ""}>Rotate Right</option></select></label>
          <button class="button button-danger-outline button-small" type="button" data-remove-photo="${escapeHTML(photo.id)}">Remove Photo</button>
        </div>
      </article>
    `).join("");
    refreshLoadPhotoOptions();

    if (!window.MileageMediaStore) return;
    await Promise.all(currentPhotos.map(async (photo) => {
      try {
        const stored = await window.MileageMediaStore.getPhoto(photo.id);
        const target = list.querySelector(`[data-view-photo="${CSS.escape(photo.id)}"]`);
        if (!stored?.blob || !target) return;
        const url = URL.createObjectURL(stored.blob);
        photoObjectUrls.push(url);
        target.dataset.photoUrl = url;
        target.innerHTML = `<img src="${url}" alt="${escapeHTML(photo.caption || photo.name || "Inspection photo")}">`;
      } catch (error) {
        console.warn("Could not load inspection photo:", error);
      }
    }));
  }

  async function addInspectionPhotos(files) {
    const status = $("inspectionPhotoStatus");
    if (!editingInspectionId || !window.MileageMediaStore) {
      window.alert("Private photo storage is unavailable.");
      return;
    }

    let images = [...(files || [])].filter((file) => String(file.type || "").startsWith("image/"));
    if (!images.length) return;
    const remaining = Math.max(0, INSPECTION_PHOTO_LIMIT - currentPhotos.length);
    if (!remaining) {
      window.alert(`This inspection already has the ${INSPECTION_PHOTO_LIMIT}-photo maximum.`);
      return;
    }
    if (images.length > remaining) {
      window.alert(`Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added. The inspection report maximum is ${INSPECTION_PHOTO_LIMIT}.`);
      images = images.slice(0, remaining);
    }
    if (currentPhotos.length < INSPECTION_PHOTO_WARNING && currentPhotos.length + images.length >= INSPECTION_PHOTO_WARNING) {
      const proceed = window.confirm(`This inspection will contain ${currentPhotos.length + images.length} photos. Large previews and Word exports may be slower on iPhone. Continue?`);
      if (!proceed) return;
    }
    status.textContent = `Preparing ${images.length} photo${images.length === 1 ? "" : "s"}…`;
    status.className = "gps-status";

    try {
      for (let index = 0; index < images.length; index += 1) {
        status.textContent = `Preparing photo ${index + 1} of ${images.length}…`;
        const metadata = await window.MileageMediaStore.addPhoto(editingInspectionId, images[index]);
        currentPhotos.push({ ...metadata, activeJobId: $("inspectionActiveJobId")?.value || "" });
      }
      const activeJobId = $("inspectionActiveJobId")?.value;
      status.textContent = `${images.length} photo${images.length === 1 ? "" : "s"} added${activeJobId ? ` to ${activeJobId}` : ""}. Save the inspection to keep the attachment.`;
      status.className = "gps-status good";
      await renderPhotoEditors();
      scheduleInspectionAutosave();
    } catch (error) {
      status.textContent = `A photo could not be added: ${error.message}`;
      status.className = "gps-status bad";
      window.alert(`The photo could not be added.\n\n${error.message}`);
    }
  }

  async function renderLinkedTripPhotos(trip) {
    const panel = $("inspectionLinkedTripPhotos");
    linkedTripPhotoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    linkedTripPhotoObjectUrls = [];
    if (!panel) return;
    const photos = Array.isArray(trip?.photos) ? trip.photos : [];
    if (!trip || !photos.length) {
      panel.innerHTML = trip
        ? `<div class="inspection-empty compact">No trip-level photos are attached to this visit.</div>`
        : `<div class="inspection-empty compact">Choose a mileage trip to show its separate visit photos.</div>`;
      return;
    }
    panel.innerHTML = `<p class="muted">Trip-level photos stay with the visit and are shown here for context. They are not copied into this inspection.</p><div class="inspection-photo-thumbnails">${photos.map((photo) => `
      <button type="button" data-view-photo="${escapeHTML(photo.id)}" aria-label="Open ${escapeHTML(photo.caption || photo.name || "trip photo")}"><span>Loading…</span></button>
    `).join("")}</div>`;
    await Promise.all(photos.map(async (photo) => {
      try {
        const stored = await window.MileageMediaStore?.getPhoto(photo.id);
        if (!stored?.blob || currentTripId !== trip.id) return;
        const button = panel.querySelector(`[data-view-photo="${CSS.escape(photo.id)}"]`);
        if (!button) return;
        const url = URL.createObjectURL(stored.blob);
        linkedTripPhotoObjectUrls.push(url);
        button.dataset.photoUrl = url;
        button.innerHTML = `<img src="${url}" alt="${escapeHTML(photo.caption || photo.name || "Trip photo")}">`;
      } catch (error) {
        console.warn("Could not load a linked trip photo:", error);
      }
    }));
  }

  function workflowSectionMarkup(values, activeJob) {
    const coating = values.coating || {};
    const structural = values.structural || {};
    const facility = values.facility || activeJob?.facility || "";
    const systems = COATING_SYSTEMS[facility] || [];
    const coatingOptions = `<option value="">${systems.length ? `Choose ${escapeHTML(facility)} system…` : "No facility-specific system loaded"}</option>${systems.map((system) => `<option value="${escapeHTML(system[0])}"${coating.system === system[0] ? " selected" : ""}>${escapeHTML(system[0])} — ${escapeHTML(system[1])}</option>`).join("")}`;
    const routine = ["Satisfactory", "Unsatisfactory", "Not observed"];
    const steel = ["Satisfactory", "Issue noted", "Not observed"];
    const type = values.inspectionType || "Inspection";
    return `
      <section id="coatingWorkflow" class="inspection-workflow-panel${type === "Coating Inspection" ? "" : " hidden"}">
        <div class="section-heading compact"><div><p class="eyebrow">Low-entry workflow</p><h3>Coating QA</h3></div></div>
        <div class="inspection-form-grid">
          <label>Coating system<select id="coatingSystem">${coatingOptions}</select></label>
          <label>Manufacturer / product family<input id="coatingManufacturer" value="${escapeHTML(coating.manufacturer || "")}" placeholder="Optional"></label>
        </div>
        <div id="coatingRequirementSummary" class="summary-box"></div>
        <div class="inspection-check-grid">
          <label>Environmental conditions<select id="coatEnvironment">${createOptionList(routine, coating.environment || "Satisfactory")}</select></label>
          <label>Blast / surface preparation<select id="coatBlast">${createOptionList(routine, coating.blast || "Satisfactory")}</select></label>
          <label>Anchor profile<select id="coatProfile">${createOptionList(["Satisfactory", "Unsatisfactory", "Not checked"], coating.profile || "Satisfactory")}</select></label>
          <label>Products verified<select id="coatProducts">${createOptionList(["Yes", "No", "Not observed"], coating.products || "Yes")}</select></label>
          <label>DFT<select id="coatDft">${createOptionList(routine, coating.dft || "Satisfactory")}</select></label>
          <label>Appearance<select id="coatAppearance">${createOptionList(["Satisfactory", "Unsatisfactory", "Not observed"], coating.appearance || "Satisfactory")}</select></label>
          <label>Vendor QC<select id="coatVendorQc">${createOptionList(["Satisfactory", "Issue noted", "Not reviewed"], coating.vendorQc || "Satisfactory")}</select></label>
        </div>
        <div class="inspection-form-grid">
          <label>Optional anchor-profile readings (mils)<input id="profileReadings" value="${escapeHTML(coating.profileReadings || "")}" inputmode="decimal" placeholder="Leave blank when no values were recorded"></label>
          <label>Optional DFT readings (mils)<input id="dftReadings" value="${escapeHTML(coating.dftReadings || "")}" inputmode="decimal" placeholder="Leave blank when no values were recorded"></label>
        </div>
      </section>
      <section id="structuralWorkflow" class="inspection-workflow-panel${type.startsWith("Structural Steel") ? "" : " hidden"}">
        <div class="section-heading compact"><div><p class="eyebrow">Low-entry workflow</p><h3>Structural Steel QA</h3></div></div>
        <div class="inspection-check-grid">
          <label>Materials / identification<select id="steelMaterial">${createOptionList(steel, structural.material || "Satisfactory")}</select></label>
          <label>Weld visual condition<select id="steelWelds">${createOptionList(steel, structural.welds || "Satisfactory")}</select></label>
          <label>General workmanship<select id="steelWorkmanship">${createOptionList(steel, structural.workmanship || "Satisfactory")}</select></label>
          <label>Dimensions<select id="steelDimensions">${createOptionList(["Satisfactory", "Issue noted", "Not performed"], structural.dimensions || "Satisfactory")}</select></label>
          <label>Post-galvanizing condition<select id="steelGalv">${createOptionList(["Not applicable", "Satisfactory", "Issue noted"], structural.galvanizing || "Not applicable")}</select></label>
        </div>
      </section>`;
  }

  function openInspectionForm(inspection = null, tripId = "", options = {}) {
    const state = readState();
    const duplicating = Boolean(options.duplicate);
    editingInspectionWasExisting = Boolean(inspection) && !duplicating;
    editingInspectionId = duplicating ? makeId() : (inspection?.id || makeId());
    currentTripId = duplicating ? "" : (tripId || inspection?.tripId || "");
    const trip = getTripById(state, currentTripId);
    const inspectionPhotos = !duplicating && Array.isArray(inspection?.photos)
      ? inspection.photos.filter((photo) => !photo.sourceTripId).map((photo) => ({ ...photo }))
      : [];
    currentPhotos = inspectionPhotos;
    originalPhotoIds = new Set(currentPhotos.map((photo) => photo.id));
    const snapshot = duplicating ? null : (inspection?.tripSnapshot || tripSnapshot(trip));
    const values = inspection || {};
    const activeJob = options.standalone
      ? null
      : activeJobById(options.activeJobId || values.activeJobId || trip?.activeJobId || state.settings.currentActiveJobId, state);
    const selectedFacilityProfileId = values.facilityProfileId || trip?.facilityProfileId || activeJob?.defaultFacilityProfileId || "";
    const facilityProfile = facilityProfileById(state, selectedFacilityProfileId);
    let workspaceChanged = false;
    if (activeJob && state.settings.currentActiveJobId !== activeJob.aj) {
      state.settings.currentActiveJobId = activeJob.aj;
      if (!state.settings.activeJobsWorkspaceVendor) state.settings.activeJobsWorkspaceVendor = activeJob.reportingVendor;
      workspaceChanged = true;
    }
    if (trip && state.settings.activeJobsWorkspaceTripId !== trip.id) {
      state.settings.activeJobsWorkspaceTripId = trip.id;
      state.settings.activeJobsWorkspaceVendor = trip.vendor || state.settings.activeJobsWorkspaceVendor || "";
      workspaceChanged = true;
    } else if (options.standalone && state.settings.activeJobsWorkspaceTripId !== "__standalone__") {
      state.settings.activeJobsWorkspaceTripId = "__standalone__";
      workspaceChanged = true;
    }
    if (workspaceChanged) writeState(state);

    const date = values.date || (trip ? inputDateFromTrip(trip.date) : todayInputValue());
    const customer = values.customer ?? activeJob?.client ?? trip?.customer ?? "";
    const vendor = values.inspectionLocation ?? values.vendor ?? trip?.vendor ?? facilityProfile?.normalInspectionLocation ?? facilityProfile?.shopFacilityName ?? activeJob?.reportingVendor ?? "";
    const projectNumber = values.projectNumber ?? activeJob?.inspectionNo ?? trip?.projectNumber ?? "";
    const activity = values.activity ?? trip?.purpose ?? values.inspectionType ?? "Inspection";
    const startTime = values.startTime ?? trip?.startTime ?? "";
    const endTime = values.endTime ?? trip?.endTime ?? "";
    const hours = values.hoursOnSite ?? calculateHours(startTime, endTime);

    const panel = $("inspectionFormPanel");
    panel.innerHTML = `
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">${editingInspectionWasExisting ? "Edit record" : (duplicating ? "Copy previous record" : "New record")}</p>
          <h3>${editingInspectionWasExisting ? "Update Inspection" : (duplicating ? "Create Inspection Copy" : "Create Inspection")}</h3>
        </div>
        <button id="closeInspectionFormBtn" class="button button-quiet button-small" type="button">Close Form</button>
      </div>

      <form id="inspectionForm" autocomplete="off">
        <input id="inspectionActiveJobId" type="hidden" value="${escapeHTML(activeJob?.aj || values.activeJobId || "")}">
        <div class="active-job-current-banner${activeJob ? "" : " no-job"}">
          <span class="eyebrow">${activeJob ? "Current Active Job — verify before notes or photos" : "NO ACTIVE JOB FOUND"}</span>
          <strong>${activeJob ? `${escapeHTML(activeJob.aj)} — ${escapeHTML(activeJob.inspectionNo)} — ${escapeHTML(activeJob.projectName)}` : "Standalone / unassigned inspection"}</strong>
          <small>${activeJob ? `Reporting vendor: ${escapeHTML(activeJob.reportingVendor)} • Notes and photos attach to this AJ and this inspection record.` : "This inspection autosaves and keeps its trip, notes, photos, loads, and follow-ups. Assign it after the missing AJ is imported."}</small>
          ${activeJob ? "" : `<div class="pending-job-assignment"><select id="pendingActiveJobSelect"><option value="">Assign later…</option>${activeJobsForState(state).filter((job) => String(job.openClosed || "").toLowerCase() === "open").map((job) => `<option value="${escapeHTML(job.aj)}">${escapeHTML(job.aj)} — ${escapeHTML(job.inspectionNo)} — ${escapeHTML(job.reportingVendor)}</option>`).join("")}</select><button id="assignPendingInspectionBtn" class="button button-secondary button-small" type="button">Assign to Active Job</button></div>`}
        </div>
        <details class="inspection-form-section">
          <summary><strong>Change Visit / Job</strong></summary>
        <div class="facility-visit-controls">
          <label>Facility Profile<select id="inspectionFacilityProfileId">${facilityProfileOptions(state, selectedFacilityProfileId, activeJob)}</select></label>
          <button id="saveVisitToFacilityProfileBtn" class="button button-secondary button-small" type="button"${selectedFacilityProfileId ? "" : " disabled"}>Save to Facility Profile</button>
          <small>Use Different Facility changes this visit only. Save to Facility Profile is the explicit permanent action.</small>
        </div>
        <label>
          Related mileage trip
          <select id="inspectionTripId">${renderTripOptions(state, currentTripId)}</select>
          <small>Choose a trip to copy its mileage, GPS, customer, vendor, project, and times. Leave standalone for calls or document reviews.</small>
        </label>

        <div id="inspectionTripSummary" class="inspection-linked-trip"></div>
        </details>

        <details class="inspection-form-section"${activeJob ? "" : " open"}>
          <summary><strong>Inherited report context</strong></summary>
          <p class="muted">These values come from the selected Active Job, visit, and Facility Profile. Expand only when verification or a temporary override is needed.</p>
        <div class="inspection-form-grid">
          <label>Date<input id="inspectionDate" type="date" required value="${escapeHTML(date)}"></label>
          <label>Client<input id="inspectionCustomer" list="customerList" required value="${escapeHTML(customer)}" placeholder="Example: Shell"></label>
          <label>Reporting vendor<input id="inspectionReportingVendor" required value="${escapeHTML(values.reportingVendor || activeJob?.reportingVendor || facilityProfile?.reportingVendor || vendor || "")}" placeholder="Vendor used on the S&B report"${activeJob ? " readonly" : ""}></label>
          <label>Inspection location / subvendor<input id="inspectionVendor" list="vendorList" required value="${escapeHTML(vendor)}" placeholder="Where the inspection occurred"></label>
          <label>S&B inspection number / project<input id="inspectionProject" list="inspectionProjectList" value="${escapeHTML(projectNumber)}" placeholder="Example: E10379-424"></label>
          <label>Project name<input id="inspectionProjectName" value="${escapeHTML(values.projectName || activeJob?.projectName || "")}" placeholder="Project or reporting-unit description"></label>
          <label>S&B order / PO<input id="inspectionPoJob" value="${escapeHTML(values.purchaseOrderJob || activeJob?.sbOrder || "")}" placeholder="Optional"></label>
        </div>
        </details>

        <details class="inspection-workflow-panel"${values.equipmentTag || values.isoDrawingNumber || values.pieceSpoolNumber ? " open" : ""}>
          <summary><strong>Identifiers and vendor loads</strong></summary>
          <p class="muted">Use the first available identifiers. Leave unused fields untouched.</p>
          <div class="inspection-form-grid">
            <label>1. Equipment tag<input id="inspectionTag" value="${escapeHTML(values.equipmentTag || "")}" placeholder="Example: F-511"></label>
            <label>2. ISO drawing number<input id="inspectionIsoNumber" value="${escapeHTML(values.isoDrawingNumber || "")}" placeholder="Example: 326-0041-05A"></label>
            <label>3. Vendor job number<input id="inspectionVendorJob" value="${escapeHTML(values.vendorJobNumber || activeJob?.vendorJobs || "")}" placeholder="Shop job number"></label>
            <label>4. Piece / spool number<input id="inspectionPieceSpool" value="${escapeHTML(values.pieceSpoolNumber || "")}" placeholder="Example: 35 or 2S1"></label>
          </div>
        </details>

        <section class="inspection-workflow-panel inspection-load-panel">
          <div class="section-heading compact">
            <div><p class="eyebrow">Vendor-assigned identifiers</p><h3>Vendor Loads</h3></div>
            <button id="addInspectionLoadBtn" class="button button-secondary button-small" type="button">+ Add Load</button>
          </div>
          <p class="muted">Enter each identifier exactly as the vendor assigned it. Routine loads only need the load number and status.</p>
          <div id="inspectionLoadEditorList" class="load-editor-list"></div>
          <details class="prior-load-details">
            <summary>Prior loads for ${escapeHTML(activeJob?.aj || "this Active Job")}</summary>
            ${priorLoadHistoryMarkup(state, activeJob?.aj || values.activeJobId || "", editingInspectionId)}
          </details>
        </section>

        <datalist id="inspectionProjectList"></datalist>

        <section class="inspection-form-section">
          <h3>What are you doing?</h3>
          <p class="muted">Choose one primary type and every activity performed during this inspection. Specialized tools appear when their activity is selected.</p>
        <div class="inspection-form-grid">
          <label>Primary inspection type<select id="inspectionType">${createOptionList(INSPECTION_TYPES, values.inspectionType || "Inspection")}</select></label>
          <label>Status<select id="inspectionStatus">${createOptionList(INSPECTION_STATUSES, values.status || (activeJob ? "Draft" : "Complete"))}</select></label>
          <label>Acceptance / release<select id="inspectionAcceptance">${createOptionList(ACCEPTANCE_STATUSES, values.acceptanceStatus || "Not Determined")}</select></label>
          <label class="full">Work summary<input id="inspectionActivity" required value="${escapeHTML(activity)}" placeholder="Short summary of the inspection work"></label>
        </div>
          <div class="inspection-activity-grid">${activitiesMarkup(inspectionActivities(values))}</div>
        </section>

        ${workflowSectionMarkup(values, activeJob)}

        <section class="inspection-form-section">
          <h3>Inspection / work time</h3>
          <p class="muted">${trip ? `Suggested from visit: ${escapeHTML(trip.startTime || "not entered")}–${escapeHTML(trip.endTime || (isActiveTrip(state, trip) ? "in progress" : "not entered"))}. Confirm or change these to the actual inspection work time; they do not determine paid timesheet hours.` : "Enter the actual inspection work time. Timesheet hours remain separately confirmed."}</p>
        <div class="inspection-form-grid">
          <label>Inspection start<input id="inspectionStartTime" value="${escapeHTML(startTime)}" placeholder="7:30 AM"></label>
          <label>Inspection end<input id="inspectionEndTime" value="${escapeHTML(endTime)}" placeholder="3:45 PM"></label>
          <label>Inspection hours on site<input id="inspectionHours" inputmode="decimal" value="${escapeHTML(hours)}" placeholder="8.25"></label>
        </div>
        </section>

        <section class="inspection-form-section">
        <h3>Notes and findings</h3>
        <label>Quick note for this AJ / inspection<textarea id="inspectionQuickNote" rows="3" placeholder="Short field note; it remains attached to the current AJ and inspection">${escapeHTML(values.quickNote || "")}</textarea></label>
        <label>Inspection summary<textarea id="inspectionSummary" rows="5" placeholder="Concise work-only summary">${escapeHTML(values.summary || "")}</textarea></label>
        <label>Observations<textarea id="inspectionObservations" rows="4" placeholder="Detailed observations and documents reviewed">${escapeHTML(values.observations || "")}</textarea></label>
        <label>Deficiency status<select id="inspectionDeficiencyStatus">${createOptionList(["None", "Issue noted"], values.deficiencyStatus || (values.deficiencies ? "Issue noted" : "None"))}</select></label>
        <div id="inspectionDeficiencyDetails"${values.deficiencyStatus === "Issue noted" || values.deficiencies ? "" : " class=\"hidden\""}>
          <label>Deficiencies / exceptions<textarea id="inspectionDeficiencies" rows="3" placeholder="Factual condition and disposition">${escapeHTML(values.deficiencies || "")}</textarea></label>
        </div>

        <div class="form-actions wrap">
          <button id="generateInspectionReportBtn" class="button button-secondary button-small" type="button">Generate Draft Report Language</button>
        </div>
        <div id="inspectionReportPreview" class="inspection-report-preview${values.generatedReportLanguage ? "" : " hidden"}">${values.generatedReportLanguage ? `<strong>Draft report language</strong><p>${escapeHTML(values.generatedReportLanguage)}</p><small>Generated only from entered facts. Review before reporting.</small>` : ""}</div>
        </section>

        <section class="inspection-form-section">
        <h3>Evidence and follow-up</h3>
        <div class="section-heading compact">
          <div><p class="eyebrow">Visit context</p><h3>Trip-Level Photos</h3></div>
        </div>
        <div id="inspectionLinkedTripPhotos" class="inspection-linked-trip-photos"></div>

        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Stored privately on this device</p>
            <h3>Inspection-Specific Photos</h3>
          </div>
          <span id="inspectionPhotoCount" class="pill">0</span>
        </div>
          <p class="muted">These photos belong only to this inspection/AJ. Trip-level visit photos remain separate above. Backups contain filenames and descriptions only; retain original images in iPhone Photos.</p>
        <div class="form-actions wrap">
          <button id="takeInspectionPhotoBtn" class="button inspection-button button-small" type="button">Take Photo</button>
          <button id="chooseInspectionPhotosBtn" class="button button-secondary button-small" type="button">Choose Photos</button>
          <input id="takeInspectionPhotoInput" class="hidden" type="file" accept="image/*" capture="environment">
          <input id="chooseInspectionPhotosInput" class="hidden" type="file" accept="image/*" multiple>
        </div>
        <div id="inspectionPhotoStatus" class="gps-status">Ready to add photos.</div>
        <div id="inspectionPhotoList" class="inspection-photo-list"></div>

        <div class="section-heading compact">
          <div><p class="eyebrow">Action tracking</p><h3>Follow-ups</h3></div>
          <button id="addFollowUpBtn" class="button button-secondary button-small" type="button">Add Follow-up</button>
        </div>
        <div id="followUpEditorList" class="followup-editor-list"></div>
        </section>

        <div class="form-actions wrap">
          <button class="button inspection-button" type="submit">${editingInspectionWasExisting ? "Save Changes" : "Save Inspection"}</button>
          <button id="cancelInspectionFormBtn" class="button button-secondary" type="button">Cancel</button>
          <span id="inspectionAutosaveStatus" class="inspection-autosave-status">${activeJob ? "Draft autosaves while this AJ is open." : "Pending / unassigned drafts autosave normally."}</span>
        </div>
      </form>
    `;
    panel.classList.remove("hidden");
    $("inspectionSection")?.classList.add("inspection-form-open");
    populateProjectDatalist(state);
    renderLoadEditors(inspectionLoads(values));
    renderFollowUpEditors(Array.isArray(values.followUps) ? values.followUps : []);
    renderPhotoEditors();
    renderLinkedTripPhotos(trip);
    renderSelectedTripSummary(snapshot);
    updateInspectionWorkflowSections();
    updateCoatingRequirementSummary();
    renderActiveJobsWorkspace(state);
    panel.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function updateInspectionWorkflowSections() {
    const type = $("inspectionType")?.value || "";
    const activities = collectInspectionActivities();
    $("coatingWorkflow")?.classList.toggle("hidden", type !== "Coating Inspection" && !activities.includes("Coating Inspection"));
    $("structuralWorkflow")?.classList.toggle("hidden", !type.startsWith("Structural Steel") && !activities.includes("Structural Steel Inspection"));
  }

  function selectedCoatingSystem(activeJobId = $("inspectionActiveJobId")?.value) {
    const job = activeJobById(activeJobId);
    const facility = job?.facility || "";
    return (COATING_SYSTEMS[facility] || []).find((system) => system[0] === $("coatingSystem")?.value) || null;
  }

  function updateCoatingRequirementSummary() {
    const box = $("coatingRequirementSummary");
    if (!box) return;
    const job = activeJobById($("inspectionActiveJobId")?.value);
    const selected = selectedCoatingSystem();
    if (!selected) {
      box.textContent = job?.facility
        ? `Select a ${job.facility} coating system to display the stored specification summary.`
        : "No facility-specific coating library applies to this inspection.";
      return;
    }
    box.innerHTML = `<strong>${escapeHTML(job.facility)} System ${escapeHTML(selected[0])}</strong><br>${escapeHTML(selected[1])}<br><strong>Surface preparation:</strong> ${escapeHTML(selected[2])}<br><strong>System summary:</strong> ${escapeHTML(selected[3])}`;
  }

  function numericReadingRange(text) {
    const tokens = String(text || "").trim().split(/[;,\s]+/).filter(Boolean);
    if (!tokens.length) return "";
    const values = tokens.map(Number);
    if (values.some((value) => !Number.isFinite(value))) return "";
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
  }

  function inspectionItemPhrase(inspection) {
    const identifiers = [];
    if (inspection.equipmentTag) identifiers.push(`equipment ${inspection.equipmentTag}`);
    if (inspection.isoDrawingNumber) identifiers.push(`ISO ${inspection.isoDrawingNumber}`);
    if (inspection.vendorJobNumber) identifiers.push(`vendor job ${inspection.vendorJobNumber}`);
    if (inspection.pieceSpoolNumber) identifiers.push(`piece/spool ${inspection.pieceSpoolNumber}`);
    const loads = loadIdentifiers(inspection);
    if (loads.length) identifiers.push(`vendor load${loads.length === 1 ? "" : "s"} ${loads.join(", ")}`);
    return identifiers.length ? identifiers.join(", ") : "the identified work scope";
  }

  function cleanReportText(value) {
    const cleaned = String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\b(\w+)\s+\1\b/gi, "$1")
      .replace(/\bwere are\b/gi, "were")
      .replace(/\bagainst lates\b/gi, "against the latest")
      .replace(/ *\n */g, "\n")
      .trim();
    if (!cleaned) return "";
    const seen = new Set();
    return cleaned.split(/(?<=[.!?])\s+/).filter((sentence) => {
      const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(" ");
  }

  function reportTextWithoutDeficiency(value, deficiencies) {
    const narrative = cleanReportText(value);
    const detail = cleanReportText(deficiencies);
    if (!narrative || !detail) return narrative;
    const normalize = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const detailKeys = detail.split(/(?<=[.!?])\s+/).map(normalize).filter(Boolean);
    return narrative.split(/(?<=[.!?])\s+/).filter((sentence) => {
      const sentenceKey = normalize(sentence);
      return !detailKeys.some((detailKey) => sentenceKey.includes(detailKey));
    }).join(" ");
  }

  function generateReportLanguage(inspection) {
    const sentences = [];
    const location = inspection.inspectionLocation || inspection.vendor || "the documented inspection location";
    const reportingVendor = inspection.reportingVendor || inspection.vendor || "the reporting vendor";
    const type = inspection.inspectionType || "Inspection";
    const activities = inspectionActivities(inspection);
    const activityDescription = activities.length ? activities.join(", ") : type;
    sentences.push(`Performed ${activityDescription.toLowerCase()} for ${inspectionItemPhrase(inspection)} at ${location} for reporting vendor ${reportingVendor}.`);

    if (hasInspectionActivity(inspection, /coat/i)) {
      const coating = inspection.coating || {};
      const job = activeJobById(inspection.activeJobId);
      const system = (COATING_SYSTEMS[job?.facility] || []).find((item) => item[0] === coating.system);
      if (coating.system) sentences.push(`The selected coating system was ${coating.system}${system ? ` (${system[1]})` : ""}.`);
      if (coating.environment === "Satisfactory") sentences.push("Environmental conditions observed or reviewed for the coating activities were satisfactory.");
      if (coating.blast === "Satisfactory") sentences.push("Surface preparation was visually examined and found satisfactory to the selected coating-system requirement.");
      if (coating.profile === "Satisfactory") {
        const range = numericReadingRange(coating.profileReadings);
        sentences.push(range
          ? `Entered representative anchor-profile measurements ranged from ${range} mils and were satisfactory.`
          : (coating.profileReadings ? "Anchor profile was checked as applicable and found satisfactory; the entered reading text was not used as a numeric value." : "Anchor profile was checked as applicable and found satisfactory; no numeric values were entered."));
      }
      if (coating.products === "Yes") sentences.push("The entered product verification was satisfactory for the selected coating system.");
      if (coating.dft === "Satisfactory") {
        const range = numericReadingRange(coating.dftReadings);
        sentences.push(range
          ? `Entered representative DFT measurements ranged from ${range} mils and were satisfactory.`
          : (coating.dftReadings ? "Dry-film-thickness results were found within specified requirements; the entered reading text was not used as a numeric value." : "Dry-film-thickness results were found within specified requirements; no numeric values were entered."));
      }
      if (coating.appearance === "Satisfactory") sentences.push("The observed coating appearance was satisfactory.");
      if (coating.vendorQc === "Satisfactory") sentences.push("Vendor QC activities or documentation reviewed during the visit were satisfactory as applicable.");
    }

    if (hasInspectionActivity(inspection, /structural|steel/i)) {
      const steel = inspection.structural || {};
      if (steel.material === "Satisfactory") sentences.push("Material condition and identification were reviewed and found satisfactory.");
      if (steel.welds === "Satisfactory") sentences.push("Visual weld condition was reviewed and found satisfactory.");
      if (steel.workmanship === "Satisfactory") sentences.push("General fabrication workmanship was satisfactory at the time of inspection.");
      if (steel.dimensions === "Satisfactory") sentences.push("The recorded dimensional inspection result was satisfactory.");
      if (steel.galvanizing === "Satisfactory") sentences.push("Post-galvanizing condition was visually reviewed and found satisfactory.");
    }

    if (inspection.acceptanceStatus && inspection.acceptanceStatus !== "Not Determined") {
      sentences.push(`Inspection disposition: ${inspection.acceptanceStatus}.`);
    }
    return cleanReportText(sentences.join(" "));
  }

  function coatingReportLanguage(inspection) {
    if (!hasInspectionActivity(inspection, /coat/i)) return "";
    const coating = inspection.coating || {};
    const job = activeJobById(inspection.activeJobId);
    const system = (COATING_SYSTEMS[job?.facility] || []).find((item) => item[0] === coating.system);
    const details = [];
    if (coating.system) details.push(`System ${coating.system}${system ? ` — ${system[1]}` : ""}`);
    if (coating.manufacturer) details.push(`Products: ${coating.manufacturer}`);
    if (coating.blast) details.push(`Surface preparation: ${coating.blast}`);
    if (coating.profileReadings) details.push(`Anchor-profile readings: ${coating.profileReadings} mils`);
    if (coating.dftReadings) details.push(`DFT readings: ${coating.dftReadings} mils`);
    if (coating.environment) details.push(`Environmental conditions: ${coating.environment}`);
    if (coating.appearance) details.push(`Appearance: ${coating.appearance}`);
    if (coating.vendorQc) details.push(`Vendor QC: ${coating.vendorQc}`);
    return details.length ? `${details.join(". ")}.` : "Coating inspection performed; no detailed coating results were entered.";
  }

  function reportSectionText(inspection) {
    const activities = inspectionActivities(inspection);
    const generalActivities = activities.filter((activity) => !/coat|nde|release/i.test(activity));
    const ndeSelected = hasInspectionActivity(inspection, /nde/i);
    const deficiency = cleanReportText(inspection.deficiencies);
    const observations = reportTextWithoutDeficiency(inspection.observations, deficiency);
    const ndeOnly = ndeSelected && activities.length > 0 && activities.every((activity) => /nde/i.test(activity));
    const loadText = inspectionLoads(inspection).length ? `Vendor Loads:\n${loadDetailsText(inspection)}` : "";
    return {
      description: reportTextWithoutDeficiency(inspection.summary || inspection.generatedReportLanguage || generateReportLanguage(inspection), deficiency),
      actionItems: [deficiency ? `Deficiency / exception: ${deficiency}` : "", inspectionFollowUpText(inspection, "All")].filter(Boolean).join("\n"),
      inspectionAudit: [ndeOnly ? "" : observations, loadText].filter(Boolean).join("\n"),
      shopInspection: cleanReportText([generalActivities.join(", "), inspection.activity].filter(Boolean).join(" — ")),
      ndeReview: ndeSelected ? (ndeOnly ? (observations || "NDE review performed.") : "NDE review performed.") : "",
      coatingInspection: coatingReportLanguage(inspection),
      inspectionRelease: hasInspectionActivity(inspection, /release|final/i) || inspection.acceptanceStatus !== "Not Determined"
        ? inspection.acceptanceStatus
        : ""
    };
  }

  function previewGeneratedReportLanguage() {
    const inspection = collectInspectionFromForm(null, null);
    if (!inspection) return;
    const language = generateReportLanguage(inspection);
    const box = $("inspectionReportPreview");
    if (!box) return;
    box.dataset.reportLanguage = language;
    box.classList.remove("hidden");
    box.innerHTML = `<strong>Draft report language</strong><p>${escapeHTML(language)}</p><small>Generated only from entered facts. Numeric values appear only when entered in the measurement fields. Review before reporting.</small>`;
  }

  function closeInspectionForm(options = {}) {
    clearTimeout(inspectionAutosaveTimer);
    inspectionAutosaveTimer = null;
    const saved = Boolean(options.saved);
    const abandonedInspectionId = !editingInspectionWasExisting && !saved ? editingInspectionId : "";
    const unsavedAddedPhotoIds = editingInspectionWasExisting && !saved
      ? currentPhotos.filter((photo) => !originalPhotoIds.has(photo.id)).map((photo) => photo.id)
      : [];
    photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls = [];
    linkedTripPhotoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    linkedTripPhotoObjectUrls = [];
    if (abandonedInspectionId && window.MileageMediaStore) {
      window.MileageMediaStore.deleteInspectionPhotos(abandonedInspectionId).catch((error) => {
        console.warn("Could not remove abandoned inspection photos:", error);
      });
    }
    unsavedAddedPhotoIds.forEach((photoId) => {
      window.MileageMediaStore?.deletePhoto(photoId).catch((error) => {
        console.warn("Could not remove an unsaved photo:", error);
      });
    });
    editingInspectionId = null;
    editingInspectionWasExisting = false;
    currentTripId = "";
    currentPhotos = [];
    originalPhotoIds = new Set();
    const panel = $("inspectionFormPanel");
    $("inspectionSection")?.classList.remove("inspection-form-open");
    if (panel) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
    }
  }

  function populateProjectDatalist(state) {
    const datalist = $("inspectionProjectList");
    if (!datalist) return;
    const projects = new Set();
    state.trips.forEach((trip) => { if (trip.projectNumber) projects.add(trip.projectNumber); });
    state.settings.inspections.forEach((inspection) => { if (inspection.projectNumber) projects.add(inspection.projectNumber); });
    datalist.innerHTML = [...projects].sort().map((project) => `<option value="${escapeHTML(project)}"></option>`).join("");
  }

  function renderSelectedTripSummary(snapshot) {
    const box = $("inspectionTripSummary");
    if (!box) return;
    if (!snapshot) {
      box.innerHTML = `<strong>Standalone record</strong><br><small>No mileage or GPS record is linked.</small>`;
      return;
    }
    const startMap = mapLink(snapshot.startLocation, "Trip Start");
    const endMap = mapLink(snapshot.endLocation, "Trip End");
    box.innerHTML = `
      <strong>${snapshot.inProgress ? "Active trip linked — mileage still in progress" : `Linked mileage: ${formatMiles(snapshot.miles)}`}</strong>
      ${snapshot.gpsRouteMiles ? ` • GPS ${formatMiles(snapshot.gpsRouteMiles)}` : ""}<br>
      <small>${escapeHTML(snapshot.date || "")} ${escapeHTML(snapshot.startTime || "")}–${snapshot.inProgress ? "In progress" : escapeHTML(snapshot.endTime || "")}
      ${snapshot.staGenerated ? ` • STA ${escapeHTML(snapshot.staFileName || "generated")}` : ""}</small>
      ${(startMap || endMap) ? `<div class="map-links">${startMap ? `<a href="${startMap}" target="_blank" rel="noopener">Start map</a>` : ""}${endMap ? `<a href="${endMap}" target="_blank" rel="noopener">End map</a>` : ""}</div>` : ""}
    `;
  }

  function applyTripToOpenForm(tripId) {
    const state = readState();
    const trip = getTripById(state, tripId);
    currentTripId = tripId;
    if (!trip) {
      renderSelectedTripSummary(null);
      renderLinkedTripPhotos(null);
      return;
    }
    $("inspectionDate").value = inputDateFromTrip(trip.date);
    $("inspectionVendor").value = trip.vendor || "";
    if (!$("inspectionActiveJobId")?.value) {
      $("inspectionCustomer").value = trip.customer || "";
      $("inspectionReportingVendor").value = trip.vendor || "";
      $("inspectionProject").value = trip.projectNumber || "";
      $("inspectionActivity").value = trip.purpose || "Inspection";
    }
    $("inspectionStartTime").value = trip.startTime || "";
    $("inspectionEndTime").value = trip.endTime || "";
    $("inspectionHours").value = calculateHours(trip.startTime, trip.endTime);
    renderSelectedTripSummary(tripSnapshot(trip));
    renderLinkedTripPhotos(trip);
  }

  function collectFollowUps() {
    return [...document.querySelectorAll("#followUpEditorList .followup-editor")]
      .map((row) => ({
        id: row.dataset.followupId || makeId("followup"),
        action: row.querySelector(".followup-action")?.value.trim() || "",
        responsibleParty: row.querySelector(".followup-owner")?.value.trim() || "",
        dueDate: row.querySelector(".followup-due")?.value || "",
        status: row.querySelector(".followup-status")?.value === "Closed" ? "Closed" : "Open"
      }))
      .filter((item) => item.action);
  }

  function setFormValueIfBlank(id, value) {
    const input = $(id);
    if (!input || input.value.trim() || !String(value || "").trim()) return;
    input.value = String(value);
  }

  function applyFacilityProfileToInspectionForm(profile) {
    if (!profile) return;
    setFormValueIfBlank("inspectionReportingVendor", profile.reportingVendor);
    setFormValueIfBlank("inspectionVendor", profile.normalInspectionLocation || profile.shopFacilityName);
    setFormValueIfBlank("inspectionObservations", profile.inspectionDefaults);
    setFormValueIfBlank("inspectionSummary", profile.reportDefaults);
    scheduleInspectionAutosave();
  }

  function assignPendingInspectionToJob() {
    const state = readState();
    const activeJob = activeJobById($("pendingActiveJobSelect")?.value, state);
    if (!activeJob) {
      window.alert("Choose the Active Job to assign.");
      return;
    }
    const existing = state.settings.inspections.find((inspection) => inspection.id === editingInspectionId) || null;
    $("inspectionActiveJobId").value = activeJob.aj;
    setFormValueIfBlank("inspectionProject", activeJob.inspectionNo);
    setFormValueIfBlank("inspectionCustomer", activeJob.client || activeJob.workbookClient);
    setFormValueIfBlank("inspectionReportingVendor", activeJob.reportingVendor);
    setFormValueIfBlank("inspectionProjectName", activeJob.projectName);
    setFormValueIfBlank("inspectionPoJob", activeJob.sbOrder);
    setFormValueIfBlank("inspectionVendorJob", activeJob.vendorJobs);
    const profileId = existing?.facilityProfileId || activeJob.defaultFacilityProfileId || "";
    if ($("inspectionFacilityProfileId") && profileId) $("inspectionFacilityProfileId").value = profileId;
    applyFacilityProfileToInspectionForm(facilityProfileById(state, profileId));
    const collected = collectInspectionFromForm(existing, existing?.status || "Draft");
    const inspection = window.MileageActiveJobsManagement?.assignPendingInspectionRecord
      ? window.MileageActiveJobsManagement.assignPendingInspectionRecord(collected, activeJob, facilityProfileById(state, profileId))
      : collected;
    persistInspection(inspection);
    editingInspectionId = inspection.id;
    editingInspectionWasExisting = true;
    openInspectionForm(inspection);
    showInspectionToast(`Pending inspection assigned to ${activeJob.aj} without creating a duplicate.`);
  }

  function saveCurrentVisitToFacilityProfile() {
    const profileId = $("inspectionFacilityProfileId")?.value || "";
    if (!profileId) {
      window.alert("Choose a Facility Profile first.");
      return;
    }
    const state = readState();
    const profile = facilityProfileById(state, profileId);
    if (!profile) return;
    const location = $("inspectionVendor")?.value.trim() || "";
    const reportingVendor = $("inspectionReportingVendor")?.value.trim() || "";
    if (!window.confirm(`Permanently update Facility Profile “${profile.name || profile.shopFacilityName}” with this visit's reporting vendor and inspection location?`)) return;
    profile.reportingVendor = reportingVendor || profile.reportingVendor;
    profile.normalInspectionLocation = location || profile.normalInspectionLocation;
    profile.modifiedISO = nowISO();
    window.MileageActiveJobsManagement?.writeState(state);
    showInspectionToast("Facility Profile updated intentionally. This visit remains unchanged.");
  }

  function collectInspectionFromForm(existing = null, statusOverride = null) {
    if (!$("inspectionForm")) return null;
    const state = readState();
    const selectedTripId = $("inspectionTripId")?.value || "";
    const trip = getTripById(state, selectedTripId);
    const activeJob = activeJobById($("inspectionActiveJobId")?.value, state);
    const facilityProfileId = $("inspectionFacilityProfileId")?.value || "";
    const facilityProfile = facilityProfileById(state, facilityProfileId);
    const createdISO = existing?.createdISO || nowISO();
    const loads = collectLoads();
    const inspection = {
      id: existing?.id || editingInspectionId || makeId(),
      schemaVersion: INSPECTION_SCHEMA_VERSION,
      activeJobId: activeJob?.aj || $("inspectionActiveJobId")?.value || "",
      sbInspectionNo: activeJob?.inspectionNo || $("inspectionProject")?.value.trim() || "",
      reportingVendor: $("inspectionReportingVendor")?.value.trim() || activeJob?.reportingVendor || "",
      inspectionLocation: $("inspectionVendor")?.value.trim() || "",
      facility: facilityProfile?.shopFacilityName || activeJob?.facility || existing?.facility || "",
      facilityProfileId,
      projectName: $("inspectionProjectName")?.value.trim() || activeJob?.projectName || "",
      tripId: selectedTripId || null,
      tripSnapshot: trip ? tripSnapshot(trip) : (existing?.tripId === selectedTripId ? existing.tripSnapshot : null),
      date: $("inspectionDate")?.value || "",
      customer: $("inspectionCustomer")?.value.trim() || "",
      vendor: $("inspectionVendor")?.value.trim() || "",
      projectNumber: $("inspectionProject")?.value.trim() || "",
      purchaseOrderJob: $("inspectionPoJob")?.value.trim() || "",
      equipmentTag: $("inspectionTag")?.value.trim() || "",
      isoDrawingNumber: $("inspectionIsoNumber")?.value.trim() || "",
      vendorJobNumber: $("inspectionVendorJob")?.value.trim() || "",
      pieceSpoolNumber: $("inspectionPieceSpool")?.value.trim() || "",
      loads,
      // Keep the legacy alias so old backups and integrations still see the first load.
      vendorLoadNumber: loads[0]?.identifier || "",
      inspectionType: $("inspectionType")?.value || "Inspection",
      activities: collectInspectionActivities(),
      activity: $("inspectionActivity")?.value.trim() || "",
      status: statusOverride || $("inspectionStatus")?.value || "Draft",
      acceptanceStatus: $("inspectionAcceptance")?.value || "Not Determined",
      startTime: $("inspectionStartTime")?.value.trim() || "",
      endTime: $("inspectionEndTime")?.value.trim() || "",
      hoursOnSite: $("inspectionHours")?.value.trim() || "",
      quickNote: $("inspectionQuickNote")?.value.trim() || "",
      summary: $("inspectionSummary")?.value.trim() || "",
      observations: $("inspectionObservations")?.value.trim() || "",
      deficiencyStatus: $("inspectionDeficiencyStatus")?.value || "None",
      deficiencies: $("inspectionDeficiencies")?.value.trim() || "",
      coating: {
        system: $("coatingSystem")?.value || "",
        manufacturer: $("coatingManufacturer")?.value.trim() || "",
        environment: $("coatEnvironment")?.value || "",
        blast: $("coatBlast")?.value || "",
        profile: $("coatProfile")?.value || "",
        products: $("coatProducts")?.value || "",
        dft: $("coatDft")?.value || "",
        appearance: $("coatAppearance")?.value || "",
        vendorQc: $("coatVendorQc")?.value || "",
        profileReadings: $("profileReadings")?.value.trim() || "",
        dftReadings: $("dftReadings")?.value.trim() || ""
      },
      structural: {
        material: $("steelMaterial")?.value || "",
        welds: $("steelWelds")?.value || "",
        workmanship: $("steelWorkmanship")?.value || "",
        dimensions: $("steelDimensions")?.value || "",
        galvanizing: $("steelGalv")?.value || ""
      },
      followUps: collectFollowUps(),
      photos: collectPhotoMetadata(),
      createdISO,
      modifiedISO: nowISO(),
      handoffExportedISO: existing?.handoffExportedISO || "",
      handoffExportedModifiedISO: existing?.handoffExportedModifiedISO || ""
    };
    const reportWasGenerated = Boolean($("inspectionReportPreview")?.dataset.reportLanguage || existing?.generatedReportLanguage);
    inspection.generatedReportLanguage = reportWasGenerated ? generateReportLanguage(inspection) : "";
    return inspection;
  }

  function persistInspection(inspection, options = {}) {
    updateState((nextState) => {
      const inspections = nextState.settings.inspections;
      const index = inspections.findIndex((item) => item.id === inspection.id);
      if (index >= 0) inspections[index] = inspection;
      else inspections.push(inspection);

      nextState.settings.currentActiveJobId = inspection.activeJobId || "";
      nextState.settings.activeJobsWorkspaceVendor = inspection.inspectionLocation || inspection.reportingVendor || nextState.settings.activeJobsWorkspaceVendor || "";
      nextState.settings.activeJobsWorkspaceTripId = inspection.tripId || "__standalone__";
      nextState.settings.customers = Array.isArray(nextState.settings.customers) ? nextState.settings.customers : [];
      nextState.settings.vendors = Array.isArray(nextState.settings.vendors) ? nextState.settings.vendors : [];
      if (inspection.customer && !nextState.settings.customers.includes(inspection.customer)) nextState.settings.customers.push(inspection.customer);
      [inspection.vendor, inspection.reportingVendor].filter(Boolean).forEach((vendor) => {
        if (!nextState.settings.vendors.includes(vendor)) nextState.settings.vendors.push(vendor);
      });
      if (inspection.activeJobId && inspection.status !== "Draft") {
        const job = (nextState.activeJobs || []).find((item) => item.aj === inspection.activeJobId);
        nextState.activeJobUpdateProposals = Array.isArray(nextState.activeJobUpdateProposals) ? nextState.activeJobUpdateProposals : [];
        const openFollowUps = (inspection.followUps || []).filter((item) => item.status !== "Closed");
        const dueDates = openFollowUps.map((item) => item.dueDate).filter(Boolean).sort();
        const proposal = {
          id: `active-job-update-${inspection.id}`,
          inspectionId: inspection.id,
          activeJobId: inspection.activeJobId,
          currentStatus: job?.status || "",
          nextAction: openFollowUps.map((item) => item.action).filter(Boolean).join("; "),
          lastInspectionDate: inspection.date || "",
          lastMileageLoggerVisit: inspection.tripSnapshot?.date || (inspection.tripId ? inspection.date : ""),
          nextExpectedInspection: dueDates[0] || "",
          createdISO: nowISO()
        };
        const proposalIndex = nextState.activeJobUpdateProposals.findIndex((item) => item.id === proposal.id);
        if (proposalIndex >= 0) nextState.activeJobUpdateProposals[proposalIndex] = proposal;
        else nextState.activeJobUpdateProposals.unshift(proposal);
      }
    }, options);
  }

  function scheduleInspectionAutosave() {
    clearTimeout(inspectionAutosaveTimer);
    inspectionAutosaveTimer = setTimeout(() => saveInspectionDraft({ silent: true }), 650);
  }

  function saveInspectionDraft(options = {}) {
    if (inspectionAutosaveInProgress || !$("inspectionForm")) return false;
    const state = readState();
    const existing = state.settings.inspections.find((inspection) => inspection.id === editingInspectionId) || null;
    if (existing && existing.status !== "Draft") return false;
    const inspection = collectInspectionFromForm(existing, "Draft");
    if (!inspection?.date || !inspection.customer || !inspection.vendor || !inspection.reportingVendor || !inspection.activity) return false;

    const comparable = (record) => JSON.stringify({ ...record, modifiedISO: "" });
    if (existing && comparable(existing) === comparable(inspection)) return true;
    inspectionAutosaveInProgress = true;
    persistInspection(inspection, { coalesceBackup: true });
    inspectionAutosaveInProgress = false;
    editingInspectionWasExisting = true;
    editingInspectionId = inspection.id;
    originalPhotoIds = new Set(currentPhotos.map((photo) => photo.id));
    const status = $("inspectionAutosaveStatus");
    if (status) status.textContent = `Draft autosaved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${inspection.activeJobId ? ` for ${inspection.activeJobId}` : " as pending / unassigned"}.`;
    renderActiveJobsWorkspace();
    return true;
  }

  function saveInspectionFromForm() {
    clearTimeout(inspectionAutosaveTimer);
    const wasEditing = editingInspectionWasExisting;
    const state = readState();
    const existing = state.settings.inspections.find((inspection) => inspection.id === editingInspectionId) || null;
    const inspection = collectInspectionFromForm(existing, null);

    if (!inspection?.date || !inspection.customer || !inspection.vendor || !inspection.reportingVendor || !inspection.activity) {
      window.alert("Date, client, reporting vendor, inspection location, and activity are required.");
      return;
    }
    persistInspection(inspection);

    closeInspectionForm({ saved: true });
    showInspectionToast(wasEditing ? "Inspection updated." : "Inspection saved.");
  }

  function duplicateInspection(source) {
    const duplicate = {
      ...source,
      id: "",
      tripId: null,
      tripSnapshot: null,
      date: todayInputValue(),
      status: source.activeJobId ? "Draft" : "In Progress",
      acceptanceStatus: "Not Determined",
      startTime: "",
      endTime: "",
      hoursOnSite: "",
      photos: [],
      loads: [],
      vendorLoadNumber: "",
      followUps: (source.followUps || []).map((item) => ({
        ...item,
        id: makeId("followup"),
        status: "Open"
      })),
      createdISO: "",
      modifiedISO: "",
      handoffExportedISO: "",
      handoffExportedModifiedISO: ""
    };
    showInspectionSection(false);
    openInspectionForm(duplicate, "", { duplicate: true });
  }

  function inspectionBackupStatus(state, inspection) {
    const confirmedISO = state.backup?.lastConfirmedISO || "";
    const changedISO = inspection.modifiedISO || inspection.createdISO || "";
    if (!confirmedISO) {
      return { label: "Never backed up", className: "inspection-backup-never" };
    }
    if (changedISO && confirmedISO < changedISO) {
      return { label: "Changes not backed up", className: "inspection-backup-pending" };
    }
    return { label: "Backed up", className: "inspection-backup-current" };
  }

  function inspectionExportStatus(inspection) {
    const exportedISO = inspection.handoffExportedISO || "";
    const exportedModifiedISO = inspection.handoffExportedModifiedISO || "";
    const changedISO = inspection.modifiedISO || inspection.createdISO || "";
    if (!exportedISO) {
      return { label: "Not exported", className: "inspection-export-never", state: "never" };
    }
    if (changedISO && exportedModifiedISO !== changedISO) {
      return { label: "Changed since export", className: "inspection-export-pending", state: "outdated" };
    }
    const date = new Date(exportedISO);
    const dateLabel = Number.isNaN(date.getTime())
      ? "Export created"
      : `Exported ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return { label: dateLabel, className: "inspection-export-current", state: "current" };
  }

  function inspectionMatchesFilter(state, inspection, filter) {
    const openFollowUps = (inspection.followUps || []).some((item) => item.status !== "Closed");
    if (filter === "needs-backup") {
      return inspectionBackupStatus(state, inspection).label !== "Backed up";
    }
    if (filter === "not-exported") return inspectionExportStatus(inspection).state === "never";
    if (filter === "export-outdated") return inspectionExportStatus(inspection).state === "outdated";
    if (filter === "incomplete") return !["Complete", "Released"].includes(inspection.status);
    if (filter === "open-followups") return openFollowUps;
    return true;
  }

  function updateInspectionBatchControls(visibleInspections = []) {
    const allIds = new Set(readState().settings.inspections.map((inspection) => inspection.id));
    [...selectedInspectionIds].forEach((id) => {
      if (!allIds.has(id)) selectedInspectionIds.delete(id);
    });
    const visibleIds = visibleInspections.map((inspection) => inspection.id);
    const selectedVisibleCount = visibleIds.filter((id) => selectedInspectionIds.has(id)).length;
    const selectAll = $("selectAllVisibleInspections");
    if (selectAll) {
      selectAll.checked = Boolean(visibleIds.length && selectedVisibleCount === visibleIds.length);
      selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
      selectAll.disabled = !visibleIds.length;
    }
    const count = $("inspectionBatchCount");
    if (count) count.textContent = `${selectedInspectionIds.size} selected`;
    const exportButton = $("exportSelectedInspectionsBtn");
    const clearButton = $("clearSelectedInspectionsBtn");
    if (exportButton) exportButton.disabled = selectedInspectionIds.size === 0;
    if (clearButton) clearButton.disabled = selectedInspectionIds.size === 0;
  }

  function inspectionSpecificPhotoReferences(inspection) {
    const seenIds = new Set();
    return (Array.isArray(inspection?.photos) ? inspection.photos : [])
      .filter((photo) => photo && !photo.sourceTripId)
      .filter((photo) => {
        const id = String(photo.id || "").trim();
        if (!id) return true;
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      })
      .map((photo) => ({ ...photo }));
  }

  function photoFigureCaption(photo, figureNumber) {
    const name = String(photo?.name || "").trim();
    const caption = String(photo?.caption || "").trim();
    const detail = caption && name && caption.toLowerCase() !== name.toLowerCase()
      ? `${caption} (${name})`
      : caption || name || "Inspection photo";
    return `Figure ${figureNumber} - ${detail}`;
  }

  function buildInspectionPreviewModel(state, inspection) {
    const activeJob = activeJobsForState(state).find((job) => job.aj === inspection.activeJobId) || null;
    const trip = getTripById(state, inspection.tripId);
    const snapshot = inspection.tripSnapshot || (trip ? tripSnapshot(trip) : null);
    const photos = inspectionSpecificPhotoReferences(inspection);
    const photoNames = new Map(photos.map((photo) => [photo.id, photo.caption || photo.name || photo.id]));
    return {
      id: inspection.id,
      title: [inspection.activeJobId, inspection.inspectionLocation || inspection.vendor, displayDate(inspection.date)].filter(Boolean).join(" | "),
      facts: [
        ["Active Job / AJ number", inspection.activeJobId || "Unassigned"],
        ["S&B inspection number", inspection.sbInspectionNo || inspection.projectNumber || activeJob?.inspectionNo || ""],
        ["Client / project", [inspection.customer || activeJob?.workbookClient, inspection.projectName || activeJob?.projectName].filter(Boolean).join(" / ")],
        ["Reporting vendor", inspection.reportingVendor || activeJob?.reportingVendor || inspection.vendor || ""],
        ["Inspection location / subvendor", inspection.inspectionLocation || inspection.vendor || activeJob?.location || ""],
        ["Vendor job number", inspection.vendorJobNumber || activeJob?.vendorJobs || ""],
        ["Equipment", inspection.equipmentTag || ""],
        ["ISO drawing", inspection.isoDrawingNumber || ""],
        ["Piece / spool", inspection.pieceSpoolNumber || ""],
        ["Date", displayDate(inspection.date)],
        ["Inspection type", inspection.inspectionType || "Inspection"],
        ["Activities performed", inspectionActivities(inspection).join(" | ")],
        ["Activity", inspection.activity || ""],
        ["Status", inspection.status || "Draft"],
        ["Acceptance / release", inspection.acceptanceStatus || "Not Determined"]
      ],
      visitFacts: snapshot ? [
        ["Visit", snapshot.inProgress ? "Trip in progress" : "Linked mileage trip"],
        ["Trip date", displayDate(snapshot.date || inspection.date)],
        ["Time", [snapshot.startTime, snapshot.endTime].filter(Boolean).join(" - ")],
        ["Mileage", formatMiles(snapshot.miles)],
        ["GPS route miles", snapshot.gpsRouteMiles ? formatMiles(snapshot.gpsRouteMiles) : ""],
        ["Destination / vendor", trip?.vendor || inspection.vendor || ""],
        ["Purpose", trip?.purpose || inspection.activity || ""]
      ] : [["Visit / mileage", "Standalone inspection"]],
      narratives: [
        ["Summary", inspection.summary || ""],
        ["Quick note", inspection.quickNote || ""],
        ["Generated report language", inspection.generatedReportLanguage || ""],
        ["Observations", inspection.observations || ""],
        ["Deficiency status", inspection.deficiencyStatus || (inspection.deficiencies ? "Issue noted" : "")],
        ["Deficiency details", inspection.deficiencies || ""]
      ],
      workflowFindings: [
        ["Coating system", inspection.coating?.system],
        ["Coating manufacturer / product", inspection.coating?.manufacturer],
        ["Environmental conditions", inspection.coating?.environment],
        ["Blast / surface preparation", inspection.coating?.blast],
        ["Anchor profile", inspection.coating?.profile],
        ["Anchor-profile readings", inspection.coating?.profileReadings],
        ["Products verified", inspection.coating?.products],
        ["DFT", inspection.coating?.dft],
        ["DFT readings", inspection.coating?.dftReadings],
        ["Coating appearance", inspection.coating?.appearance],
        ["Vendor QC", inspection.coating?.vendorQc],
        ["Structural materials / identification", inspection.structural?.material],
        ["Structural weld visual condition", inspection.structural?.welds],
        ["Structural workmanship", inspection.structural?.workmanship],
        ["Structural dimensions", inspection.structural?.dimensions],
        ["Post-galvanizing condition", inspection.structural?.galvanizing]
      ].filter(([, value]) => String(value || "").trim()),
      loads: inspectionLoads(inspection).map((load) => ({
        identifier: load.identifier || "Unidentified load",
        status: load.status || "Not Recorded",
        notes: load.notes || "",
        deficiencyFollowUp: load.deficiencyFollowUp || "",
        photos: (load.photoIds || []).map((id) => photoNames.get(id) || id)
      })),
      followUps: (inspection.followUps || []).map((item) => ({
        action: item.action || "Follow-up",
        responsibleParty: item.responsibleParty || "",
        dueDate: item.dueDate ? displayDate(item.dueDate) : "",
        status: item.status || "Open"
      })),
      photos
    };
  }

  function previewFactsMarkup(facts) {
    return facts.filter(([, value]) => String(value || "").trim()).map(([label, value]) => `
      <div class="inspection-preview-fact"><small>${escapeHTML(label)}</small><span>${escapeHTML(value)}</span></div>
    `).join("");
  }

  function inspectionPreviewMarkup(model) {
    const narratives = model.narratives.filter(([, value]) => String(value || "").trim());
    return `
      <header class="inspection-preview-header">
        <div><p class="eyebrow">Read-only inspection preview</p><h2 id="inspectionPreviewTitle">${escapeHTML(model.title || "Inspection")}</h2><p class="muted">Review this record before editing or sending it to Inspection Notes.</p></div>
        <button class="button button-quiet button-small" type="button" data-close-inspection-preview>Close</button>
      </header>
      <div class="inspection-preview-body">
        <section class="inspection-preview-section"><h3>Inspection identity</h3><div class="inspection-preview-facts">${previewFactsMarkup(model.facts)}</div></section>
        <section class="inspection-preview-section"><h3>Visit / mileage context</h3><div class="inspection-preview-facts">${previewFactsMarkup(model.visitFacts)}</div></section>
        ${narratives.length ? `<section class="inspection-preview-section"><h3>Inspection notes and findings</h3><div class="inspection-preview-list">${narratives.map(([label, value]) => `<article class="inspection-preview-item"><strong>${escapeHTML(label)}</strong><p>${escapeHTML(value)}</p></article>`).join("")}</div></section>` : ""}
        ${model.workflowFindings.length ? `<section class="inspection-preview-section"><h3>Detailed inspection findings</h3><div class="inspection-preview-facts">${previewFactsMarkup(model.workflowFindings)}</div></section>` : ""}
        ${model.loads.length ? `<section class="inspection-preview-section"><h3>Vendor loads</h3><div class="inspection-preview-list">${model.loads.map((load) => `<article class="inspection-preview-item"><strong>${escapeHTML(load.identifier)} • ${escapeHTML(load.status)}</strong>${load.notes ? `<p>${escapeHTML(load.notes)}</p>` : ""}${load.deficiencyFollowUp ? `<p><strong>Deficiency / follow-up:</strong> ${escapeHTML(load.deficiencyFollowUp)}</p>` : ""}${load.photos.length ? `<p><strong>Photos:</strong> ${escapeHTML(load.photos.join(" | "))}</p>` : ""}</article>`).join("")}</div></section>` : ""}
        ${model.followUps.length ? `<section class="inspection-preview-section"><h3>Follow-ups</h3><div class="inspection-preview-list">${model.followUps.map((item) => `<article class="inspection-preview-item"><strong>${escapeHTML(item.action)} • ${escapeHTML(item.status)}</strong>${item.responsibleParty || item.dueDate ? `<p>${escapeHTML([item.responsibleParty, item.dueDate].filter(Boolean).join(" • "))}</p>` : ""}</article>`).join("")}</div></section>` : ""}
        <section class="inspection-preview-section"><h3>Inspection photos (${model.photos.length})</h3>${model.photos.length ? `<div class="inspection-preview-photos">${model.photos.map((photo, index) => `<figure class="inspection-preview-photo"><div class="inspection-photo-loading" data-preview-photo="${escapeHTML(photo.id || "")}">Loading photo…</div><figcaption>${escapeHTML(photoFigureCaption(photo, index + 1))}</figcaption>${photo.name ? `<small>Filename: ${escapeHTML(photo.name)}</small>` : ""}</figure>`).join("")}</div>` : `<p class="muted">No inspection-specific photos are attached.</p>`}</section>
      </div>
      <footer class="inspection-preview-actions">
        <button class="button button-secondary" type="button" data-preview-edit-inspection="${escapeHTML(model.id)}">Edit Inspection</button>
        <button class="button inspection-button" type="button" data-preview-export-inspection="${escapeHTML(model.id)}">Export Word Report</button>
        <button class="button button-quiet" type="button" data-close-inspection-preview>Close Preview</button>
      </footer>
    `;
  }

  async function hydrateInspectionPreviewPhotos(model) {
    inspectionPreviewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    inspectionPreviewObjectUrls = [];
    if (!window.MileageMediaStore || !model.photos.length) return;
    const stored = await window.MileageMediaStore.getAllPhotos();
    const byId = new Map(stored.map((photo) => [photo.id, photo]));
    document.querySelectorAll("#inspectionPreviewContent [data-preview-photo]").forEach((holder) => {
      const photo = byId.get(holder.dataset.previewPhoto);
      if (!photo?.blob) {
        holder.textContent = "Photo file is not available on this device.";
        return;
      }
      const url = URL.createObjectURL(photo.blob);
      inspectionPreviewObjectUrls.push(url);
      const image = document.createElement("img");
      image.src = url;
      image.alt = photo.caption || photo.name || "Inspection photo";
      holder.replaceWith(image);
    });
  }

  function closeInspectionPreview() {
    inspectionPreviewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    inspectionPreviewObjectUrls = [];
    previewInspectionId = "";
    $("inspectionPreviewOverlay")?.classList.add("hidden");
  }

  async function openInspectionPreview(inspectionId) {
    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
    const overlay = $("inspectionPreviewOverlay");
    const content = $("inspectionPreviewContent");
    if (!inspection || !overlay || !content) return;
    const model = buildInspectionPreviewModel(state, inspection);
    previewInspectionId = inspection.id;
    content.innerHTML = inspectionPreviewMarkup(model);
    overlay.classList.remove("hidden");
    overlay.scrollTop = 0;
    content.querySelector("[data-close-inspection-preview]")?.focus();
    await hydrateInspectionPreviewPhotos(model);
  }

  function renderInspectionList(state) {
    const container = $("inspectionList");
    if (!container) return;
    const query = $("inspectionSearch")?.value.trim().toLowerCase() || "";
    const filter = $("inspectionFilter")?.value || "all";
    const inspections = [...state.settings.inspections]
      .filter((inspection) => !query || inspectionSearchText(inspection).includes(query))
      .filter((inspection) => inspectionMatchesFilter(state, inspection, filter))
      .sort((a, b) => `${b.date || ""}|${b.modifiedISO || ""}`.localeCompare(`${a.date || ""}|${a.modifiedISO || ""}`));
    const resultCount = $("inspectionResultCount");
    if (resultCount) resultCount.textContent = `${inspections.length} shown`;

    if (activeView === "followups") {
      renderOpenFollowUps(inspections, container);
      updateInspectionBatchControls([]);
      return;
    }

    if (!inspections.length) {
      container.innerHTML = `<div class="inspection-empty">No inspection records match the current search.</div>`;
      updateInspectionBatchControls([]);
      return;
    }

    container.innerHTML = inspections.map((inspection) => {
      const followUps = Array.isArray(inspection.followUps) ? inspection.followUps : [];
      const openCount = followUps.filter((item) => item.status !== "Closed").length;
      const snapshot = inspection.tripSnapshot;
      const photos = Array.isArray(inspection.photos) ? inspection.photos : [];
      const loads = inspectionLoads(inspection);
      const statusClass = ["Complete", "Released"].includes(inspection.status)
        ? "inspection-pill-complete"
        : "inspection-pill-open";
      const backupStatus = inspectionBackupStatus(state, inspection);
      const exportStatus = inspectionExportStatus(inspection);
      return `
        <article class="inspection-record" data-inspection-id="${escapeHTML(inspection.id)}">
          <div class="inspection-record-heading">
            <div class="inspection-record-select">
              <input type="checkbox" data-select-inspection="${escapeHTML(inspection.id)}"${selectedInspectionIds.has(inspection.id) ? " checked" : ""} aria-label="Select this inspection">
              <div>
                <p class="eyebrow">${escapeHTML(displayDate(inspection.date))} • ${escapeHTML(inspection.inspectionType || "Inspection")}${inspection.activeJobId ? ` • ${escapeHTML(inspection.activeJobId)}` : ""}</p>
                <h3>${escapeHTML(inspection.inspectionLocation || inspection.vendor || "Facility")}${inspection.sbInspectionNo || inspection.projectNumber ? ` — ${escapeHTML(inspection.sbInspectionNo || inspection.projectNumber)}` : ""}</h3>
                <p class="muted">${escapeHTML(inspection.customer || "")}${inspection.reportingVendor ? ` • Report: ${escapeHTML(inspection.reportingVendor)}` : ""}${inspection.equipmentTag ? ` • ${escapeHTML(inspection.equipmentTag)}` : ""}${inspection.vendorJobNumber || inspection.purchaseOrderJob ? ` • ${escapeHTML(inspection.vendorJobNumber || inspection.purchaseOrderJob)}` : ""}</p>
              </div>
            </div>
            <div class="inspection-record-pills">
              <span class="pill ${backupStatus.className}">${escapeHTML(backupStatus.label)}</span>
              <span class="pill ${exportStatus.className}">${escapeHTML(exportStatus.label)}</span>
              <span class="pill ${statusClass}">${escapeHTML(inspection.status || "Pending")}</span>
            </div>
          </div>

          <div class="inspection-meta">
            <span><strong>Activity:</strong> ${escapeHTML(inspection.activity || "—")}</span>
            <span><strong>Active Job:</strong> ${escapeHTML(inspection.activeJobId || "Unassigned")}</span>
            <span><strong>Acceptance:</strong> ${escapeHTML(inspection.acceptanceStatus || "Not Determined")}</span>
            <span><strong>Hours:</strong> ${escapeHTML(inspection.hoursOnSite || "—")}</span>
            <span><strong>Mileage:</strong> ${snapshot ? (snapshot.inProgress ? "In progress" : formatMiles(snapshot.miles)) : "Standalone"}</span>
            <span><strong>Open actions:</strong> ${openCount}</span>
            <span><strong>Photos:</strong> ${photos.length}</span>
            <span><strong>Vendor loads:</strong> ${loads.length ? escapeHTML(loads.map((load) => load.identifier).filter(Boolean).join(" | ")) : "—"}</span>
          </div>

          ${loads.length ? `<div class="inspection-load-summary">${loads.map((load) => `
            <span><strong>${escapeHTML(load.identifier || "Unidentified load")}</strong> • ${escapeHTML(load.status || "Not Recorded")}${load.deficiencyFollowUp ? ` • Follow-up: ${escapeHTML(load.deficiencyFollowUp)}` : ""}</span>
          `).join("")}</div>` : ""}

          ${inspection.summary ? `<div class="inspection-summary"><strong>Summary</strong><br>${escapeHTML(inspection.summary)}</div>` : ""}
          ${inspection.quickNote ? `<div class="inspection-summary"><strong>Quick note</strong><br>${escapeHTML(inspection.quickNote)}</div>` : ""}
          ${inspection.deficiencies ? `<div class="inspection-summary"><strong>Deficiencies / exceptions</strong><br>${escapeHTML(inspection.deficiencies)}</div>` : ""}
          ${photos.length ? `<div class="inspection-photo-thumbnails">${photos.slice(0, 4).map((photo) => `
            <button type="button" data-view-photo="${escapeHTML(photo.id)}" aria-label="Open ${escapeHTML(photo.caption || photo.name || "inspection photo")}">
              <span>Photo</span>
            </button>
          `).join("")}${photos.length > 4 ? `<span class="inspection-photo-more">+${photos.length - 4} more</span>` : ""}</div>` : ""}

          ${followUps.length ? `<div class="inspection-followups">${followUps.map((item) => `
            <div class="inspection-followup ${item.status === "Closed" ? "closed" : ""}">
              <strong>${escapeHTML(item.action)}</strong><br>
              <small>${escapeHTML(item.responsibleParty || "Unassigned")}${item.dueDate ? ` • due ${escapeHTML(displayDate(item.dueDate))}` : ""} • ${escapeHTML(item.status || "Open")}</small>
            </div>
          `).join("")}</div>` : ""}

          <div class="inspection-record-actions">
            <button class="button button-secondary button-small" type="button" data-preview-inspection="${escapeHTML(inspection.id)}">Preview</button>
            <button class="button button-secondary button-small" type="button" data-edit-inspection="${escapeHTML(inspection.id)}">Edit</button>
            <button class="button button-secondary button-small" type="button" data-duplicate-inspection="${escapeHTML(inspection.id)}">Duplicate</button>
            <button class="button inspection-button button-small" type="button" data-export-inspection="${escapeHTML(inspection.id)}">Export Word Report</button>
            <button class="button button-secondary button-small" type="button" data-export-inspection-photos="${escapeHTML(inspection.id)}">Word + Photos ZIP</button>
            ${snapshot?.startLocation ? `<a class="button button-secondary button-small" href="${mapLink(snapshot.startLocation, "Trip Start")}" target="_blank" rel="noopener">Start Map</a>` : ""}
            ${snapshot?.endLocation ? `<a class="button button-secondary button-small" href="${mapLink(snapshot.endLocation, "Trip End")}" target="_blank" rel="noopener">End Map</a>` : ""}
            <button class="button button-danger-outline button-small" type="button" data-delete-inspection="${escapeHTML(inspection.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
    updateInspectionBatchControls(inspections);
    hydrateInspectionListPhotos();
  }

  async function hydrateInspectionListPhotos() {
    inspectionListObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    inspectionListObjectUrls = [];
    if (!window.MileageMediaStore) return;
    const buttons = [...document.querySelectorAll("#inspectionList [data-view-photo]")];
    await Promise.all(buttons.map(async (button) => {
      try {
        const stored = await window.MileageMediaStore.getPhoto(button.dataset.viewPhoto);
        if (!stored?.blob || !button.isConnected) return;
        const url = URL.createObjectURL(stored.blob);
        inspectionListObjectUrls.push(url);
        button.dataset.photoUrl = url;
        button.innerHTML = `<img src="${url}" alt="">`;
      } catch (error) {
        console.warn("Could not load inspection thumbnail:", error);
      }
    }));
  }

  function renderOpenFollowUps(inspections, container) {
    const rows = inspections.flatMap((inspection) => {
      const followUps = (inspection.followUps || [])
        .filter((item) => item.status !== "Closed")
        .map((item) => ({ inspection, item, kind: "Follow-up" }));
      const deficiencies = inspection.deficiencies
        ? [{
          inspection,
          kind: "Deficiency",
          item: { id: "", action: inspection.deficiencies, responsibleParty: "", dueDate: "", status: "Open" }
        }]
        : [];
      const loadExceptions = inspectionLoads(inspection)
        .filter((load) => load.deficiencyFollowUp)
        .map((load) => ({
          inspection,
          kind: `Load ${load.identifier || "exception"}`,
          item: { id: "", action: load.deficiencyFollowUp, responsibleParty: "", dueDate: "", status: "Open" }
        }));
      return [...followUps, ...deficiencies, ...loadExceptions];
    }).sort((a, b) => {
      const jobOrder = String(a.inspection.activeJobId || "Unassigned").localeCompare(String(b.inspection.activeJobId || "Unassigned"));
      return jobOrder || String(a.item.dueDate || "9999-12-31").localeCompare(String(b.item.dueDate || "9999-12-31"));
    });

    if (!rows.length) {
      container.innerHTML = `<div class="inspection-empty">No open follow-up actions match the current search.</div>`;
      return;
    }

    const groups = new Map();
    rows.forEach((row) => {
      const key = row.inspection.activeJobId || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    container.innerHTML = [...groups.entries()].map(([activeJobId, group]) => `
      <section class="inspection-followup-group">
        <div class="section-heading compact"><div><p class="eyebrow">Active Job</p><h3>${escapeHTML(activeJobId)}</h3></div><span class="pill inspection-pill-open">${group.length} OPEN</span></div>
        ${group.map(({ inspection, item, kind }) => `
      <article class="inspection-record">
        <div class="inspection-record-heading">
          <div>
            <p class="eyebrow">${escapeHTML(kind)}${item.dueDate ? ` • due ${escapeHTML(displayDate(item.dueDate))}` : " • no due date"}</p>
            <h3>${escapeHTML(item.action)}</h3>
            <p class="muted">${escapeHTML(inspection.vendor || "Facility")}${inspection.projectNumber ? ` • ${escapeHTML(inspection.projectNumber)}` : ""} • ${escapeHTML(displayDate(inspection.date))}</p>
          </div>
          <span class="pill inspection-pill-open">OPEN</span>
        </div>
        <div class="inspection-meta">
          <span><strong>Responsible:</strong> ${escapeHTML(item.responsibleParty || "Unassigned")}</span>
          <span><strong>Inspection:</strong> ${escapeHTML(inspection.inspectionType || "Inspection")}</span>
        </div>
        <div class="inspection-record-actions">
          <button class="button button-secondary button-small" type="button" data-edit-inspection="${escapeHTML(inspection.id)}">Open Inspection</button>
          ${item.id ? `<button class="button inspection-button button-small" type="button" data-close-followup="${escapeHTML(inspection.id)}|${escapeHTML(item.id)}">Mark Closed</button>` : ""}
        </div>
      </article>
        `).join("")}
      </section>
    `).join("");
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

  function photoExtension(photo) {
    const type = String(photo?.type || photo?.blob?.type || "").toLowerCase();
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/heic" || type === "image/heif") return "heic";
    const match = String(photo?.name || "").toLowerCase().match(/\.(jpe?g|png|webp|heic|heif)$/);
    if (match) return match[1] === "jpeg" ? "jpg" : match[1];
    return "jpg";
  }

  function packageBaseName(inspection) {
    return [
      "Inspection",
      inspection.date || todayInputValue(),
      inspection.vendor || "Facility",
      inspection.projectNumber || inspection.equipmentTag || "Record"
    ].map((part, index) => safeFilePart(part, index === 0 ? "Inspection" : "Record")).join("_");
  }

  function inspectionFollowUpText(inspection, status = "Open") {
    return (inspection.followUps || [])
      .filter((item) => status === "All" || (status === "Closed" ? item.status === "Closed" : item.status !== "Closed"))
      .map((item) => {
        const details = [
          item.responsibleParty ? `Owner: ${item.responsibleParty}` : "",
          item.dueDate ? `Due: ${displayDate(item.dueDate)}` : "",
          `Status: ${item.status || "Open"}`
        ].filter(Boolean).join("; ");
        return `- ${item.action || "Follow-up"}${details ? ` (${details})` : ""}`;
      })
      .join("\r\n");
  }

  function buildInspectionUpdate(inspection, photoCount) {
    const snapshot = inspection.tripSnapshot || {};
    const lines = [
      "INSPECTION UPDATE",
      "",
      `Date: ${displayDate(inspection.date)}`,
      `Active Job: ${inspection.activeJobId || "Unassigned"}`,
      `S&B Inspection Number: ${inspection.sbInspectionNo || inspection.projectNumber || "Not entered"}`,
      `Customer: ${inspection.customer || "Not entered"}`,
      `Reporting Vendor: ${inspection.reportingVendor || inspection.vendor || "Not entered"}`,
      `Inspection Location: ${inspection.inspectionLocation || inspection.vendor || "Not entered"}`,
      `Project: ${inspection.projectNumber || "Not entered"}`,
      `S&B Order / PO: ${inspection.purchaseOrderJob || "Not entered"}`,
      `Equipment Tag: ${inspection.equipmentTag || "Not entered"}`,
      `ISO Drawing: ${inspection.isoDrawingNumber || "Not entered"}`,
      `Vendor Job: ${inspection.vendorJobNumber || "Not entered"}`,
      `Piece / Spool: ${inspection.pieceSpoolNumber || "Not entered"}`,
      `Vendor Loads: ${loadIdentifiers(inspection).join(" | ") || "Not entered"}`,
      ...(inspectionLoads(inspection).length ? [
        "",
        "VENDOR LOAD DETAILS",
        loadDetailsText(inspection)
      ] : []),
      `Inspection Type: ${inspection.inspectionType || "Inspection"}`,
      `Activity: ${inspection.activity || "Not entered"}`,
      `Status: ${inspection.status || "Not entered"}`,
      `Acceptance / Release: ${inspection.acceptanceStatus || "Not Determined"}`,
      `Time: ${inspection.startTime || "Not entered"} - ${inspection.endTime || "Not entered"}`,
      `Hours On Site: ${inspection.hoursOnSite || "Not entered"}`,
      "",
      "SUMMARY",
      inspection.summary || "No summary entered.",
      "",
      "GENERATED DRAFT REPORT LANGUAGE",
      inspection.generatedReportLanguage || "Not generated.",
      "",
      "QUICK NOTE",
      inspection.quickNote || "None entered.",
      "",
      "OBSERVATIONS",
      inspection.observations || "No observations entered.",
      "",
      "DEFICIENCIES / EXCEPTIONS",
      inspection.deficiencies || "None entered.",
      "",
      "OPEN FOLLOW-UPS",
      inspectionFollowUpText(inspection, "Open") || "None.",
      "",
      "RECORD DETAILS",
      `Photos: ${photoCount}`,
      `Mileage: ${snapshot.miles === undefined || snapshot.miles === null ? "Standalone inspection" : `${Number(snapshot.miles).toFixed(1)} miles`}`,
      `GPS Route Miles: ${snapshot.gpsRouteMiles === undefined || snapshot.gpsRouteMiles === null ? "Not recorded" : Number(snapshot.gpsRouteMiles).toFixed(1)}`,
      `STA Generated: ${snapshot.staGenerated ? "Yes" : "No"}`,
      `STA Filename: ${snapshot.staFileName || "Not recorded"}`,
      "",
      `Generated by Mileage Logger on ${new Date().toLocaleString()}`
    ];
    return lines.join("\r\n");
  }

  function buildInspectionDataCsv(inspection, photoCount) {
    const snapshot = inspection.tripSnapshot || {};
    const header = [
      "Date", "Active Job", "S&B Inspection Number", "Customer", "Reporting Vendor", "Inspection Location", "Project Name", "Project Number", "S&B Order / PO", "Equipment Tag", "ISO Drawing", "Vendor Job", "Piece / Spool", "Vendor Load #",
      "Inspection Type", "Activities Performed", "Activity", "Status", "Acceptance / Release", "Start Time", "End Time",
      "Hours On Site", "Odometer Miles", "GPS Miles", "STA Generated", "STA Filename", "Photo Count",
      "Quick Note", "Summary", "Generated Report Language", "Observations", "Deficiencies / Exceptions", "Open Follow-ups", "Closed Follow-ups",
      "Created", "Modified", "Vendor Load Details"
    ];
    const row = [
      displayDate(inspection.date), inspection.activeJobId, inspection.sbInspectionNo, inspection.customer,
      inspection.reportingVendor, inspection.inspectionLocation || inspection.vendor, inspection.projectName, inspection.projectNumber,
      inspection.purchaseOrderJob, inspection.equipmentTag, inspection.isoDrawingNumber, inspection.vendorJobNumber,
      inspection.pieceSpoolNumber, loadIdentifiers(inspection).join(" | "), inspection.inspectionType, inspectionActivities(inspection).join(" | "), inspection.activity,
      inspection.status, inspection.acceptanceStatus, inspection.startTime, inspection.endTime,
      inspection.hoursOnSite, snapshot.miles ?? "", snapshot.gpsRouteMiles ?? "",
      snapshot.staGenerated ? "Yes" : "No", snapshot.staFileName || "", photoCount,
      inspection.quickNote, inspection.summary, inspection.generatedReportLanguage, inspection.observations, inspection.deficiencies,
      inspectionFollowUpText(inspection, "Open"), inspectionFollowUpText(inspection, "Closed"),
      formatDateTime(inspection.createdISO), formatDateTime(inspection.modifiedISO), loadDetailsText(inspection)
    ];
    return [header, row].map((values) => values.map(csvEscape).join(",")).join("\r\n");
  }

  function handoffRecordKey(inspection) {
    return [
      inspection.projectNumber || "No Project",
      inspection.date || todayInputValue(),
      inspection.vendor || "No Vendor"
    ].join(" | ");
  }

  function photoExtractedText(photo) {
    return String(
      photo.extractedText
      || photo.ocrText
      || photo.transcript
      || photo.handwrittenText
      || ""
    ).trim();
  }

  function buildPhotoTextFile(inspection, photos) {
    const lines = [
      "PHOTO NOTES AND EXTRACTED TEXT",
      "",
      `Record key: ${handoffRecordKey(inspection)}`,
      ""
    ];
    if (!photos.length) {
      lines.push("No photos were attached to this inspection.");
      return lines.join("\r\n");
    }
    photos.forEach((photo, index) => {
      const extractedText = photoExtractedText(photo);
      lines.push(
        `PHOTO ${index + 1}`,
        `File: ${photo.packagePath}`,
        `Caption: ${photo.caption || "No caption entered."}`,
        "Extracted handwritten text:",
        extractedText || "No extracted text is stored yet. Review the original photo when summarizing.",
        ""
      );
    });
    return lines.join("\r\n");
  }

  function buildHandoffReadme(inspection, baseName) {
    return [
      "MILEAGE LOGGER INSPECTION HANDOFF",
      "",
      `Record key: ${handoffRecordKey(inspection)}`,
      "",
      "Purpose",
      "This package combines the Mileage Logger trip and inspection record for use with Summarize Inspection Notes.",
      "",
      "How to use",
      "1. Save this complete ZIP in OneDrive > Inspection Handoffs.",
      "2. Give the complete ZIP to the Summarize Inspection Notes work folder.",
      "3. Match other notes and transcripts using the project number, inspection date, and vendor.",
      "4. Keep the original ZIP as the source record.",
      "",
      "Important files",
      `${baseName}_Handoff.json - structured record for reliable merging`,
      `${baseName}_Editable_Report.docx - editable inspection report`,
      `${baseName}_Update.txt - readable inspection update`,
      `${baseName}_Photo_Text.txt - captions and any stored extracted text`,
      "Photos folder - original photo files",
      "",
      `Created: ${new Date().toLocaleString()}`
    ].join("\r\n");
  }

  function buildInspectionHandoffJson(inspection, photos) {
    const state = readState();
    const linkedTrip = getTripById(state, inspection.tripId);
    const snapshot = inspection.tripSnapshot || null;
    const photoRecords = photos.map((photo) => ({
      id: photo.id || "",
      filename: photo.packagePath,
      originalName: photo.name || "",
      caption: photo.caption || "",
      createdISO: photo.createdISO || "",
      sourceTripId: photo.sourceTripId || "",
      extractedText: photoExtractedText(photo)
    }));
    const trip = linkedTrip ? {
      id: linkedTrip.id,
      date: linkedTrip.date || "",
      startISO: linkedTrip.startISO || "",
      endISO: linkedTrip.endISO || "",
      startTime: linkedTrip.startTime || "",
      endTime: linkedTrip.endTime || "",
      customer: linkedTrip.customer || "",
      vendor: linkedTrip.vendor || "",
      projectNumber: linkedTrip.projectNumber || "",
      purpose: linkedTrip.purpose || "",
      notes: linkedTrip.notes || "",
      startOdometer: linkedTrip.startOdometer ?? "",
      endOdometer: linkedTrip.endOdometer ?? "",
      miles: linkedTrip.miles ?? "",
      gpsRouteMiles: linkedTrip.gpsRouteMiles ?? "",
      startLocation: linkedTrip.startLocation || null,
      endLocation: linkedTrip.endLocation || null,
      staGenerated: Boolean(linkedTrip.staGenerated),
      staFileName: linkedTrip.staFileName || ""
    } : snapshot;
    return JSON.stringify({
      schema: "mileage-logger-inspection-handoff",
      schemaVersion: 1,
      generatedISO: new Date().toISOString(),
      recordKey: handoffRecordKey(inspection),
      matching: {
        activeJobId: inspection.activeJobId || "",
        sbInspectionNo: inspection.sbInspectionNo || "",
        projectNumber: inspection.projectNumber || "",
        inspectionDate: inspection.date || "",
        reportingVendor: inspection.reportingVendor || inspection.vendor || "",
        inspectionLocation: inspection.inspectionLocation || inspection.vendor || ""
      },
      inspection: {
        ...inspection,
        photos: photoRecords
      },
      trip,
      notes: {
        quickNote: inspection.quickNote || "",
        summary: inspection.summary || "",
        generatedReportLanguage: inspection.generatedReportLanguage || "",
        observations: inspection.observations || "",
        deficiencies: inspection.deficiencies || "",
        openFollowUps: inspectionFollowUpText(inspection, "Open"),
        closedFollowUps: inspectionFollowUpText(inspection, "Closed"),
        photoText: photoRecords.map((photo) => ({
          filename: photo.filename,
          caption: photo.caption,
          extractedText: photo.extractedText
        }))
      },
      sta: {
        generated: Boolean((trip || snapshot)?.staGenerated),
        filename: (trip || snapshot)?.staFileName || ""
      }
    }, null, 2);
  }

  function buildPhotoIndexHtml(inspection, photos) {
    const cards = photos.length
      ? photos.map((photo, index) => `
        <article class="photo">
          <img src="${escapeHTML(photo.packagePath)}" alt="${escapeHTML(photo.caption || photo.name || `Inspection photo ${index + 1}`)}">
          <div>
            <h2>Photo ${index + 1}</h2>
            <p><strong>Caption:</strong> ${escapeHTML(photo.caption || "No caption entered.")}</p>
            <p><strong>Original name:</strong> ${escapeHTML(photo.name || "Inspection photo")}</p>
          </div>
        </article>
      `).join("")
      : "<p>No photographs were attached to this inspection.</p>";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHTML(packageBaseName(inspection))} Photo Index</title>
  <style>
    body{font-family:Arial,sans-serif;color:#172033;background:#f4f6f8;margin:0;padding:24px}
    main{max-width:1000px;margin:auto}.header,.photo{background:white;border:1px solid #d9e0e8;border-radius:12px;padding:20px;margin-bottom:20px}
    h1,h2{margin-top:0}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
    .photo{display:grid;grid-template-columns:minmax(240px,2fr) minmax(180px,1fr);gap:20px;align-items:start}
    img{display:block;width:100%;height:auto;border-radius:8px}@media(max-width:700px){.photo{grid-template-columns:1fr}}
  </style>
</head>
<body>
<main>
  <section class="header">
    <h1>Inspection Photo Index</h1>
    <div class="meta">
      <span><strong>Date:</strong> ${escapeHTML(displayDate(inspection.date))}</span>
      <span><strong>Customer:</strong> ${escapeHTML(inspection.customer || "Not entered")}</span>
      <span><strong>Vendor:</strong> ${escapeHTML(inspection.vendor || "Not entered")}</span>
      <span><strong>Project:</strong> ${escapeHTML(inspection.projectNumber || "Not entered")}</span>
      <span><strong>Activity:</strong> ${escapeHTML(inspection.activity || "Not entered")}</span>
      <span><strong>Photos:</strong> ${photos.length}</span>
    </div>
  </section>
  ${cards}
</main>
</body>
</html>`;
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function wordParagraph(text, style = "", options = {}) {
    const paragraphProperties = [
      style ? `<w:pStyle w:val="${style}"/>` : "",
      options.center ? '<w:jc w:val="center"/>' : "",
      options.pageBreakBefore ? '<w:pageBreakBefore/>' : "",
      options.keepNext ? '<w:keepNext/>' : ""
    ].filter(Boolean).join("");
    const lines = String(text ?? "").split(/\r?\n/);
    const runs = lines.map((line, index) => {
      const breakTag = index ? '<w:br/>' : "";
      return `<w:r>${options.bold ? "<w:rPr><w:b/></w:rPr>" : ""}${breakTag}<w:t xml:space="preserve">${xmlEscape(line || " ")}</w:t></w:r>`;
    }).join("");
    return `<w:p>${paragraphProperties ? `<w:pPr>${paragraphProperties}</w:pPr>` : ""}${runs}</w:p>`;
  }

  function wordTable(rows, widths, headerRows = 0) {
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
    const tableRows = rows.map((row, rowIndex) => {
      const cells = row.map((value, cellIndex) => {
        const fill = rowIndex < headerRows || (widths.length === 4 && cellIndex % 2 === 0) ? "F2F4F7" : "";
        const bold = rowIndex < headerRows || (widths.length === 4 && cellIndex % 2 === 0);
        return `<w:tc><w:tcPr><w:tcW w:w="${widths[cellIndex]}" w:type="dxa"/>${fill ? `<w:shd w:fill="${fill}"/>` : ""}<w:vAlign w:val="center"/></w:tcPr>${wordParagraph(value || " ", "", { bold })}</w:tc>`;
      }).join("");
      return `<w:tr>${rowIndex < headerRows ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells}</w:tr>`;
    }).join("");
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="${totalWidth}" w:type="dxa"/>
        <w:tblInd w:w="120" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:color="D9E0E8"/>
          <w:left w:val="single" w:sz="4" w:color="D9E0E8"/>
          <w:bottom w:val="single" w:sz="4" w:color="D9E0E8"/>
          <w:right w:val="single" w:sz="4" w:color="D9E0E8"/>
          <w:insideH w:val="single" w:sz="4" w:color="D9E0E8"/>
          <w:insideV w:val="single" w:sz="4" w:color="D9E0E8"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>${grid}</w:tblGrid>
      ${tableRows}
    </w:tbl>`;
  }

  function wordImageParagraph(photo, relationshipId, drawingId, mediaName, options = {}) {
    const maxWidth = Number(options.maxWidth) || 6.2;
    const maxHeight = Number(options.maxHeight) || 7.0;
    const rotated = ["left", "right"].includes(photo.reportRotation);
    const sourceWidth = rotated ? (Number(photo.height) || 900) : (Number(photo.width) || 1200);
    const sourceHeight = rotated ? (Number(photo.width) || 1200) : (Number(photo.height) || 900);
    const rotation = photo.reportRotation === "right" ? 5400000 : (photo.reportRotation === "left" ? 16200000 : 0);
    const fillFrame = Boolean(options.fillFrame);
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    const width = fillFrame ? maxWidth : Math.max(1, sourceWidth * scale);
    const height = fillFrame ? maxHeight : Math.max(1, sourceHeight * scale);
    let crop = "";
    if (fillFrame) {
      const sourceAspect = sourceWidth / sourceHeight;
      const frameAspect = maxWidth / maxHeight;
      if (sourceAspect > frameAspect) {
        const side = Math.round(((1 - frameAspect / sourceAspect) / 2) * 100000);
        crop = `<a:srcRect l="${side}" r="${side}"/>`;
      } else if (sourceAspect < frameAspect) {
        const edge = Math.round(((1 - sourceAspect / frameAspect) / 2) * 100000);
        crop = `<a:srcRect t="${edge}" b="${edge}"/>`;
      }
    }
    const cx = Math.round(width * 914400);
    const cy = Math.round(height * 914400);
    const description = xmlEscape(photo.caption || photo.name || `Inspection photo ${drawingId}`);
    return `<w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${cx}" cy="${cy}"/>
          <wp:docPr id="${drawingId}" name="${xmlEscape(mediaName)}" descr="${description}"/>
          <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr><pic:cNvPr id="0" name="${xmlEscape(mediaName)}" descr="${description}"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill><a:blip r:embed="${relationshipId}"/>${crop}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                <pic:spPr><a:xfrm${rotation ? ` rot="${rotation}"` : ""}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing></w:r>
    </w:p>`;
  }

  function parseWordXml(bytes, partName) {
    const xml = window.fflate.strFromU8(bytes);
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const parserError = document.getElementsByTagName("parsererror")[0];
    if (parserError) throw new Error(`The S&B template contains invalid XML in ${partName}.`);
    return document;
  }

  function serializeWordXml(document) {
    return window.fflate.strToU8(new XMLSerializer().serializeToString(document));
  }

  function wordElements(parent, localName) {
    return Array.from(parent.getElementsByTagNameNS(WORD_NS, localName));
  }

  function wordNodeText(parent) {
    return wordElements(parent, "t").map((node) => node.textContent || "").join("");
  }

  function setWordParagraphText(paragraph, value) {
    const document = paragraph.ownerDocument;
    const firstRun = wordElements(paragraph, "r")[0];
    const runProperties = firstRun ? wordElements(firstRun, "rPr")[0]?.cloneNode(true) : null;
    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "pPr")) {
        paragraph.removeChild(node);
      }
    });
    String(value ?? "").split(/\r?\n/).forEach((line, index) => {
      const run = document.createElementNS(WORD_NS, "w:r");
      if (runProperties) run.appendChild(runProperties.cloneNode(true));
      if (index) run.appendChild(document.createElementNS(WORD_NS, "w:br"));
      const text = document.createElementNS(WORD_NS, "w:t");
      text.setAttributeNS(XML_NS, "xml:space", "preserve");
      text.textContent = line || " ";
      run.appendChild(text);
      paragraph.appendChild(run);
    });
  }

  function tableRows(table) {
    return Array.from(table.childNodes).filter(
      (node) => node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "tr"
    );
  }

  function rowCells(row) {
    return Array.from(row.childNodes).filter(
      (node) => node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "tc"
    );
  }

  function ensurePhotoTableRows(table, requiredRows) {
    const rows = tableRows(table);
    if (!rows.length) throw new Error("The S&B template photo table has no rows.");
    while (tableRows(table).length < requiredRows) {
      table.appendChild(rows[rows.length - 1].cloneNode(true));
    }
    tableRows(table).forEach((row) => {
      let properties = Array.from(row.childNodes).find(
        (node) => node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "trPr"
      );
      if (!properties) {
        properties = row.ownerDocument.createElementNS(WORD_NS, "w:trPr");
        row.insertBefore(properties, row.firstChild);
      }
      if (!wordElements(properties, "cantSplit").length) {
        properties.appendChild(row.ownerDocument.createElementNS(WORD_NS, "w:cantSplit"));
      }
    });
  }

  function setWordCellText(table, rowIndex, cellIndex, value) {
    const row = tableRows(table)[rowIndex];
    const cell = row ? rowCells(row)[cellIndex] : null;
    if (!cell) return;
    let paragraph = Array.from(cell.childNodes).find(
      (node) => node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "p"
    );
    if (!paragraph) {
      paragraph = cell.ownerDocument.createElementNS(WORD_NS, "w:p");
      cell.appendChild(paragraph);
    }
    setWordParagraphText(paragraph, value || " ");
  }

  function setHeaderLabelValue(table, rowIndex, cellIndex, label, value) {
    setWordCellText(table, rowIndex, cellIndex, `${label}${value ? ` ${value}` : " "}`);
  }

  function normalizedWordText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function hasWordAncestor(element, localName) {
    let parent = element?.parentElement || null;
    while (parent) {
      if (parent.namespaceURI === WORD_NS && parent.localName === localName) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function findWordParagraph(document, label) {
    const expected = normalizedWordText(label);
    return wordElements(document, "p").find(
      (paragraph) => (
        !hasWordAncestor(paragraph, "tc")
        && normalizedWordText(wordNodeText(paragraph)) === expected
      )
    ) || null;
  }

  function nextWordParagraph(paragraph) {
    let node = paragraph?.nextSibling || null;
    while (node) {
      if (node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "p") return node;
      node = node.nextSibling;
    }
    return null;
  }

  function setParagraphAfterLabel(document, label, value) {
    if (!value) return;
    const labelParagraph = findWordParagraph(document, label);
    const valueParagraph = nextWordParagraph(labelParagraph);
    if (valueParagraph) setWordParagraphText(valueParagraph, value);
  }

  function setLabeledParagraphValue(document, label, value) {
    if (!value) return;
    const paragraph = findWordParagraph(document, label);
    if (paragraph) setWordParagraphText(paragraph, `${label} ${value}`);
  }

  function importWordFragment(document, xml) {
    const wrapper = new DOMParser().parseFromString(
      `<root xmlns:w="${WORD_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${xml}</root>`,
      "application/xml"
    );
    const parserError = wrapper.getElementsByTagName("parsererror")[0];
    if (parserError) throw new Error("The S&B photo layout could not be created.");
    return document.importNode(wrapper.documentElement.firstElementChild, true);
  }

  function setPhotoCell(table, rowIndex, cellIndex, photo, relationshipId, drawingId, mediaName, figureNumber) {
    const row = tableRows(table)[rowIndex];
    const cell = row ? rowCells(row)[cellIndex] : null;
    if (!cell) return;
    Array.from(cell.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "tcPr")) {
        cell.removeChild(node);
      }
    });
    const imageParagraph = importWordFragment(
      cell.ownerDocument,
      wordImageParagraph(photo, relationshipId, drawingId, mediaName, {
        maxWidth: 3.65,
        maxHeight: 2.25,
        fillFrame: photo.reportLayout !== "fit"
      })
    );
    const caption = importWordFragment(
      cell.ownerDocument,
      wordParagraph(
        photoFigureCaption(photo, figureNumber),
        "",
        { center: true }
      )
    );
    cell.appendChild(imageParagraph);
    cell.appendChild(caption);
  }

  function setUnsupportedPhotoCell(table, rowIndex, cellIndex, photo, figureNumber) {
    const row = tableRows(table)[rowIndex];
    const cell = row ? rowCells(row)[cellIndex] : null;
    if (!cell) return;
    Array.from(cell.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "tcPr")) {
        cell.removeChild(node);
      }
    });
    cell.appendChild(importWordFragment(
      cell.ownerDocument,
      wordParagraph("Image retained in the handoff Photos folder; this format cannot be embedded in Word.", "", { center: true })
    ));
    cell.appendChild(importWordFragment(
      cell.ownerDocument,
      wordParagraph(photoFigureCaption(photo, figureNumber), "", { center: true })
    ));
  }

  function setEmptyPhotoCell(table, rowIndex, cellIndex, figureNumber) {
    const row = tableRows(table)[rowIndex];
    const cell = row ? rowCells(row)[cellIndex] : null;
    if (!cell) return;
    Array.from(cell.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "tcPr")) {
        cell.removeChild(node);
      }
    });
    cell.appendChild(
      importWordFragment(
        cell.ownerDocument,
        wordParagraph(`Figure ${figureNumber} -`, "", { center: false })
      )
    );
  }

  function clearPhotoCell(table, rowIndex, cellIndex) {
    const row = tableRows(table)[rowIndex];
    const cell = row ? rowCells(row)[cellIndex] : null;
    if (!cell) return;
    Array.from(cell.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "tcPr")) {
        cell.removeChild(node);
      }
    });
    cell.appendChild(importWordFragment(cell.ownerDocument, wordParagraph(" ")));
  }

  function nextRelationshipId(relationshipsDocument) {
    const used = Array.from(relationshipsDocument.getElementsByTagNameNS(REL_NS, "Relationship"))
      .map((relationship) => String(relationship.getAttribute("Id") || ""))
      .map((id) => Number(id.replace(/^rId/i, "")))
      .filter(Number.isFinite);
    return Math.max(0, ...used) + 1;
  }

  function ensureWordImageContentType(contentTypesDocument, extension) {
    const normalized = extension === "jpeg" ? "jpg" : extension;
    const existing = Array.from(contentTypesDocument.getElementsByTagNameNS(CONTENT_TYPES_NS, "Default"))
      .some((item) => String(item.getAttribute("Extension") || "").toLowerCase() === normalized);
    if (existing) return;
    const entry = contentTypesDocument.createElementNS(CONTENT_TYPES_NS, "Default");
    entry.setAttribute("Extension", normalized);
    entry.setAttribute("ContentType", normalized === "png" ? "image/png" : "image/jpeg");
    contentTypesDocument.documentElement.appendChild(entry);
  }

  async function buildSAndBInspectionDocx(templateRecord, inspection, photos, outputFilename) {
    if (!window.fflate) throw new Error("The Word document component is unavailable.");
    const files = window.fflate.unzipSync(new Uint8Array(templateRecord.bytes));
    validateInspectionReportTemplateBytes(new Uint8Array(templateRecord.bytes));

    const documentXml = parseWordXml(files["word/document.xml"], "word/document.xml");
    const headerXml = parseWordXml(files["word/header1.xml"], "word/header1.xml");
    const footerXml = parseWordXml(files["word/footer1.xml"], "word/footer1.xml");
    const relationshipsXml = parseWordXml(
      files["word/_rels/document.xml.rels"],
      "word/_rels/document.xml.rels"
    );
    const contentTypesXml = parseWordXml(files["[Content_Types].xml"], "[Content_Types].xml");

    const headerTable = wordElements(headerXml, "tbl")[0];
    const activeJob = activeJobById(inspection.activeJobId);
    const reportLanguage = reportTextWithoutDeficiency(
      inspection.generatedReportLanguage || inspection.summary || inspection.activity || "",
      inspection.deficiencies
    );
    if (!headerTable) throw new Error("The S&B template header table is missing.");
    setHeaderLabelValue(headerTable, 1, 0, "CLIENT:", inspection.customer || "");
    setHeaderLabelValue(headerTable, 1, 1, "CLIENT PROJECT:", inspection.projectName || activeJob?.projectName || "");
    setHeaderLabelValue(headerTable, 2, 0, "CLIENT PROJECT NUMBER:", activeJob?.clientProjectNo || "");
    setHeaderLabelValue(headerTable, 2, 1, "CLIENT PO TO S&B INSPECTION:", "");
    setHeaderLabelValue(headerTable, 3, 0, "CLIENT PO TO VENDOR:", inspection.vendorJobNumber || inspection.purchaseOrderJob || "");
    setHeaderLabelValue(headerTable, 3, 1, "S&B INSPECTION JOB:", inspection.sbInspectionNo || inspection.projectNumber || "");
    setHeaderLabelValue(headerTable, 4, 0, "REPORT NUMBER:", "");
    setHeaderLabelValue(headerTable, 4, 1, "DATE OF REPORT:", displayDate(inspection.date));

    const tables = wordElements(documentXml, "tbl");
    const vendorTable = tables[0];
    const photoTable = tables[2];
    if (!vendorTable || !photoTable) throw new Error("The S&B template report tables are missing.");
    const snapshot = inspection.tripSnapshot || {};
    setWordCellText(vendorTable, 0, 1, inspection.reportingVendor || inspection.vendor || "");
    setWordCellText(vendorTable, 4, 1, inspection.vendorJobNumber || inspection.purchaseOrderJob || "");
    setWordCellText(vendorTable, 7, 1, displayDate(inspection.date));
    setWordCellText(vendorTable, 8, 1, snapshot.staFileName || "");
    setWordCellText(vendorTable, 7, 3, inspection.activity || "");
    setWordCellText(vendorTable, 8, 3, inspection.equipmentTag || "");

    const sections = reportSectionText(inspection);
    setParagraphAfterLabel(documentXml, "DESCRIPTION:", sections.description || reportLanguage);
    setParagraphAfterLabel(documentXml, "ACTION ITEMS:", sections.actionItems);
    setParagraphAfterLabel(documentXml, "INSPECTION/AUDIT:", sections.inspectionAudit);
    setLabeledParagraphValue(documentXml, "Shop Inspection:", sections.shopInspection);
    setLabeledParagraphValue(documentXml, "NDE Review:", sections.ndeReview);
    setLabeledParagraphValue(documentXml, "Coating Inspection:", sections.coatingInspection);
    setLabeledParagraphValue(documentXml, "Inspection Release:", sections.inspectionRelease);

    const relationshipRoot = relationshipsXml.documentElement;
    let relationshipNumber = nextRelationshipId(relationshipsXml);
    const requiredPhotoRows = Math.max(2, Math.ceil(photos.length / 2));
    ensurePhotoTableRows(photoTable, requiredPhotoRows);
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      if (!["png", "jpg", "jpeg"].includes(photoExtension(photo))) {
        setUnsupportedPhotoCell(photoTable, Math.floor(index / 2), index % 2, photo, index + 1);
        continue;
      }
      const extension = photoExtension(photo) === "jpeg" ? "jpg" : photoExtension(photo);
      ensureWordImageContentType(contentTypesXml, extension);
      const mediaName = `sb-inspection-photo-${index + 1}.${extension}`;
      const relationshipId = `rId${relationshipNumber}`;
      relationshipNumber += 1;
      const relationship = relationshipsXml.createElementNS(REL_NS, "Relationship");
      relationship.setAttribute("Id", relationshipId);
      relationship.setAttribute(
        "Type",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
      );
      relationship.setAttribute("Target", `media/${mediaName}`);
      relationshipRoot.appendChild(relationship);
      files[`word/media/${mediaName}`] = new Uint8Array(await photo.blob.arrayBuffer());
      setPhotoCell(
        photoTable,
        Math.floor(index / 2),
        index % 2,
        photo,
        relationshipId,
        100 + index,
        mediaName,
        index + 1
      );
    }
    for (let index = photos.length; index < requiredPhotoRows * 2; index += 1) {
      if (index < 4) {
        setEmptyPhotoCell(photoTable, Math.floor(index / 2), index % 2, index + 1);
      } else {
        clearPhotoCell(photoTable, Math.floor(index / 2), index % 2);
      }
    }

    wordElements(footerXml, "t").forEach((textNode) => {
      const text = String(textNode.textContent || "");
      if (/\.docx/i.test(text)) textNode.textContent = outputFilename;
    });

    files["word/document.xml"] = serializeWordXml(documentXml);
    files["word/header1.xml"] = serializeWordXml(headerXml);
    files["word/footer1.xml"] = serializeWordXml(footerXml);
    files["word/_rels/document.xml.rels"] = serializeWordXml(relationshipsXml);
    files["[Content_Types].xml"] = serializeWordXml(contentTypesXml);
    return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
  }

  async function buildInspectionDocx(inspection, photos) {
    if (!window.fflate) throw new Error("The Word document component is unavailable.");
    const snapshot = inspection.tripSnapshot || {};
    const now = new Date().toISOString();
    const metadata = [
      ["Date", displayDate(inspection.date), "Active Job", inspection.activeJobId || "Unassigned"],
      ["Customer", inspection.customer || "Not entered", "S&B Inspection #", inspection.sbInspectionNo || inspection.projectNumber || "Not entered"],
      ["Reporting Vendor", inspection.reportingVendor || inspection.vendor || "Not entered", "Inspection Location", inspection.inspectionLocation || inspection.vendor || "Not entered"],
      ["S&B Order / PO", inspection.purchaseOrderJob || "Not entered", "Equipment Tag", inspection.equipmentTag || "Not entered"],
      ["ISO Drawing", inspection.isoDrawingNumber || "Not entered", "Vendor Job", inspection.vendorJobNumber || "Not entered"],
      ["Vendor Loads", loadIdentifiers(inspection).join(" | ") || "Not entered", "Load Count", String(inspectionLoads(inspection).length)],
      ["Inspection Type", inspection.inspectionType || "Inspection", "Activities", inspectionActivities(inspection).join(" | ") || "Not entered"],
      ["Work Summary", inspection.activity || "Not entered", "Status", inspection.status || "Draft"],
      ["Status", inspection.status || "Not entered", "Acceptance / Release", inspection.acceptanceStatus || "Not Determined"],
      ["Start Time", inspection.startTime || "Not entered", "End Time", inspection.endTime || "Not entered"],
      ["Hours On Site", inspection.hoursOnSite || "Not entered", "Attached Photos", String(photos.length)],
      ["Mileage", snapshot.miles === undefined || snapshot.miles === null ? "Standalone inspection" : `${Number(snapshot.miles).toFixed(1)} miles`, "GPS Route Miles", snapshot.gpsRouteMiles === undefined || snapshot.gpsRouteMiles === null ? "Not recorded" : Number(snapshot.gpsRouteMiles).toFixed(1)],
      ["STA Generated", snapshot.staGenerated ? "Yes" : "No", "STA Filename", snapshot.staFileName || "Not recorded"]
    ];
    const followUps = inspection.followUps || [];
    const followUpRows = [
      ["Action", "Responsible Party", "Due Date", "Status"],
      ...followUps.map((item) => [
        item.action || "Follow-up",
        item.responsibleParty || "Not assigned",
        item.dueDate ? displayDate(item.dueDate) : "Not entered",
        item.status || "Open"
      ])
    ];

    const embeddedPhotos = photos.filter((photo) => ["png", "jpg", "jpeg"].includes(photoExtension(photo)));
    const summaryText = reportTextWithoutDeficiency(inspection.summary, inspection.deficiencies);
    const reportLanguage = reportTextWithoutDeficiency(inspection.generatedReportLanguage, inspection.deficiencies);
    const quickNoteText = reportTextWithoutDeficiency(inspection.quickNote, inspection.deficiencies);
    const observationsText = reportTextWithoutDeficiency(inspection.observations, inspection.deficiencies);
    const imageRelationships = [];
    const mediaEntries = {};
    embeddedPhotos.forEach((photo, index) => {
      const extension = photoExtension(photo) === "jpeg" ? "jpg" : photoExtension(photo);
      const mediaName = `inspection-photo-${index + 1}.${extension}`;
      const relationshipId = `rId${5 + index}`;
      imageRelationships.push({ photo, relationshipId, mediaName, extension });
    });
    for (const item of imageRelationships) {
      mediaEntries[`word/media/${item.mediaName}`] = new Uint8Array(await item.photo.blob.arrayBuffer());
    }

    const photoBody = photos.length
      ? photos.map((photo, index) => {
        const embedded = imageRelationships.find((item) => item.photo === photo);
        const photoHeading = index === 0
          ? `Inspection Photos - Photo 1 of ${photos.length}`
          : `Photo ${index + 1} of ${photos.length}`;
        return [
          wordParagraph(photoHeading, "Heading1", { pageBreakBefore: true, keepNext: true }),
          wordParagraph(photoFigureCaption(photo, index + 1), "Caption", { center: true }),
          embedded
            ? wordImageParagraph(photo, embedded.relationshipId, index + 1, embedded.mediaName)
            : wordParagraph("This image remains in the package's Photos folder but cannot be embedded in this Word version.", "", { center: true }),
          wordParagraph(`File: ${photo.packagePath}`, "Caption", { center: true })
        ].join("");
      }).join("")
      : "";

    const body = [
      wordParagraph("INSPECTION REPORT", "Title"),
      wordParagraph(`${inspection.activeJobId ? `${inspection.activeJobId} | ` : ""}${inspection.inspectionLocation || inspection.vendor || "Facility"}${inspection.sbInspectionNo || inspection.projectNumber ? ` | ${inspection.sbInspectionNo || inspection.projectNumber}` : ""}`, "Subtitle"),
      wordTable(metadata, [1500, 3180, 1500, 3180]),
      wordParagraph("Summary", "Heading1", { keepNext: true }),
      wordParagraph(summaryText || "No summary entered."),
      reportLanguage ? wordParagraph("Generated Draft Report Language", "Heading1", { keepNext: true }) : "",
      reportLanguage ? wordParagraph(reportLanguage) : "",
      quickNoteText ? wordParagraph("Quick Note", "Heading1", { keepNext: true }) : "",
      quickNoteText ? wordParagraph(quickNoteText) : "",
      wordParagraph("Observations", "Heading1", { keepNext: true }),
      wordParagraph(observationsText || "No observations entered."),
      inspectionLoads(inspection).length ? wordParagraph("Vendor Loads", "Heading1", { keepNext: true }) : "",
      inspectionLoads(inspection).length ? wordParagraph(loadDetailsText(inspection)) : "",
      wordParagraph("Deficiencies / Exceptions", "Heading1", { keepNext: true }),
      wordParagraph(inspection.deficiencies || "None entered."),
      followUps.length ? wordParagraph("Follow-up Actions", "Heading1", { keepNext: true }) : "",
      followUps.length ? wordTable(followUpRows, [4200, 1900, 1400, 1860], 1) : "",
      photoBody
    ].join("");

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>${body}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId3"/>
      <w:footerReference w:type="default" r:id="rId4"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="172033"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="80"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="0B2545"/><w:sz w:val="46"/><w:szCs w:val="46"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:keepNext/></w:pPr><w:rPr><w:color w:val="566573"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4D78"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="80"/></w:pPr><w:rPr><w:i/><w:color w:val="566573"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
</w:styles>`;

    const documentRelationships = [
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
      ...imageRelationships.map((item) => `<Relationship Id="${item.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.mediaName}"/>`)
    ].join("");

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

    const entries = {
      "[Content_Types].xml": window.fflate.strToU8(contentTypes),
      "_rels/.rels": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
      "docProps/core.xml": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(packageBaseName(inspection))} Editable Inspection Report</dc:title><dc:creator>Mileage Logger</dc:creator><cp:lastModifiedBy>Mileage Logger</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`),
      "docProps/app.xml": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Mileage Logger</Application><AppVersion>1.0</AppVersion></Properties>`),
      "word/document.xml": window.fflate.strToU8(documentXml),
      "word/styles.xml": window.fflate.strToU8(stylesXml),
      "word/settings.xml": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:updateFields w:val="true"/></w:settings>`),
      "word/header1.xml": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="D9E0E8"/></w:pBdr></w:pPr><w:r><w:rPr><w:color w:val="566573"/><w:sz w:val="18"/></w:rPr><w:t>Mileage Logger | Editable Inspection Report</w:t></w:r></w:p></w:hdr>`),
      "word/footer1.xml": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="777777"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="777777"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`),
      "word/_rels/document.xml.rels": window.fflate.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRelationships}</Relationships>`),
      ...mediaEntries
    };
    return new Uint8Array(window.fflate.zipSync(entries, { level: 6 }));
  }

  async function loadPackagePhotos(inspection) {
    if (!window.MileageMediaStore) return [];
    const stored = await window.MileageMediaStore.getAllPhotos();
    // Match by the photo's unique ID so packages also include photos created by
    // older builds that saved a temporary inspection ID before the record itself.
    const byId = new Map(stored.map((photo) => [photo.id, photo]));
    return inspectionSpecificPhotoReferences(inspection).map((metadata, index) => {
      const photo = byId.get(metadata.id);
      if (!photo?.blob) return null;
      const extension = photoExtension(photo);
      const sequence = String(index + 1).padStart(2, "0");
      const friendlyName = safeFilePart(photo.caption || photo.name, `Inspection_Photo_${sequence}`);
      return {
        ...photo,
        ...metadata,
        blob: photo.blob,
        packagePath: `Photos/${sequence}_${friendlyName}.${extension}`
      };
    }).filter(Boolean);
  }

  async function deliverInspectionPackage(filename, blob) {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    const isWord = /\.docx$/i.test(filename);
    const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches;
    const forceDownload = new URLSearchParams(window.location.search).get("download") === "1";
    if (!forceDownload && touchDevice && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        // Share only the file. On iOS, including a text message alongside a ZIP
        // can cause Save to Files to save the message as a .txt file instead.
        await navigator.share({ files: [file] });
        showInspectionToast(isWord ? "Word report ready to save or share." : "Word + Photos ZIP ready to save or share.");
        return true;
      } catch (error) {
        if (error?.name === "AbortError") {
          showInspectionToast(isWord ? "Word report was not saved." : "Inspection export was not saved.");
          return false;
        }
        console.warn("Inspection package share failed; using download instead:", error);
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
    showInspectionToast(isWord ? "Word report downloaded." : "Word + Photos ZIP downloaded.");
    return true;
  }

  function recordInspectionExports(inspectionIds) {
    const state = readState();
    const exportedISO = nowISO();
    const idSet = new Set(inspectionIds);
    state.settings.inspections.forEach((inspection) => {
      if (!idSet.has(inspection.id)) return;
      inspection.handoffExportedISO = exportedISO;
      inspection.handoffExportedModifiedISO = inspection.modifiedISO || inspection.createdISO || exportedISO;
    });
    writeState(state);
    refreshFromState(true);
  }

  async function buildInspectionWordReport(inspection) {
    const photos = await loadPackagePhotos(inspection);
    const baseName = packageBaseName(inspection);
    const editableReportFilename = `${baseName}_Editable_Report.docx`;
    const templateRecord = inspectionTemplateInstalled
      ? await readInspectionReportTemplateRecord()
      : null;
    const docx = templateRecord?.bytes
      ? await buildSAndBInspectionDocx(
        templateRecord,
        inspection,
        photos,
        editableReportFilename
      )
      : await buildInspectionDocx(inspection, photos);
    return { baseName, filename: editableReportFilename, bytes: docx, photos };
  }

  async function buildInspectionPackageEntries(inspection, folder = "") {
    const report = await buildInspectionWordReport(inspection);
    const prefix = folder ? `${folder}/` : "";
    const entries = { [`${prefix}${report.filename}`]: report.bytes };
    for (const photo of report.photos) {
      entries[`${prefix}${photo.packagePath}`] = new Uint8Array(await photo.blob.arrayBuffer());
    }
    return { baseName: report.baseName, entries };
  }

  async function exportInspectionPackage(inspection, button) {
    const originalText = button?.textContent || "Export Word Report";
    if (button) {
      button.disabled = true;
      button.textContent = "Building Word Report...";
    }
    try {
      const report = await buildInspectionWordReport(inspection);
      const delivered = await deliverInspectionPackage(
        report.filename,
        new Blob([report.bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      );
      if (delivered) recordInspectionExports([inspection.id]);
    } catch (error) {
      console.error("Inspection Word export failed:", error);
      window.alert(`The Word report could not be created.\n\n${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  async function exportInspectionWithPhotos(inspection, button) {
    if (!window.fflate) {
      window.alert("The ZIP component is unavailable. Reopen the app while online and try again.");
      return;
    }
    const originalText = button?.textContent || "Word + Photos ZIP";
    if (button) {
      button.disabled = true;
      button.textContent = "Building ZIP...";
    }
    try {
      const { baseName, entries } = await buildInspectionPackageEntries(inspection);
      const bytes = window.fflate.zipSync(entries, { level: 6 });
      const delivered = await deliverInspectionPackage(`${baseName}_Word_and_Photos.zip`, new Blob([bytes], { type: "application/zip" }));
      if (delivered) recordInspectionExports([inspection.id]);
    } catch (error) {
      console.error("Inspection Word + Photos export failed:", error);
      window.alert(`The Word + Photos ZIP could not be created.\n\n${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  async function exportSelectedInspectionPackages(button) {
    if (!window.fflate) {
      window.alert("The ZIP component is unavailable. Reopen the app while online and try again.");
      return;
    }
    const state = readState();
    const inspections = state.settings.inspections.filter((inspection) => selectedInspectionIds.has(inspection.id));
    if (!inspections.length) {
      window.alert("Select at least one inspection.");
      return;
    }
    const originalText = button?.textContent || "Export Selected (ZIP)";
    if (button) {
      button.disabled = true;
      button.textContent = `Building 0 of ${inspections.length}...`;
    }
    try {
      const entries = {
        ["00_READ_ME_FIRST.txt"]: window.fflate.strToU8(
        `SELECTED INSPECTION WORD REPORTS\r\n\r\nThis ZIP contains ${inspections.length} editable Word report${inspections.length === 1 ? "" : "s"}. Each report embeds its inspection photos once; separate image files and PDFs are not included.\r\n`
        )
      };
      for (let index = 0; index < inspections.length; index += 1) {
        if (button) button.textContent = `Building ${index + 1} of ${inspections.length}...`;
        const inspection = inspections[index];
        const folder = `${String(index + 1).padStart(2, "0")}_${packageBaseName(inspection)}`;
        const report = await buildInspectionWordReport(inspection);
        entries[`${folder}/${report.filename}`] = report.bytes;
      }
      const bytes = window.fflate.zipSync(entries, { level: 6 });
      const filename = `Selected_Inspection_Word_Reports_${new Date().toISOString().slice(0, 10)}_${inspections.length}_records.zip`;
      const delivered = await deliverInspectionPackage(filename, new Blob([bytes], { type: "application/zip" }));
      if (delivered) recordInspectionExports(inspections.map((inspection) => inspection.id));
    } catch (error) {
      console.error("Selected inspection export failed:", error);
      window.alert(`The selected inspection packages could not be created.\n\n${error.message}`);
    } finally {
      if (button) {
        button.disabled = selectedInspectionIds.size === 0;
        button.textContent = originalText;
      }
    }
  }

  function exportInspectionCSV() {
    const state = readState();
    const inspections = [...state.settings.inspections].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    if (!inspections.length) {
      window.alert("There are no inspection records to export.");
      return;
    }

    const header = [
      "Date", "Active Job", "S&B Inspection Number", "Customer", "Reporting Vendor", "Inspection Location", "Project Name", "Project Number", "S&B Order / PO", "Equipment Tag", "ISO Drawing", "Vendor Job", "Piece / Spool", "Vendor Load #",
      "Inspection Type", "Activities Performed", "Activity", "Status", "Acceptance / Release", "Start Time", "End Time",
      "Hours On Site", "Linked Trip", "Odometer Miles", "GPS Miles", "STA Generated", "STA Filename",
      "Quick Note", "Summary", "Generated Report Language", "Observations", "Deficiencies / Exceptions", "Open Follow-ups", "Closed Follow-ups",
      "Created", "Modified", "Vendor Load Details"
    ];

    const rows = inspections.map((inspection) => {
      const followUps = inspection.followUps || [];
      const open = followUps.filter((item) => item.status !== "Closed").map((item) => (
        `${item.action}${item.responsibleParty ? ` [${item.responsibleParty}]` : ""}${item.dueDate ? ` due ${item.dueDate}` : ""}`
      )).join(" | ");
      const closed = followUps.filter((item) => item.status === "Closed").map((item) => item.action).join(" | ");
      const snapshot = inspection.tripSnapshot || {};
      return [
        displayDate(inspection.date), inspection.activeJobId, inspection.sbInspectionNo, inspection.customer,
        inspection.reportingVendor, inspection.inspectionLocation || inspection.vendor, inspection.projectName, inspection.projectNumber,
        inspection.purchaseOrderJob, inspection.equipmentTag, inspection.isoDrawingNumber, inspection.vendorJobNumber,
        inspection.pieceSpoolNumber, loadIdentifiers(inspection).join(" | "), inspection.inspectionType, inspectionActivities(inspection).join(" | "), inspection.activity,
        inspection.status, inspection.acceptanceStatus, inspection.startTime, inspection.endTime,
        inspection.hoursOnSite, inspection.tripId ? "Yes" : "No", snapshot.miles ?? "",
        snapshot.gpsRouteMiles ?? "", snapshot.staGenerated ? "Yes" : "No", snapshot.staFileName || "",
        inspection.quickNote, inspection.summary, inspection.generatedReportLanguage, inspection.observations, inspection.deficiencies, open, closed,
        formatDateTime(inspection.createdISO), formatDateTime(inspection.modifiedISO), loadDetailsText(inspection)
      ];
    });

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inspection-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showInspectionToast("Inspection CSV created.");
  }

  function showInspectionToast(message) {
    const toast = $("toast");
    if (toast) {
      toast.textContent = message;
      toast.classList.remove("hidden");
      clearTimeout(showInspectionToast.timer);
      showInspectionToast.timer = setTimeout(() => toast.classList.add("hidden"), 3400);
      return;
    }
    console.info(message);
  }

  function setActiveView(view) {
    activeView = view;
    $("inspectionListViewBtn")?.classList.toggle("active-view", view === "inspections");
    $("followUpViewBtn")?.classList.toggle("active-view", view === "followups");
    renderInspectionList(readState());
  }

  function refreshFromState(force = false) {
    if (!$('inspectionSection')) return;
    const state = readState();
    renderActiveTripInspectionAction(state);
    const signature = JSON.stringify({
      activeTrip: state.activeTrip ? [state.activeTrip.id, state.activeTrip.startISO, state.activeTrip.vendor, state.activeTrip.projectNumber, state.activeTrip.purpose, state.activeTrip.notes, (state.activeTrip.photos || []).map((photo) => [photo.id, photo.caption])] : null,
      trips: state.trips.map((trip) => [trip.id, trip.endISO, trip.miles, trip.notes, (trip.photos || []).map((photo) => [photo.id, photo.caption])]),
      inspections: state.settings.inspections.map((inspection) => [inspection.id, inspection.modifiedISO]),
      activeJobsCatalog: activeJobsForState(state).map((job) => [job.aj, job.modifiedISO, job.openClosed, job.defaultFacilityProfileId]),
      facilityProfiles: facilityProfilesForState(state).map((profile) => [profile.id, profile.modifiedISO]),
      ignored: state.settings.inspectionIgnoredTripIds,
      activeJob: [state.settings.currentActiveJobId, state.settings.activeJobsWorkspaceVendor, state.settings.activeJobsWorkspaceTripId],
      backup: [state.backup?.pendingTripCount, state.backup?.pendingChangeCount, state.backup?.lastConfirmedISO]
    });
    if (!force && signature === lastStateSignature) return;
    lastStateSignature = signature;
    renderPrompt(state);
    renderDashboard(state);
    renderActiveJobsWorkspace(state);
    renderInspectionList(state);
  }

  function bindEvents() {
    $("inspectionBtn")?.addEventListener("click", () => showInspectionSection(false));
    $("inspectionNavBtn")?.addEventListener("click", () => showInspectionSection(false));
    $("closeInspectionSection")?.addEventListener("click", hideInspectionSection);
    $("newInspectionBtn")?.addEventListener("click", () => {
      const state = readState();
      openInspectionForm(null, $("activeJobsVisit")?.value || "", { activeJobId: state.settings.currentActiveJobId || "" });
    });
    $("standaloneInspectionBtn")?.addEventListener("click", () => openInspectionForm(null, "", { standalone: true }));
    $("inspectionListViewBtn")?.addEventListener("click", () => setActiveView("inspections"));
    $("followUpViewBtn")?.addEventListener("click", () => setActiveView("followups"));
    $("exportInspectionsBtn")?.addEventListener("click", exportInspectionCSV);
    $("exportSelectedInspectionsBtn")?.addEventListener("click", (event) => {
      exportSelectedInspectionPackages(event.currentTarget);
    });
    $("clearSelectedInspectionsBtn")?.addEventListener("click", () => {
      selectedInspectionIds.clear();
      renderInspectionList(readState());
    });
    $("selectAllVisibleInspections")?.addEventListener("change", (event) => {
      const checked = event.currentTarget.checked;
      document.querySelectorAll("#inspectionList [data-select-inspection]").forEach((input) => {
        if (checked) selectedInspectionIds.add(input.dataset.selectInspection);
        else selectedInspectionIds.delete(input.dataset.selectInspection);
      });
      renderInspectionList(readState());
    });
    $("importInspectionTemplateBtn")?.addEventListener("click", () => {
      $("inspectionTemplateFileInput")?.click();
    });
    $("removeInspectionTemplateBtn")?.addEventListener("click", async () => {
      if (!window.confirm("Remove the privately stored S&B Word report template from this device? Inspection records and photos will not be deleted.")) return;
      try {
        await deleteInspectionReportTemplateRecord();
        await refreshInspectionReportTemplateStatus();
        showInspectionToast("Private S&B Word template removed.");
      } catch (error) {
        window.alert(`The private S&B Word template could not be removed.\n\n${error.message}`);
      }
    });
    $("inspectionSearch")?.addEventListener("input", () => renderInspectionList(readState()));
    $("inspectionFilter")?.addEventListener("change", () => renderInspectionList(readState()));
    $("clearInspectionSearch")?.addEventListener("click", () => {
      $("inspectionSearch").value = "";
      $("inspectionFilter").value = "all";
      renderInspectionList(readState());
    });

    document.addEventListener("click", async (event) => {
      if (event.target.closest("#workCurrentInspectionBtn")) {
        const state = readState();
        const trip = state.activeTrip;
        if (!trip) {
          window.alert("There is no active trip to inspect right now.");
          return;
        }
        state.settings.activeJobsWorkspaceTripId = trip.id;
        state.settings.activeJobsWorkspaceVendor = trip.vendor || state.settings.activeJobsWorkspaceVendor || "";
        writeState(state);
        showInspectionSection(false, trip.id);
        return;
      }

      if (event.target.closest("#workPendingJobBtn")) {
        const state = readState();
        const tripId = $("activeJobsVisit")?.value || state.activeTrip?.id || "";
        openInspectionForm(null, tripId, { standalone: true });
        return;
      }

      if (event.target.closest("#assignPendingInspectionBtn")) {
        assignPendingInspectionToJob();
        return;
      }

      if (event.target.closest("#saveVisitToFacilityProfileBtn")) {
        saveCurrentVisitToFacilityProfile();
        return;
      }

      const activeJobButton = event.target.closest("[data-work-active-job]");
      if (activeJobButton) {
        switchActiveJob(activeJobButton.dataset.workActiveJob);
        return;
      }

      const newWorkspaceInspectionButton = event.target.closest("[data-new-workspace-inspection]");
      if (newWorkspaceInspectionButton) {
        if ($("inspectionForm")) saveInspectionDraft({ silent: true });
        const tripId = $("activeJobsVisit")?.value || "";
        openInspectionForm(null, tripId, { activeJobId: newWorkspaceInspectionButton.dataset.newWorkspaceInspection });
        return;
      }

      const workspaceInspectionButton = event.target.closest("[data-open-workspace-inspection]");
      if (workspaceInspectionButton) {
        if ($("inspectionForm") && editingInspectionId !== workspaceInspectionButton.dataset.openWorkspaceInspection) {
          saveInspectionDraft({ silent: true });
        }
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === workspaceInspectionButton.dataset.openWorkspaceInspection);
        if (inspection) openInspectionForm(inspection);
        return;
      }

      const editWorkspaceTripButton = event.target.closest("[data-edit-workspace-trip]");
      if (editWorkspaceTripButton) {
        $("inspectionSection")?.classList.add("hidden");
        document.dispatchEvent(new CustomEvent("mileage:edit-trip", { detail: { tripId: editWorkspaceTripButton.dataset.editWorkspaceTrip } }));
        return;
      }

      if (event.target.closest("#generateInspectionReportBtn")) {
        previewGeneratedReportLanguage();
        scheduleInspectionAutosave();
        return;
      }

      const createTripButton = event.target.closest("[data-create-inspection-trip]");
      if (createTripButton) {
        showInspectionSection(true, createTripButton.dataset.createInspectionTrip);
        return;
      }

      const ignoreTripButton = event.target.closest("[data-ignore-inspection-trip]");
      if (ignoreTripButton) {
        const tripId = ignoreTripButton.dataset.ignoreInspectionTrip;
        updateState((state) => {
          if (!state.settings.inspectionIgnoredTripIds.includes(tripId)) {
            state.settings.inspectionIgnoredTripIds.push(tripId);
          }
        });
        showInspectionToast("Trip marked as not requiring an inspection record.");
        return;
      }

      if (event.target.closest("#backupInspectionChangesBtn")) {
        const backupButton = $("backupNowBtn") || $("backupBtn");
        if (backupButton) backupButton.click();
        else window.alert("Open the Mileage Logger page and use Save Full Data Backup to protect the inspection changes.");
        return;
      }

      if (event.target.closest("#closeInspectionFormBtn") || event.target.closest("#cancelInspectionFormBtn")) {
        closeInspectionForm();
        return;
      }

      if (event.target.closest("#addFollowUpBtn")) {
        const current = [...document.querySelectorAll("#followUpEditorList .followup-editor")].map((row) => ({
          id: row.dataset.followupId,
          action: row.querySelector(".followup-action")?.value || "",
          responsibleParty: row.querySelector(".followup-owner")?.value || "",
          dueDate: row.querySelector(".followup-due")?.value || "",
          status: row.querySelector(".followup-status")?.value || "Open"
        }));
        current.push({ id: makeId("followup"), action: "", responsibleParty: "", dueDate: "", status: "Open" });
        renderFollowUpEditors(current);
        scheduleInspectionAutosave();
        return;
      }

      if (event.target.closest("#addInspectionLoadBtn")) {
        const current = collectLoads();
        current.push({
          id: makeId("load"),
          identifier: "",
          status: "Not Recorded",
          notes: "",
          deficiencyFollowUp: "",
          photoIds: []
        });
        renderLoadEditors(current);
        document.querySelector("#inspectionLoadEditorList .load-editor:last-child .load-identifier")?.focus();
        scheduleInspectionAutosave();
        return;
      }

      if (event.target.closest("#takeInspectionPhotoBtn")) {
        $("takeInspectionPhotoInput")?.click();
        return;
      }

      if (event.target.closest("#chooseInspectionPhotosBtn")) {
        $("chooseInspectionPhotosInput")?.click();
        return;
      }

      const viewPhotoButton = event.target.closest("[data-view-photo]");
      if (viewPhotoButton) {
        const url = viewPhotoButton.dataset.photoUrl;
        if (url) window.open(url, "_blank", "noopener");
        else window.alert("The photo is still loading or is not available on this device.");
        return;
      }

      const removePhotoButton = event.target.closest("[data-remove-photo]");
      if (removePhotoButton) {
        const photoId = removePhotoButton.dataset.removePhoto;
        const removedPhoto = collectPhotoMetadata().find((photo) => photo.id === photoId);
        if (!window.confirm("Remove this photo from the inspection?")) return;
        currentPhotos = collectPhotoMetadata().filter((photo) => photo.id !== photoId);
        try {
          if (!removedPhoto?.sourceTripId) {
            await window.MileageMediaStore?.deletePhoto(photoId);
          }
          if (editingInspectionWasExisting && originalPhotoIds.has(photoId)) {
            originalPhotoIds.delete(photoId);
            updateState((state) => {
              const inspection = state.settings.inspections.find((item) => item.id === editingInspectionId);
              if (inspection) {
                inspection.photos = (inspection.photos || []).filter((photo) => photo.id !== photoId);
                inspection.loads = inspectionLoads(inspection).map((load) => ({
                  ...load,
                  photoIds: (load.photoIds || []).filter((id) => id !== photoId)
                }));
                inspection.modifiedISO = nowISO();
              }
            });
          }
          await renderPhotoEditors();
          $("inspectionPhotoStatus").textContent = "Photo removed. Save the inspection to keep this change.";
          $("inspectionPhotoStatus").className = "gps-status warn";
        } catch (error) {
          window.alert(`The photo could not be removed.\n\n${error.message}`);
        }
        return;
      }

      const removeFollowUp = event.target.closest(".remove-followup-btn");
      if (removeFollowUp) {
        removeFollowUp.closest(".followup-editor")?.remove();
        scheduleInspectionAutosave();
        return;
      }

      const removeLoad = event.target.closest(".remove-load-btn");
      if (removeLoad) {
        const identifier = removeLoad.closest(".load-editor")?.querySelector(".load-identifier")?.value.trim();
        if (identifier && !window.confirm(`Remove vendor load ${identifier}?`)) return;
        const current = collectLoads().filter((load) => load.id !== removeLoad.closest(".load-editor")?.dataset.loadId);
        renderLoadEditors(current);
        scheduleInspectionAutosave();
        return;
      }

      if (event.target.closest("[data-close-inspection-preview]")) {
        closeInspectionPreview();
        return;
      }

      const previewButton = event.target.closest("[data-preview-inspection]");
      if (previewButton) {
        await openInspectionPreview(previewButton.dataset.previewInspection);
        return;
      }

      const previewEditButton = event.target.closest("[data-preview-edit-inspection]");
      if (previewEditButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === previewEditButton.dataset.previewEditInspection);
        closeInspectionPreview();
        if (inspection) {
          showInspectionSection(false);
          openInspectionForm(inspection);
        }
        return;
      }

      const previewExportButton = event.target.closest("[data-preview-export-inspection]");
      if (previewExportButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === previewExportButton.dataset.previewExportInspection);
        if (inspection) await exportInspectionPackage(inspection, previewExportButton);
        return;
      }

      const editButton = event.target.closest("[data-edit-inspection]");
      if (editButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === editButton.dataset.editInspection);
        if (inspection) {
          showInspectionSection(false);
          openInspectionForm(inspection);
        }
        return;
      }

      const duplicateButton = event.target.closest("[data-duplicate-inspection]");
      if (duplicateButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === duplicateButton.dataset.duplicateInspection);
        if (inspection) duplicateInspection(inspection);
        return;
      }

      const exportButton = event.target.closest("[data-export-inspection]");
      if (exportButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === exportButton.dataset.exportInspection);
        if (inspection) await exportInspectionPackage(inspection, exportButton);
        return;
      }

      const exportPhotosButton = event.target.closest("[data-export-inspection-photos]");
      if (exportPhotosButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === exportPhotosButton.dataset.exportInspectionPhotos);
        if (inspection) await exportInspectionWithPhotos(inspection, exportPhotosButton);
        return;
      }

      const deleteButton = event.target.closest("[data-delete-inspection]");
      if (deleteButton) {
        const state = readState();
        const inspection = state.settings.inspections.find((item) => item.id === deleteButton.dataset.deleteInspection);
        if (!inspection) return;
        if (!window.confirm(`Delete the ${displayDate(inspection.date)} inspection at ${inspection.vendor}? This cannot be undone.`)) return;
        updateState((nextState) => {
          nextState.settings.inspections = nextState.settings.inspections.filter((item) => item.id !== inspection.id);
        });
        window.MileageMediaStore?.deleteInspectionPhotos(inspection.id).catch((error) => {
          console.warn("Could not remove inspection photos:", error);
        });
        closeInspectionForm();
        showInspectionToast("Inspection deleted.");
        return;
      }

      const closeFollowUpButton = event.target.closest("[data-close-followup]");
      if (closeFollowUpButton) {
        const [inspectionId, followUpId] = closeFollowUpButton.dataset.closeFollowup.split("|");
        updateState((state) => {
          const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
          const followUp = inspection?.followUps?.find((item) => item.id === followUpId);
          if (followUp) {
            followUp.status = "Closed";
            inspection.modifiedISO = nowISO();
          }
        });
        showInspectionToast("Follow-up marked closed.");
        return;
      }

      const mainAppControl = event.target.closest("#startBtn, #endBtn, #staBtn, #logBtn, [data-show]");
      if (mainAppControl && !event.target.closest("#inspectionSection")) {
        $("inspectionSection")?.classList.add("hidden");
      }
    });

    document.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-select-inspection]");
      if (!checkbox) return;
      if (checkbox.checked) selectedInspectionIds.add(checkbox.dataset.selectInspection);
      else selectedInspectionIds.delete(checkbox.dataset.selectInspection);
      updateInspectionBatchControls(
        [...document.querySelectorAll("#inspectionList [data-inspection-id]")]
          .map((record) => ({ id: record.dataset.inspectionId }))
      );
    });

    document.addEventListener("change", (event) => {
      if (event.target.id === "activeJobsVendor") {
        const state = readState();
        state.settings.activeJobsWorkspaceVendor = event.target.value;
        state.settings.activeJobsWorkspaceTripId = "";
        writeState(state);
        renderActiveJobsWorkspace();
        return;
      }
      if (event.target.id === "activeJobsVisit") {
        const state = readState();
        state.settings.activeJobsWorkspaceTripId = event.target.value || "__standalone__";
        const trip = getTripById(state, event.target.value);
        if (trip?.vendor) state.settings.activeJobsWorkspaceVendor = trip.vendor;
        writeState(state);
        renderActiveJobsWorkspace();
        return;
      }
      if (event.target.id === "inspectionFacilityProfileId") {
        const profile = facilityProfileById(readState(), event.target.value);
        const saveButton = $("saveVisitToFacilityProfileBtn");
        if (saveButton) saveButton.disabled = !profile;
        applyFacilityProfileToInspectionForm(profile);
        return;
      }
      if (event.target.id === "inspectionTemplateFileInput") {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const status = $("inspectionTemplateStatus");
        const importButton = $("importInspectionTemplateBtn");
        if (importButton) importButton.disabled = true;
        if (status) {
          status.textContent = "Validating and storing the S&B Word template privately on this device…";
          status.className = "private-master-status";
        }
        importInspectionReportTemplate(file)
          .then(async () => {
            await refreshInspectionReportTemplateStatus();
            showInspectionToast("Private S&B Word template installed.");
          })
          .catch(async (error) => {
            console.error("S&B Word template import failed:", error);
            window.alert(`The S&B Word template could not be imported.\n\n${error.message}`);
            await refreshInspectionReportTemplateStatus();
          })
          .finally(() => {
            if (importButton) importButton.disabled = false;
          });
        return;
      }
      if (event.target.id === "takeInspectionPhotoInput" || event.target.id === "chooseInspectionPhotosInput") {
        const files = [...(event.target.files || [])];
        event.target.value = "";
        addInspectionPhotos(files);
      }
      if (event.target.id === "inspectionTripId") {
        applyTripToOpenForm(event.target.value);
      }
      if (event.target.id === "inspectionType") {
        updateInspectionWorkflowSections();
        if ($("inspectionActivity")?.value === "Inspection" || !$("inspectionActivity")?.value.trim()) {
          $("inspectionActivity").value = event.target.value;
        }
      }
      if (event.target.matches?.("[data-inspection-activity]")) {
        updateInspectionWorkflowSections();
      }
      if (event.target.id === "coatingSystem") updateCoatingRequirementSummary();
      if (event.target.id === "inspectionDeficiencyStatus") {
        $("inspectionDeficiencyDetails")?.classList.toggle("hidden", event.target.value !== "Issue noted");
      }
      if (event.target.id === "inspectionStartTime" || event.target.id === "inspectionEndTime") {
        const calculated = calculateHours($("inspectionStartTime")?.value, $("inspectionEndTime")?.value);
        if (calculated && $("inspectionHours")) $("inspectionHours").value = calculated;
      }
      if (event.target.closest("#inspectionForm")) scheduleInspectionAutosave();
    });

    document.addEventListener("input", (event) => {
      if (event.target.closest("#inspectionForm")) scheduleInspectionAutosave();
    });

    document.addEventListener("submit", (event) => {
      if (event.target.id !== "inspectionForm") return;
      event.preventDefault();
      saveInspectionFromForm();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && previewInspectionId) closeInspectionPreview();
    });

    window.addEventListener("storage", () => refreshFromState(true));
    window.addEventListener("mileage:trip-finalized", (event) => {
      finalizeLinkedTrip(event.detail?.tripId || "");
    });
    window.addEventListener("mileage:trip-completed", (event) => {
      promptForCompletedTrip(event.detail?.tripId || "", event.detail?.backupConfirmed);
    });
  }

  function finalizeLinkedTrip(tripId) {
    if (!tripId) return 0;
    const state = readState();
    const trip = state.trips.find((item) => item.id === tripId);
    if (!trip) return 0;
    const linked = state.settings.inspections.filter((inspection) => inspection.tripId === tripId);
    if (!linked.length) return 0;
    const snapshot = tripSnapshot(trip);
    linked.forEach((inspection) => {
      inspection.tripSnapshot = { ...snapshot };
    });
    writeState(state);
    return linked.length;
  }

  function promptForCompletedTrip(tripId, backupConfirmed) {
      refreshFromState(true);

      if (!tripId || !backupConfirmed) return;

      const state = readState();
      const trip = getTripById(state, tripId);
      if (!trip) return;
      const linked = state.settings.inspections.filter((inspection) => inspection.tripId === tripId);
      if (linked.length) {
        showInspectionToast(`Trip finalized and linked to ${linked.length} inspection record${linked.length === 1 ? "" : "s"}.`);
        return;
      }

      const createInspection = window.confirm(
        `Trip saved and backed up.\n\nCreate an inspection record for ${trip.vendor || "this trip"}?`
      );
      if (createInspection) showInspectionSection(true, tripId);
  }

  function initialize() {
    injectInterface();
    bindEvents();
    window.MileageInspectionDatabase = {
      promptForTrip: promptForCompletedTrip
    };
    refreshFromState(true);
    refreshInspectionReportTemplateStatus();

    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "inspection" || action === "inspections") {
      setTimeout(() => showInspectionSection(false), 80);
    }

    window.setInterval(() => refreshFromState(false), REFRESH_INTERVAL_MS);
  }

  window.MileageInspectionReportTesting = Object.freeze({
    inspectionSpecificPhotoReferences,
    photoFigureCaption,
    buildInspectionPreviewModel,
    inspectionPreviewMarkup,
    reportSectionText,
    buildInspectionDocx,
    buildSAndBInspectionDocx
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
