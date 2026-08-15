const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const workflowSource = fs.readFileSync(path.join(root, "workflow-data.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const inspectionsSource = fs.readFileSync(path.join(root, "inspections.js"), "utf8");
const mediaSource = fs.readFileSync(path.join(root, "media-store.js"), "utf8");
const serviceWorkerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const activeJobsManagementSource = fs.readFileSync(path.join(root, "active-jobs-management.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(workflowSource, context, { filename: "workflow-data.js" });
const data = context.window.MileageWorkflowData;

assert.match(appSource, /mileage_logger_state_v3/, "Main Local Storage key must remain unchanged");
assert.match(inspectionsSource, /mileage_logger_state_v3/, "Inspection Local Storage key must remain unchanged");
assert.match(mediaSource, /MileageLoggerInspectionMedia/, "Existing media IndexedDB name must remain unchanged");
assert.match(inspectionsSource, /MileageLoggerPrivateFiles/, "Existing private-files IndexedDB name must remain unchanged");
assert.match(activeJobsManagementSource, /mileage_logger_state_v3/, "Active Jobs management must preserve the existing Local Storage key");

const legacy = {
  activeTrip: { id: "active-1", startOdometer: 100, routePoints: [{ latitude: 29.9, longitude: -95.1 }] },
  trips: [{
    id: "trip-legacy", date: "08/01/2026", customer: "Existing Client", vendor: "Existing Vendor",
    purpose: "Inspection", projectNumber: "000123", startOdometer: 100, endOdometer: 125,
    miles: 25, startLocation: { latitude: 29.1, longitude: -95.2 },
    photos: [{ id: "trip-photo-1", name: "IMG_0001.JPG", caption: "Existing caption" }]
  }],
  lastOdometer: 125,
  backup: { lastFilename: "legacy.zip", pendingChangeCount: 0 },
  settings: {
    customExistingSetting: "keep-me",
    inspections: [{
      id: "inspection-legacy", tripId: "trip-legacy", vendorLoadNumber: "LOAD 00-A/7",
      projectNumber: "000123", photos: [{ id: "inspection-photo-1", name: "IMG_0002.JPG" }]
    }]
  }
};

const migrated = data.migrateState(legacy);
assert.equal(migrated.activeTrip.routePoints[0].latitude, 29.9);
assert.equal(migrated.trips[0].projectNumber, "000123", "Text-like identifiers must retain leading zeroes");
assert.equal(migrated.trips[0].photos[0].caption, "Existing caption");
assert.equal(migrated.settings.customExistingSetting, "keep-me");
assert.equal(migrated.settings.inspections[0].loads[0].identifier, "LOAD 00-A/7");
assert.equal(migrated.settings.inspections[0].vendorLoadNumber, "LOAD 00-A/7");

migrated.workflow.mileageRate = "0.70";
migrated.workflow.timesheetEntries.push(data.normalizeTimesheetEntry({
  id: "timesheet-manual-1", sourceType: "manual", date: "2026-08-01",
  activity: "Report Writing", hours: "2.5", status: "Submitted"
}));
migrated.trips[0].reimbursement.status = "Submitted";
migrated.trips[0].reimbursement.submittedDate = "2026-08-02";

const backupPackage = {
  backupFormat: "MileageLoggerDataBackup",
  backupVersion: 5,
  appState: migrated
};
const restored = data.migrateState(JSON.parse(JSON.stringify(backupPackage)).appState);
assert.deepEqual(JSON.parse(JSON.stringify(restored.activeTrip)), JSON.parse(JSON.stringify(migrated.activeTrip)));
assert.equal(restored.trips[0].reimbursement.status, "Submitted");
assert.equal(restored.trips[0].photos[0].name, "IMG_0001.JPG");
assert.equal(restored.settings.inspections[0].loads[0].identifier, "LOAD 00-A/7");
assert.equal(restored.workflow.timesheetEntries[0].activity, "Report Writing");
assert.equal(restored.workflow.mileageRate, "0.70");
assert.match(appSource, /activeJobs: parsed\?\.activeJobs/, "Restore sanitization must retain synchronized Active Jobs");
assert.match(appSource, /facilityProfiles: parsed\?\.facilityProfiles/, "Restore sanitization must retain Facility Profiles");
assert.match(appSource, /activeJobImports: parsed\?\.activeJobImports/, "Restore sanitization must retain import audit history");
assert.equal(restored.settings.inspections[0].activeJobId || "", "", "Legacy inspections without an AJ must remain unassigned");

for (const filename of ["app-data.json", "mileage-log.csv", "concur-reimbursement.csv", "weekly-timesheet.csv"]) {
  assert.ok(appSource.includes(filename), `Backup package must include ${filename}`);
}
for (const filename of ["workflow-data.js", "workflow-queues.js"]) {
  assert.ok(serviceWorkerSource.includes(filename), `Offline cache must include ${filename}`);
}
assert.match(appSource, /MileageLoggerFullBackup.*MileageLoggerDataBackup/, "Restore must continue accepting old and current backup formats");

console.log("Backup/restore compatibility and unchanged storage identifiers passed.");
