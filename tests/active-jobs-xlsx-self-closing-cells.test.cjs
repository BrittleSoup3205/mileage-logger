const assert = require("node:assert/strict");
const management = require("../active-jobs-management.js");
const fflate = require("../vendor/fflate.min.js");

function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineCell(ref, value) {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

const headers = [
  "Record ID", "Inspection Job #", "Client", "Client Project Name", "Client Project Number",
  "S&B Order / PO", "Fabricator", "Shop Number", "Location", "Current Status",
  "Latest Known Status / Next Action", "Open / Closed"
];

const headerCells = headers.map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}1`, value)).join("");
const row2 = [
  inlineCell("A2", "AJ-017"),
  inlineCell("B2", "E10379-432"),
  inlineCell("C2", "Shell Norco"),
  inlineCell("D2", "UE E-2329 Exchanger Bundle Replacement"),
  '<c r="E2"/>',
  '<c r="F2"/>',
  inlineCell("G2", "Cembell"),
  inlineCell("H2", "2607-9612"),
  '<c r="I2"/>',
  '<c r="J2"/>',
  '<c r="K2"/>',
  inlineCell("L2", "Open")
].join("");
const row3 = [
  inlineCell("A3", "AJ-018"),
  inlineCell("B3", "E10379-433"),
  inlineCell("C3", "Shell Norco"),
  inlineCell("D3", "CR2 E-1211A, B, & C Bundle Replacements"),
  '<c r="E3"/>',
  '<c r="F3"/>',
  inlineCell("G3", "Cembell"),
  inlineCell("H3", "2607-9497"),
  '<c r="I3"/>',
  '<c r="J3"/>',
  '<c r="K3"/>',
  inlineCell("L3", "Open")
].join("");

const entries = {
  "xl/workbook.xml": fflate.strToU8('<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Active Jobs" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels": fflate.strToU8('<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  "xl/worksheets/sheet1.xml": fflate.strToU8(`<?xml version="1.0"?><worksheet><sheetData><row r="1">${headerCells}</row><row r="2">${row2}</row><row r="3">${row3}</row></sheetData></worksheet>`)
};

const parsed = management.parseActiveJobsWorkbookBytes(fflate.zipSync(entries), fflate);
assert.equal(parsed.jobs.length, 2);
assert.equal(parsed.jobs[0].sbOrder, "", "A self-closing blank S&B Order / PO cell must remain blank");
assert.equal(parsed.jobs[0].reportingVendor, "Cembell", "Fabricator after a self-closing blank cell must stay in its own column");
assert.equal(parsed.jobs[0].vendorJobs, "2607-9612");
assert.equal(parsed.jobs[0].openClosed, "Open", "Consecutive self-closing blanks must not consume a later Open / Closed value");
assert.equal(parsed.jobs[1].reportingVendor, "Cembell");
assert.equal(parsed.jobs[1].vendorJobs, "2607-9497");
assert.equal(parsed.jobs[1].openClosed, "Open");

const review = management.buildImportReview([], parsed.jobs);
assert.equal(review.counts.CONFLICT, 0, "Valid new rows must not be flagged as missing a reporting vendor");
assert.equal(review.counts.NEW, 2);

console.log("Active Jobs XLSX self-closing cell regression tests passed.");
