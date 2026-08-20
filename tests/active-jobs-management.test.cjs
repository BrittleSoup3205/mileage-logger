const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const management = require("../active-jobs-management.js");
const fflate = require("../vendor/fflate.min.js");

function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function inlineCell(value, row, column) {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function makeWorkbook(rows, sheetName = "Active Jobs") {
  const sheetRows = rows.map((values, index) => {
    const rowNumber = index + 1;
    return `<row r="${rowNumber}">${values.map((value, column) => inlineCell(value, rowNumber, column)).join("")}</row>`;
  }).join("");
  const entries = {
    "xl/workbook.xml": fflate.strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": fflate.strToU8(`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": fflate.strToU8(`<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`)
  };
  return fflate.zipSync(entries);
}

const headers = [
  "Record ID", "Inspection Job #", "Client", "Client Project Name", "Client Project Number",
  "S&B Order / PO", "Fabricator", "Shop Number", "Location", "Current Status",
  "Latest Known Status / Next Action", "Open / Closed", "Last Inspection Date"
];
const bytes = makeWorkbook([
  ["ACTIVE JOBS — AUTHORITATIVE CURRENT REGISTER"],
  [], [], [], [],
  headers,
  ["AJ-916", "TEST-INSP-016", "Example Client", "Synthetic Project Alpha", "000123", "TEST-PO-7", "Example Fabricator, Inc.", "00-17/A", "Example Yard", "IN PROCESS", "Do not infer", "Open", 46249],
  ["AJ-917", "TEST-INSP-017", "Example Client", "Synthetic Blank Test", "", "", "Example Fabricator B", "", "", "", "", "Closed", ""]
]);

const parsed = management.parseActiveJobsWorkbookBytes(bytes, fflate);
assert.equal(parsed.sheetName, "Active Jobs");
assert.equal(parsed.headerRow, 6);
assert.equal(parsed.jobs.length, 2);
assert.equal(parsed.jobs[0].aj, "AJ-916");
assert.equal(parsed.jobs[0].clientProjectNo, "000123", "Text identifiers must preserve leading zeroes");
assert.equal(parsed.jobs[0].vendorJobs, "00-17/A", "Shop identifiers must remain exact text");
assert.equal(parsed.jobs[0].lastInspectionDate, "2026-08-15", "Excel dates should become ISO dates");
assert.equal(parsed.jobs[1].clientProjectNo, "", "Blank fields must remain blank");
assert.throws(() => management.parseActiveJobsWorkbookBytes(makeWorkbook([headers], "Wrong Sheet"), fflate), /worksheet named/);

const numericStatus = management.parseActiveJobsWorkbookBytes(makeWorkbook([
  headers,
  ["AJ-957", "TEST-INSP-057", "Example Client", "Synthetic Project", "", "", "Example Fabricator", "", "", 57, "Review", "Open", ""]
]), fflate).jobs[0];
assert.equal(numericStatus.status, "", "A numeric Current Status such as 57 must be treated as blank");
assert.match(numericStatus._importWarnings.join(" "), /numeric or implausible/);

const calculatedState = {
  activeJobs: [{ aj: "AJ-957", status: "57", lastMileageLoggerVisit: "#REF!" }],
  settings: { inspections: [{ id: "i-57", activeJobId: "AJ-957", date: "2026-08-19", tripSnapshot: { date: "2026-08-20" } }] }
};
management.refreshCalculatedJobFields(calculatedState);
assert.equal(calculatedState.activeJobs[0].status, "", "Stored numeric status must be repaired during migration");
assert.equal(calculatedState.activeJobs[0].lastMileageLoggerVisit, "2026-08-20", "Last Mileage Logger Visit must derive from linked visit data instead of a workbook #REF value");

const current = [
  { aj: "AJ-001", inspectionNo: "E-1", reportingVendor: "Vendor A", projectName: "Old", openClosed: "Open" },
  { aj: "AJ-002", inspectionNo: "E-2", reportingVendor: "Vendor B", projectName: "Stable", openClosed: "Open" },
  { aj: "AJ-003", inspectionNo: "E-3", reportingVendor: "Vendor C", projectName: "Closing", openClosed: "Open" }
];
const review = management.buildImportReview(current, [
  { aj: "AJ-001", inspectionNo: "E-1", reportingVendor: "Vendor A", projectName: "New", openClosed: "Open" },
  { aj: "AJ-002", inspectionNo: "E-2", reportingVendor: "Vendor B", projectName: "Stable", openClosed: "Open" },
  { aj: "AJ-003", inspectionNo: "E-3", reportingVendor: "Vendor C", projectName: "Closing", openClosed: "Closed" },
  { aj: "AJ-004", inspectionNo: "E-4", reportingVendor: "Vendor D", projectName: "New Job", openClosed: "Open" }
]);
assert.deepEqual(review.counts, { NEW: 1, UPDATED: 1, CLOSED: 1, "NO CHANGE": 1, CONFLICT: 0 });

const blankExistingIdentity = management.buildImportReview([current[0]], [
  { aj: "AJ-001", inspectionNo: "", reportingVendor: "", projectName: "Updated safely", openClosed: "Open" }
]);
assert.equal(blankExistingIdentity.counts.CONFLICT, 0, "Existing AJ source blanks must not block when stored permanent identifiers are available");
assert.equal(blankExistingIdentity.items[0].job.inspectionNo, "E-1", "Blank source inspection number must preserve the stored value");
assert.equal(blankExistingIdentity.items[0].job.reportingVendor, "Vendor A", "Blank source Reporting Vendor must preserve the stored value");
assert.match(blankExistingIdentity.items[0].warnings.join(" "), /Source blank.*existing.*preserved/i);
const blankIdentityApplied = management.applyImportReview({ activeJobs: structuredClone([current[0]]) }, blankExistingIdentity, { importedISO: "2026-08-15T10:00:00.000Z" });
assert.equal(blankIdentityApplied.state.activeJobs[0].inspectionNo, "E-1", "Applying other row changes must never erase a stored inspection number");
assert.equal(blankIdentityApplied.state.activeJobs[0].reportingVendor, "Vendor A", "Applying other row changes must never erase a stored Reporting Vendor");

const existingOpenBlankSource = management.buildImportReview([
  { aj: "AJ-OPEN", inspectionNo: "E-OPEN", reportingVendor: "Vendor Open", openClosed: "Open" }
], [
  { aj: "AJ-OPEN", inspectionNo: "E-OPEN", reportingVendor: "Vendor Open", openClosed: "" }
]);
assert.equal(existingOpenBlankSource.counts.CONFLICT, 0, "A blank source status must not block an existing Open AJ");
assert.equal(existingOpenBlankSource.items[0].job.openClosed, "Open", "A blank source status must preserve an existing Open value");
assert.match(existingOpenBlankSource.items[0].warnings.join(" "), /Source blank.*existing Open \/ Closed value preserved/i);
const existingOpenBlankApplied = management.applyImportReview({ activeJobs: [{ aj: "AJ-OPEN", inspectionNo: "E-OPEN", reportingVendor: "Vendor Open", openClosed: "Open" }] }, existingOpenBlankSource);
assert.equal(existingOpenBlankApplied.state.activeJobs[0].openClosed, "Open", "Applying a blank workbook status must not remove Open");

const existingClosedBlankSource = management.buildImportReview([
  { aj: "AJ-CLOSED", inspectionNo: "E-CLOSED", reportingVendor: "Vendor Closed", openClosed: "Closed" }
], [
  { aj: "AJ-CLOSED", inspectionNo: "E-CLOSED", reportingVendor: "Vendor Closed", openClosed: "" }
]);
assert.equal(existingClosedBlankSource.counts.CONFLICT, 0, "A blank source status must not block an existing Closed AJ");
assert.equal(existingClosedBlankSource.items[0].job.openClosed, "Closed", "A blank source status must preserve an existing Closed value");
assert.match(existingClosedBlankSource.items[0].warnings.join(" "), /Source blank.*existing Open \/ Closed value preserved/i);

assert.equal(review.items.find((item) => item.aj === "AJ-003").classification, "CLOSED", "An explicit Closed workbook value must remain a deliberate close");
const explicitOpenReview = management.buildImportReview([
  { aj: "AJ-REOPEN", inspectionNo: "E-REOPEN", reportingVendor: "Vendor Reopen", openClosed: "Closed" }
], [
  { aj: "AJ-REOPEN", inspectionNo: "E-REOPEN", reportingVendor: "Vendor Reopen", openClosed: "Open" }
]);
assert.equal(explicitOpenReview.items[0].classification, "UPDATED", "An explicit Open workbook value must be honored by the existing update rules");
const explicitOpenApplied = management.applyImportReview({ activeJobs: [{ aj: "AJ-REOPEN", inspectionNo: "E-REOPEN", reportingVendor: "Vendor Reopen", openClosed: "Closed" }] }, explicitOpenReview);
assert.equal(explicitOpenApplied.state.activeJobs[0].openClosed, "Open");

const newMissingVendor = management.buildImportReview([], [
  { aj: "AJ-NEW", inspectionNo: "E-NEW", reportingVendor: "", projectName: "Incomplete new job" }
]);
assert.equal(newMissingVendor.counts.CONFLICT, 1, "A new AJ without Reporting Vendor remains blocking");

const historicalDuplicates = [
  { aj: "AJ-H1", inspectionNo: "E-HIST", reportingVendor: "Historical Vendor", projectName: "Unit 1", openClosed: "Open" },
  { aj: "AJ-H2", inspectionNo: "E-HIST", reportingVendor: "Historical Vendor", projectName: "Unit 2", openClosed: "Open" }
];
const grandfatheredReview = management.buildImportReview(historicalDuplicates, structuredClone(historicalDuplicates));
assert.equal(grandfatheredReview.counts.CONFLICT, 0, "Known unchanged historical duplicate identities must not repeatedly block");
assert.equal(grandfatheredReview.warningCount, 2);
assert.match(grandfatheredReview.items[0].warnings.join(" "), /grandfathered|historical/i);

const introducedDuplicate = management.buildImportReview([historicalDuplicates[0]], [
  historicalDuplicates[0],
  { aj: "AJ-H3", inspectionNo: "E-HIST", reportingVendor: "Historical Vendor", projectName: "New duplicate" }
]);
assert.equal(introducedDuplicate.counts.CONFLICT, 2, "A newly introduced duplicate identity remains blocking");

const duplicateAj = management.buildImportReview([], [
  { aj: "AJ-010", inspectionNo: "E-10", reportingVendor: "Vendor X" },
  { aj: "AJ-010", inspectionNo: "E-11", reportingVendor: "Vendor Y" }
]);
assert.equal(duplicateAj.counts.CONFLICT, 2, "Duplicate AJ numbers require review");
const duplicateIdentity = management.buildImportReview([], [
  { aj: "AJ-011", inspectionNo: "E-12", reportingVendor: "Vendor Z" },
  { aj: "AJ-012", inspectionNo: "E-12", reportingVendor: "Vendor Z" }
]);
assert.equal(duplicateIdentity.counts.CONFLICT, 2, "Duplicate reporting-unit identities require review");
const changedIdentity = management.buildImportReview(current, [
  { aj: "AJ-001", inspectionNo: "E-99", reportingVendor: "Vendor A", projectName: "Replacement" }
]);
assert.equal(changedIdentity.counts.CONFLICT, 1, "Suspicious AJ identity changes must not auto-apply");
const unchangedBeforeResolution = management.applyImportReview({ activeJobs: structuredClone(current) }, changedIdentity, { importedISO: "2026-08-15T11:00:00.000Z" });
assert.equal(unchangedBeforeResolution.state.activeJobs[0].inspectionNo, "E-1", "Unresolved conflicts must never be applied");
changedIdentity.items[0].resolution = "accept";
const acceptedIdentityChange = management.applyImportReview({ activeJobs: structuredClone(current) }, changedIdentity, { importedISO: "2026-08-15T11:30:00.000Z" });
assert.equal(acceptedIdentityChange.state.activeJobs[0].inspectionNo, "E-99", "A complete identity change may be applied only after explicit acceptance");
assert.equal(acceptedIdentityChange.audit.conflictResolutions[0].resolution, "accept");

const legacy = {
  trips: [{ id: "trip-1", projectNumber: "000123" }],
  settings: { inspections: [{ id: "inspection-1", activeJobId: "AJ-001", photos: [{ id: "photo-1" }], loads: [{ id: "load-1", identifier: "L-1" }] }] }
};
const seeded = management.migrateState(legacy, current);
assert.equal(seeded.activeJobs.length, 3);
assert.equal(seeded.settings.inspections[0].activeJobId, "AJ-001", "Existing inspection links must not be rewritten");
assert.equal(seeded.trips[0].projectNumber, "000123");
const seededAgain = management.migrateState(seeded, current);
assert.equal(seededAgain.activeJobs.length, 3, "First-run migration must not duplicate jobs");

const recoverySeed = [
  { aj: "AJ-912", inspectionNo: "TEST-INSP-012", reportingVendor: "Example Fabricator A", openClosed: "" },
  { aj: "AJ-913", inspectionNo: "TEST-INSP-013", reportingVendor: "Example Fabricator B", openClosed: "" },
  { aj: "AJ-914", inspectionNo: "TEST-INSP-014", reportingVendor: "Example Fabricator C", openClosed: "Open" },
  { aj: "AJ-915", inspectionNo: "TEST-INSP-015", reportingVendor: "Example Fabricator D", openClosed: "Open" }
];
const existingUnassignedInspection = {
  id: "inspection-nde-review", tripId: "trip-example", activeJobId: "", date: "2026-08-15",
  reportingVendor: "Example Fabricator C", sbInspectionNo: "TEST-INSP-014", activity: "NDE Review",
  summary: "RT film review", notes: "Preserve all inspection data", status: "Completed",
  photos: [{ id: "photo-existing" }], loads: [{ id: "load-existing", identifier: "Vendor load" }]
};
const inspectionBeforeRecovery = structuredClone(existingUnassignedInspection);
const damagedCatalogState = {
  activeJobs: recoverySeed.map((job) => ({ ...job, openClosed: "", source: "active-jobs-import" })),
  settings: { inspections: [existingUnassignedInspection] },
  trips: [{ id: "trip-example", projectNumber: "TEST-INSP-014", vendor: "Example Fabricator C", miles: 0 }],
  facilityProfiles: [],
  activeJobImports: []
};
const aj914Reference = damagedCatalogState.activeJobs.find((job) => job.aj === "AJ-914");
const recovery = management.repairBlankOpenClosedFromSeed(damagedCatalogState, recoverySeed);
assert.deepEqual(recovery.repairedAJs, ["AJ-914", "AJ-915"], "Only seed jobs with a known prior status should be repaired");
assert.strictEqual(recovery.state.activeJobs.find((job) => job.aj === "AJ-914"), aj914Reference, "The synthetic AJ must be repaired in place");
assert.equal(recovery.state.activeJobs.filter((job) => job.aj === "AJ-914").length, 1, "The synthetic AJ must not be duplicated or recreated");
assert.equal(recovery.state.activeJobs.find((job) => job.aj === "AJ-914").openClosed, "Open");
assert.equal(recovery.state.activeJobs.find((job) => job.aj === "AJ-915").openClosed, "Open");
assert.ok(recovery.state.activeJobs.find((job) => job.aj === "AJ-914").modifiedISO, "A repaired AJ must be marked modified for normal synchronization");
assert.equal(recovery.state.activeJobs.find((job) => job.aj === "AJ-912").openClosed, "", "A job with no known seed status must remain blank");
assert.equal(recovery.state.activeJobs.find((job) => job.aj === "AJ-913").openClosed, "", "A job with no known seed status must remain blank");
assert.deepEqual(recovery.state.settings.inspections[0], inspectionBeforeRecovery, "Catalog repair must not rewrite the existing unassigned NDE Review inspection");
assert.equal(recovery.state.settings.inspections[0].activeJobId, "", "The existing inspection must remain unassigned for the user-test assignment workflow");
const recoveredMatches = management.matchingJobsForVisit(recovery.state, { id: "trip-example", projectNumber: "TEST-INSP-014", vendor: "Example Fabricator C" });
assert.equal(recoveredMatches[0]?.aj, "AJ-914", "The repaired synthetic visit must match its AJ again");
assert.deepEqual(management.matchingJobsForVisit(recovery.state, { id: "trip-unmatched", projectNumber: "E-NOT-REAL", vendor: "Unrelated Vendor" }), [], "An unmatched visit must not fall back to unrelated open jobs");
const secondRecovery = management.repairBlankOpenClosedFromSeed(recovery.state, recoverySeed);
assert.deepEqual(secondRecovery.repairedAJs, [], "The recovery must be idempotent after the blank values are restored");
const explicitlyClosedState = { activeJobs: [{ ...recoverySeed[2], openClosed: "Closed" }] };
assert.deepEqual(management.repairBlankOpenClosedFromSeed(explicitlyClosedState, recoverySeed).repairedAJs, [], "An explicit Closed value must never be overwritten by seed recovery");
assert.equal(explicitlyClosedState.activeJobs[0].openClosed, "Closed");
const changedIdentityState = { activeJobs: [{ ...recoverySeed[2], inspectionNo: "E-DIFFERENT", openClosed: "" }] };
assert.deepEqual(management.repairBlankOpenClosedFromSeed(changedIdentityState, recoverySeed).repairedAJs, [], "Seed recovery must not cross a changed permanent identity");
assert.equal(changedIdentityState.activeJobs[0].openClosed, "");

const applied = management.applyImportReview(seededAgain, review, {
  sourceFilename: "Active Jobs Master.xlsx", sourceHash: "abc", deviceId: "device-1", deviceLabel: "PC", importedISO: "2026-08-15T12:00:00.000Z"
});
assert.equal(applied.state.activeJobs.find((job) => job.aj === "AJ-001").projectName, "New");
assert.equal(applied.state.activeJobs.find((job) => job.aj === "AJ-003").openClosed, "Closed");
assert.equal(applied.state.activeJobs.length, 4);
assert.equal(applied.state.settings.inspections[0].activeJobId, "AJ-001");
assert.equal(applied.state.activeJobImports[0].counts.NEW, 1);

const profileOne = management.normalizeFacilityProfile({ name: "Vendor A — Main", reportingVendor: "Vendor A", normalInspectionLocation: "Main Shop", aliases: "Paint Yard\nStorage Yard" });
const profileTwo = management.normalizeFacilityProfile({ name: "Vendor A — Galvanizer", reportingVendor: "Vendor A", normalInspectionLocation: "Example Galvanizer" });
assert.notEqual(profileOne.id, profileTwo.id, "One vendor may have multiple Facility Profiles");
const profileState = { activeJobs: [{ ...current[0], defaultFacilityProfileId: profileOne.id, facilityProfileIds: [profileOne.id, profileTwo.id] }], facilityProfiles: [profileOne, profileTwo], activeJobImports: [], settings: { inspections: [] } };
assert.equal(management.facilityProfilesForJob(profileState, profileState.activeJobs[0]).length, 2, "An Active Job may explicitly use multiple Facility Profiles");
const suggested = management.prefillVisitRecord({ vendor: "Today's override" }, profileState.activeJobs[0], profileOne);
assert.equal(suggested.vendor, "Today's override", "Existing visit values are temporary overrides and must not be overwritten");
assert.equal(suggested.projectNumber, "E-1");
assert.equal(profileOne.normalInspectionLocation, "Main Shop", "Visit prefill must not modify the profile");
assert.equal(management.matchingJobsForVisit(profileState, { id: "trip-x", vendor: "Paint Yard", projectNumber: "" })[0].aj, "AJ-001", "Facility aliases should match jobs");

const pending = {
  id: "inspection-pending", activeJobId: "", tripId: "trip-1", notes: "keep", photos: [{ id: "photo-1" }],
  loads: [{ id: "load-1", identifier: "Vendor L/01" }], followUps: [{ id: "follow-1", action: "Verify" }]
};
const assigned = management.assignPendingInspectionRecord(pending, profileState.activeJobs[0], profileOne);
assert.equal(assigned.id, pending.id, "Assignment must update the same inspection, not duplicate it");
assert.equal(assigned.activeJobId, "AJ-001");
assert.deepEqual(assigned.photos, pending.photos);
assert.deepEqual(assigned.loads, pending.loads);
assert.deepEqual(assigned.followUps, pending.followUps);

const inspectionsSource = fs.readFileSync(path.join(__dirname, "..", "inspections.js"), "utf8");
assert.doesNotMatch(inspectionsSource, /scheduleInspectionAutosave\(\)[\s\S]{0,180}!\$\("inspectionActiveJobId"\)/, "Pending inspections must not be blocked from autosave");
assert.match(inspectionsSource, /NO ACTIVE JOB FOUND/);
assert.match(inspectionsSource, /Work as Pending \/ Unassigned Job/);
assert.match(inspectionsSource, /Assign to Active Job/);

const externalWorkbookPath = process.env.ACTIVE_JOBS_TEST_WORKBOOK || "";
if (externalWorkbookPath && fs.existsSync(externalWorkbookPath)) {
  const external = management.parseActiveJobsWorkbookBytes(fs.readFileSync(externalWorkbookPath), fflate);
  assert.equal(external.sheetName, "Active Jobs");
  assert.deepEqual(external.headers.slice(0, 12), [
    "Record ID", "Inspection Job #", "Client", "Client Project Name", "Client Project Number", "S&B Order / PO",
    "Fabricator", "Shop Number", "Location", "Current Status", "Latest Known Status / Next Action", "Open / Closed"
  ]);
  assert.ok(external.jobs.length > 0, "An explicitly supplied external workbook should contain at least one applicable row");
  assert.equal(external.jobs.some((job) => job.aj === "#REF!"), false, "Formula-only table rows must not become jobs");
}

console.log("Active Jobs import, migration, Facility Profile, pending assignment, and optional-workbook tests passed.");
