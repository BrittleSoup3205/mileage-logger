(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const DEVICE_ID_KEY = "mileage_logger_sync_device_id_v1";
  const VERIFIED_META_KEY = "mileage_logger_verified_sync_v1";
  const TYPES = new Set(["active_trip", "trip", "inspection", "timesheet_entry", "timesheet_week", "active_job", "facility_profile", "active_job_import", "active_job_proposal", "preferences"]);
  const VERIFY_INTERVAL_MS = 60000;
  let inFlight = null;
  let scheduledTimer = null;
  let lastVerifyStarted = 0;

  const text = (value) => value == null ? "" : String(value);
  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const keyOf = (type, id) => `${type}:${id}`;

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
  }

  function hash(value) {
    const source = JSON.stringify(stable(value));
    let result = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      result ^= source.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
  }

  function loadConfig() {
    const config = read(CONFIG_KEY, {});
    return {
      enabled: config.enabled !== false,
      projectUrl: text(config.projectUrl).trim().replace(/\/$/, ""),
      publishableKey: text(config.publishableKey).trim()
    };
  }

  function loadSession() {
    return read(SESSION_KEY, null);
  }

  function deviceId() {
    return localStorage.getItem(DEVICE_ID_KEY) || "verified-sync-guard";
  }

  function ready() {
    const config = loadConfig();
    const session = loadSession();
    return Boolean(
      config.enabled && config.projectUrl && config.publishableKey &&
      session?.access_token && session?.user?.id && navigator.onLine
    );
  }

  function durablePreferences(state) {
    const settings = state?.settings || {};
    const workflow = state?.workflow || {};
    return {
      settings: {
        roundMiles: settings.roundMiles,
        autoCaptureGps: settings.autoCaptureGps,
        maxGpsAccuracy: settings.maxGpsAccuracy,
        differenceWarning: settings.differenceWarning,
        customers: Array.isArray(settings.customers) ? settings.customers : [],
        vendors: Array.isArray(settings.vendors) ? settings.vendors : [],
        purposes: Array.isArray(settings.purposes) ? settings.purposes : [],
        vendorLocations: Array.isArray(settings.vendorLocations) ? settings.vendorLocations : [],
        inspectionIgnoredTripIds: Array.isArray(settings.inspectionIgnoredTripIds) ? settings.inspectionIgnoredTripIds : []
      },
      workflow: { mileageRate: workflow.mileageRate ?? "" }
    };
  }

  function shapeState(state) {
    state = state && typeof state === "object" ? state : {};
    state.trips = Array.isArray(state.trips) ? state.trips : [];
    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
    state.workflow = state.workflow && typeof state.workflow === "object" ? state.workflow : {};
    state.workflow.timesheetEntries = Array.isArray(state.workflow.timesheetEntries) ? state.workflow.timesheetEntries : [];
    state.workflow.timesheetWeeks = state.workflow.timesheetWeeks && typeof state.workflow.timesheetWeeks === "object" ? state.workflow.timesheetWeeks : {};
    state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
    state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
    state.activeJobImports = Array.isArray(state.activeJobImports) ? state.activeJobImports : [];
    state.activeJobUpdateProposals = Array.isArray(state.activeJobUpdateProposals) ? state.activeJobUpdateProposals : [];
    return state;
  }

  function extractRecords(state) {
    const records = new Map();
    if (state.activeTrip?.id) records.set(keyOf("active_trip", "current"), { type: "active_trip", id: "current", payload: state.activeTrip });
    state.trips.forEach((item) => item?.id && records.set(keyOf("trip", item.id), { type: "trip", id: item.id, payload: item }));
    state.settings.inspections.forEach((item) => item?.id && records.set(keyOf("inspection", item.id), { type: "inspection", id: item.id, payload: item }));
    state.activeJobs.forEach((item) => item?.aj && records.set(keyOf("active_job", item.aj), { type: "active_job", id: item.aj, payload: item }));
    state.facilityProfiles.forEach((item) => item?.id && records.set(keyOf("facility_profile", item.id), { type: "facility_profile", id: item.id, payload: item }));
    state.activeJobImports.forEach((item) => item?.id && records.set(keyOf("active_job_import", item.id), { type: "active_job_import", id: item.id, payload: item }));
    state.activeJobUpdateProposals.forEach((item) => item?.id && records.set(keyOf("active_job_proposal", item.id), { type: "active_job_proposal", id: item.id, payload: item }));
    state.workflow.timesheetEntries.forEach((item) => item?.id && records.set(keyOf("timesheet_entry", item.id), { type: "timesheet_entry", id: item.id, payload: item }));
    Object.entries(state.workflow.timesheetWeeks).forEach(([id, payload]) => records.set(keyOf("timesheet_week", id), { type: "timesheet_week", id, payload }));
    records.set(keyOf("preferences", "durable"), { type: "preferences", id: "durable", payload: durablePreferences(state) });
    return records;
  }

  function replaceRecord(array, field, id, payload, deleted) {
    const index = array.findIndex((item) => item?.[field] === id);
    if (deleted) {
      if (index >= 0) array.splice(index, 1);
    } else if (index >= 0) array[index] = payload;
    else array.push(payload);
  }

  function applyRemote(state, row) {
    const type = row.record_type;
    const id = row.record_id;
    const payload = row.payload;
    const deleted = Boolean(row.tombstone);

    if (type === "active_trip" && id === "current") {
      state.activeTrip = deleted ? null : payload;
      return;
    }
    if (type === "trip") return replaceRecord(state.trips, "id", id, payload, deleted);
    if (type === "inspection") return replaceRecord(state.settings.inspections, "id", id, payload, deleted);
    if (type === "active_job") return replaceRecord(state.activeJobs, "aj", id, payload, deleted);
    if (type === "facility_profile") return replaceRecord(state.facilityProfiles, "id", id, payload, deleted);
    if (type === "active_job_import") return replaceRecord(state.activeJobImports, "id", id, payload, deleted);
    if (type === "active_job_proposal") return replaceRecord(state.activeJobUpdateProposals, "id", id, payload, deleted);
    if (type === "timesheet_entry") return replaceRecord(state.workflow.timesheetEntries, "id", id, payload, deleted);
    if (type === "timesheet_week") {
      if (deleted) delete state.workflow.timesheetWeeks[id];
      else state.workflow.timesheetWeeks[id] = payload;
      return;
    }
    if (type === "preferences" && id === "durable" && !deleted && payload) {
      const settings = payload.settings || {};
      ["roundMiles", "autoCaptureGps", "maxGpsAccuracy", "differenceWarning"].forEach((field) => {
        if (settings[field] !== undefined) state.settings[field] = settings[field];
      });
      ["customers", "vendors", "purposes", "vendorLocations", "inspectionIgnoredTripIds"].forEach((field) => {
        if (Array.isArray(settings[field])) state.settings[field] = settings[field];
      });
      if (payload.workflow?.mileageRate !== undefined) state.workflow.mileageRate = payload.workflow.mileageRate;
    }
  }

  function recalculateOdometer(state) {
    const latest = [...state.trips]
      .filter((trip) => trip?.endOdometer !== undefined && trip?.endOdometer !== null && trip?.endOdometer !== "")
      .sort((left, right) => text(right.endISO || right.date).localeCompare(text(left.endISO || left.date)))[0];
    if (latest) state.lastOdometer = latest.endOdometer;
  }

  async function apiRequest(path, options = {}) {
    const config = loadConfig();
    const session = loadSession();
    const headers = new Headers(options.headers || {});
    headers.set("apikey", config.publishableKey);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${config.projectUrl}${path}`, { ...options, headers });
    const raw = await response.text();
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); } catch (_) { body = raw; }
    }
    if (!response.ok) throw new Error(body?.message || body?.msg || body?.error || `${response.status} ${response.statusText}`);
    return body;
  }

  async function fetchCloudRows() {
    const rows = await apiRequest("/rest/v1/mileage_sync_records?select=record_type,record_id,payload,modified_at,device_id,tombstone&order=modified_at.asc");
    return Array.isArray(rows) ? rows.filter((row) => TYPES.has(row.record_type)) : [];
  }

  async function pushRows(rows) {
    if (!rows.length) return;
    await apiRequest("/rest/v1/mileage_sync_records?on_conflict=user_id,record_type,record_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    });
  }

  function setVerifiedBadge(label, message) {
    const indicator = document.getElementById("multiDeviceSyncIndicator");
    const status = document.getElementById("multiDeviceSyncStatus");
    const dataState = label === "SYNCED" ? "ready" : label === "ERROR" ? "error" : "warn";
    if (indicator) {
      indicator.textContent = label;
      indicator.dataset.syncState = dataState;
      indicator.title = message;
    }
    if (status) {
      status.textContent = message;
      status.dataset.syncState = dataState;
    }
  }

  function compare(local, cloudRows) {
    const cloudMap = new Map(cloudRows.map((row) => [keyOf(row.record_type, row.record_id), row]));
    const mismatches = [];
    cloudRows.forEach((row) => {
      const key = keyOf(row.record_type, row.record_id);
      const localRecord = local.get(key);
      if (row.tombstone) {
        if (localRecord) mismatches.push(key);
      } else if (!localRecord || hash(localRecord.payload) !== hash(row.payload)) mismatches.push(key);
    });
    local.forEach((_, key) => {
      const row = cloudMap.get(key);
      if (!row || row.tombstone) mismatches.push(key);
    });
    const counts = {};
    cloudRows.filter((row) => !row.tombstone).forEach((row) => {
      counts[row.record_type] = (counts[row.record_type] || 0) + 1;
    });
    return { mismatches: [...new Set(mismatches)], counts };
  }

  async function verifyAndRepair(reason = "verify") {
    if (inFlight) return inFlight;
    if (!ready()) return false;

    const baseStatus = window.MileageMultiDeviceSync?.getStatus?.();
    if (baseStatus?.state === "syncing") {
      scheduleVerify("wait-for-base-sync", 2500);
      return false;
    }

    const now = Date.now();
    if (reason !== "manual" && now - lastVerifyStarted < 4000) return false;
    lastVerifyStarted = now;

    inFlight = (async () => {
      try {
        let state = shapeState(read(STATE_KEY, {}));
        let cloudRows = await fetchCloudRows();
        let local = extractRecords(state);
        const cloudMap = new Map(cloudRows.map((row) => [keyOf(row.record_type, row.record_id), row]));
        let changed = false;

        // Safe repair: restore records that exist in cloud but are completely missing locally.
        // Do not overwrite a same-ID local record here; the base sync engine resolves that using timestamps.
        cloudRows.forEach((row) => {
          const key = keyOf(row.record_type, row.record_id);
          const localRecord = local.get(key);
          if (!row.tombstone && !localRecord) {
            applyRemote(state, row);
            changed = true;
          }
        });

        if (changed) {
          recalculateOdometer(state);
          localStorage.setItem(STATE_KEY, JSON.stringify(state));
          window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "verified-sync-repair-v2" } }));
        }

        // Preserve local-only records by adding them to cloud; never infer a deletion from an incomplete device.
        state = shapeState(read(STATE_KEY, {}));
        local = extractRecords(state);
        const session = loadSession();
        const outgoing = [];
        local.forEach((record, key) => {
          if (!cloudMap.has(key)) {
            outgoing.push({
              user_id: session.user.id,
              record_type: record.type,
              record_id: record.id,
              payload: record.payload,
              device_id: deviceId(),
              tombstone: false
            });
          }
        });
        if (outgoing.length) {
          await pushRows(outgoing);
          cloudRows = await fetchCloudRows();
        }

        state = shapeState(read(STATE_KEY, {}));
        local = extractRecords(state);
        const check = compare(local, cloudRows);
        const checkedISO = new Date().toISOString();
        write(VERIFIED_META_KEY, {
          lastVerifiedISO: check.mismatches.length ? "" : checkedISO,
          lastCheckedISO: checkedISO,
          mismatchCount: check.mismatches.length,
          counts: check.counts
        });

        if (check.mismatches.length) {
          setVerifiedBadge("CHECK", `${check.mismatches.length} record${check.mismatches.length === 1 ? "" : "s"} still differ from cloud. Tap Sync Now once and keep this device open.`);
          return false;
        }

        setVerifiedBadge(
          "SYNCED",
          `Verified ${new Date(checkedISO).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}: ${check.counts.trip || 0} trips, ${check.counts.inspection || 0} inspections, ${check.counts.active_job || 0} Active Jobs match cloud.`
        );
        return true;
      } catch (error) {
        console.warn("Verified sync check failed:", error);
        // Do not create a visual status loop. Show an error only when this was an explicit/manual check.
        if (reason === "manual") setVerifiedBadge("ERROR", `Sync verification failed: ${error.message}`);
        return false;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function scheduleVerify(reason, delay = 3500) {
    clearTimeout(scheduledTimer);
    scheduledTimer = setTimeout(() => verifyAndRepair(reason), delay);
  }

  function install() {
    // The legacy sync engine starts after ~1.5 seconds. Verify after it has had time to finish.
    scheduleVerify("startup", 5000);
    setInterval(() => verifyAndRepair("interval"), VERIFY_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleVerify("visible", 4000);
    });
    window.addEventListener("online", () => scheduleVerify("online", 4000));
    window.addEventListener("mileage:state-changed", (event) => {
      if (event.detail?.source === "verified-sync-repair-v2" || event.detail?.source === "cloud-sync") return;
      scheduleVerify("state-change", 5000);
    });

    const base = window.MileageMultiDeviceSync;
    if (base?.syncNow) {
      const original = base.syncNow.bind(base);
      base.syncNow = async (options = {}) => {
        const result = await original(options);
        await verifyAndRepair("manual");
        return result;
      };
      base.verifyAndRepair = () => verifyAndRepair("manual");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();