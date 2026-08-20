const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "active-jobs-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "active-jobs-data.js" });

const data = context.window.MileageActiveJobsData;
assert.ok(data, "Active Jobs data module should load");
assert.ok(Array.isArray(data.activeJobs), "The Active Jobs catalog should be available");

const syntheticJobs = [
  { aj: "AJ-901", inspectionNo: "TEST-INSP-001", reportingVendor: "Example Fabricator", vendorJobs: "TEST-SHOP-01" },
  { aj: "AJ-902", inspectionNo: "TEST-INSP-001", reportingVendor: "Example Fabricator", vendorJobs: "TEST-SHOP-02" }
];
const conflicts = data.reportingUnitConflicts(syntheticJobs);
assert.ok(
  conflicts.some((group) => group.map((job) => job.aj).join("|") === "AJ-901|AJ-902"),
  "A synthetic duplicate reporting unit should remain a review flag"
);

const trips = [{
  id: "trip-shared",
  date: "08/11/2026",
  vendor: "Example Fabricator",
  customer: "Example Client",
  projectNumber: "TEST-INSP-001",
  purpose: "Inspection",
  notes: "Shared visit",
  miles: 42.5
}];
const inspections = [
  {
    id: "inspection-2",
    tripId: "trip-shared",
    activeJobId: "AJ-901",
    sbInspectionNo: "TEST-INSP-001",
    reportingVendor: "Example Fabricator",
    inspectionLocation: "Example Shop",
    customer: "Example Client",
    projectName: "Synthetic Project Alpha",
    vendorJobNumber: "TEST-SHOP-01",
    activity: "Fit-up Inspection"
  },
  {
    id: "inspection-3",
    tripId: "trip-shared",
    activeJobId: "AJ-902",
    sbInspectionNo: "TEST-INSP-001",
    reportingVendor: "Example Fabricator",
    inspectionLocation: "Example Shop",
    customer: "Example Client",
    projectName: "Synthetic Project Beta",
    vendorJobNumber: "TEST-SHOP-02",
    activity: "Document Review"
  }
];

const csv = data.makeActivityCSV(trips, inspections);
const rows = csv.replace(/^\uFEFF/, "").split("\r\n");
assert.equal(rows.length, 2, "A shared mileage trip should produce one activity row");
assert.match(rows[1], /AJ-901/);
assert.match(rows[1], /AJ-902/);
assert.equal((csv.match(/42\.5/g) || []).length, 1, "Shared mileage must appear exactly once");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(indexHtml, /active-jobs-data\.js\?v=visit-workspace-5/);
assert.match(indexHtml, /active-jobs-management\.js\?v=full-upgrade-list-1/);
const serviceWorker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
for (const match of serviceWorker.matchAll(/"\.\/([^"?]+)(?:\?[^"\s]+)?"/g)) {
  const asset = match[1];
  if (!asset) continue;
  assert.ok(fs.existsSync(path.join(__dirname, "..", asset)), `Offline asset should exist: ${asset}`);
}

console.log("Active Jobs data and shared-mileage export tests passed.");
