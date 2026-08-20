const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "workflow-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "workflow-data.js" });

const data = context.window.MileageWorkflowData;
assert.ok(data, "Workflow data module should load");

const legacyState = {
  trips: [{
    id: "trip-1",
    date: "08/12/2026",
    miles: 42.5,
    vendor: "Example Fabricator",
    purpose: "Inspection",
    customer: "Example Client",
    projectNumber: "TEST-INSP-001",
    startTime: "7:30 AM",
    endTime: "4:00 PM",
    notes: "Routine visit"
  }],
  settings: {
    inspections: [{
      id: "inspection-1",
      tripId: "trip-1",
      date: "2026-08-12",
      activeJobId: "AJ-901",
      sbInspectionNo: "TEST-INSP-001",
      vendorLoadNumber: "LOAD-0007A",
      acceptanceStatus: "Accepted",
      activity: "Fit-up Inspection",
      customer: "Example Client",
      inspectionLocation: "Example Shop"
    }]
  }
};

const migrated = data.migrateState(legacyState);
assert.equal(migrated.settings.inspections[0].loads.length, 1);
assert.equal(migrated.settings.inspections[0].loads[0].identifier, "LOAD-0007A", "Legacy load identifier must be exact");
assert.equal(migrated.settings.inspections[0].vendorLoadNumber, "LOAD-0007A", "Legacy alias must remain available");
assert.equal(migrated.trips[0].reimbursement.reimbursable, true);
assert.equal(migrated.trips[0].reimbursement.status, "Not Submitted");
assert.equal(migrated.workflow.mileageRate, "", "Mileage rate must require configuration rather than a hard-coded amount");
assert.equal(data.estimatedReimbursement(migrated.trips[0], migrated.workflow.mileageRate), null, "A blank rate must not display a zero-dollar estimate");

const preserved = data.migrateInspection({
  id: "inspection-2",
  vendorLoadNumber: "OLD-LOAD",
  loads: [
    { id: "load-a", identifier: "A-09/1", status: "Released" },
    { id: "load-b", identifier: "B 002", status: "Hold", deficiencyFollowUp: "Verify MTR" }
  ]
});
assert.deepEqual(
  Array.from(preserved.loads, (load) => load.identifier),
  ["A-09/1", "B 002"],
  "Multiple vendor-assigned load identifiers must remain exact and ordered"
);
assert.equal(preserved.vendorLoadNumber, "OLD-LOAD", "Existing legacy field must not be overwritten");

const multiActivity = data.migrateInspection({
  id: "inspection-multi",
  inspectionType: "Hydro / Pressure Test",
  activities: ["Hydro / Pressure Test", "Coating Inspection", "Documentation Review"]
});
assert.deepEqual(Array.from(data.inspectionActivities(multiActivity)), [
  "Hydro / Pressure Test", "Coating Inspection", "Documentation Review"
], "One inspection must retain every selected activity");

const migratedLegacyActivity = data.migrateInspection({
  id: "inspection-legacy-activity",
  inspectionType: "Inspection",
  activity: "NDE review and coating inspection"
});
assert.deepEqual(Array.from(data.inspectionActivities(migratedLegacyActivity)), [
  "Coating Inspection", "NDE Review"
], "Legacy migration must infer every recognized activity from the existing Activity text");

const withRate = data.migrateState({
  ...migrated,
  workflow: { ...migrated.workflow, mileageRate: "0.70" }
});
const concur = data.concurRows(withRate);
assert.equal(concur.length, 1);
assert.equal(concur[0].estimated, 29.75);
assert.deepEqual(Array.from(concur[0].context.activeJobs), ["AJ-901"]);

const suggestions = data.timesheetEntries(withRate);
assert.equal(suggestions.length, 1, "Linked trip and inspection should produce one daily suggestion");
assert.equal(suggestions[0].sourceType, "trip");
assert.equal(suggestions[0].hours, "", "Trip duration must not be assumed as timesheet hours");
assert.match(suggestions[0].ajSbProject, /AJ-901/);
assert.match(suggestions[0].ajSbProject, /TEST-INSP-001/);

const manualState = data.migrateState({
  ...withRate,
  workflow: {
    ...withRate.workflow,
    timesheetEntries: [{
      id: "timesheet-manual-1",
      sourceType: "manual",
      date: "2026-08-13",
      activity: "Report Writing",
      hours: "2.5",
      laborType: "OT",
      status: "Entered"
    }]
  }
});
assert.equal(data.timesheetEntries(manualState).length, 2, "No-trip work must coexist with trip suggestions");
assert.equal(data.timesheetEntries(manualState).find((entry) => entry.id === "timesheet-manual-1").laborType, "OT");
const week = data.weekSummary(manualState, "2026-08-12");
assert.equal(week.weekStart, "2026-08-10");
assert.equal(week.total, 2.5);
assert.ok(week.incompleteDays.length > 0, "Incomplete weekdays must be visible");

const concurCsv = data.makeConcurCSV(withRate);
assert.match(concurCsv, /Concur Report \/ Batch/);
assert.match(concurCsv, /AJ-901/);
const timesheetCsv = data.makeTimesheetCSV(manualState);
assert.match(timesheetCsv, /Report Writing/);

console.log("Workflow migration, Concur, and timesheet data tests passed.");
