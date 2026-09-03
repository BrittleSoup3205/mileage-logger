(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const DEVICE_ID_KEY = "mileage_logger_sync_device_id_v1";
  const CHECKPOINT_TYPE = "backup_checkpoint";
  const CHECKPOINT_ID = "latest";
  let syncTimer = null;
  let inFlight = false;

  function safeParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function fnv32(input, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function legacyTripId(trip) {
    const source = trip && typeof trip === "object" ? trip : {};
    const fingerprint = [
      source.date,
      source.startISO,
      source.endISO,
      source.startTime,
      source.endTime,
      source.startOdometer,
      source.endOdometer,
      source.miles,
      source.customer,
      source.vendor,
      source.projectNumber,
      source.purpose,
      source.startLocation?.latitude,
      source.startLocation?.longitude,
      source.endLocation?.latitude,
      source.endLocation?.longitude
    ].map(text).join("\u241f");
    return `legacy-trip-${fnv32(fingerprint, 2166136261)}${fnv32(fingerprint, 2246822519)}`;
  }

  function assignTripIds(state) {
    if (!state || typeof state !== "object") return false;
    let changed = false;
    if (Array.isArray(state.trips)) {
      state.trips.forEach((trip) => {
        if (!trip || typeof trip !== "object" || text(trip.id)) return;
        trip.id = legacyTripId(trip);
        changed = true;
      });
    }
    if (state.activeTrip && typeof state.activeTrip === "object" && !text(state.activeTrip.id)) {
      state.activeTrip.id = legacyTripId(state.activeTrip);
      changed = true;
    }
    return changed;
  }

  function wrapWorkflowMigration() {
    const api = window.MileageWorkflowData;
    if (!api || api.__integrityTripIdFixApplied) return;
    const originalTrip = typeof api.migrateTrip === "function" ? api.migrateTrip.bind(api) : (trip) => trip;
    const originalState = typeof api.migrateState === "function" ? api.migrateState.bind(api) : (state) => state;

    api.migrateTrip = (trip) => {
      const migrated = originalTrip(trip) || {};
      if (!text(migrated.id)) migrated.id = legacyTripId(migrated);
      return migrated;
    };

    api.migrateState = (state) => {
      const migrated = originalState(state) || {};
      assignTripIds(migrated);
      return migrated;
    };

    api.__integrityTripIdFixApplied = true;
    api.legacyTripId = legacyTripId;
  }

  function migrateStoredTripIds() {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const state = safeParse(raw, null);
    if (!state || !assignTripIds(state)) return false;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "integrity-trip-id-migration" } }));
    setTimeout(() => window.MileageMultiDeviceSync?.syncNow?.({ reason: "legacy-trip-id-migration" }), 250);
    return true;
  }

  function loadConfig() {
    const config = safeParse(localStorage.getItem(CONFIG_KEY), {});
    return {
      enabled: config.enabled === undefined ? true : Boolean(config.enabled),
      projectUrl: text(config.projectUrl).replace(/\/$/, ""),
      publishableKey: text(config.publishableKey)
    };
  }

  function loadSession() {
    return safeParse(localStorage.getItem(SESSION_KEY), null);
  }

  function readState() {
    return safeParse(localStorage.getItem(STATE_KEY), null);
  }

  function checkpointPayload(state) {
    const backup = state?.backup || {};
    const confirmed = text(backup.lastConfirmedISO);
    if (!confirmed) return null;
    return {
      lastConfirmedISO: confirmed,
      lastConfirmedTripCount: Math.max(0, Number(backup.lastConfirmedTripCount || 0)),
      lastFilename: text(backup.lastFilename)
    };
  }

  async function request(path, options = {}) {
    const config = loadConfig();
    const session = loadSession();
    if (!config.enabled || !config.projectUrl || !config.publishableKey || !session?.access_token || !session?.user?.id) return null;
    const headers = new Headers(options.headers || {});
    headers.set("apikey", config.publishableKey);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${config.projectUrl}${path}`, { ...options, headers });
    if (!response.ok) return null;
    const body = await response.text();
    return body ? safeParse(body, null) : null;
  }

  async function fetchCheckpoint() {
    const rows = await request(`/rest/v1/mileage_sync_records?select=record_type,record_id,payload,modified_at&record_type=eq.${CHECKPOINT_TYPE}&record_id=eq.${CHECKPOINT_ID}&limit=1`, { method: "GET" });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function pushCheckpoint(payload) {
    if (!payload?.lastConfirmedISO) return false;
    const session = loadSession();
    if (!session?.user?.id) return false;
    const row = {
      user_id: session.user.id,
      record_type: CHECKPOINT_TYPE,
      record_id: CHECKPOINT_ID,
      payload,
      device_id: text(localStorage.getItem(DEVICE_ID_KEY)) || "backup-checkpoint-device",
      tombstone: false
    };
    const result = await request("/rest/v1/mileage_sync_records?on_conflict=user_id,record_type,record_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([row])
    });
    return Array.isArray(result) || result !== null;
  }

  function applyCheckpoint(payload) {
    if (!payload?.lastConfirmedISO) return false;
    const state = readState();
    if (!state) return false;
    state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
    const remoteConfirmed = Date.parse(payload.lastConfirmedISO || "") || 0;
    const localConfirmed = Date.parse(state.backup.lastConfirmedISO || "") || 0;
    const required = Date.parse(state.backup.lastRequiredISO || "") || 0;
    let changed = false;

    if (remoteConfirmed >= localConfirmed) {
      if (state.backup.lastConfirmedISO !== payload.lastConfirmedISO) changed = true;
      if (Number(state.backup.lastConfirmedTripCount || 0) !== Number(payload.lastConfirmedTripCount || 0)) changed = true;
      if (text(state.backup.lastFilename) !== text(payload.lastFilename)) changed = true;
      state.backup.lastConfirmedISO = payload.lastConfirmedISO;
      state.backup.lastConfirmedTripCount = Math.max(0, Number(payload.lastConfirmedTripCount || 0));
      state.backup.lastFilename = text(payload.lastFilename);
    }

    if (remoteConfirmed && remoteConfirmed >= required && (Number(state.backup.pendingTripCount || 0) > 0 || Number(state.backup.pendingChangeCount || 0) > 0)) {
      state.backup.pendingTripCount = 0;
      state.backup.pendingChangeCount = 0;
      changed = true;
    }

    if (!changed) return false;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "backup-checkpoint-sync" } }));
    return true;
  }

  async function syncCheckpoint() {
    if (inFlight || !navigator.onLine) return;
    inFlight = true;
    try {
      wrapWorkflowMigration();
      migrateStoredTripIds();
      const state = readState();
      const local = checkpointPayload(state);
      const remoteRow = await fetchCheckpoint();
      const remote = remoteRow?.payload || null;
      const localTime = Date.parse(local?.lastConfirmedISO || "") || 0;
      const remoteTime = Date.parse(remote?.lastConfirmedISO || "") || 0;

      if (local && localTime > remoteTime) {
        await pushCheckpoint(local);
      } else if (remote && remoteTime >= localTime) {
        applyCheckpoint(remote);
      } else if (local && !remote) {
        await pushCheckpoint(local);
      }
    } catch (error) {
      console.warn("Mileage Logger integrity checkpoint sync skipped:", error);
    } finally {
      inFlight = false;
    }
  }

  function schedule(delay = 400) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncCheckpoint, delay);
  }

  wrapWorkflowMigration();
  migrateStoredTripIds();
  schedule(800);
  setInterval(() => schedule(0), 60000);
  window.addEventListener("mileage:state-changed", (event) => {
    if (String(event.detail?.source || "") === "backup-checkpoint-sync") return;
    schedule(700);
  });
  window.addEventListener("online", () => schedule(300));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(300);
  });
})();
