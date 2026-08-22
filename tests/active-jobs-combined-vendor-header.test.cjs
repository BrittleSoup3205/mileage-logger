const assert = require("node:assert/strict");
const management = require("../active-jobs-management.js");

const table = {
  headerRow: 1,
  headers: [
    "Record ID",
    "Inspection Job #",
    "Client",
    "Client Project Name",
    "Reporting Vendor / Fabricator",
    "Shop Number",
    "Open / Closed"
  ],
  rows: [
    ["AJ-017", "E10379-432", "Shell Norco", "UE E-2329 Exchanger Bundle Replacement", "Cembell", "2607-9612", "Open"],
    ["AJ-018", "E10379-433", "Shell Norco", "CR2 E-1211A, B, & C Bundle Replacements", "Cembell", "2607-9497", "Open"]
  ]
};

const jobs = management.workbookRowsToJobs(table);
assert.equal(jobs.length, 2);
assert.equal(jobs[0].reportingVendor, "Cembell", "Combined Reporting Vendor / Fabricator header must map to reportingVendor");
assert.equal(jobs[1].reportingVendor, "Cembell", "Combined Reporting Vendor / Fabricator header must map consistently");

const review = management.buildImportReview([], jobs);
assert.equal(review.counts.CONFLICT, 0, "New rows with the combined vendor header must not be flagged as missing a reporting vendor");
assert.equal(review.counts.NEW, 2);

console.log("Active Jobs combined Reporting Vendor / Fabricator header regression tests passed.");
