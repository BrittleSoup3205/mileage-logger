(() => {
  "use strict";

  const APP_STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const META_KEY = "mileage_logger_sync_meta_v1";
  const DEVICE_ID_KEY = "mileage_logger_sync_device_id_v1";
  const SYNC_INTERVAL_MS = 20000;
  const DEFAULT_PROJECT_URL = "https://osvubxisjfplnljabvrn.supabase.co";
  const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_n3tp6B8y5abgPN1r7ITUYA_cMuE7AlP";
  const RECORD_TYPES = new Set(["active_trip", "trip", "inspection", "timesheet_entry", "timesheet_week", "preferences"]);

  let syncTimer = null;
  let syncInFlight = false;
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
      records: meta.records && typeof meta.records === "object" ? meta.records : {},
      lastSyncISO: String(meta.lastSyncISO || ""),
      conflicts: Array.isArray(meta.conflicts) ? meta.conflicts.slice(-20) : []
    };
  }

  function saveMeta(meta) {
    writeJSON(META_KEY, {
      records: meta.records || {},
      lastSyncISO: meta.lastSyncISO || "",
      conflicts: (meta.conflicts || []).slice(-20)
    });
  }

  function readAppState() {
    return readJSON(APP_STATE_KEY, null);
  }

  function writeAppState(state) {
    applyingRemote = true;
    try {
      localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "cloud-sync" } }));
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
      workflow: {
        mileageRate: workflow.mileageRate ?? ""
      }
    };
  }

  function extractRecords(state) {
    const records = new Map();
    if (!state) return records;
    if (state.activeTrip?.id) records.set(recordKey("active_trip", "current"), { type: "active_trip", id: "current", payload: state.activeTrip });
    (Array.isArray(state.trips) ? state.trips : []).forEach((trip) => {
      if (trip?.id) records.set(recordKey("trip", trip.id), { type: "trip", id: trip.id, payload: trip });
    });
    (Array.isArray(state.settings?.inspections) ? state.settings.inspections : []).forEach((inspection) => {
      if (inspection?.id) records.set(recordKey("inspection", inspection.id), { type: "inspection", id: inspection.id, payload: inspection });
    });
    (Array.isArray(state.workflow?.timesheetEntries) ? state.workflow.timesheetEntries : []).forEach((entry) => {
      if (entry?.id) records.set(recordKey("timesheet_entry", entry.id), { type: "timesheet_entry", id: entry.id, payload: entry });
    });
    Object.entries(state.workflow?.timesheetWeeks || {}).forEach(([week, value]) => {
      records.set(recordKey("timesheet_week", week), { type: "timesheet_week", id: week, payload: value });
    });
    records.set(recordKey("preferences", "durable"), { type: "preferences", id: "durable", payload: durablePreferences(state) });
    return records;
  }

  function scanLocal(state, meta, options = {}) {
    const current = extractRecords(state);
    const currentKeys = new Set(current.keys());
    const timestamp = Date.now();

    current.forEach((record, key) => {
      const hash = hashValue(record.payload);
      const existing = meta.records[key];
      if (!existing) {
        meta.records[key] = { hash, modifiedAt: timestamp, syncedAt: 0, tombstone: false };
      } else if (existing.hash !== hash || existing.tombstone) {
        if (!options.remoteApplied) {
          existing.modifiedAt = timestamp;
          existing.syncedAt = Number(existing.syncedAt || 0);
        }
        existing.hash = hash;
        existing.tombstone = false;
      }
    });

    Object.entries(meta.records).forEach(([key, existing]) => {
      const [type] = key.split(":", 1);
      if (!RECORD_TYPES.has(type) || currentKeys.has(key) || existing.tombstone) return;
      existing.hash = "__deleted__";
      existing.tombstone = true;
      existing.modifiedAt = timestamp;
      existing.syncedAt = Number(existing.syncedAt || 0);
    });
    return current;
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

    if (type === "trip") {
      state.trips = Array.isArray(state.trips) ? state.trips : [];
      const index = state.trips.findIndex((item) => item?.id === id);
      if (deleted) {
        if (index >= 0) state.trips.splice(index, 1);
      } else if (index >= 0) state.trips[index] = payload;
      else state.trips.push(payload);
      return;
    }

    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    if (type === "inspection") {
      state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
      const index = state.settings.inspections.findIndex((item) => item?.id === id);
      if (deleted) {
        if (index >= 0) state.settings.inspections.splice(index, 1);
      } else if (index >= 0) state.settings.inspections[index] = payload;
      else state.settings.inspections.push(payload);
      return;
    }

    state.workflow = state.workflow && typeof state.workflow === "object" ? state.workflow : {};
    if (type === "timesheet_entry") {
      state.workflow.timesheetEntries = Array.isArray(state.workflow.timesheetEntries) ? state.workflow.timesheetEntries : [];
      const index = state.workflow.timesheetEntries.findIndex((item) => item?.id === id);
      if (deleted) {
        if (index >= 0) state.workflow.timesheetEntries.splice(index, 1);
      } else if (index >= 0) state.workflow.timesheetEntries[index] = payload;
      else state.workflow.timesheetEntries.push(payload);
      return;
    }

    if (type === "timesheet_week") {
      state.workflow.timesheetWeeks = state.workflow.timesheetWeeks && typeof state.workflow.timesheetWeeks === "object" ? state.workflow.timesheetWeeks : {};
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
    setStatus("ready", `Signed in as ${body.user?.email || email}.`);
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
      setStatus("ready", `Account created and signed in as ${body.user?.email || email}.`);
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
    return Array.isArray(rows) ? rows : [];
  }

  async function pushRows(rows) {
    if (!rows.length) return [];
    return request("/rest/v1/mileage_sync_records?on_conflict=user_id,record_type,record_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows)
    });
  }

  async function heartbeat(session, syncISO) {
    const config = loadConfig();
    await request("/rest/v1/mileage_sync_devices?on_conflict=user_id,device_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        user_id: session.user.id,
        device_id: deviceId(),
        device_label: config.deviceLabel,
        platform: platformLabel(),
        last_seen_at: syncISO,
        last_sync_at: syncISO
      }])
    });
  }

  function conflictMessage(meta) {
    const recent = (meta.conflicts || []).slice(-1)[0];
    if (!recent) return "";
    return ` Latest conflict: ${recent.type} ${recent.id}; ${recent.winner} copy kept.`;
  }

  async function syncNow(options = {}) {
    if (syncInFlight) return false;
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
    setStatus("syncing", options.reason === "manual" ? "Synchronizing now…" : "Synchronizing changes…");
    try {
      const session = await validSession();
      if (!session?.user?.id) throw new Error("Signed-in user information is unavailable.");
      let state = readAppState();
      if (!state) throw new Error("Mileage Logger local state is unavailable.");
      const meta = loadMeta();
      let localRecords = scanLocal(state, meta);
      const remoteRows = await fetchRemoteRecords();
      const remoteByKey = new Map(remoteRows.map((row) => [recordKey(row.record_type, row.record_id), row]));
      const initialCloudBootstrap = !meta.lastSyncISO && remoteRows.length > 0;
      let remoteApplied = false;

      for (const remote of remoteRows) {
        if (!RECORD_TYPES.has(remote.record_type)) continue;
        const key = recordKey(remote.record_type, remote.record_id);
        const remoteTime = Date.parse(remote.modified_at || "") || 0;
        const remoteHash = remote.tombstone ? "__deleted__" : hashValue(remote.payload);
        const localMeta = meta.records[key];
        const localRecord = localRecords.get(key);
        const localHash = localRecord ? hashValue(localRecord.payload) : (localMeta?.tombstone ? "__deleted__" : "__missing__");
        const contentDiffers = localHash !== remoteHash;

        if (!localMeta || (initialCloudBootstrap && contentDiffers)) {
          applyRemoteRecord(state, remote);
          meta.records[key] = { hash: remoteHash, modifiedAt: remoteTime, syncedAt: remoteTime, tombstone: Boolean(remote.tombstone) };
          remoteApplied = true;
          continue;
        }

        const localModified = Number(localMeta.modifiedAt || 0);
        const localSynced = Number(localMeta.syncedAt || 0);
        const localDirty = localModified > localSynced;
        const remoteChanged = remoteTime > localSynced;
        if (localDirty && remoteChanged && contentDiffers) {
          const remoteWins = remoteTime >= localModified;
          meta.conflicts.push({
            at: nowISO(),
            type: remote.record_type,
            id: remote.record_id,
            localDevice: deviceId(),
            remoteDevice: remote.device_id || "other device",
            winner: remoteWins ? "cloud/newer-device" : "this-device"
          });
          if (remoteWins) {
            applyRemoteRecord(state, remote);
            meta.records[key] = { hash: remoteHash, modifiedAt: remoteTime, syncedAt: remoteTime, tombstone: Boolean(remote.tombstone) };
            remoteApplied = true;
          }
          continue;
        }

        if (remoteChanged && remoteTime >= localModified && contentDiffers) {
          applyRemoteRecord(state, remote);
          meta.records[key] = { hash: remoteHash, modifiedAt: remoteTime, syncedAt: remoteTime, tombstone: Boolean(remote.tombstone) };
          remoteApplied = true;
        } else if (!contentDiffers && remoteTime > localSynced) {
          localMeta.syncedAt = remoteTime;
          localMeta.modifiedAt = Math.max(localModified, remoteTime);
          localMeta.hash = remoteHash;
          localMeta.tombstone = Boolean(remote.tombstone);
        }
      }

      if (remoteApplied) {
        saveMeta(meta);
        writeAppState(state);
        state = readAppState();
      }

      localRecords = scanLocal(state, meta, { remoteApplied });
      const outgoing = [];
      Object.entries(meta.records).forEach(([key, item]) => {
        const localModified = Number(item.modifiedAt || 0);
        const localSynced = Number(item.syncedAt || 0);
        if (localModified <= localSynced) return;
        const separator = key.indexOf(":");
        const type = key.slice(0, separator);
        const id = key.slice(separator + 1);
        if (!RECORD_TYPES.has(type)) return;
        const record = localRecords.get(key);
        outgoing.push({
          user_id: session.user.id,
          record_type: type,
          record_id: id,
          payload: item.tombstone ? null : (record?.payload ?? null),
          device_id: deviceId(),
          tombstone: Boolean(item.tombstone)
        });
      });

      const pushed = await pushRows(outgoing);
      const pushedRows = Array.isArray(pushed) ? pushed : [];
      const pushedByKey = new Map(pushedRows.map((row) => [recordKey(row.record_type, row.record_id), row]));
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
      });

      const syncISO = nowISO();
      meta.lastSyncISO = syncISO;
      saveMeta(meta);
      await heartbeat(session, syncISO);
      setStatus(meta.conflicts.length ? "warn" : "ready", `${outgoing.length ? `${outgoing.length} change${outgoing.length === 1 ? "" : "s"} synchronized. ` : ""}Synced ${new Date(syncISO).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.${conflictMessage(meta)}`);
      return true;
    } catch (error) {
      console.warn("Mileage Logger sync failed:", error);
      setStatus("error", `Sync paused: ${error.message}`);
      return false;
    } finally {
      syncInFlight = false;
    }
  }

  function setStatus(state, message) {
    lastStatus = { state, message };
    renderStatus();
  }

  function statusLabel(state) {
    return ({ off: "LOCAL", ready: "SYNCED", syncing: "SYNCING", offline: "OFFLINE", warn: "CHECK", error: "ERROR" })[state] || "SYNC";
  }

  function renderStatus() {
    const indicator = $("multiDeviceSyncIndicator");
    if (indicator) {
      indicator.textContent = statusLabel(lastStatus.state);
      indicator.dataset.syncState = lastStatus.state;
      indicator.title = lastStatus.message;
    }
    const status = $("multiDeviceSyncStatus");
    if (status) {
      status.textContent = lastStatus.message;
      status.dataset.syncState = lastStatus.state;
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
  }

  function injectUI() {
    if ($("multiDeviceSyncCard")) return;
    const topbar = document.querySelector(".topbar");
    if (topbar) {
      const indicator = document.createElement("button");
      indicator.id = "multiDeviceSyncIndicator";
      indicator.className = "sync-indicator";
      indicator.type = "button";
      indicator.textContent = "LOCAL";
      indicator.addEventListener("click", () => {
        $("multiDeviceSyncCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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
      <div id="multiDeviceSyncStatus" class="sync-status">Multi-device sync not configured.</div>
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
      <p class="privacy-note compact-note"><strong>Current phase:</strong> trips, active trip, inspections, vendor-load details, Concur status, timesheet entries/weeks, and durable app preferences synchronize. Actual photo files, the private STA master PDF, and other documents remain device-local until the file-sync phase is enabled.</p>
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
      setStatus(configReady(next) ? (sessionReady() ? "ready" : "warn") : "off", configReady(next) ? (sessionReady() ? "Sync setup saved." : "Sync setup saved. Sign in to begin synchronization.") : "Multi-device sync setup is incomplete. Local Mileage Logger continues to work normally.");
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
    const meta = loadMeta();
    setStatus("ready", meta.lastSyncISO ? `Last synced ${new Date(meta.lastSyncISO).toLocaleString()}.` : "Signed in. Initial synchronization pending.");
  }

  function startScheduler() {
    clearInterval(syncTimer);
    syncTimer = setInterval(() => syncNow({ reason: "interval" }), SYNC_INTERVAL_MS);
    window.addEventListener("online", () => syncNow({ reason: "online" }));
    window.addEventListener("offline", () => setStatus("offline", "Offline — local changes will sync when internet returns."));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow({ reason: "visible" });
    });
    window.addEventListener("mileage:state-changed", (event) => {
      if (applyingRemote || event.detail?.source === "cloud-sync") return;
      setTimeout(() => syncNow({ reason: "state-change" }), 1200);
    });
  }

  function initialize() {
    injectUI();
    initialStatus();
    startScheduler();
    setTimeout(() => syncNow({ reason: "startup" }), 1500);
  }

  window.MileageMultiDeviceSync = {
    syncNow,
    signIn,
    signOut,
    getStatus: () => ({ ...lastStatus }),
    getDeviceId: deviceId,
    getConfig: loadConfig
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
