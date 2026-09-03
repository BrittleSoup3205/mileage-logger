(() => {
  "use strict";
  const STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  const DEVICE_ID_KEY = "mileage_logger_sync_device_id_v1";
  const TYPE = "backup_checkpoint";
  const ID = "latest";
  let timer = null;
  let running = false;

  const parse = (value, fallback) => { try { const x = JSON.parse(value); return x ?? fallback; } catch (_) { return fallback; } };
  const text = (value) => String(value ?? "").trim();
  const config = () => {
    const c = parse(localStorage.getItem(CONFIG_KEY), {});
    return { enabled: c.enabled === undefined ? true : Boolean(c.enabled), projectUrl: text(c.projectUrl).replace(/\/$/, ""), publishableKey: text(c.publishableKey) };
  };
  const loadSession = () => parse(localStorage.getItem(SESSION_KEY), null);
  const saveSession = (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));

  function currentTripCount(state) {
    if (!Array.isArray(state?.trips)) return 0;
    const ids = new Set();
    let anonymous = 0;
    state.trips.forEach((trip) => {
      const id = text(trip?.id);
      if (id) ids.add(id);
      else anonymous += 1;
    });
    return ids.size + anonymous;
  }

  async function validSession() {
    let session = loadSession();
    if (!session?.access_token || !session?.refresh_token) return null;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt - Date.now() > 60000) return session;
    const c = config();
    const response = await fetch(`${c.projectUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: c.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) return null;
    const next = parse(await response.text(), null);
    if (!next?.access_token) return null;
    saveSession(next);
    return next;
  }

  async function request(path, options = {}) {
    const c = config();
    const session = await validSession();
    if (!c.enabled || !c.projectUrl || !c.publishableKey || !session?.user?.id) return null;
    const headers = new Headers(options.headers || {});
    headers.set("apikey", c.publishableKey);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${c.projectUrl}${path}`, { ...options, headers });
    if (!response.ok) return null;
    const body = await response.text();
    return body ? parse(body, null) : null;
  }

  function localPayload() {
    const state = parse(localStorage.getItem(STATE_KEY), null);
    const backup = state?.backup || {};
    if (!text(backup.lastConfirmedISO)) return null;
    const tripCount = currentTripCount(state);
    const backupCount = Math.max(0, Number(backup.lastConfirmedTripCount || 0));
    if (backupCount !== tripCount) return null;
    return {
      lastConfirmedISO: text(backup.lastConfirmedISO),
      lastConfirmedTripCount: backupCount,
      lastFilename: text(backup.lastFilename)
    };
  }

  async function fetchRemote() {
    const rows = await request(`/rest/v1/mileage_sync_records?select=payload,modified_at&record_type=eq.${TYPE}&record_id=eq.${ID}&limit=1`, { method: "GET" });
    return Array.isArray(rows) ? rows[0]?.payload || null : null;
  }

  async function push(payload) {
    const session = await validSession();
    if (!session?.user?.id || !payload) return;
    await request("/rest/v1/mileage_sync_records?on_conflict=user_id,record_type,record_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ user_id: session.user.id, record_type: TYPE, record_id: ID, payload, device_id: text(localStorage.getItem(DEVICE_ID_KEY)) || "backup-device", tombstone: false }])
    });
  }

  function apply(remote) {
    if (!remote?.lastConfirmedISO) return;
    const state = parse(localStorage.getItem(STATE_KEY), null);
    if (!state) return;
    const tripCount = currentTripCount(state);
    const remoteCount = Math.max(0, Number(remote.lastConfirmedTripCount || 0));
    if (remoteCount !== tripCount) return;

    state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
    const remoteTime = Date.parse(remote.lastConfirmedISO) || 0;
    const localTime = Date.parse(state.backup.lastConfirmedISO || "") || 0;
    const localCount = Math.max(0, Number(state.backup.lastConfirmedTripCount || 0));
    const localValid = localCount === tripCount;
    const required = Date.parse(state.backup.lastRequiredISO || "") || 0;
    let changed = false;

    if (!localValid || remoteTime > localTime || (remoteTime === localTime && remoteCount > localCount)) {
      state.backup.lastConfirmedISO = remote.lastConfirmedISO;
      state.backup.lastConfirmedTripCount = remoteCount;
      state.backup.lastFilename = text(remote.lastFilename);
      changed = true;
    }

    if (remoteTime >= required && (Number(state.backup.pendingTripCount || 0) > 0 || Number(state.backup.pendingChangeCount || 0) > 0)) {
      state.backup.pendingTripCount = 0;
      state.backup.pendingChangeCount = 0;
      changed = true;
    }

    if (!changed) return;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "backup-checkpoint-v2" } }));
  }

  async function sync() {
    if (running || !navigator.onLine) return;
    running = true;
    try {
      const local = localPayload();
      const remote = await fetchRemote();
      const lt = Date.parse(local?.lastConfirmedISO || "") || 0;
      const rt = Date.parse(remote?.lastConfirmedISO || "") || 0;
      if (local && (lt > rt || (lt === rt && Number(local.lastConfirmedTripCount || 0) > Number(remote?.lastConfirmedTripCount || 0)))) await push(local);
      else if (remote) apply(remote);
    } finally {
      running = false;
    }
  }

  function schedule(delay = 400) { clearTimeout(timer); timer = setTimeout(sync, delay); }
  schedule(600);
  setInterval(() => schedule(0), 60000);
  window.addEventListener("mileage:state-changed", (event) => {
    if (String(event.detail?.source || "") === "backup-checkpoint-v2") return;
    schedule(600);
  });
  window.addEventListener("online", () => schedule(250));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(250); });
})();
