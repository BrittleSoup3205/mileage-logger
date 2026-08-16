const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const management = require("../active-jobs-management.js");

const syncSource = fs.readFileSync("sync-engine.js", "utf8");
const activeJobsSource = fs.readFileSync("active-jobs-management.js", "utf8");
const APP_STATE_KEY = "mileage_logger_state_v3";
const CONFIG_KEY = "mileage_logger_sync_config_v1";
const SESSION_KEY = "mileage_logger_sync_session_v1";
const META_KEY = "mileage_logger_sync_meta_v1";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => body === null ? "" : JSON.stringify(body)
  };
}

function makeHarness({ online = true, localState, remoteRows = [], syncMeta } = {}) {
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
  if (syncMeta !== undefined) storage.set(META_KEY, JSON.stringify(syncMeta));

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
    if (url.includes("/rest/v1/mileage_sync_devices") && options.method === "POST") return jsonResponse(null);
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
    getMeta: () => JSON.parse(storage.get(META_KEY) || "{}"),
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
  const activeJob = { aj: "AJ-CLOUD", inspectionNo: "E-CLOUD", reportingVendor: "Cloud Vendor", openClosed: "Open" };
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
    { record_type: "active_job", record_id: activeJob.aj, payload: activeJob, modified_at: "2026-08-14T20:01:30.000Z", device_id: "iphone", tombstone: false },
    { record_type: "preferences", record_id: "durable", payload: preferences, modified_at: "2026-08-14T20:02:00.000Z", device_id: "iphone", tombstone: false }
  ];
  const harness = makeHarness({
    remoteRows,
    syncMeta: { records: { "trip:stale": { hash: "stale", modifiedAt: 1, syncedAt: 1 } }, lastSyncISO: "2026-01-01T00:00:00.000Z", conflicts: [] }
  });

  assert.equal(await harness.api.syncNow({ reason: "test" }), true);
  const state = harness.getState();
  assert.deepEqual(state.trips, [trip], "The empty device must receive the authoritative cloud trip");
  assert.deepEqual(state.activeJobs, [activeJob], "Upgrade #6 Active Jobs must bootstrap from cloud with the other records");
  assert.deepEqual(state.settings.customers, preferences.settings.customers, "Cloud preferences must replace empty-device defaults");
  assert.equal(state.workflow.mileageRate, "0.70", "Cloud workflow preferences must be restored");
  assert.equal(state.lastOdometer, 125, "The new device must derive its next odometer value from the latest cloud trip");
  assert.deepEqual(harness.recordPushes, [], "First bootstrap must not upload or overwrite cloud records");
  assert.equal(harness.getMeta().records["trip:stale"], undefined, "Stale sync metadata must be rebuilt from cloud records");
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
    workflow: { timesheetEntries: [], timesheetWeeks: {} },
    activeJobs: []
  });
  const harness = makeHarness({ localState, remoteRows: [] });

  assert.equal(await harness.api.syncNow({ reason: "test" }), true);
  assert.ok(harness.recordPushes.some((row) => row.record_type === "trip" && row.record_id === localTrip.id), "Existing local changes must keep uploading normally");
}

async function testRepairedActiveJobUsesNormalSynchronization() {
  const state = {
    activeTrip: null,
    trips: [],
    lastOdometer: "",
    backup: {},
    settings: { inspections: [] },
    workflow: { timesheetEntries: [], timesheetWeeks: {} },
    activeJobs: [{ aj: "AJ-014", inspectionNo: "E10367-408", reportingVendor: "Pipe & Steel", openClosed: "" }],
    facilityProfiles: [],
    activeJobImports: []
  };
  management.repairBlankOpenClosedFromSeed(state, [
    { aj: "AJ-014", inspectionNo: "E10367-408", reportingVendor: "Pipe & Steel", openClosed: "Open" }
  ]);
  const harness = makeHarness({ localState: JSON.stringify(state), remoteRows: [] });

  assert.equal(await harness.api.syncNow({ reason: "test" }), true);
  const pushed = harness.recordPushes.find((row) => row.record_type === "active_job" && row.record_id === "AJ-014");
  assert.equal(pushed?.payload?.openClosed, "Open", "The in-place AJ repair must upload through the existing active_job sync record");
}

function testActiveJobsModuleDoesNotMaterializeEmptyState() {
  const storage = new Map();
  let readyHandler = null;
  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value))
  };
  const document = {
    readyState: "loading",
    getElementById: () => null,
    addEventListener: (type, callback) => { if (type === "DOMContentLoaded") readyHandler = callback; }
  };
  const window = {
    document,
    localStorage,
    addEventListener() {},
    dispatchEvent() {},
    MileageActiveJobsData: { activeJobs: [{ aj: "AJ-SEED" }] },
    crypto: { randomUUID: () => "test-id" }
  };
  vm.runInContext(activeJobsSource, vm.createContext({ window, document, localStorage, console, Date }), { filename: "active-jobs-management.js" });
  readyHandler();
  assert.equal(localStorage.getItem(APP_STATE_KEY), null, "Upgrade #6 initialization must not defeat empty-device cloud bootstrap by writing seed state first");
}

function testActiveJobsModuleRepairsExistingStoredCatalog() {
  const existingInspection = { id: "inspection-nde", activeJobId: "", tripId: "trip-pipe", activity: "NDE Review", summary: "RT film review" };
  const storage = new Map([[APP_STATE_KEY, JSON.stringify({
    activeJobs: [{ aj: "AJ-014", inspectionNo: "E10367-408", reportingVendor: "Pipe & Steel", openClosed: "" }],
    settings: { inspections: [existingInspection] },
    trips: [{ id: "trip-pipe", projectNumber: "E10367-408", vendor: "Pipe & Steel" }],
    backup: { pendingChangeCount: 2 }
  })]]);
  let readyHandler = null;
  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value))
  };
  const document = {
    readyState: "loading",
    getElementById: () => null,
    addEventListener: (type, callback) => { if (type === "DOMContentLoaded") readyHandler = callback; }
  };
  const window = {
    document,
    localStorage,
    addEventListener() {},
    dispatchEvent() {},
    setTimeout: (callback) => { callback(); return 1; },
    MileageActiveJobsData: { activeJobs: [{ aj: "AJ-014", inspectionNo: "E10367-408", reportingVendor: "Pipe & Steel", openClosed: "Open" }] },
    crypto: { randomUUID: () => "test-id" }
  };
  const CustomEvent = class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  vm.runInContext(activeJobsSource, vm.createContext({ window, document, localStorage, CustomEvent, console, Date }), { filename: "active-jobs-management.js" });
  readyHandler();
  const repaired = JSON.parse(localStorage.getItem(APP_STATE_KEY));
  assert.equal(repaired.activeJobs[0].openClosed, "Open", "Existing stored state must be repaired automatically when the hotfix initializes");
  assert.equal(repaired.activeJobs.length, 1, "Automatic repair must not duplicate the AJ");
  assert.deepEqual(repaired.settings.inspections[0], existingInspection, "Automatic catalog repair must leave the unassigned inspection untouched");
  assert.equal(repaired.backup.pendingChangeCount, 2, "The migration repair must not alter existing backup accounting");
}

(async () => {
  testActiveJobsModuleDoesNotMaterializeEmptyState();
  testActiveJobsModuleRepairsExistingStoredCatalog();
  await testEmptyDeviceBootstrapsFromCloudWithoutPush();
  await testOfflineEmptyDeviceRemainsUntouched();
  await testExistingLocalStateStillPushesNormally();
  await testRepairedActiveJobUsesNormalSynchronization();
  console.log("Multi-device empty-device bootstrap checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
