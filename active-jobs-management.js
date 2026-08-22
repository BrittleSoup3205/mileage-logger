((root, factory) => {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MileageActiveJobsManagement = api;
})(typeof window !== "undefined" ? window : globalThis, (root) => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const WORKSHEET_NAME = "Active Jobs";
  const JOB_FIELDS = [
    "aj", "inspectionNo", "workbookClient", "projectName", "clientProjectNo", "sbOrder",
    "reportingVendor", "vendorJobs", "location", "status", "nextAction", "openClosed",
    "lastInspectionDate", "lastMileageLoggerVisit", "nextExpectedInspection", "lastSourceReviewThrough",
    "workbookLastUpdated", "statusSource", "sourcePage", "dataQuality", "notes"
  ];
  const HEADER_FIELDS = {
    "record id": "aj",
    "aj number": "aj",
    "inspection job #": "inspectionNo",
    "s&b inspection number": "inspectionNo",
    "client": "workbookClient",
    "client project name": "projectName",
    "project name": "projectName",
    "client project number": "clientProjectNo",
    "s&b order / po": "sbOrder",
    "reporting vendor": "reportingVendor",
    "reporting vendor / fabricator": "reportingVendor",
    "fabricator": "reportingVendor",
    "shop number": "vendorJobs",
    "vendor shop / job number(s)": "vendorJobs",
    "location": "location",
    "current status": "status",
    "status": "status",
    "latest known status / next action": "nextAction",
    "next action": "nextAction",
    "open / closed": "openClosed",
    "last inspection date": "lastInspectionDate",
    "last mileage logger visit": "lastMileageLoggerVisit",
    "next expected inspection / target": "nextExpectedInspection",
    "last source review through": "lastSourceReviewThrough",
    "workbook last updated": "workbookLastUpdated",
    "status source": "statusSource",
    "source page": "sourcePage",
    "data quality": "dataQuality",
    "notes": "notes"
  };
  const DATE_FIELDS = new Set([
    "lastInspectionDate", "lastMileageLoggerVisit", "nextExpectedInspection",
    "lastSourceReviewThrough", "workbookLastUpdated"
  ]);

  const text = (value) => value === null || value === undefined ? "" : String(value);
  const trimmed = (value) => text(value).trim();
  const keyText = (value) => trimmed(value).toLowerCase();
  const nowISO = () => new Date().toISOString();
  const makeId = (prefix) => {
    if (root.crypto?.randomUUID) return `${prefix}-${root.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };
  const escapeHTML = (value) => text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function decodeXml(value) {
    return text(value)
      .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
      .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function xmlAttribute(attributes, name) {
    const match = text(attributes).match(new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}=(?:"([^"]*)"|'([^']*)')`, "i"));
    return decodeXml(match?.[1] ?? match?.[2] ?? "");
  }

  function columnIndex(reference) {
    const letters = (text(reference).match(/^[A-Z]+/i)?.[0] || "").toUpperCase();
    let result = 0;
    for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
    return Math.max(0, result - 1);
  }

  function sheetTargetPath(target) {
    const clean = text(target).replace(/\\/g, "/").replace(/^\//, "");
    if (clean.startsWith("xl/")) return clean;
    const parts = [];
    `xl/${clean}`.split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return parts.join("/");
  }

  function excelDate(value) {
    if (value === "" || value === null || value === undefined) return "";
    if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(text(value))) {
      const serial = Number(value);
      if (Number.isFinite(serial) && serial >= 20000) {
        const milliseconds = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
        return new Date(milliseconds).toISOString().slice(0, 10);
      }
    }
    const raw = trimmed(value);
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return raw;
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }

  function cleanWorkbookValue(value) {
    const result = text(value);
    return /^#(?:REF!|VALUE!|N\/A|NAME\?|DIV\/0!|NUM!|NULL!)$/i.test(trimmed(result)) ? "" : result;
  }

  function plausibleStatus(value) {
    const candidate = trimmed(value);
    return !candidate || /[a-z]/i.test(candidate);
  }

  function parseSharedStrings(xml) {
    return [...text(xml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => (
      [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) => decodeXml(item[1])).join("")
    ));
  }

  function parseCellValue(attributes, body, sharedStrings) {
    const type = xmlAttribute(attributes, "t");
    if (type === "inlineStr") {
      return [...text(body).matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) => decodeXml(item[1])).join("");
    }
    const raw = decodeXml(text(body).match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "");
    if (type === "s") return sharedStrings[Number(raw)] ?? "";
    if (type === "str" || type === "e") return raw;
    if (type === "b") return raw === "1";
    if (raw === "") return "";
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }

  function parseSheetRows(xml, sharedStrings) {
    return [...text(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)].map((rowMatch) => {
      const row = [];
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const reference = xmlAttribute(cell[1], "r");
        row[columnIndex(reference)] = parseCellValue(cell[1], cell[2], sharedStrings);
      }
      return row;
    });
  }

  function parseWorkbookTable(bytes, fflateApi = root.fflate) {
    if (!fflateApi?.unzipSync || !fflateApi?.strFromU8) throw new Error("The XLSX reader is unavailable.");
    const entries = fflateApi.unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const xml = (path) => entries[path] ? fflateApi.strFromU8(entries[path]) : "";
    const workbookXml = xml("xl/workbook.xml");
    const relationshipsXml = xml("xl/_rels/workbook.xml.rels");
    if (!workbookXml || !relationshipsXml) throw new Error("This file is not a readable Excel workbook.");

    const relationshipTargets = new Map();
    for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gi)) {
      relationshipTargets.set(xmlAttribute(match[1], "Id"), xmlAttribute(match[1], "Target"));
    }
    let selected = null;
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/gi)) {
      const name = xmlAttribute(match[1], "name");
      if (name === WORKSHEET_NAME) {
        selected = { name, relationshipId: xmlAttribute(match[1], "r:id") };
        break;
      }
    }
    if (!selected) throw new Error(`The workbook must contain a worksheet named “${WORKSHEET_NAME}”.`);
    const target = relationshipTargets.get(selected.relationshipId);
    const sheetXml = target ? xml(sheetTargetPath(target)) : "";
    if (!sheetXml) throw new Error(`The “${WORKSHEET_NAME}” worksheet could not be read.`);

    const sharedStrings = parseSharedStrings(xml("xl/sharedStrings.xml"));
    const rows = parseSheetRows(sheetXml, sharedStrings);
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map((value) => keyText(value));
      return headers.includes("record id") && headers.includes("inspection job #");
    });
    if (headerIndex < 0) throw new Error("The Active Jobs header row was not found.");
    const headers = rows[headerIndex].map((value) => trimmed(value));
    return { sheetName: selected.name, headerRow: headerIndex + 1, headers, rows: rows.slice(headerIndex + 1) };
  }

  function workbookRowsToJobs(table) {
    const mappedHeaders = table.headers.map((header) => HEADER_FIELDS[keyText(header)] || "");
    const jobs = [];
    table.rows.forEach((row, index) => {
      const record = {};
      mappedHeaders.forEach((field, column) => {
        if (!field) return;
        const value = row[column] ?? "";
        record[field] = cleanWorkbookValue(DATE_FIELDS.has(field) ? excelDate(value) : value);
      });
      record._importWarnings = [];
      if (!plausibleStatus(record.status)) {
        record._importWarnings.push(`Current Status value “${trimmed(record.status)}” is numeric or implausible and was left blank.`);
        record.status = "";
      }
      // Ignore Excel table/formula rows that contain no source job data.
      // Derived workbook columns may contain formulas below the final job.
      // Rows with any identity or job-detail value are retained so malformed
      // source data can still be surfaced as a conflict during review.
      const sourceFields = [
        "aj",
        "inspectionNo",
        "workbookClient",
        "projectName",
        "clientProjectNo",
        "sbOrder",
        "reportingVendor",
        "vendorJobs",
        "location",
        "status",
        "nextAction",
        "openClosed",
        "lastInspectionDate"
      ];
      if (!sourceFields.some((field) => trimmed(record[field]))) return;
      record.aj = trimmed(record.aj);
      record.sourceRow = table.headerRow + index + 1;
      jobs.push(record);
    });
    return jobs;
  }

  function parseActiveJobsWorkbookBytes(bytes, fflateApi = root.fflate) {
    const table = parseWorkbookTable(bytes, fflateApi);
    return { ...table, jobs: workbookRowsToJobs(table) };
  }

  function identityKey(job) {
    const inspectionNo = keyText(job?.inspectionNo);
    const vendor = keyText(job?.reportingVendor);
    return inspectionNo && vendor ? `${inspectionNo}||${vendor}` : "";
  }

  function sameValue(left, right) {
    return text(left) === text(right);
  }

  function changesFor(existing, imported) {
    return JOB_FIELDS.filter((field) => !sameValue(existing?.[field], imported?.[field]));
  }

  function buildImportReview(currentJobs = [], importedJobs = []) {
    const existingByAj = new Map(currentJobs.map((job) => [trimmed(job.aj), job]));
    const existingByIdentity = new Map();
    currentJobs.forEach((job) => {
      const key = identityKey(job);
      if (!key) return;
      if (!existingByIdentity.has(key)) existingByIdentity.set(key, []);
      existingByIdentity.get(key).push(job);
    });
    const ajCounts = new Map();
    const prepared = importedJobs.map((sourceJob) => {
      const aj = trimmed(sourceJob.aj);
      const existing = existingByAj.get(aj) || null;
      const job = cloneJob(sourceJob);
      const warnings = Array.isArray(sourceJob._importWarnings) ? [...sourceJob._importWarnings] : [];
      delete job._importWarnings;
      if (existing) {
        [
          ["inspectionNo", "S&B Inspection Number", true],
          ["reportingVendor", "Reporting Vendor / Fabricator", true],
          ["openClosed", "Open / Closed value", false]
        ].forEach(([field, label, warnWhenUnavailable]) => {
          if (!trimmed(sourceJob[field]) && trimmed(existing[field])) {
            job[field] = existing[field];
            warnings.push(`Source blank — existing ${label} preserved.`);
          } else if (warnWhenUnavailable && !trimmed(sourceJob[field]) && !trimmed(existing[field])) {
            warnings.push(`Source blank — no stored ${label} is available for this existing AJ.`);
          }
        });
      }
      return { sourceJob, job, aj, existing, warnings };
    });
    const importedByIdentity = new Map();
    prepared.forEach((entry) => {
      const identity = identityKey(entry.job);
      const { aj } = entry;
      if (aj) ajCounts.set(aj, (ajCounts.get(aj) || 0) + 1);
      if (identity) {
        if (!importedByIdentity.has(identity)) importedByIdentity.set(identity, []);
        importedByIdentity.get(identity).push(entry);
      }
    });

    const items = prepared.map(({ sourceJob, job, aj, existing, warnings }) => {
      const identity = identityKey(job);
      const reasons = [];
      if (!aj) reasons.push("Missing AJ / Record ID");
      if (!existing && !trimmed(job.inspectionNo)) reasons.push("Missing S&B Inspection Number");
      if (!existing && !trimmed(job.reportingVendor)) reasons.push("Missing Reporting Vendor / Fabricator");
      if (aj && ajCounts.get(aj) > 1) reasons.push("Duplicate AJ number in imported workbook");
      if (existing) {
        if (trimmed(sourceJob.inspectionNo) && trimmed(existing.inspectionNo) && !sameValue(existing.inspectionNo, sourceJob.inspectionNo)) {
          reasons.push("Existing AJ identity changed (S&B Inspection Number)");
        }
        if (trimmed(sourceJob.reportingVendor) && trimmed(existing.reportingVendor) && !sameValue(existing.reportingVendor, sourceJob.reportingVendor)) {
          reasons.push("Existing AJ identity changed (Reporting Vendor / Fabricator)");
        }
      }

      const importedGroup = importedByIdentity.get(identity) || [];
      const existingGroup = existingByIdentity.get(identity) || [];
      const unchangedExistingIdentity = Boolean(existing && identity && identityKey(existing) === identity);
      const grandfatheredDuplicate = unchangedExistingIdentity
        && existingGroup.length > 1
        && importedGroup.every((entry) => entry.existing && identityKey(entry.existing) === identity && existingGroup.some((candidate) => trimmed(candidate.aj) === entry.aj));
      if (identity && importedGroup.length > 1) {
        if (grandfatheredDuplicate) warnings.push("Existing/grandfathered duplicate identity preserved; AJs remain separate.");
        else reasons.push("New duplicate S&B Inspection Number + Reporting Vendor in imported workbook");
      }
      const otherExisting = (existingByIdentity.get(identity) || []).filter((candidate) => trimmed(candidate.aj) !== aj);
      if (identity && otherExisting.length) {
        if (grandfatheredDuplicate) warnings.push("Known historical identity exception — no combine or renumber performed.");
        else reasons.push(`Identity already belongs to ${otherExisting.map((candidate) => candidate.aj).join(", ")}`);
      }

      const changedFields = existing ? changesFor(existing, job) : [];
      let classification = "NO CHANGE";
      if (reasons.length) classification = "CONFLICT";
      else if (!existing) classification = "NEW";
      else if (keyText(job.openClosed) === "closed" && keyText(existing.openClosed) !== "closed") classification = "CLOSED";
      else if (changedFields.length) classification = "UPDATED";
      return { aj, job, sourceJob, existing, classification, changedFields, reasons, warnings: [...new Set(warnings)] };
    });

    const counts = { NEW: 0, UPDATED: 0, CLOSED: 0, "NO CHANGE": 0, CONFLICT: 0 };
    items.forEach((item) => { counts[item.classification] += 1; });
    return { items, counts, warningCount: items.filter((item) => item.warnings.length).length, importedCount: importedJobs.length };
  }

  function cloneJob(job) {
    return JSON.parse(JSON.stringify(job || {}));
  }

  function repairBlankOpenClosedFromSeed(stateInput, seedJobs = root.MileageActiveJobsData?.activeJobs || []) {
    const state = stateInput && typeof stateInput === "object" ? stateInput : {};
    if (!Array.isArray(state.activeJobs) || !Array.isArray(seedJobs)) return { state, repairedAJs: [] };
    const seedByAj = new Map(seedJobs.map((job) => [trimmed(job?.aj), job]));
    const repairedAJs = [];
    let repairedISO = "";
    state.activeJobs.forEach((job) => {
      if (!job || trimmed(job.openClosed)) return;
      const seed = seedByAj.get(trimmed(job.aj));
      if (!seed || !trimmed(seed.openClosed)) return;
      const currentIdentity = identityKey(job);
      const seedIdentity = identityKey(seed);
      if (currentIdentity && seedIdentity && currentIdentity !== seedIdentity) return;
      repairedISO = repairedISO || nowISO();
      job.openClosed = seed.openClosed;
      job.modifiedISO = repairedISO;
      repairedAJs.push(trimmed(job.aj));
    });
    return { state, repairedAJs };
  }

  function calculatedMileageVisit(state, job) {
    const inspections = Array.isArray(state?.settings?.inspections) ? state.settings.inspections : [];
    const dates = inspections
      .filter((inspection) => trimmed(inspection.activeJobId) === trimmed(job.aj))
      .map((inspection) => inspection.tripSnapshot?.date || (inspection.tripId ? inspection.date : ""))
      .map(excelDate)
      .filter(Boolean)
      .sort();
    return dates.at(-1) || "";
  }

  function refreshCalculatedJobFields(state) {
    if (!Array.isArray(state.activeJobs)) return [];
    const repaired = [];
    state.activeJobs.forEach((job) => {
      if (!plausibleStatus(job.status)) {
        job.status = "";
        job.statusRepairNote = "An invalid numeric Current Status was removed. Review the Active Jobs Master row.";
        repaired.push(job.aj);
      }
      const visit = calculatedMileageVisit(state, job);
      if (visit && visit !== cleanWorkbookValue(job.lastMileageLoggerVisit)) job.lastMileageLoggerVisit = visit;
    });
    return repaired;
  }

  function migrateState(input, seedJobs = root.MileageActiveJobsData?.activeJobs || []) {
    const state = input && typeof input === "object" ? input : {};
    const hasCatalog = Array.isArray(state.activeJobs);
    if (!hasCatalog) {
      state.activeJobs = (Array.isArray(seedJobs) ? seedJobs : []).map((job) => ({ ...cloneJob(job), source: "embedded-seed" }));
      state.activeJobsInitializedISO = state.activeJobsInitializedISO || nowISO();
    }
    repairBlankOpenClosedFromSeed(state, seedJobs);
    state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
    state.activeJobImports = Array.isArray(state.activeJobImports) ? state.activeJobImports : [];
    state.activeJobUpdateProposals = Array.isArray(state.activeJobUpdateProposals) ? state.activeJobUpdateProposals : [];
    refreshCalculatedJobFields(state);
    return state;
  }

  function getActiveJobs(state) {
    return migrateState(state || {}, root.MileageActiveJobsData?.activeJobs || []).activeJobs;
  }

  function getFacilityProfiles(state) {
    return migrateState(state || {}, root.MileageActiveJobsData?.activeJobs || []).facilityProfiles;
  }

  function normalizeFacilityProfile(profile = {}) {
    return {
      id: trimmed(profile.id) || makeId("facility"),
      name: trimmed(profile.name),
      shopFacilityName: trimmed(profile.shopFacilityName),
      streetAddress: trimmed(profile.streetAddress),
      city: trimmed(profile.city),
      state: trimmed(profile.state),
      zip: trimmed(profile.zip),
      primaryContact: trimmed(profile.primaryContact),
      phone: trimmed(profile.phone),
      email: trimmed(profile.email),
      normalInspectionLocation: trimmed(profile.normalInspectionLocation),
      latitude: trimmed(profile.latitude),
      longitude: trimmed(profile.longitude),
      reportingVendor: trimmed(profile.reportingVendor),
      aliases: Array.isArray(profile.aliases) ? profile.aliases.map(trimmed).filter(Boolean) : text(profile.aliases).split(/\r?\n|,/).map(trimmed).filter(Boolean),
      normalWorkingHours: trimmed(profile.normalWorkingHours),
      facilityNotes: trimmed(profile.facilityNotes),
      inspectionDefaults: trimmed(profile.inspectionDefaults),
      reportDefaults: trimmed(profile.reportDefaults),
      createdISO: profile.createdISO || nowISO(),
      modifiedISO: nowISO()
    };
  }

  function facilityValues(profile) {
    return [profile?.name, profile?.shopFacilityName, profile?.normalInspectionLocation, profile?.reportingVendor, ...(profile?.aliases || [])]
      .map(keyText).filter(Boolean);
  }

  function facilityProfileForJob(state, job) {
    if (!job?.defaultFacilityProfileId) return null;
    return getFacilityProfiles(state).find((profile) => profile.id === job.defaultFacilityProfileId) || null;
  }

  function facilityProfilesForJob(state, job) {
    const profiles = getFacilityProfiles(state);
    const explicitIds = Array.isArray(job?.facilityProfileIds) ? job.facilityProfileIds.filter(Boolean) : [];
    if (job?.defaultFacilityProfileId && !explicitIds.includes(job.defaultFacilityProfileId)) explicitIds.push(job.defaultFacilityProfileId);
    if (explicitIds.length) return profiles.filter((profile) => explicitIds.includes(profile.id));
    // Backward-compatible convenience until the user explicitly chooses the
    // facilities for this AJ.
    return profiles.filter((profile) => !profile.reportingVendor || keyText(profile.reportingVendor) === keyText(job?.reportingVendor));
  }

  function jobMatchScore(state, job, trip, selectedLocation = "") {
    if (!job) return 0;
    let score = 0;
    const project = keyText(trip?.projectNumber);
    const activeJobId = trimmed(trip?.activeJobId);
    const locations = [selectedLocation, trip?.vendor].map(keyText).filter(Boolean);
    if (activeJobId && activeJobId === trimmed(job.aj)) score = Math.max(score, 120);
    if (project && [job.inspectionNo, job.sbOrder, job.clientProjectNo].map(keyText).includes(project)) score = Math.max(score, 100);
    if (locations.includes(keyText(job.reportingVendor)) || locations.includes(keyText(job.location))) score = Math.max(score, 70);
    const profiles = facilityProfilesForJob(state, job);
    if (profiles.some((profile) => facilityValues(profile).some((value) => locations.includes(value)))) score = Math.max(score, 90);
    const linked = (state?.settings?.inspections || []).some((inspection) => inspection.tripId === trip?.id && inspection.activeJobId === job.aj);
    if (linked) score = Math.max(score, 130);
    return score;
  }

  function matchingJobsForVisit(state, trip, selectedLocation = "") {
    return getActiveJobs(state)
      .filter((job) => keyText(job.openClosed) === "open")
      .map((job) => ({ job, score: jobMatchScore(state, job, trip, selectedLocation) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || text(left.job.aj).localeCompare(text(right.job.aj)))
      .map((candidate) => candidate.job);
  }

  function prefillVisitRecord(record = {}, job = null, profile = null) {
    const next = cloneJob(record);
    const setBlank = (field, value) => {
      if (!trimmed(next[field]) && trimmed(value)) next[field] = value;
    };
    setBlank("activeJobId", job?.aj);
    setBlank("facilityProfileId", profile?.id || job?.defaultFacilityProfileId);
    setBlank("projectNumber", job?.inspectionNo);
    setBlank("sbInspectionNo", job?.inspectionNo);
    setBlank("customer", job?.client || job?.workbookClient);
    setBlank("reportingVendor", job?.reportingVendor || profile?.reportingVendor);
    setBlank("vendor", profile?.normalInspectionLocation || profile?.shopFacilityName || job?.reportingVendor);
    setBlank("inspectionLocation", profile?.normalInspectionLocation || profile?.shopFacilityName || job?.reportingVendor);
    setBlank("projectName", job?.projectName);
    setBlank("purchaseOrderJob", job?.sbOrder);
    setBlank("vendorJobNumber", job?.vendorJobs);
    return next;
  }

  function assignPendingInspectionRecord(inspection, job, profile = null) {
    if (!inspection?.id || !job?.aj) throw new Error("An existing inspection and Active Job are required.");
    const assigned = prefillVisitRecord(inspection, job, profile);
    assigned.id = inspection.id;
    assigned.activeJobId = job.aj;
    assigned.modifiedISO = nowISO();
    return assigned;
  }

  function applyImportReview(stateInput, review, metadata = {}) {
    const state = migrateState(stateInput, root.MileageActiveJobsData?.activeJobs || []);
    const byAj = new Map(state.activeJobs.map((job) => [trimmed(job.aj), job]));
    for (const item of review.items || []) {
      if (item.classification === "NO CHANGE") continue;
      if (item.classification === "CONFLICT" && item.resolution !== "accept") continue;
      const existing = byAj.get(item.aj);
      const preserved = existing ? {
        defaultFacilityProfileId: existing.defaultFacilityProfileId || "",
        facilityProfileIds: Array.isArray(existing.facilityProfileIds) ? [...existing.facilityProfileIds] : [],
        createdISO: existing.createdISO || ""
      } : {};
      const next = {
        ...(existing || {}),
        ...cloneJob(item.job),
        ...preserved,
        aj: item.aj,
        source: "active-jobs-import",
        modifiedISO: metadata.importedISO || nowISO()
      };
      if (!next.createdISO) next.createdISO = metadata.importedISO || nowISO();
      if (existing) Object.assign(existing, next);
      else {
        state.activeJobs.push(next);
        byAj.set(item.aj, next);
      }
    }
    const audit = {
      id: makeId("active-jobs-import"),
      sourceFilename: metadata.sourceFilename || "",
      importedISO: metadata.importedISO || nowISO(),
      deviceId: metadata.deviceId || "",
      deviceLabel: metadata.deviceLabel || "",
      sourceHash: metadata.sourceHash || "",
      counts: { ...review.counts },
      warningCount: Number(review.warningCount || 0),
      conflictResolutions: (review.items || []).filter((item) => item.classification === "CONFLICT").map((item) => ({
        aj: item.aj || "",
        sourceRow: item.job?.sourceRow || null,
        resolution: item.resolution || "unresolved",
        reasons: [...(item.reasons || [])]
      }))
    };
    state.activeJobImports.unshift(audit);
    state.activeJobImports = state.activeJobImports.slice(0, 50);
    return { state, audit };
  }

  async function hashBytes(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (root.crypto?.subtle) {
      const digest = await root.crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    data.forEach((value) => { hash ^= value; hash = Math.imul(hash, 16777619); });
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function readState() {
    try {
      return migrateState(JSON.parse(root.localStorage?.getItem(STATE_KEY) || "{}"));
    } catch (_) {
      return migrateState({});
    }
  }

  function writeState(state, options = {}) {
    if (options.backupChange !== false) {
      state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
      state.backup.pendingChangeCount = Math.max(0, Number(state.backup.pendingChangeCount || 0)) + 1;
      state.backup.lastRequiredISO = nowISO();
    }
    root.localStorage?.setItem(STATE_KEY, JSON.stringify(state));
    root.dispatchEvent?.(new CustomEvent("mileage:state-changed", { detail: { source: "active-jobs-management" } }));
  }

  function persistMigrationsAndRepairs() {
    const raw = root.localStorage?.getItem(STATE_KEY);
    if (raw === null || raw === undefined) return false;
    try {
      const original = JSON.parse(raw || "{}");
      const before = JSON.stringify(original);
      const migrated = migrateState(original);
      if (before === JSON.stringify(migrated)) return false;
      writeState(migrated, { backupChange: false });
      return true;
    } catch (_) {
      return false;
    }
  }

  let pendingReview = null;
  let editingProfileId = "";

  function classificationClass(value) {
    return `active-jobs-${keyText(value).replace(/\s+/g, "-")}`;
  }

  function conflictCanBeAccepted(item) {
    if (!item?.aj || !trimmed(item.job?.inspectionNo) || !trimmed(item.job?.reportingVendor)) return false;
    return !(item.reasons || []).some((reason) => /duplicate|already belongs/i.test(reason));
  }

  function unresolvedConflictCount(review) {
    return (review?.items || []).filter((item) => item.classification === "CONFLICT" && !["keep", "accept"].includes(item.resolution)).length;
  }

  function reviewMarkup(review) {
    if (!review) return `<div class="active-jobs-empty">Choose Active Jobs Master.xlsx to prepare a review. Nothing changes until Apply Update is pressed.</div>`;
    const count = (name) => Number(review.counts?.[name] || 0);
    return `
      <div class="active-jobs-review-counts">
        ${["NEW", "UPDATED", "CLOSED", "NO CHANGE", "CONFLICT"].map((name) => `<span class="${classificationClass(name)}"><strong>${count(name)}</strong> ${name}</span>`).join("")}
        <span class="active-jobs-warning"><strong>${Number(review.warningCount || 0)}</strong> WARNINGS</span>
      </div>
      <div class="active-jobs-review-list">${review.items.map((item, index) => `
        <article class="active-jobs-review-item ${classificationClass(item.classification)}">
          <span>${escapeHTML(item.classification)}</span>
          <strong>${escapeHTML(item.aj || `Row ${item.job.sourceRow || "?"}`)} — ${escapeHTML(item.job.inspectionNo || "No inspection number")}</strong>
          <small>${escapeHTML(item.job.reportingVendor || "No reporting vendor")}${item.changedFields.length ? ` • Changed: ${escapeHTML(item.changedFields.join(", "))}` : ""}</small>
          ${item.reasons.length ? `<p>${escapeHTML(item.reasons.join("; "))}</p>` : ""}
          ${item.warnings?.length ? `<p class="active-jobs-warning-text">${escapeHTML(item.warnings.join(" "))}</p>` : ""}
          ${item.classification === "CONFLICT" ? `<label>Required resolution<select data-conflict-resolution="${index}"><option value=""${item.resolution ? "" : " selected"}>Choose…</option><option value="keep"${item.resolution === "keep" ? " selected" : ""}>Keep current data / skip row</option>${conflictCanBeAccepted(item) ? `<option value="accept"${item.resolution === "accept" ? " selected" : ""}>Accept workbook identity change</option>` : ""}</select></label><small>${conflictCanBeAccepted(item) ? "Accept is available because this is a complete, non-duplicate identity change." : "Correct duplicate or missing identity data in the workbook and review it again if this row should be imported."}</small>` : ""}
        </article>`).join("")}
      </div>`;
  }

  function profileOptions(state, selected = "") {
    return `<option value="">No default profile</option>${getFacilityProfiles(state).map((profile) => `<option value="${escapeHTML(profile.id)}"${profile.id === selected ? " selected" : ""}>${escapeHTML(profile.name || profile.shopFacilityName || profile.reportingVendor || profile.id)}</option>`).join("")}`;
  }

  function linkedProfileOptions(state, job) {
    const selected = new Set(Array.isArray(job.facilityProfileIds) ? job.facilityProfileIds : []);
    if (job.defaultFacilityProfileId) selected.add(job.defaultFacilityProfileId);
    return getFacilityProfiles(state).map((profile) => `<option value="${escapeHTML(profile.id)}"${selected.has(profile.id) ? " selected" : ""}>${escapeHTML(profile.name || profile.shopFacilityName || profile.reportingVendor || profile.id)}</option>`).join("");
  }

  function activeJobProposalMarkup(state) {
    const proposals = Array.isArray(state.activeJobUpdateProposals) ? state.activeJobUpdateProposals : [];
    if (!proposals.length) return `<div class="active-jobs-empty">No completed inspections are waiting for an Active Job review.</div>`;
    return proposals.map((proposal) => `
      <article class="active-jobs-review-item" data-active-job-proposal="${escapeHTML(proposal.id)}">
        <strong>${escapeHTML(proposal.activeJobId)} — review after inspection ${escapeHTML(proposal.inspectionId)}</strong>
        <div class="inspection-form-grid">
          <label>Current Status<input data-proposal-status value="${escapeHTML(proposal.currentStatus || "")}" placeholder="Leave blank when unknown"></label>
          <label>Next Action<input data-proposal-next-action value="${escapeHTML(proposal.nextAction || "")}" placeholder="Required follow-up or next step"></label>
          <label>Last Inspection Date<input data-proposal-last-inspection type="date" value="${escapeHTML(excelDate(proposal.lastInspectionDate))}"></label>
          <label>Last Mileage Logger Visit<input data-proposal-last-visit type="date" value="${escapeHTML(excelDate(proposal.lastMileageLoggerVisit))}"></label>
          <label>Next Expected Inspection<input data-proposal-next-expected type="date" value="${escapeHTML(excelDate(proposal.nextExpectedInspection))}"></label>
        </div>
        <div class="form-actions wrap"><button class="button button-primary button-small" type="button" data-apply-active-job-proposal>Apply Reviewed Update</button><button class="button button-quiet button-small" type="button" data-dismiss-active-job-proposal>Dismiss</button></div>
      </article>`).join("");
  }

  function renderManagement() {
    const host = root.document?.getElementById("activeJobsManagementCard");
    if (!host) return;
    const state = readState();
    const jobs = getActiveJobs(state);
    const profiles = getFacilityProfiles(state);
    const imports = state.activeJobImports || [];
    const unresolvedConflicts = unresolvedConflictCount(pendingReview);
    host.innerHTML = `
      <div class="status-heading">
        <div><p class="eyebrow">Upgrade #6</p><h2>Active Jobs Management</h2></div>
        <span class="pill ready">${jobs.filter((job) => keyText(job.openClosed) === "open").length} OPEN</span>
      </div>
      <p>Active Jobs imported here synchronize through the existing private Mileage Logger account. The embedded list is retained only as a first-run seed and emergency fallback.</p>
      <div class="form-actions wrap">
        <button id="updateActiveJobsBtn" class="button button-primary" type="button">Update Active Jobs</button>
        <input id="activeJobsWorkbookInput" class="hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      </div>
      <p id="activeJobsImportStatus" class="gps-status">Choose an .xlsx file containing a worksheet named Active Jobs.</p>
      <details class="active-jobs-management-details" open>
        <summary>Inspection → Active Job review (${state.activeJobUpdateProposals.length})</summary>
        <p>Completed inspections propose dates and follow-ups here. Nothing changes in the authoritative Active Job until you review and apply it.</p>
        <div class="active-jobs-review-list">${activeJobProposalMarkup(state)}</div>
      </details>
      <details class="active-jobs-management-details">
        <summary>Create a genuinely new Active Job</summary>
        <form id="newActiveJobForm" class="inspection-form-grid" autocomplete="off">
          <label>Record ID / AJ number<input id="newActiveJobAj" required pattern="AJ-[0-9]{3,}" placeholder="AJ-901"></label>
          <label>S&B inspection number<input id="newActiveJobInspectionNo" required></label>
          <label>Client<input id="newActiveJobClient"></label>
          <label>Project name<input id="newActiveJobProjectName"></label>
          <label>Reporting vendor<input id="newActiveJobVendor" required></label>
          <label>Vendor job number<input id="newActiveJobVendorJob"></label>
          <label>Current Status<input id="newActiveJobStatus" placeholder="Leave blank when unknown"></label>
          <label>Next Action<input id="newActiveJobNextAction"></label>
          <button class="button button-primary" type="submit">Create New Active Job</button>
        </form>
        <small>The AJ number must come from the authoritative master. Existing numbers are never reused, generated, or renumbered.</small>
      </details>
      <section class="active-jobs-import-review" aria-live="polite">
        <div class="section-heading compact"><div><p class="eyebrow">Review before apply</p><h3>Import Changes</h3></div></div>
        <div id="activeJobsImportReview">${reviewMarkup(pendingReview)}</div>
        <div class="form-actions wrap">
          <button id="applyActiveJobsUpdateBtn" class="button button-backup" type="button"${pendingReview && !unresolvedConflicts ? "" : " disabled"}>Apply Update</button>
          <button id="cancelActiveJobsUpdateBtn" class="button button-quiet" type="button"${pendingReview ? "" : " disabled"}>Cancel Review</button>
        </div>
        <small>Conflicts are never applied or skipped silently. Resolve every conflict explicitly before Apply Update. Missing rows do not close existing jobs.</small>
      </section>
      <details class="active-jobs-management-details" open>
        <summary>Facility Profiles (${profiles.length})</summary>
        <form id="facilityProfileForm" class="facility-profile-form" autocomplete="off">
          <input id="facilityProfileId" type="hidden" value="${escapeHTML(editingProfileId)}">
          <div class="inspection-form-grid">
            <label>Profile name<input id="facilityProfileName" required placeholder="Pipe & Steel — primary shop"></label>
            <label>Reporting vendor<input id="facilityReportingVendor" placeholder="Vendor used on reports"></label>
            <label>Shop / facility name<input id="facilityShopName" placeholder="Physical shop or yard"></label>
            <label>Normal inspection location<input id="facilityInspectionLocation" placeholder="Default visit location"></label>
            <label>Street address<input id="facilityStreetAddress"></label>
            <label>City<input id="facilityCity"></label>
            <label>State<input id="facilityState"></label>
            <label>ZIP code<input id="facilityZip" inputmode="numeric"></label>
            <label>Primary contact<input id="facilityContact"></label>
            <label>Phone<input id="facilityPhone" type="tel" inputmode="tel"></label>
            <label>Email<input id="facilityEmail" type="email"></label>
            <label>Normal working hours<input id="facilityHours"></label>
            <label>Latitude<input id="facilityLatitude" inputmode="decimal"></label>
            <label>Longitude<input id="facilityLongitude" inputmode="decimal"></label>
          </div>
          <label>Aliases (one per line)<textarea id="facilityAliases" rows="3"></textarea></label>
          <label>Facility notes<textarea id="facilityNotes" rows="3"></textarea></label>
          <label>Repeatable inspection defaults<textarea id="facilityInspectionDefaults" rows="2"></textarea></label>
          <label>Repeatable report defaults<textarea id="facilityReportDefaults" rows="2"></textarea></label>
          <div class="form-actions wrap"><button class="button button-primary" type="submit">Save Facility Profile</button><button id="clearFacilityProfileBtn" class="button button-quiet" type="button">Clear</button></div>
        </form>
        <div class="facility-profile-list">${profiles.length ? profiles.map((profile) => `
          <article><div><strong>${escapeHTML(profile.name || profile.shopFacilityName)}</strong><small>${escapeHTML(profile.reportingVendor || "No reporting vendor")} • ${escapeHTML(profile.normalInspectionLocation || profile.shopFacilityName || "No normal location")}</small></div><div class="form-actions wrap"><button class="button button-secondary button-small" type="button" data-edit-facility="${escapeHTML(profile.id)}">Edit</button><button class="button button-danger-outline button-small" type="button" data-delete-facility="${escapeHTML(profile.id)}">Remove</button></div></article>`).join("") : `<div class="active-jobs-empty">No Facility Profiles saved yet.</div>`}</div>
      </details>
      <details class="active-jobs-management-details">
        <summary>Active Job defaults (${jobs.length})</summary>
        <div class="active-job-default-list">${jobs.map((job) => `<article><div><strong>${escapeHTML(job.aj)} — ${escapeHTML(job.inspectionNo)}</strong><small>${escapeHTML(job.reportingVendor)} • ${escapeHTML(job.projectName)}</small></div><div class="active-job-profile-links"><label>Available Facility Profiles<select multiple size="${Math.min(4, Math.max(2, profiles.length || 2))}" data-job-facility-profiles="${escapeHTML(job.aj)}">${linkedProfileOptions(state, job)}</select><small>Select every facility this AJ may use.</small></label><label>Preferred / default<select data-job-default-profile="${escapeHTML(job.aj)}">${profileOptions(state, job.defaultFacilityProfileId || "")}</select></label></div></article>`).join("")}</div>
      </details>
      <details class="active-jobs-management-details">
        <summary>Recent import history (${imports.length})</summary>
        <div class="active-jobs-import-history">${imports.length ? imports.slice(0, 10).map((entry) => `<article><strong>${escapeHTML(entry.sourceFilename || "Active Jobs import")}</strong><small>${escapeHTML(new Date(entry.importedISO).toLocaleString())} • NEW ${entry.counts?.NEW || 0}, UPDATED ${entry.counts?.UPDATED || 0}, CLOSED ${entry.counts?.CLOSED || 0}, CONFLICT ${entry.counts?.CONFLICT || 0}, WARNINGS ${entry.warningCount || 0}</small></article>`).join("") : `<div class="active-jobs-empty">No applied imports yet.</div>`}</div>
      </details>`;
  }

  function ensureManagementCard() {
    if (!root.document || root.document.getElementById("activeJobsManagementCard")) return;
    const settings = root.document.getElementById("settingsSection");
    if (!settings) return;
    const card = root.document.createElement("section");
    card.id = "activeJobsManagementCard";
    card.className = "active-jobs-management-card settings-card";
    const heading = settings.querySelector(".section-heading");
    if (heading) heading.insertAdjacentElement("afterend", card);
    else settings.prepend(card);
    renderManagement();
  }

  function setInputValue(id, value, overwrite = false) {
    const input = root.document?.getElementById(id);
    if (!input || (!overwrite && trimmed(input.value))) return;
    input.value = text(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function prefillStartForm(job, profile) {
    if (!job && !profile) return;
    setInputValue("projectNumber", job?.inspectionNo || "");
    const client = root.MileageActiveJobsData?.normalizedJob ? root.MileageActiveJobsData.normalizedJob(job || {}).client : job?.workbookClient;
    setInputValue("customer", client || job?.workbookClient || "");
    setInputValue("vendor", profile?.normalInspectionLocation || profile?.shopFacilityName || job?.reportingVendor || "");
  }

  function renderStartProfileOptions() {
    const jobSelect = root.document?.getElementById("startActiveJobId");
    const profileSelect = root.document?.getElementById("startFacilityProfileId");
    if (!jobSelect || !profileSelect) return;
    const state = readState();
    const selectedJobId = jobSelect.value;
    const openJobs = getActiveJobs(state).filter((candidate) => keyText(candidate.openClosed) === "open");
    jobSelect.innerHTML = `<option value="">Pending / unassigned</option>${openJobs.map((candidate) => `<option value="${escapeHTML(candidate.aj)}"${candidate.aj === selectedJobId ? " selected" : ""}>${escapeHTML(candidate.aj)} — ${escapeHTML(candidate.inspectionNo)} — ${escapeHTML(candidate.reportingVendor)}</option>`).join("")}`;
    const job = getActiveJobs(state).find((candidate) => candidate.aj === jobSelect.value);
    const profiles = job ? facilityProfilesForJob(state, job) : getFacilityProfiles(state);
    const selected = profileSelect.value || job?.defaultFacilityProfileId || "";
    profileSelect.innerHTML = `<option value="">No Facility Profile</option>${profiles.map((profile) => `<option value="${escapeHTML(profile.id)}"${profile.id === selected ? " selected" : ""}>${escapeHTML(profile.name || profile.shopFacilityName || profile.id)}</option>`).join("")}`;
    const profile = profiles.find((candidate) => candidate.id === profileSelect.value) || null;
    prefillStartForm(job, profile);
  }

  function ensureStartSelectors() {
    if (!root.document || root.document.getElementById("startActiveJobId")) return;
    const project = root.document.getElementById("projectNumber")?.closest("label");
    if (!project) return;
    const state = readState();
    const wrapper = root.document.createElement("div");
    wrapper.className = "inspection-form-grid active-job-trip-prefill";
    wrapper.innerHTML = `<label>Active Job (optional)<select id="startActiveJobId"><option value="">Pending / unassigned</option>${getActiveJobs(state).filter((job) => keyText(job.openClosed) === "open").map((job) => `<option value="${escapeHTML(job.aj)}">${escapeHTML(job.aj)} — ${escapeHTML(job.inspectionNo)} — ${escapeHTML(job.reportingVendor)}</option>`).join("")}</select></label><label>Facility Profile<select id="startFacilityProfileId"><option value="">No Facility Profile</option></select></label>`;
    project.insertAdjacentElement("beforebegin", wrapper);
    wrapper.addEventListener("change", (event) => {
      if (event.target.id === "startActiveJobId") renderStartProfileOptions();
      if (event.target.id === "startFacilityProfileId") {
        const nextState = readState();
        const job = getActiveJobs(nextState).find((candidate) => candidate.aj === root.document.getElementById("startActiveJobId")?.value);
        const profile = getFacilityProfiles(nextState).find((candidate) => candidate.id === event.target.value);
        prefillStartForm(job, profile);
      }
    });
    renderStartProfileOptions();
  }

  function fillProfileForm(profile) {
    editingProfileId = profile?.id || "";
    const values = {
      facilityProfileId: profile?.id, facilityProfileName: profile?.name, facilityReportingVendor: profile?.reportingVendor,
      facilityShopName: profile?.shopFacilityName, facilityInspectionLocation: profile?.normalInspectionLocation,
      facilityStreetAddress: profile?.streetAddress, facilityCity: profile?.city, facilityState: profile?.state,
      facilityZip: profile?.zip, facilityContact: profile?.primaryContact, facilityPhone: profile?.phone,
      facilityEmail: profile?.email, facilityHours: profile?.normalWorkingHours, facilityLatitude: profile?.latitude,
      facilityLongitude: profile?.longitude, facilityAliases: (profile?.aliases || []).join("\n"),
      facilityNotes: profile?.facilityNotes, facilityInspectionDefaults: profile?.inspectionDefaults,
      facilityReportDefaults: profile?.reportDefaults
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = root.document?.getElementById(id);
      if (input) input.value = text(value);
    });
  }

  function collectProfileForm() {
    const value = (id) => root.document?.getElementById(id)?.value || "";
    return normalizeFacilityProfile({
      id: value("facilityProfileId"), name: value("facilityProfileName"), reportingVendor: value("facilityReportingVendor"),
      shopFacilityName: value("facilityShopName"), normalInspectionLocation: value("facilityInspectionLocation"),
      streetAddress: value("facilityStreetAddress"), city: value("facilityCity"), state: value("facilityState"), zip: value("facilityZip"),
      primaryContact: value("facilityContact"), phone: value("facilityPhone"), email: value("facilityEmail"),
      normalWorkingHours: value("facilityHours"), latitude: value("facilityLatitude"), longitude: value("facilityLongitude"),
      aliases: value("facilityAliases"), facilityNotes: value("facilityNotes"), inspectionDefaults: value("facilityInspectionDefaults"),
      reportDefaults: value("facilityReportDefaults")
    });
  }

  async function prepareWorkbookReview(file) {
    const status = root.document?.getElementById("activeJobsImportStatus");
    if (status) status.textContent = `Reading ${file.name}…`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseActiveJobsWorkbookBytes(bytes, root.fflate);
    const state = readState();
    const review = buildImportReview(getActiveJobs(state), parsed.jobs);
    pendingReview = {
      ...review,
      sourceFilename: file.name,
      sourceHash: await hashBytes(bytes),
      worksheetName: parsed.sheetName,
      headerRow: parsed.headerRow
    };
    renderManagement();
    const nextStatus = root.document?.getElementById("activeJobsImportStatus");
    if (nextStatus) {
      nextStatus.textContent = `${parsed.jobs.length} Active Jobs rows read from ${parsed.sheetName}. ${review.warningCount || 0} non-blocking warning row${review.warningCount === 1 ? "" : "s"}. Review all changes before Apply Update.`;
      nextStatus.className = review.counts.CONFLICT || review.warningCount ? "gps-status warn" : "gps-status good";
    }
  }

  function bindUI() {
    if (!root.document) return;
    root.document.addEventListener("click", async (event) => {
      if (event.target.closest("#updateActiveJobsBtn")) root.document.getElementById("activeJobsWorkbookInput")?.click();
      if (event.target.closest("#cancelActiveJobsUpdateBtn")) { pendingReview = null; renderManagement(); }
      if (event.target.closest("#applyActiveJobsUpdateBtn") && pendingReview) {
        if (unresolvedConflictCount(pendingReview)) {
          root.alert("Resolve every conflict before applying this update.");
          return;
        }
        if (!root.confirm("Apply all NEW, UPDATED, and CLOSED Active Jobs shown in this review, using your explicit conflict resolutions?")) return;
        const state = readState();
        const sync = root.MileageMultiDeviceSync;
        const config = sync?.getConfig?.() || {};
        const result = applyImportReview(state, pendingReview, {
          sourceFilename: pendingReview.sourceFilename,
          sourceHash: pendingReview.sourceHash,
          deviceId: sync?.getDeviceId?.() || "",
          deviceLabel: config.deviceLabel || "",
          importedISO: nowISO()
        });
        writeState(result.state);
        pendingReview = null;
        renderManagement();
        renderStartProfileOptions();
        root.alert("Active Jobs update applied with your conflict resolutions. Other signed-in devices will receive the update through ordinary sync.");
      }
      const edit = event.target.closest("[data-edit-facility]");
      if (edit) fillProfileForm(getFacilityProfiles(readState()).find((profile) => profile.id === edit.dataset.editFacility));
      const remove = event.target.closest("[data-delete-facility]");
      if (remove) {
        const state = readState();
        const profile = getFacilityProfiles(state).find((candidate) => candidate.id === remove.dataset.deleteFacility);
        if (!profile || !root.confirm(`Remove Facility Profile “${profile.name || profile.shopFacilityName}”? Existing visits and inspections will not be changed.`)) return;
        state.facilityProfiles = state.facilityProfiles.filter((candidate) => candidate.id !== profile.id);
        state.activeJobs.forEach((job) => {
          if (job.defaultFacilityProfileId === profile.id) job.defaultFacilityProfileId = "";
          if (Array.isArray(job.facilityProfileIds)) job.facilityProfileIds = job.facilityProfileIds.filter((id) => id !== profile.id);
        });
        writeState(state);
        editingProfileId = "";
        renderManagement();
      }
      if (event.target.closest("#clearFacilityProfileBtn")) fillProfileForm(null);
      const proposalCard = event.target.closest("[data-active-job-proposal]");
      if (proposalCard && event.target.closest("[data-apply-active-job-proposal], [data-dismiss-active-job-proposal]")) {
        const state = readState();
        const proposal = state.activeJobUpdateProposals.find((item) => item.id === proposalCard.dataset.activeJobProposal);
        if (!proposal) return;
        if (event.target.closest("[data-apply-active-job-proposal]")) {
          const job = state.activeJobs.find((item) => item.aj === proposal.activeJobId);
          if (!job) { root.alert("The Active Job is no longer available."); return; }
          const status = proposalCard.querySelector("[data-proposal-status]")?.value.trim() || "";
          if (!plausibleStatus(status)) { root.alert("Current Status must contain meaningful text or remain blank."); return; }
          job.status = status;
          job.nextAction = proposalCard.querySelector("[data-proposal-next-action]")?.value.trim() || "";
          job.lastInspectionDate = proposalCard.querySelector("[data-proposal-last-inspection]")?.value || job.lastInspectionDate || "";
          job.lastMileageLoggerVisit = proposalCard.querySelector("[data-proposal-last-visit]")?.value || job.lastMileageLoggerVisit || "";
          job.nextExpectedInspection = proposalCard.querySelector("[data-proposal-next-expected]")?.value || "";
          job.modifiedISO = nowISO();
        }
        state.activeJobUpdateProposals = state.activeJobUpdateProposals.filter((item) => item.id !== proposal.id);
        writeState(state);
        renderManagement();
        return;
      }
    });

    root.document.addEventListener("change", async (event) => {
      if (event.target.id === "activeJobsWorkbookInput") {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try { await prepareWorkbookReview(file); }
        catch (error) {
          console.error("Active Jobs workbook import failed:", error);
          const status = root.document.getElementById("activeJobsImportStatus");
          if (status) { status.textContent = error.message; status.className = "gps-status warn"; }
          root.alert(`Active Jobs could not be reviewed.\n\n${error.message}`);
        }
      }
      const conflictResolution = event.target.closest("[data-conflict-resolution]");
      if (conflictResolution && pendingReview) {
        const item = pendingReview.items[Number(conflictResolution.dataset.conflictResolution)];
        if (item?.classification === "CONFLICT") item.resolution = conflictResolution.value;
        renderManagement();
        return;
      }
      const defaultSelect = event.target.closest("[data-job-default-profile]");
      if (defaultSelect) {
        const state = readState();
        const job = getActiveJobs(state).find((candidate) => candidate.aj === defaultSelect.dataset.jobDefaultProfile);
        if (job) {
          job.defaultFacilityProfileId = defaultSelect.value;
          job.facilityProfileIds = Array.isArray(job.facilityProfileIds) ? job.facilityProfileIds : [];
          if (defaultSelect.value && !job.facilityProfileIds.includes(defaultSelect.value)) job.facilityProfileIds.push(defaultSelect.value);
          job.modifiedISO = nowISO();
          writeState(state);
          renderManagement();
          renderStartProfileOptions();
        }
        return;
      }
      const linkedProfiles = event.target.closest("[data-job-facility-profiles]");
      if (linkedProfiles) {
        const state = readState();
        const job = getActiveJobs(state).find((candidate) => candidate.aj === linkedProfiles.dataset.jobFacilityProfiles);
        if (job) {
          job.facilityProfileIds = [...linkedProfiles.selectedOptions].map((option) => option.value).filter(Boolean);
          if (job.defaultFacilityProfileId && !job.facilityProfileIds.includes(job.defaultFacilityProfileId)) job.defaultFacilityProfileId = "";
          job.modifiedISO = nowISO();
          writeState(state);
          renderManagement();
          renderStartProfileOptions();
        }
      }
    });

    root.document.addEventListener("submit", (event) => {
      if (event.target.id === "newActiveJobForm") {
        event.preventDefault();
        const value = (id) => root.document.getElementById(id)?.value.trim() || "";
        const aj = value("newActiveJobAj").toUpperCase();
        const state = readState();
        if (!/^AJ-\d{3,}$/.test(aj)) { root.alert("Enter the authoritative AJ number in AJ-### format."); return; }
        if (state.activeJobs.some((job) => keyText(job.aj) === keyText(aj))) { root.alert(`${aj} already exists and cannot be reused.`); return; }
        if (!value("newActiveJobInspectionNo") || !value("newActiveJobVendor")) { root.alert("S&B inspection number and reporting vendor are required."); return; }
        const status = value("newActiveJobStatus");
        if (!plausibleStatus(status)) { root.alert("Current Status must contain meaningful text or remain blank."); return; }
        state.activeJobs.push({
          aj,
          inspectionNo: value("newActiveJobInspectionNo"),
          workbookClient: value("newActiveJobClient"),
          projectName: value("newActiveJobProjectName"),
          reportingVendor: value("newActiveJobVendor"),
          vendorJobs: value("newActiveJobVendorJob"),
          status,
          nextAction: value("newActiveJobNextAction"),
          openClosed: "Open",
          source: "manual-authoritative-entry",
          createdISO: nowISO(),
          modifiedISO: nowISO()
        });
        writeState(state);
        renderManagement();
        renderStartProfileOptions();
        return;
      }
      if (event.target.id !== "facilityProfileForm") return;
      event.preventDefault();
      const profile = collectProfileForm();
      if (!profile.name) { root.alert("Facility Profile name is required."); return; }
      const state = readState();
      const index = state.facilityProfiles.findIndex((candidate) => candidate.id === profile.id);
      if (index >= 0) profile.createdISO = state.facilityProfiles[index].createdISO || profile.createdISO;
      if (index >= 0) state.facilityProfiles[index] = profile;
      else state.facilityProfiles.push(profile);
      writeState(state);
      editingProfileId = "";
      renderManagement();
    });

    root.addEventListener?.("mileage:state-changed", (event) => {
      if (event.detail?.source === "active-jobs-management") return;
      const refresh = () => {
        persistMigrationsAndRepairs();
        renderManagement();
        renderStartProfileOptions();
      };
      if (event.detail?.source === "cloud-sync" && root.setTimeout) root.setTimeout(refresh, 50);
      else refresh();
    });
  }

  function initialize() {
    if (!root.document || !root.localStorage) return;
    // An authenticated empty device must remain truly empty until the sync
    // engine performs its pull-only cloud bootstrap. Persist migrations only
    // when this device already has Mileage Logger state.
    persistMigrationsAndRepairs();
    ensureManagementCard();
    ensureStartSelectors();
    bindUI();
  }

  const api = {
    STATE_KEY,
    WORKSHEET_NAME,
    parseWorkbookTable,
    workbookRowsToJobs,
    parseActiveJobsWorkbookBytes,
    buildImportReview,
    applyImportReview,
    repairBlankOpenClosedFromSeed,
    migrateState,
    getActiveJobs,
    getFacilityProfiles,
    normalizeFacilityProfile,
    facilityProfileForJob,
    facilityProfilesForJob,
    jobMatchScore,
    matchingJobsForVisit,
    prefillVisitRecord,
    assignPendingInspectionRecord,
    plausibleStatus,
    calculatedMileageVisit,
    refreshCalculatedJobFields,
    hashBytes,
    readState,
    writeState
  };

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
  }
  return api;
});