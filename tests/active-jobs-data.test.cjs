const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "active-jobs-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "active-jobs-data.js" });

const data = context.window.MileageActiveJobsData;
assert.ok(data, "Active Jobs data module should load");
assert.equal(data.activeJobs.length, 15, "The current Active Jobs Master rows should remain present");

const conflicts = data.reportingUnitConflicts();
assert.ok(
  conflicts.some((group) => group.map((job) => job.aj).join("|") === "AJ-002|AJ-003"),
  "The Smith Tank E10379-410 conflict should remain a review flag"
);
assert.equal(data.activeJobs.find((job) => job.aj === "AJ-002").vendorJobs, "26-6936");
assert.equal(data.activeJobs.find((job) => job.aj === "AJ-003").vendorJobs, "26-6937");

const trips = [{
  id: "trip-shared",
  date: "08/11/2026",
  vendor: "Smith Tank",
  customer: "Shell",
  projectNumber: "E10379-410",
  purpose: "Inspection",
  notes: "Shared visit",
  miles: 42.5
}];
const inspections = [
  {
    id: "inspection-2",
    tripId: "trip-shared",
    activeJobId: "AJ-002",
    sbInspectionNo: "E10379-410",
    reportingVendor: "Smith Tank",
    inspectionLocation: "Smith Tank",
    customer: "Shell",
    projectName: "T-F0501-1 Tank Renewal",
    vendorJobNumber: "26-6936",
    activity: "Fit-up Inspection"
  },
  {
    id: "inspection-3",
    tripId: "trip-shared",
    activeJobId: "AJ-003",
    sbInspectionNo: "E10379-410",
    reportingVendor: "Smith Tank",
    inspectionLocation: "Smith Tank",
    customer: "Shell",
    projectName: "T-F0498 Tank Renewal",
    vendorJobNumber: "26-6937",
    activity: "Document Review"
  }
];

const csv = data.makeActivityCSV(trips, inspections);
const rows = csv.replace(/^\uFEFF/, "").split("\r\n");
assert.equal(rows.length, 2, "A shared mileage trip should produce one activity row");
assert.match(rows[1], /AJ-002/);
assert.match(rows[1], /AJ-003/);
assert.equal((csv.match(/42\.5/g) || []).length, 1, "Shared mileage must appear exactly once");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(indexHtml, /active-jobs-data\.js\?v=visit-workspace-5/);
assert.match(indexHtml, /active-jobs-management\.js\?v=upgrade-6-1/);
const serviceWorker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
for (const match of serviceWorker.matchAll(/"\.\/([^"?]+)(?:\?[^"\s]+)?"/g)) {
  const asset = match[1];
  if (!asset) continue;
  assert.ok(fs.existsSync(path.join(__dirname, "..", asset)), `Offline asset should exist: ${asset}`);
}

console.log("Active Jobs data and shared-mileage export tests passed.");
