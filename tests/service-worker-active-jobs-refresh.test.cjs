const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");

assert.match(source, /mileage-logger-full-upgrade-list-v68/, "Service worker cache version must advance so installed apps refresh assets");
assert.match(source, /active-jobs-management\.js\?v=xlsx-self-closing-cells-1/, "Active Jobs management must use a new cache-busting asset URL");
assert.match(source, /pathname\.endsWith\("\/active-jobs-management\.js"\)/, "Old index references must be routed to the refreshed Active Jobs asset");
assert.match(source, /fetch\(activeJobsUrl, \{ cache: "reload" \}\)/, "The refreshed Active Jobs asset must bypass stale HTTP cache on first fetch");

console.log("Active Jobs service worker cache refresh regression tests passed.");
