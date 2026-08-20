const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const inspections = read("inspections.js");
const mediaStore = read("media-store.js");
const app = read("app.js");
const jobs = read("active-jobs-management.js");
const sync = read("sync-engine.js");
const queues = read("workflow-queues.js");
const index = read("index.html");

assert.match(inspections, /const INSPECTION_PHOTO_LIMIT = 50/);
assert.match(inspections, /const INSPECTION_PHOTO_WARNING = 30/);
assert.match(inspections, /\$\{currentPhotos\.length\} of \$\{INSPECTION_PHOTO_LIMIT\}/);
assert.match(mediaStore, /const MAX_IMAGE_DIMENSION = 1600/);
assert.match(mediaStore, /const JPEG_QUALITY = 0\.82/);
assert.match(mediaStore, /canvas\.toBlob\([\s\S]*?"image\/jpeg"/);

assert.match(inspections, /Export Word Report/);
assert.match(inspections, /Word \+ Photos ZIP/);
assert.match(inspections, /PDF is not generated/);
assert.match(inspections, /function exportInspectionPackage[\s\S]*?buildInspectionWordReport/);
assert.match(inspections, /reportRotation/);
assert.match(inspections, /Rotate Left/);
assert.match(inspections, /Rotate Right/);
assert.match(inspections, /a:srcRect/);

assert.match(inspections, /Activities Performed/);
assert.match(inspections, /Coating QA/);
assert.match(inspections, /id="visitHierarchy"/);
assert.match(inspections, /How this works/i);
assert.match(inspections, /inspection-followup-group/);
assert.match(inspections, /Preferred/);
assert.match(jobs, /Inspection → Active Job review/);

assert.match(jobs, /invalid numeric Current Status was removed/);
assert.match(jobs, /Create a genuinely new Active Job/);
assert.match(jobs, /calculatedMileageVisit/);
assert.match(sync, /Historical conflicts remain available in Sync History/);
assert.match(sync, /Current sync health/);
assert.match(queues, /Administrative Queues/);
assert.match(queues, /do not affect inspection completion/i);

assert.match(app, /const APP_VERSION = "7\.0\.0-preview"/);
assert.match(app, /async function testBackupRestore/);
assert.match(app, /Current app data was not changed/);
assert.match(index, /id="appVersionInfo"/);
assert.match(index, /id="testRestoreBackupBtn"/);

console.log("Full upgrade-list static regression checks passed.");
