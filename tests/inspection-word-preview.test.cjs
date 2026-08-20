const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const fflate = require("../vendor/fflate.min.js");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "inspections.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "inspections.js"), "utf8");

const localStorage = {
  getItem: () => null,
  setItem: () => {}
};
const document = {
  readyState: "loading",
  addEventListener: () => {},
  getElementById: () => null
};
const window = {
  localStorage,
  fflate,
  MileageWorkflowData: { inspectionLoads: (inspection) => inspection.loads || [] },
  MileageActiveJobsData: { activeJobs: [] },
  MileageActiveJobsManagement: {
    getActiveJobs: (state) => state.settings.activeJobs || []
  }
};
const context = vm.createContext({
  window,
  document,
  console,
  Blob,
  Uint8Array,
  URL,
  Date,
  Math,
  Map,
  Set,
  Object,
  Array,
  String,
  Number,
  Boolean
});
vm.runInContext(source, context, { filename: "inspections.js" });
const api = window.MileageInspectionReportTesting;
const jpegFixture = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDFooor7E+RCiiigAooooAKKKKACiiigAooooA//9k=", "base64");

function photo(index, extra = {}) {
  return {
    id: `photo-${index}`,
    name: `IMG_${String(index).padStart(4, "0")}.jpg`,
    caption: `Weld detail ${index}`,
    type: "image/jpeg",
    width: 1600,
    height: 1200,
    packagePath: `Photos/${String(index).padStart(2, "0")}_IMG_${index}.jpg`,
    blob: new Blob([jpegFixture], { type: "image/jpeg" }),
    ...extra
  };
}

assert.ok(api, "Inspection report test API should be available without initializing the UI");

for (const count of [0, 1, 4, 5, 8, 13, 25, 50]) {
  const references = api.inspectionSpecificPhotoReferences({ photos: Array.from({ length: count }, (_, index) => photo(index + 1)) });
  assert.equal(references.length, count, `${count} inspection photos should remain selected`);
  references.forEach((item, index) => {
    assert.match(api.photoFigureCaption(item, index + 1), new RegExp(`^Figure ${index + 1} - `));
    assert.match(api.photoFigureCaption(item, index + 1), new RegExp(item.name));
    assert.match(api.photoFigureCaption(item, index + 1), new RegExp(item.caption));
  });
}

const selected = api.inspectionSpecificPhotoReferences({
  photos: [photo(1), photo(1), photo(2, { sourceTripId: "trip-1" }), photo(3)]
});
assert.deepEqual(selected.map((item) => item.id), ["photo-1", "photo-3"], "Duplicate and trip-level photo references must not enter inspection reports");

const state = {
  trips: [{ id: "trip-1", date: "2026-08-14", vendor: "Vendor destination", purpose: "Shop inspection", miles: 42.5, startTime: "08:00", endTime: "10:00" }],
  settings: {
    activeJobs: [{ aj: "AJ-900", inspectionNo: "TEST-INSP-900", workbookClient: "Example Client", projectName: "Synthetic Project", reportingVendor: "Example Fabricator", vendorJobs: "TEST-SHOP-44" }],
    inspections: []
  }
};
const inspection = {
  id: "inspection-1",
  tripId: "trip-1",
  activeJobId: "AJ-900",
  date: "2026-08-14",
  customer: "Example Client",
  projectName: "Synthetic Project",
  reportingVendor: "Example Fabricator",
  inspectionLocation: "Example Subvendor Shop",
  equipmentTag: "V-101",
  isoDrawingNumber: "ISO-22",
  pieceSpoolNumber: "SP-7",
  inspectionType: "Final Inspection",
  activity: "Dimensional inspection",
  status: "Complete",
  acceptanceStatus: "Accepted",
  summary: "Summary text",
  quickNote: "Quick note text",
  generatedReportLanguage: "Generated report text",
  observations: "All observations text",
  deficiencyStatus: "Issue noted",
  deficiencies: "Deficiency detail text",
  coating: { system: "C-200", profileReadings: "2.1, 2.3", dftReadings: "8.0, 8.4" },
  structural: { welds: "Satisfactory", dimensions: "Issue noted" },
  loads: [{ id: "load-1", identifier: "LOAD-X", status: "Hold", notes: "Load note", deficiencyFollowUp: "Repair required", photoIds: ["photo-1"] }],
  followUps: [{ id: "follow-1", action: "Verify repair", responsibleParty: "Vendor", dueDate: "2026-08-20", status: "Open" }],
  photos: [photo(1), photo(2)]
};
state.settings.inspections.push(inspection);
const before = JSON.stringify(state);
const model = api.buildInspectionPreviewModel(state, inspection);
const markup = api.inspectionPreviewMarkup(model);
assert.equal(JSON.stringify(state), before, "Preview model and markup must not alter inspection state");
assert.match(markup, /AJ-900/);
assert.match(markup, /TEST-INSP-900/);
assert.match(markup, /42\.5 mi/);
for (const text of ["Summary text", "Quick note text", "Generated report text", "All observations text", "Deficiency detail text", "C-200", "2.1, 2.3", "Satisfactory", "LOAD-X", "Verify repair"]) {
  assert.match(markup, new RegExp(text));
}
assert.equal((markup.match(/data-preview-photo=/g) || []).length, 2, "Preview must render every inspection photo");
assert.match(markup, /data-preview-edit-inspection="inspection-1"/);
assert.match(markup, /data-preview-export-inspection="inspection-1"/);
assert.match(markup, /data-close-inspection-preview/);
assert.match(markup, /LOAD-X • Hold/, "Vendor load status should use the intended bullet separator");
assert.match(markup, /Verify repair • Open/, "Follow-up status should use the intended bullet separator");
assert.match(markup, /Vendor • 08\/20\/2026/, "Follow-up details should use the intended bullet separator");
assert.match(markup, /Loading photo…/, "Photo loading text should use the intended ellipsis");
assert.doesNotMatch(markup, /(?:\u00e2\u20ac|\u00c3|\ufffd|\u00c2|\u00f0\u0178)/i, "Inspection Preview markup must not contain known mojibake sequences");

assert.match(styles, /\.inspection-preview-photos \{[^}]*grid-template-columns: repeat\(2,/s, "Desktop preview should use a two-column photo layout");
assert.match(styles, /@media \(max-width: 760px\)[^]*\.inspection-preview-facts, \.inspection-preview-photos \{ grid-template-columns: 1fr;/, "Mobile preview should collapse to one column");
assert.match(source, /const requiredPhotoRows = Math\.max\(2, Math\.ceil\(photos\.length \/ 2\)\)/, "Private template must grow for every photo pair");
assert.match(source, /ensurePhotoTableRows\(photoTable, requiredPhotoRows\)/);
assert.match(source, /ensureWordImageContentType\(contentTypesXml, extension\)/, "Private templates must declare added image media types");
assert.match(source, /index < 4[^]*?setEmptyPhotoCell[^]*?clearPhotoCell/, "Extra odd photo rows must not invent a numbered empty figure");
assert.match(source, /createElementNS\(WORD_NS, "w:cantSplit"\)/, "Photo rows must stay together across page breaks");
assert.doesNotMatch(source, /const supportedPhotos =[^]*?\.slice\(0, 4\)/, "Word export must not cap photos at four");

const mixedNdeSections = api.reportSectionText({
  ...inspection,
  activities: ["NDE Review", "Dimensional Inspection"],
  activity: "Dimensional inspection and general documentation review",
  observations: "General dimensional observations remain in the inspection audit section."
});
assert.match(mixedNdeSections.inspectionAudit, /General dimensional observations/,
  "Selecting NDE alongside other work must not steal unrelated general observations");
assert.doesNotMatch(mixedNdeSections.ndeReview, /General dimensional observations/,
  "The NDE section must not claim mixed-activity general observations");

const sectionDeficiency = "Synthetic section exception requires repair.";
const deficiencySections = api.reportSectionText({
  ...inspection,
  summary: "",
  deficiencies: sectionDeficiency,
  generatedReportLanguage: `Inspection completed. A deficiency or exception was recorded: ${sectionDeficiency}`
});
assert.equal((Object.values(deficiencySections).join("\n").match(/Synthetic section exception requires repair\./g) || []).length, 1,
  "Template-routed Word sections must contain a deficiency or exception exactly once");

(async () => {
  const repeatedDeficiency = "Synthetic flange exception requires repair.";
  const deficiencyBytes = await api.buildInspectionDocx({
    ...inspection,
    summary: `Summary entered. ${repeatedDeficiency}`,
    quickNote: `Quick note entered. ${repeatedDeficiency}`,
    observations: `General observations entered. ${repeatedDeficiency}`,
    deficiencies: repeatedDeficiency,
    generatedReportLanguage: `Inspection completed. A deficiency or exception was recorded: ${repeatedDeficiency}`
  }, []);
  const deficiencyXml = fflate.strFromU8(fflate.unzipSync(deficiencyBytes)["word/document.xml"]);
  assert.equal((deficiencyXml.match(/Synthetic flange exception requires repair\./g) || []).length, 1,
    "A deficiency or exception must appear exactly once in the Word report");

  for (const count of [0, 1, 4, 5, 8, 13, 25, 50]) {
    const photos = Array.from({ length: count }, (_, index) => photo(index + 1));
    const bytes = await api.buildInspectionDocx(inspection, photos);
    if (count === 13 && process.env.INSPECTION_DOCX_FIXTURE) {
      fs.writeFileSync(process.env.INSPECTION_DOCX_FIXTURE, bytes);
    }
    const entries = fflate.unzipSync(bytes);
    const xml = fflate.strFromU8(entries["word/document.xml"]);
    assert.equal((xml.match(/Figure \d+ - /g) || []).length, count, `${count}-photo Word report should contain ${count} figures`);
    for (let index = 1; index <= count; index += 1) {
      assert.match(xml, new RegExp(`Figure ${index} - Weld detail ${index} \\(IMG_${String(index).padStart(4, "0")}\\.jpg\\)`));
      assert.ok(entries[`word/media/inspection-photo-${index}.jpg`], `Photo ${index} must be embedded exactly once`);
    }
    assert.equal(Object.keys(entries).filter((name) => name.startsWith("word/media/inspection-photo-")).length, count);
    if (count > 4) assert.ok((xml.match(/w:pageBreakBefore/g) || []).length >= count, "Additional photos should continue onto later pages");
  }
  console.log("Inspection Word export and read-only preview regression checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
