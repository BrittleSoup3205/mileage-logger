const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const syncSource = fs.readFileSync("sync-engine.js", "utf8");
const APP_STATE_KEY = "mileage_logger_state_v3";
const CONFIG_KEY = "mileage_logger_sync_config_v1";
const SESSION_KEY = "mileage_logger_sync_session_v1";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => body === null ? "" : JSON.stringify(body)
  };
}

function makeHarness({ online = true, localState, remoteRows = [] } = {}) {
  const storage = new Map();
  const recordPushes = [];
  let remoteFetchCount = 0;

  storage.set(CONFIG_KEY, JSON.stringify({
    enabled: true,
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    email: "owner@example.com",
    deviceLabel: "Regression device"
  }));
  storage.set(SESSION_KEY, JSON.stringify({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-1", email: "owner@example.com" }
  }));
  if (localState !== undefined) storage.set(APP_STATE_KEY, localState);

  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  const window = {
    dispatchEvent() {},
    addEventListener() {},
    MileageMultiDeviceSync: null
  };
  const document = {
    readyState: "loading",
    getElementById: () => null,
    addEventListener() {},
    querySelector: () => null
  };
  const fetch = async (url, options = {}) => {
    if (url.includes("/rest/v1/mileage_sync_records") && options.method === "GET") {
      remoteFetchCount += 1;
      return jsonResponse(remoteRows);
    }
    if (url.includes("/rest/v1/mileage_sync_records") && options.method === "POST") {
      const rows = JSON.parse(options.body);
      recordPushes.push(...rows);
      return jsonResponse(rows.map((row) => ({ ...row, modified_at: new Date().toISOString() })));
    }
    if (url.includes("/rest/v1/mileage_sync_devices") && options.method === "POST") {
      return jsonResponse(null);
    }
    throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
  };

  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => "device-id" },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    Date,
    fetch,
    Headers,
    localStorage,
    navigator: { onLine: online, userAgent: "Regression", platform: "Test", maxTouchPoints: 0 },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: (callback) => { callback(); return 1; },
    window,
    document
  });
  vm.runInContext(syncSource, context, { filename: "sync-engine.js" });

  return {
    api: window.MileageMultiDeviceSync,
    getState: () => {
      const raw = storage.get(APP_STATE_KEY);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    recordPushes,
    getRemoteFetchCount: () => remoteFetchCount
  };
}

async function testEmptyDeviceBootstrapsFromCloudWithoutPush() {
  const trip = {
    id: "trip-1",
    endISO: "2026-08-14T20:00:00.000Z",
    startOdometer: 100,
    endOdometer: 125,
    miles: 25,
    customer: "Cloud customer"
  };
  const preferences = {
    settings: {
      roundMiles: true,
      customers: ["Authoritative customer"],
      vendors: ["Authoritative vendor"],
      purposes: ["Inspection"],
      vendorLocations: [],
      inspectionIgnoredTripIds: []
    },
    workflow: { mileageRate: "0.70" }
  };
  const remoteRows = [
    { record_type: "trip", record_id: trip.id, payload: trip, modified_at: "2026-08-14T20:01:00.000Z", device_id: "iphone", tombstone: false },
    { record_type: "preferences", record_id: "durable", payload: preferences, modified_at: "2026-08-14T20:02:00.000Z", device_id: "iphone", tombstone: false }
  ];
  const harness = makeHarness({ remoteRows });

  assert.equal(await harness.api.syncNow({ reason: "test" }), true);
  const state = harness.getState();
  assert.deepEqual(state.trips, [trip], "The empty device must receive the authoritative cloud trip");
  assert.deepEqual(state.settings.customers, preferences.settings.customers, "Cloud preferences must replace empty-device defaults");
  assert.equal(state.workflow.mileageRate, "0.70", "Cloud workflow preferences must be restored");
  assert.equal(state.lastOdometer, 125, "The new device must derive its next odometer value from the latest cloud trip");
  assert.deepEqual(harness.recordPushes, [], "First bootstrap must not upload or overwrite cloud records");
  assert.equal(harness.api.getStatus().state, "ready");
  assert.match(harness.api.getStatus().message, /initialized from existing cloud data/i);
}

async function testOfflineEmptyDeviceRemainsUntouched() {
  const harness = makeHarness({ online: false, remoteRows: [{ record_type: "trip" }] });
  assert.equal(await harness.api.syncNow({ reason: "test" }), false);
  assert.equal(harness.getState(), undefined, "Offline startup must not invent or overwrite local state");
  assert.equal(harness.getRemoteFetchCount(), 0, "Offline startup must not contact the cloud");
  assert.equal(harness.api.getStatus().state, "offline");
}

async function testExistingLocalStateStillPushesNormally() {
  const localTrip = { id: "local-trip", endISO: "2026-08-14T21:00:00.000Z", endOdometer: 150 };
  const localState = JSON.stringify({
    activeTrip: null,
    trips: [localTrip],
    lastOdometer: 150,
    backup: {},
    settings: { inspections: [] },
    workflow: { timesheetEntries: [], timesheetWeeks: {} }
  });
  const harness = makeHarness({ localState, remoteRows: [] });

  assert.equal(await harness.api.syncNow({ reason: "test" }), true);
  assert.ok(harness.recordPushes.some((row) => row.record_type === "trip" && row.record_id === localTrip.id), "Existing local changes must keep uploading normally");
}

(async () => {
  await testEmptyDeviceBootstrapsFromCloudWithoutPush();
  await testOfflineEmptyDeviceRemainsUntouched();
  await testExistingLocalStateStillPushesNormally();
  console.log("Multi-device empty-device bootstrap checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
