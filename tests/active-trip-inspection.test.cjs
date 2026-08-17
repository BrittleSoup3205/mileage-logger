const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const inspections = fs.readFileSync(path.join(root, "inspections.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

assert.match(inspections, /state\.activeTrip\?\.id === tripId/, "Active trip must resolve as an inspection trip");
assert.match(inspections, /Work Current Inspection/, "Active trip card must offer Work Current Inspection");
assert.match(inspections, /ACTIVE TRIP — .*in progress/s, "Visit selector must identify the active trip");
assert.match(inspections, /selectedTrip\?\.projectNumber.*job\.inspectionNo/s, "Active job matching must support a new subvendor via project number");
assert.match(inspections, /mileage:trip-finalized/, "Inspection layer must finalize trip snapshots before backup");
assert.match(inspections, /Trip finalized and linked to/, "Completed trip must not prompt for a duplicate inspection when already linked");
assert.match(app, /mileage:trip-finalized/, "Mileage app must dispatch finalization before backup");
assert.match(serviceWorker, /mileage-logger-(?:active-trip-inspection-v54|multi-device-v5[6-9]|active-jobs-management-v5[8-9]|active-jobs-bootstrap-v59|active-jobs-open-status-v60|inspection-word-preview-v6[1-4])/, "Offline cache must include the active-trip inspection fix or a newer release");

console.log("Active-trip inspection workflow checks passed.");
