const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const inspections = fs.readFileSync(path.join(root, "inspections.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mediaStore = fs.readFileSync(path.join(root, "media-store.js"), "utf8");

assert.match(index, /id="tripEditTakePhotoBtn"/);
assert.match(index, /id="tripEditChoosePhotosBtn"/);
assert.match(app, /data-trip-edit-photo-caption/);
assert.match(app, /MileageMediaStore\.addPhoto\(tripId,/);
assert.match(app, /data-remove-trip-edit-photo/);
assert.match(app, /function tripPhotoMetadata\(\)/);
assert.match(app, /function photoReferenceCount\(\)/);
assert.match(app, /tripPhotoCount: tripPhotos\.length/);
assert.match(app, /photoReferences: photoReferenceCount\(\)/);
assert.match(app, /window\.addEventListener\("mileage:state-changed", reloadStateFromStorage\)/);
assert.match(app, /function buildBackupPackage\(\) \{\s*\/\/[^]*?state = loadState\(\);/);
assert.match(mediaStore, /async function updatePhotoCaption/);

assert.match(inspections, /id="activeJobsVisit"/);
assert.match(inspections, /id="visitCurrentContext"/);
assert.match(inspections, /id="visitLinkedInspections"/);
assert.match(inspections, /id="visitNotesPhotos"/);
assert.match(inspections, /data-open-workspace-inspection/);
assert.match(inspections, /data-edit-workspace-trip/);
assert.match(inspections, /standaloneInspectionBtn/);
assert.match(
  inspections,
  /const selectedVendor = savedTrip\?\.vendor \|\| state\.settings\.activeJobsWorkspaceVendor/,
  "An edited visit vendor should replace stale workspace vendor context"
);

assert.match(inspections, /inspection\.photos\.filter\(\(photo\) => !photo\.sourceTripId\)/);
assert.doesNotMatch(inspections, /inheritedTripPhotos/);
assert.doesNotMatch(inspections, /recoverLinkedTripPhotos/);
assert.match(inspections, /Trip-level photos stay with the visit/);
assert.match(inspections, /\(inspection\.tripId \|\| ""\) === tripId/);
assert.match(inspections, /window\.dispatchEvent\(new CustomEvent\("mileage:state-changed"\)\)/);

console.log("Visit workspace and separate photo-ownership checks passed.");
