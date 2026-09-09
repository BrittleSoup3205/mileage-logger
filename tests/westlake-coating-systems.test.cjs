const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "westlake-coating-systems.js"), "utf8");
const listeners = {};
const documentStub = {
  documentElement: {},
  getElementById() { return null; },
  addEventListener(type, handler) { listeners[`document:${type}`] = handler; }
};
class MutationObserverStub {
  constructor(callback) { this.callback = callback; }
  observe() {}
}
const coatingSystems = { Norco: [], Geismar: [] };
const context = {
  window: {
    MileageActiveJobsData: {
      coatingSystems,
      activeJobs: [],
      normalizedJob: (job) => job
    },
    addEventListener(type, handler) { listeners[`window:${type}`] = handler; }
  },
  document: documentStub,
  MutationObserver: MutationObserverStub,
  localStorage: { getItem() { return null; } },
  setTimeout(callback) { callback(); return 0; },
  console
};
context.window.window = context.window;
context.window.document = documentStub;
vm.runInNewContext(source, context, { filename: "westlake-coating-systems.js" });

const api = context.window.MileageWestlakeCoatingReference;
assert.ok(api, "Westlake coating reference should load");
assert.ok(Array.isArray(coatingSystems.Plaquemine), "Plaquemine coating library should be installed");
assert.equal(coatingSystems.Plaquemine.length, 25, "Only the 25 current PDES-8001 systems should be loaded");

const expectedCodes = [
  "G-1", "G-2A", "G-2C", "G-3A", "G-3B", "G-3E", "G-5", "G-6A", "G-6C", "G-9A", "G-9B",
  "G-13", "G-14", "G-15A", "G-16B", "G-17", "G-21", "G-22", "G-23A", "G-23B", "G-23C", "G-24", "G-25", "G-26", "G-27"
];
assert.deepEqual(Array.from(coatingSystems.Plaquemine, (system) => system[0]), expectedCodes);

const obsolete = new Set(["G-2B", "G-3C", "G-3D", "G-4A", "G-4B", "G-6B", "G-7A", "G-8A", "G-9C", "G-10A", "G-11A", "G-12A", "G-15B", "G-15C", "G-16A", "G-18", "G-19", "G-20"]);
assert.equal(coatingSystems.Plaquemine.some((system) => obsolete.has(system[0])), false, "Obsolete systems must stay excluded");

const g6a = coatingSystems.Plaquemine.find((system) => system[0] === "G-6A");
assert.ok(g6a[4].manufacturers.some((row) => row.join(" ").includes("893") && row.join(" ").includes("890") && row.join(" ").includes("133")), "G-6A should retain the Carboline 893 / 890 / 133 combination");

for (const code of ["G-23A", "G-23B", "G-23C", "G-26"]) {
  const system = coatingSystems.Plaquemine.find((item) => item[0] === code);
  assert.match(system[4].discrepancy, /SP5/i);
  assert.match(system[4].discrepancy, /SP6/i);
}

assert.equal(api.source.revision, "7");
assert.match(api.source.revisionNote, /internal document page headers display Rev\. 6/i);
assert.ok(api.inspectionControls.some((item) => /same work shift/i.test(item)));
assert.ok(api.inspectionControls.some((item) => /1\.5-2\.5 mils/i.test(item)));
assert.ok(api.inspectionControls.some((item) => /each end and middle/i.test(item)));

console.log("Westlake PDES-8001 coating reference tests passed.");