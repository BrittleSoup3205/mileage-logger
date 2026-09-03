(() => {
  "use strict";

  const APP_STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const META_KEY = "mileage_logger_sync_meta_v1";
  const DEVICE_ID_KEY = "mileage_logger_sync_device_id_v1";
  const SYNC_INTERVAL_MS = 30000;
  const DEFAULT_PROJECT_URL = "https://osvubxisjfplnljabvrn.supabase.co";
  const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_n3tp6B8y5abgPN1r7ITUYA_cMuE7AlP";
  const RECORD_TYPES = new Set([
    "active_trip",
    "trip",
    "inspection",
    "timesheet_entry",
    "timesheet_week",
    "active_job",
    "facility_profile",
    "active_job_import",
    "active_job_proposal",
    "preferences"
  ]);

  let syncTimer = null;
  let scheduledSyncTimer = null;
  let syncInFlight = false;
  let syncRequested = false;
  let applyingRemote = false;
  let lastStatus = { state: "off", message: "Multi-device sync not configured." };

  const $ = (id) => document.getElementById(id);
  const nowISO = () => new Date().toISOString();

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

  function makeId(prefix = "sync") {
    if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function deviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = makeId("device");
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function defaultDeviceLabel() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/iPad/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPad";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/Windows/i.test(ua)) return "Windows PC";
    if (/Mac/i.test(platform)) return "Mac";
    return "Mileage Logger Device";
  }

  function platformLabel() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/iPad/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPadOS";
    if (/iPhone/i.test(ua)) return "iOS";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac/i.test(platform)) return "macOS";
    return platform || "Web";
  }

  function loadConfig() {
    const config = readJSON(CONFIG_KEY, {});
    return {
      enabled: config.enabled === undefined ? true : Boolean(config.enabled),
      projectUrl: String(config.projectUrl || DEFAULT_PROJECT_URL).trim().replace(/\/$/, ""),
      publishableKey: String(config.publishableKey || DEFAULT_PUBLISHABLE_KEY).trim(),
      email: String(config.email || "").trim(),
      deviceLabel: String(config.deviceLabel || defaultDeviceLabel()).trim() || defaultDeviceLabel()
    };
  }

  function saveConfig(config) {
    writeJSON(CONFIG_KEY, {
      enabled: Boolean(config.enabled),
      projectUrl: String(config.projectUrl || "").trim().replace(/\/$/, ""),
      publishableKey: String(config.publishableKey || "").trim(),
      email: String(config.email || "").trim(),
      deviceLabel: String(config.deviceLabel || defaultDeviceLabel()).trim() || defaultDeviceLabel()
    });
  }

  function loadSession() {
    return readJSON(SESSION_KEY, null);
  }

  function saveSession(session) {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else writeJSON(SESSION_KEY, session);
  }

  function loadMeta() {
    const meta = readJSON(META_KEY, {});
    return {
      version: 2,
      records: meta.records && typeof meta.records === "object" ? meta.records : {},
      lastSyncISO: String(meta.lastSyncISO || ""),
      lastCheckedISO: String(meta.lastCheckedISO || ""),
      lastMismatchKeys: Array.isArray(meta.lastMismatchKeys) ? meta.lastMismatchKeys.slice(0, 20) : [],
      conflicts: Array.isArray(meta.conflicts) ? meta.conflicts.slice(-20) : []
    };
  }

  function saveMeta(meta) {
    writeJSON(META_KEY, {
      version: 2,
      records: meta.records || {},
      lastSyncISO: meta.lastSyncISO || "",
      lastCheckedISO: meta.lastCheckedISO || "",
      lastMismatchKeys: (meta.lastMismatchKeys || []).slice(0, 20),
      conflicts: (meta.conflicts || []).slice(-20)
    });
  }

  function readAppState() {
    return readJSON(APP_STATE_KEY, null);
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

  function cloudBootstrapState() {
    return shapeState({
      activeTrip: null,
      trips: [],
      lastOdometer: "",
      backup: {},
      settings: { inspections: [] },
      workflow: { timesheetEntries: [], timesheetWeeks: {} },
      activeJobs: [],
      facilityProfiles: [],
      activeJobImports: [],
      activeJobUpdateProposals: []
    });
  }

  function recalculateOdometer(state) {
    const latest = [...(Array.isArray(state.trips) ? state.trips : [])]
      .filter((trip) => trip?.endOdometer !== undefined && trip?.endOdometer !== null && trip?.endOdometer !== "")
      .sort((left, right) => String(right.endISO || right.date || "").localeCompare(String(left.endISO || left.date || "")))[0];
    const next = latest?.endOdometer ?? "";
    if (String(state.lastOdometer ?? "") === String(next ?? "")) return false;
    state.lastOdometer = next;
    return true;
  }

  function writeAppState(state, source = "cloud-sync-v2") {
    applyingRemote = true;
    try {
      localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source } }));
    } finally {
      setTimeout(() => { applyingRemote = false; }, 0);
    }
  }

  function stableObject(value) {
    if (Array.isArray(value)) return value.map(stableObject);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
    }
    return value;
  }

  function hashValue(value) {
    const text = JSON.stringify(stableObject(value));
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function recordKey(type, id) {
    return `${type}:${id}`;
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

  function extractRecords(rawState) {
    const state = shapeState(rawState);
    const records = new Map();
    if (state.activeTrip?.id) records.set(recordKey("active_trip", "current"), { type: "active_trip", id: "current", payload: state.activeTrip });
    state.trips.forEach((item) => item?.id && records.set(recordKey("trip", item.id), { type: "trip", id: item.id, payload: item }));
    state.settings.inspections.forEach((item) => item?.id && records.set(recordKey("inspection", item.id), { type: "inspection", id: item.id, payload: item }));
    state.activeJobs.forEach((item) => item?.aj && records.set(recordKey("active_job", item.aj), { type: "active_job", id: item.aj, payload: item }));
    state.facilityProfiles.forEach((item) => item?.id && records.set(recordKey("facility_profile", item.id), { type: "facility_profile", id: item.id, payload: item }));
    state.activeJobImports.forEach((item) => item?.id && records.set(recordKey("active_job_import", item.id), { type: "active_job_import", id: item.id, payload: item }));
    state.activeJobUpdateProposals.forEach((item) => item?.id && records.set(recordKey("active_job_proposal", item.id), { type: "active_job_proposal", id: item.id, payload: item }));
    state.workflow.timesheetEntries.forEach((item) => item?.id && records.set(recordKey("timesheet_entry", item.id), { type: "timesheet_entry", id: item.id, payload: item }));
    Object.entries(state.workflow.timesheetWeeks).forEach(([id, payload]) => records.set(recordKey("timesheet_week", id), { type: "timesheet_week", id, payload }));
    records.set(recordKey("preferences", "durable"), { type: "preferences", id: "durable", payload: durablePreferences(state) });
    return records;
  }

  function authorizedLocalTombstone(item, type) {
    if (!item?.tombstone) return false;
    if (item.deletionSource === "explicit") return true;
    return type === "active_trip" && item.deletionSource === "active-trip-cleared";
  }

  function scanLocal(state, meta, options = {}) {
    const current = extractRecords(state);
    const timestamp = Date.now();

    current.forEach((record, key) => {
      const hash = hashValue(record.payload);
      const existing = meta.records[key];
      if (!existing) {
        meta.records[key] = {
          hash,
          modifiedAt: timestamp,
          syncedAt: options.seedNewAsSynced ? timestamp : 0,
          tombstone: false,
          deletionSource: ""
        };
      } else if (existing.hash !== hash || existing.tombstone) {
        if (!options.remoteApplied) {
          existing.modifiedAt = timestamp;
          existing.syncedAt = Number(existing.syncedAt || 0);
        }
        existing.hash = hash;
        existing.tombstone = false;
        existing.deletionSource = "";
      }
    });

    const activeTripKey = recordKey("active_trip", "current");
    const activeTripMeta = meta.records[activeTripKey];
    if (!current.has(activeTripKey) && activeTripMeta && !activeTripMeta.tombstone && !options.suppressActiveTripTombstone) {
      activeTripMeta.hash = "__deleted__";
      activeTripMeta.tombstone = true;
      activeTripMeta.deletionSource = "active-trip-cleared";
      activeTripMeta.modifiedAt = timestamp;
      activeTripMeta.syncedAt = Number(activeTripMeta.syncedAt || 0);
    }

    return current;
  }

  function replaceRecord(array, field, id, payload, deleted) {
    const index = array.findIndex((item) => item?.[field] === id);
    if (deleted) {
      if (index >= 0) array.splice(index, 1);
    } else if (index >= 0) array[index] = payload;
    else array.push(payload);
  }

  function applyRemoteRecord(state, remote) {
    const type = remote.record_type;
    const id = remote.record_id;
    const payload = remote.payload;
    const deleted = Boolean(remote.tombstone);

    if (type === "active_trip" && id === "current") {
      state.activeTrip = deleted ? null : payload;
      return;
    }
    if (type === "trip") return replaceRecord(state.trips, "id", id, payload, deleted);
    if (type === "inspection") return replaceRecord(state.settings.inspections, "id", id, payload, deleted);
    if (type === "active_job") return replaceRecord(state.activeJobs, "aj", id, payload, deleted);
    if (type === "facility_profile") return replaceRecord(state.facilityProfiles, "id", id, payload, deleted);
    if (type === "active_job_import") {
      replaceRecord(state.activeJobImports, "id", id, payload, deleted);
      state.activeJobImports.sort((left, right) => String(right.importedISO || "").localeCompare(String(left.importedISO || "")));
      return;
    }
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

  function setMetaFromRemote(meta, key, remote) {
    const remoteTime = Date.parse(remote.modified_at || "") || Date.now();
    meta.records[key] = {
      hash: remote.tombstone ? "__deleted__" : hashValue(remote.payload),
      modifiedAt: remoteTime,
      syncedAt: remoteTime,
      tombstone: Boolean(remote.tombstone),
      deletionSource: remote.tombstone ? "cloud" : ""
    };
  }

  function configReady(config = loadConfig()) {
    return Boolean(config.enabled && /^https:\/\//i.test(config.projectUrl) && config.publishableKey && config.email);
  }

  function sessionReady(session = loadSession()) {
    return Boolean(session?.access_token && session?.refresh_token && session?.user?.id);
  }

  function isSecretKey(key) {
    const value = String(key || "").toLowerCase();
    return value.includes("service_role") || value.startsWith("sb_secret_");
  }

  async function validSession() {
    let session = loadSession();
    if (!session) return null;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt - Date.now() > 60000) return session;
    const config = loadConfig();
    const response = await fetch(`${config.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const bodyText = await response.text();
    const body = bodyText ? safeJSONParse(bodyText, {}) : {};
    if (!response.ok) {
      saveSession(null);
      throw new Error(body?.error_description || body?.msg || "Sync sign-in expired. Sign in again.");
    }
    session = body;
    saveSession(session);
    return session;
  }

  async function request(path, options = {}) {
    const config = loadConfig();
    if (!config.projectUrl || !config.publishableKey) throw new Error("Sync project URL and publishable key are required.");
    if (isSecretKey(config.publishableKey)) throw new Error("Do not use a service-role or secret key in Mileage Logger. Use the public/publishable key only.");
    const headers = new Headers(options.headers || {});
    headers.set("apikey", config.publishableKey);
    if (options.auth !== false) {
      const session = await validSession();
      if (!session?.access_token) throw new Error("Sign in to Mileage Logger sync first.");
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${config.projectUrl}${path}`, { ...options, headers });
    const text = await response.text();
    const body = text ? safeJSONParse(text, text) : null;
    if (!response.ok) {
      const message = body?.msg || body?.message || body?.error_description || body?.error || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return body;
  }

  async function signIn(email, password) {
    const config = loadConfig();
    const response = await fetch(`${config.projectUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const text = await response.text();
    const body = text ? safeJSONParse(text, {}) : {};
    if (!response.ok) throw new Error(body?.error_description || body?.msg || "Could not sign in.");
    saveSession(body);
    setStatus("check", `Signed in as ${body.user?.email || email}. Verifying records…`);
    await syncNow({ reason: "sign-in" });
    return body;
  }

  async function signUp(email, password) {
    const config = loadConfig();
    const response = await fetch(`${config.projectUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const text = await response.text();
    const body = text ? safeJSONParse(text, {}) : {};
    if (!response.ok) throw new Error(body?.error_description || body?.msg || "Could not create the sync account.");
    if (body.access_token) {
      saveSession(body);
      setStatus("check", `Account created. Verifying records for ${body.user?.email || email}…`);
      await syncNow({ reason: "signup" });
    } else {
      setStatus("warn", "Account created. Check your email if confirmation is required, then sign in.");
    }
    return body;
  }

  function signOut() {
    saveSession(null);
    setStatus(configReady() ? "warn" : "off", configReady() ? "Signed out. Local Mileage Logger data remains on this device." : "Multi-device sync not configured.");
  }

  async function fetchRemoteRecords() {
    const rows = await request("/rest/v1/mileage_sync_records?select=record_type,record_id,payload,modified_at,device_id,tombstone&order=modified_at.asc", { method: "GET" });
    return Array.isArray(rows) ? rows.filter((row) => RECORD_TYPES.has(row.record_type)) : [];
  }

  async function pushRows(rows) {
    if (!rows.length) return [];
    return request("/rest/v1/mileage_sync_records?on_conflict=user_id,record_type,record_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows)
    });
  }

  async function heartbeat(session, seenISO, verifiedISO = "") {
    const config = loadConfig();
    const row = {
      user_id: session.user.id,
      device_id: deviceId(),
      device_label: config.deviceLabel,
      platform: platformLabel(),
      last_seen_at: seenISO
    };
    if (verifiedISO) row.last_sync_at = verifiedISO;
    await request("/rest/v1/mileage_sync_devices?on_conflict=user_id,device_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([row])
    });
  }

  function buildOutgoing(state, meta, session) {
    const local = extractRecords(state);
    const outgoing = [];
    Object.entries(meta.records).forEach(([key, item]) => {
      const separator = key.indexOf(":");
      const type = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (!RECORD_TYPES.has(type)) return;
      const localModified = Number(item.modifiedAt || 0);
      const localSynced = Number(item.syncedAt || 0);
      if (localModified <= localSynced) return;
      if (item.tombstone) {
        if (!authorizedLocalTombstone(item, type)) return;
        outgoing.push({ user_id: session.user.id, record_type: type, record_id: id, payload: null, device_id: deviceId(), tombstone: true });
        return;
      }
      const record = local.get(key);
      if (!record) return;
      outgoing.push({ user_id: session.user.id, record_type: type, record_id: id, payload: record.payload, device_id: deviceId(), tombstone: false });
    });
    return outgoing;
  }

  function updateMetaFromPush(meta, outgoing, pushedRows) {
    const pushedByKey = new Map((Array.isArray(pushedRows) ? pushedRows : []).map((row) => [recordKey(row.record_type, row.record_id), row]));
    outgoing.forEach((row) => {
      const key = recordKey(row.record_type, row.record_id);
      const item = meta.records[key];
      if (!item) return;
      const serverRow = pushedByKey.get(key);
      const serverTime = Date.parse(serverRow?.modified_at || "") || Date.now();
      item.modifiedAt = serverTime;
      item.syncedAt = serverTime;
      item.hash = row.tombstone ? "__deleted__" : hashValue(row.payload);
      item.tombstone = Boolean(row.tombstone);
      item.deletionSource = row.tombstone ? (item.deletionSource || "explicit") : "";
    });
  }

  function compareStateToCloud(state, cloudRows) {
    const local = extractRecords(state);
    const cloudMap = new Map(cloudRows.map((row) => [recordKey(row.record_type, row.record_id), row]));
    const mismatches = [];
    cloudRows.forEach((row) => {
      const key = recordKey(row.record_type, row.record_id);
      const localRecord = local.get(key);
      if (row.tombstone) {
        if (localRecord) mismatches.push(key);
      } else if (!localRecord || hashValue(localRecord.payload) !== hashValue(row.payload)) {
        mismatches.push(key);
      }
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

  function recordConflict(meta, remote, winner) {
    meta.conflicts.push({
      at: nowISO(),
      type: remote.record_type,
      id: remote.record_id,
      localDevice: deviceId(),
      remoteDevice: remote.device_id || "other device",
      winner
    });
  }

  function mergeCloudIntoLocal(state, meta, remoteRows, options = {}) {
    let changed = false;
    let localRecords = extractRecords(state);

    for (const remote of remoteRows) {
      const key = recordKey(remote.record_type, remote.record_id);
      const remoteTime = Date.parse(remote.modified_at || "") || 0;
      const remoteHash = remote.tombstone ? "__deleted__" : hashValue(remote.payload);
      const localRecord = localRecords.get(key);
      const localMeta = meta.records[key];

      if (!localRecord) {
        const explicitLocalDelete = localMeta && authorizedLocalTombstone(localMeta, remote.record_type) && Number(localMeta.modifiedAt || 0) > Number(localMeta.syncedAt || 0);
        if (explicitLocalDelete) {
          if (remoteTime >= Number(localMeta.modifiedAt || 0)) {
            applyRemoteRecord(state, remote);
            setMetaFromRemote(meta, key, remote);
            changed = true;
          }
          continue;
        }
        if (!remote.tombstone) {
          applyRemoteRecord(state, remote);
          changed = true;
        }
        setMetaFromRemote(meta, key, remote);
        localRecords = extractRecords(state);
        continue;
      }

      const localHash = hashValue(localRecord.payload);
      if (localHash === remoteHash) {
        const existing = localMeta || {};
        existing.hash = remoteHash;
        existing.syncedAt = Math.max(Number(existing.syncedAt || 0), remoteTime);
        existing.modifiedAt = Math.max(Number(existing.modifiedAt || 0), remoteTime);
        existing.tombstone = Boolean(remote.tombstone);
        existing.deletionSource = remote.tombstone ? "cloud" : "";
        meta.records[key] = existing;
        continue;
      }

      if (!localMeta || options.bootstrap) {
        applyRemoteRecord(state, remote);
        setMetaFromRemote(meta, key, remote);
        changed = true;
        localRecords = extractRecords(state);
        continue;
      }

      const localModified = Number(localMeta.modifiedAt || 0);
      const localSynced = Number(localMeta.syncedAt || 0);
      const localDirty = localModified > localSynced;
      const remoteChanged = remoteTime > localSynced;

      if (localDirty && remoteChanged) {
        const remoteWins = remoteTime >= localModified;
        recordConflict(meta, remote, remoteWins ? "cloud/newer-device" : "this-device");
        if (remoteWins) {
          applyRemoteRecord(state, remote);
          setMetaFromRemote(meta, key, remote);
          changed = true;
          localRecords = extractRecords(state);
        }
        continue;
      }

      if (!localDirty || (remoteChanged && remoteTime >= localModified)) {
        applyRemoteRecord(state, remote);
        setMetaFromRemote(meta, key, remote);
        changed = true;
        localRecords = extractRecords(state);
      }
    }

    if (recalculateOdometer(state)) changed = true;
    return changed;
  }

  async function finalReconcile(state, meta, session) {
    let cloudRows = await fetchRemoteRecords();
    let changed = mergeCloudIntoLocal(state, meta, cloudRows, { bootstrap: false });
    if (changed) {
      writeAppState(state, "cloud-sync-final-reconcile");
      state = shapeState(readAppState());
      scanLocal(state, meta, { remoteApplied: true, suppressActiveTripTombstone: true });
    }

    let outgoing = buildOutgoing(state, meta, session);
    if (outgoing.length) {
      const pushed = await pushRows(outgoing);
      updateMetaFromPush(meta, outgoing, pushed);
      cloudRows = await fetchRemoteRecords();
    }

    changed = mergeCloudIntoLocal(state, meta, cloudRows, { bootstrap: false });
    if (changed) {
      writeAppState(state, "cloud-sync-final-reconcile-2");
      state = shapeState(readAppState());
      scanLocal(state, meta, { remoteApplied: true, suppressActiveTripTombstone: true });
    }

    cloudRows = await fetchRemoteRecords();
    return { state, cloudRows, check: compareStateToCloud(state, cloudRows) };
  }

  async function syncNow(options = {}) {
    if (syncInFlight) {
      syncRequested = true;
      return false;
    }
    const config = loadConfig();
    if (!configReady(config)) {
      setStatus("off", "Multi-device sync not configured. Local/offline Mileage Logger still works normally.");
      return false;
    }
    if (!navigator.onLine) {
      setStatus("offline", "Offline — local changes are safe on this device and will sync when internet returns.");
      return false;
    }
    if (!sessionReady()) {
      setStatus("warn", "Sync configured but signed out. Sign in to synchronize this device.");
      return false;
    }

    syncInFlight = true;
    syncRequested = false;
    setStatus("syncing", options.reason === "manual" ? "Synchronizing and verifying now…" : "Synchronizing and verifying changes…");

    try {
      const session = await validSession();
      if (!session?.user?.id) throw new Error("Signed-in user information is unavailable.");
      const seenISO = nowISO();
      await heartbeat(session, seenISO, "");

      const storedStateMissing = localStorage.getItem(APP_STATE_KEY) === null;
      let state = readAppState();
      const meta = loadMeta();
      const conflictCountBefore = meta.conflicts.length;
      let remoteRows = await fetchRemoteRecords();
      const cloudBootstrap = !state && storedStateMissing && remoteRows.some((row) => RECORD_TYPES.has(row.record_type) && !row.tombstone);
      if (!state && !cloudBootstrap) throw new Error("Mileage Logger local state is unavailable.");
      if (cloudBootstrap) {
        state = cloudBootstrapState();
        meta.records = {};
        meta.lastSyncISO = "";
      } else {
        state = shapeState(state);
      }

      scanLocal(state, meta, { seedNewAsSynced: false, suppressActiveTripTombstone: cloudBootstrap });
      const merged = mergeCloudIntoLocal(state, meta, remoteRows, { bootstrap: cloudBootstrap || !meta.lastSyncISO });
      if (merged || cloudBootstrap) {
        writeAppState(state, "cloud-sync-merge-v2");
        state = shapeState(readAppState());
      }

      scanLocal(state, meta, { remoteApplied: merged, seedNewAsSynced: cloudBootstrap, suppressActiveTripTombstone: cloudBootstrap });
      let outgoing = buildOutgoing(state, meta, session);
      if (outgoing.length) {
        const pushed = await pushRows(outgoing);
        updateMetaFromPush(meta, outgoing, pushed);
      }

      const reconciled = await finalReconcile(state, meta, session);
      state = reconciled.state;
      remoteRows = reconciled.cloudRows;
      const check = reconciled.check;
      const checkedISO = nowISO();
      meta.lastCheckedISO = checkedISO;
      meta.lastMismatchKeys = check.mismatches.slice(0, 20);

      if (check.mismatches.length) {
        saveMeta(meta);
        await heartbeat(session, checkedISO, "");
        const sample = check.mismatches.slice(0, 3).join(", ");
        setStatus("check", `${check.mismatches.length} record${check.mismatches.length === 1 ? "" : "s"} still differ from cloud${sample ? ` (${sample})` : ""}. This device will retry automatically.`);
        return false;
      }

      meta.lastSyncISO = checkedISO;
      saveMeta(meta);
      await heartbeat(session, checkedISO, checkedISO);
      const newConflicts = Math.max(0, meta.conflicts.length - conflictCountBefore);
      const summary = `${check.counts.trip || 0} trips, ${check.counts.inspection || 0} inspections, ${check.counts.active_job || 0} Active Jobs`;
      setStatus(newConflicts ? "warn" : "ready", `Verified ${new Date(checkedISO).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}: ${summary} match cloud.${newConflicts ? " A newer-copy conflict was resolved; see Sync History." : ""}`);
      return true;
    } catch (error) {
      console.warn("Mileage Logger sync failed:", error);
      setStatus("error", `Sync paused: ${error.message}`);
      return false;
    } finally {
      syncInFlight = false;
      if (syncRequested) {
        syncRequested = false;
        scheduleSync("queued-change", 500);
      }
    }
  }

  function markDeleted(type, id) {
    if (!RECORD_TYPES.has(type) || !id) return false;
    const meta = loadMeta();
    const key = recordKey(type, id);
    const existing = meta.records[key] || {};
    meta.records[key] = {
      ...existing,
      hash: "__deleted__",
      modifiedAt: Date.now(),
      syncedAt: Number(existing.syncedAt || 0),
      tombstone: true,
      deletionSource: "explicit"
    };
    saveMeta(meta);
    scheduleSync("explicit-delete", 100);
    return true;
  }

  function setStatus(state, message) {
    lastStatus = { state, message };
    renderStatus();
  }

  function statusLabel(state) {
    return ({ off: "LOCAL", ready: "SYNCED", syncing: "SYNCING", offline: "OFFLINE", check: "CHECK", warn: "CHECK", error: "ERROR" })[state] || "SYNC";
  }

  function renderStatus() {
    const indicator = $("multiDeviceSyncIndicator");
    if (indicator) {
      indicator.textContent = statusLabel(lastStatus.state);
      indicator.dataset.syncState = lastStatus.state === "check" ? "warn" : lastStatus.state;
      indicator.title = lastStatus.message;
    }
    const status = $("multiDeviceSyncStatus");
    if (status) {
      status.textContent = lastStatus.message;
      status.dataset.syncState = lastStatus.state === "check" ? "warn" : lastStatus.state;
    }
    const config = loadConfig();
    const session = loadSession();
    const signedIn = sessionReady(session);
    const syncButton = $("multiDeviceSyncNowBtn");
    if (syncButton) syncButton.disabled = !configReady(config) || !signedIn || syncInFlight;
    const signOutButton = $("multiDeviceSignOutBtn");
    if (signOutButton) signOutButton.disabled = !signedIn;
    const identity = $("multiDeviceIdentity");
    if (identity) identity.textContent = signedIn ? `Signed in: ${session.user?.email || config.email}` : "Not signed in";
    const history = $("multiDeviceSyncHistory");
    if (history) {
      const meta = loadMeta();
      const conflicts = [...meta.conflicts].reverse();
      const mismatch = meta.lastMismatchKeys.length ? `<p><strong>Last unmatched records:</strong> ${escapeHTML(meta.lastMismatchKeys.join(", "))}</p>` : "";
      history.innerHTML = `<p><strong>Current sync health:</strong> ${escapeHTML(statusLabel(lastStatus.state))}</p><p><strong>Last verified sync:</strong> ${meta.lastSyncISO ? escapeHTML(new Date(meta.lastSyncISO).toLocaleString()) : "Not yet verified"}</p>${mismatch}${conflicts.length ? `<div class="sync-history-list">${conflicts.map((item) => `<article><strong>${escapeHTML(item.type)} ${escapeHTML(item.id)}</strong><small>${escapeHTML(new Date(item.at).toLocaleString())} • ${escapeHTML(item.winner)} copy kept • remote ${escapeHTML(item.remoteDevice || "other device")}</small></article>`).join("")}</div>` : `<p>No historical conflicts.</p>`}`;
    }
  }

  function injectUI() {
    if ($("multiDeviceSyncCard")) return;
    const topbar = document.querySelector(".topbar");
    if (topbar) {
      const indicator = document.createElement("button");
      indicator.id = "multiDeviceSyncIndicator";
      indicator.className = "sync-indicator";
      indicator.type = "button";
      indicator.textContent = "CHECK";
      indicator.addEventListener("click", () => $("multiDeviceSyncCard")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      topbar.appendChild(indicator);
    }

    const settingsSection = $("settingsSection") || document.querySelector("section[id*='settings']");
    if (!settingsSection) return;
    const config = loadConfig();
    const card = document.createElement("section");
    card.id = "multiDeviceSyncCard";
    card.className = "sync-settings-card";
    card.innerHTML = `
      <div class="sync-heading">
        <div><p class="eyebrow">Upgrade #5</p><h3>Multi-Device Mileage Logger</h3></div>
        <span id="multiDeviceIdentity" class="sync-identity">Not signed in</span>
      </div>
      <p class="sync-explainer">Use the same Mileage Logger records on iPhone, iPad, and PC. Local data remains available offline; structured changes synchronize when internet is available.</p>
      <div id="multiDeviceSyncStatus" class="sync-status">Checking cloud agreement…</div>
      <details class="sync-advanced"><summary>Sync History</summary><div id="multiDeviceSyncHistory"></div></details>
      <div class="sync-grid">
        <label>Sync email<input id="multiDeviceEmail" type="email" autocomplete="email" value="${escapeHTML(config.email)}" placeholder="Your private sync login"></label>
        <label>Device name<input id="multiDeviceDeviceLabel" value="${escapeHTML(config.deviceLabel)}" placeholder="Example: Jeremy's iPhone"></label>
      </div>
      <label>Sync password<input id="multiDevicePassword" type="password" autocomplete="current-password" placeholder="Not stored by Mileage Logger"></label>
      <div class="form-actions wrap sync-actions">
        <button id="multiDeviceSignInBtn" class="button button-primary button-small" type="button">Sign In</button>
        <button id="multiDeviceCreateAccountBtn" class="button button-secondary button-small" type="button">Create Account</button>
        <button id="multiDeviceSyncNowBtn" class="button button-secondary button-small" type="button">Sync Now</button>
        <button id="multiDeviceSignOutBtn" class="button button-quiet button-small" type="button">Sign Out</button>
      </div>
      <details class="sync-advanced">
        <summary>One-time cloud setup</summary>
        <p>Use only the project's public/publishable key. Never enter a service-role or secret key.</p>
        <label>Supabase project URL<input id="multiDeviceProjectUrl" inputmode="url" value="${escapeHTML(config.projectUrl)}" placeholder="https://your-project.supabase.co"></label>
        <label>Public / publishable key<input id="multiDevicePublishableKey" type="password" value="${escapeHTML(config.publishableKey)}" placeholder="Public/publishable key only"></label>
        <label class="checkbox-row"><input id="multiDeviceEnabled" type="checkbox"${config.enabled ? " checked" : ""}><span>Enable multi-device synchronization on this device</span></label>
        <button id="multiDeviceSaveConfigBtn" class="button button-secondary button-small" type="button">Save Sync Setup</button>
      </details>
      <p class="privacy-note compact-note"><strong>Sync rule:</strong> a device that is missing a record does not delete that record from the cloud. Deletions require an explicit delete action. The SYNCED badge appears only after this device is verified against cloud records.</p>
    `;
    const firstCard = settingsSection.querySelector(".settings-card, .warning-card, form, .card");
    if (firstCard) firstCard.insertAdjacentElement("beforebegin", card);
    else settingsSection.prepend(card);

    $("multiDeviceSaveConfigBtn")?.addEventListener("click", () => {
      const next = {
        enabled: Boolean($("multiDeviceEnabled")?.checked),
        projectUrl: $("multiDeviceProjectUrl")?.value || "",
        publishableKey: $("multiDevicePublishableKey")?.value || "",
        email: $("multiDeviceEmail")?.value || "",
        deviceLabel: $("multiDeviceDeviceLabel")?.value || defaultDeviceLabel()
      };
      if (isSecretKey(next.publishableKey)) {
        window.alert("Do not enter a service-role or secret key. Use the Supabase public/publishable key only.");
        return;
      }
      saveConfig(next);
      setStatus(configReady(next) ? (sessionReady() ? "check" : "warn") : "off", configReady(next) ? (sessionReady() ? "Sync setup saved. Verification pending." : "Sync setup saved. Sign in to begin synchronization.") : "Multi-device sync setup is incomplete. Local Mileage Logger continues to work normally.");
    });

    $("multiDeviceSignInBtn")?.addEventListener("click", async () => {
      const password = $("multiDevicePassword")?.value || "";
      const email = ($("multiDeviceEmail")?.value || "").trim();
      const configNow = loadConfig();
      if (!configReady({ ...configNow, email })) {
        window.alert("Complete and save the one-time cloud setup first.");
        return;
      }
      saveConfig({ ...configNow, email, deviceLabel: $("multiDeviceDeviceLabel")?.value || configNow.deviceLabel });
      try { await signIn(email, password); }
      catch (error) { setStatus("error", `Sign in failed: ${error.message}`); }
      if ($("multiDevicePassword")) $("multiDevicePassword").value = "";
    });

    $("multiDeviceCreateAccountBtn")?.addEventListener("click", async () => {
      const password = $("multiDevicePassword")?.value || "";
      const email = ($("multiDeviceEmail")?.value || "").trim();
      const configNow = loadConfig();
      if (!configReady({ ...configNow, email })) {
        window.alert("Complete and save the one-time cloud setup first.");
        return;
      }
      if (password.length < 8) {
        window.alert("Use a sync password with at least 8 characters.");
        return;
      }
      saveConfig({ ...configNow, email, deviceLabel: $("multiDeviceDeviceLabel")?.value || configNow.deviceLabel });
      try { await signUp(email, password); }
      catch (error) { setStatus("error", `Account creation failed: ${error.message}`); }
      if ($("multiDevicePassword")) $("multiDevicePassword").value = "";
    });

    $("multiDeviceSyncNowBtn")?.addEventListener("click", () => syncNow({ reason: "manual" }));
    $("multiDeviceSignOutBtn")?.addEventListener("click", signOut);
    renderStatus();
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initialStatus() {
    if (!configReady()) return setStatus("off", "Multi-device sync not configured. Local/offline Mileage Logger works normally.");
    if (!sessionReady()) return setStatus("warn", "Sync setup is ready. Sign in to synchronize this device.");
    if (!navigator.onLine) return setStatus("offline", "Offline — local changes will sync when internet returns.");
    setStatus("check", "Signed in. Verifying this device against cloud records…");
  }

  function scheduleSync(reason = "scheduled", delay = 500) {
    clearTimeout(scheduledSyncTimer);
    scheduledSyncTimer = setTimeout(() => syncNow({ reason }), Math.max(0, delay));
  }

  function startScheduler() {
    clearInterval(syncTimer);
    syncTimer = setInterval(() => syncNow({ reason: "interval" }), SYNC_INTERVAL_MS);
    window.addEventListener("online", () => scheduleSync("online", 100));
    window.addEventListener("offline", () => setStatus("offline", "Offline — local changes will sync when internet returns."));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleSync("visible", 150);
    });
    window.addEventListener("mileage:state-changed", (event) => {
      if (applyingRemote || String(event.detail?.source || "").startsWith("cloud-sync")) return;
      scheduleSync("state-change", 700);
    });
  }

  function initialize() {
    injectUI();
    initialStatus();
    startScheduler();
    scheduleSync("startup", 800);
  }

  window.MileageMultiDeviceSync = {
    syncNow,
    signIn,
    signOut,
    markDeleted,
    getStatus: () => ({ ...lastStatus }),
    getDeviceId: deviceId,
    getConfig: loadConfig
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
