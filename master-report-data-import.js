(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const ACTIVE_SHEET = "Active Jobs";
  const FACILITY_SHEET = "Facility Profiles";
  let pending = null;
  let applyRequested = false;
  let baselineImportIds = new Set();
  let pollTimer = null;
  let enriching = false;

  const text = (value) => value === null || value === undefined ? "" : String(value);
  const clean = (value) => text(value).trim();
  const key = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
      state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
      state.activeJobImports = Array.isArray(state.activeJobImports) ? state.activeJobImports : [];
      return state;
    } catch (_) {
      return { activeJobs: [], facilityProfiles: [], activeJobImports: [] };
    }
  }

  function writeState(state) {
    if (window.MileageActiveJobsManagement?.writeState) {
      window.MileageActiveJobsManagement.writeState(state);
      return;
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "master-report-data-import" } }));
  }

  function decodeXml(value) {
    return text(value)
      .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
      .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }

  function attr(attributes, name) {
    const match = text(attributes).match(new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}=(?:"([^"]*)"|'([^']*)')`, "i"));
    return decodeXml(match?.[1] ?? match?.[2] ?? "");
  }

  function colIndex(reference) {
    const letters = (text(reference).match(/^[A-Z]+/i)?.[0] || "").toUpperCase();
    let result = 0;
    for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
    return Math.max(0, result - 1);
  }

  function targetPath(target) {
    const cleanTarget = text(target).replace(/\\/g, "/").replace(/^\//, "");
    if (cleanTarget.startsWith("xl/")) return cleanTarget;
    const parts = [];
    `xl/${cleanTarget}`.split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return parts.join("/");
  }

  function sharedStrings(xml) {
    return [...text(xml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => (
      [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) => decodeXml(item[1])).join("")
    ));
  }

  function cellValue(attributes, body, shared) {
    const type = attr(attributes, "t");
    if (type === "inlineStr") return [...text(body).matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) => decodeXml(item[1])).join("");
    const raw = decodeXml(text(body).match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || "");
    if (type === "s") return shared[Number(raw)] ?? "";
    if (type === "str" || type === "e") return raw;
    if (type === "b") return raw === "1";
    if (raw === "") return "";
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  }

  function sheetRows(xml, shared) {
    return [...text(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)].map((rowMatch) => {
      const row = [];
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
        const reference = attr(cell[1], "r");
        if (!reference) continue;
        row[colIndex(reference)] = cellValue(cell[1], cell[2] || "", shared);
      }
      return row;
    });
  }

  function workbookSheets(bytes) {
    if (!window.fflate?.unzipSync || !window.fflate?.strFromU8) throw new Error("The XLSX reader is unavailable.");
    const entries = window.fflate.unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const xml = (path) => entries[path] ? window.fflate.strFromU8(entries[path]) : "";
    const workbookXml = xml("xl/workbook.xml");
    const relsXml = xml("xl/_rels/workbook.xml.rels");
    const relTargets = new Map();
    for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gi)) {
      relTargets.set(attr(match[1], "Id"), attr(match[1], "Target"));
    }
    const shared = sharedStrings(xml("xl/sharedStrings.xml"));
    const output = {};
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/gi)) {
      const name = attr(match[1], "name");
      const relationshipId = attr(match[1], "r:id");
      const target = relTargets.get(relationshipId);
      if (!name || !target) continue;
      const sheetXml = xml(targetPath(target));
      if (sheetXml) output[name] = sheetRows(sheetXml, shared);
    }
    return output;
  }

  function tableFromRows(rows, requiredHeaders = []) {
    if (!Array.isArray(rows)) return null;
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map(key);
      return requiredHeaders.every((header) => headers.includes(key(header)));
    });
    if (headerIndex < 0) return null;
    return { headers: rows[headerIndex].map((value) => clean(value)), rows: rows.slice(headerIndex + 1) };
  }

  function columnMap(headers) {
    const map = new Map();
    headers.forEach((header, index) => map.set(key(header), index));
    return map;
  }

  function valueAt(row, columns, names) {
    for (const name of names) {
      if (columns.has(key(name))) return clean(row[columns.get(key(name))]);
    }
    return undefined;
  }

  function hasColumn(columns, names) {
    return names.some((name) => columns.has(key(name)));
  }

  function parseActiveJobExtras(rows) {
    const table = tableFromRows(rows, ["Record ID", "Inspection Job #"]);
    if (!table) return [];
    const columns = columnMap(table.headers);
    const fields = [
      ["clientPoToSbInspection", ["Client PO to S&B Inspection"]],
      ["clientPoToVendor", ["Client PO to Vendor"]],
      ["primaryContact", ["Primary Contact", "Primary Contact Name"]],
      ["primaryContactEmail", ["Primary Contact Email", "Contact Email"]],
      ["primaryTag", ["Primary Tag"]],
      ["additionalTags", ["Additional Tag(s)", "Additional Tags"]]
    ];
    return table.rows.map((row) => {
      const aj = valueAt(row, columns, ["Record ID", "AJ Number"]);
      if (!aj) return null;
      const record = { aj, presentFields: [] };
      fields.forEach(([field, names]) => {
        if (!hasColumn(columns, names)) return;
        record.presentFields.push(field);
        record[field] = valueAt(row, columns, names) ?? "";
      });
      return record;
    }).filter(Boolean);
  }

  function slug(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  }

  function parseFacilityProfiles(rows) {
    const table = tableFromRows(rows, ["Facility Name"]);
    if (!table) return [];
    const columns = columnMap(table.headers);
    const fields = {
      id: ["Record ID", "Facility ID"],
      name: ["Facility Name"],
      reportingVendor: ["Reporting Vendor"],
      reportName: ["Report Name", "Footer Vendor Name"],
      shopFacilityName: ["Shop / Facility Name", "Shop Facility Name"],
      normalInspectionLocation: ["Normal Inspection Location", "Inspection Location"],
      streetAddress: ["Street Address", "Address"],
      city: ["City"], state: ["State"], zip: ["ZIP", "Zip Code"],
      phone: ["Phone", "Phone Number"], primaryContact: ["Primary Contact", "Default Contact"],
      email: ["Email", "Default Email"], aliases: ["Aliases"],
      normalWorkingHours: ["Normal Working Hours", "Working Hours"],
      inspectionDefaults: ["Inspection Defaults"], reportDefaults: ["Report Defaults"],
      facilityNotes: ["Notes", "Facility Notes"]
    };
    return table.rows.map((row) => {
      const name = valueAt(row, columns, fields.name);
      if (!name) return null;
      const profile = {};
      Object.entries(fields).forEach(([field, names]) => {
        if (hasColumn(columns, names)) profile[field] = valueAt(row, columns, names) ?? "";
      });
      profile.id = profile.id || `facility-${slug(name)}`;
      profile.name = name;
      profile.aliases = String(profile.aliases || "").split(/\r?\n|[,;|]+/).map((item) => item.trim()).filter(Boolean);
      return profile;
    }).filter(Boolean);
  }

  async function parseFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sheets = workbookSheets(bytes);
    return {
      sourceFilename: file.name,
      jobExtras: parseActiveJobExtras(sheets[ACTIVE_SHEET]),
      facilityProfiles: parseFacilityProfiles(sheets[FACILITY_SHEET])
    };
  }

  function latestImportIsNew(state) {
    return (state.activeJobImports || []).some((entry) => entry?.id && !baselineImportIds.has(entry.id));
  }

  function updateStatus(message) {
    const status = document.getElementById("activeJobsImportStatus");
    if (status) status.textContent = message;
  }

  function applyEnrichment() {
    if (!pending || enriching) return false;
    const state = readState();
    const now = new Date().toISOString();
    let jobsUpdated = 0;
    let profilesUpdated = 0;

    pending.jobExtras.forEach((source) => {
      const job = state.activeJobs.find((item) => item?.aj === source.aj);
      if (!job) return;
      source.presentFields.forEach((field) => { job[field] = source[field] ?? ""; });
      job.modifiedISO = now;
      jobsUpdated += 1;
    });

    pending.facilityProfiles.forEach((source) => {
      let profile = state.facilityProfiles.find((item) => item?.id === source.id)
        || state.facilityProfiles.find((item) => key(item?.name) === key(source.name));
      if (!profile) {
        profile = { id: source.id, createdISO: now };
        state.facilityProfiles.push(profile);
      }
      Object.entries(source).forEach(([field, value]) => {
        if (field !== "id") profile[field] = value;
      });
      profile.modifiedISO = now;
      profilesUpdated += 1;
    });

    enriching = true;
    try { writeState(state); }
    finally { enriching = false; }

    const parts = [];
    if (jobsUpdated) parts.push(`${jobsUpdated} Active Job report-data row${jobsUpdated === 1 ? "" : "s"}`);
    if (profilesUpdated) parts.push(`${profilesUpdated} Facility Profile${profilesUpdated === 1 ? "" : "s"}`);
    updateStatus(`${pending.sourceFilename}: imported ${parts.length ? parts.join(" and ") : "no additional report data"}.`);

    const toast = document.getElementById("toast");
    if (toast) {
      toast.textContent = "Active Jobs report fields and Facility Profiles updated.";
      toast.classList.remove("hidden");
      setTimeout(() => toast.classList.add("hidden"), 3500);
    }

    pending = null;
    applyRequested = false;
    baselineImportIds = new Set();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    return true;
  }

  function startApplyPoll() {
    if (pollTimer) clearInterval(pollTimer);
    let attempts = 0;
    pollTimer = setInterval(() => {
      attempts += 1;
      if (!applyRequested) {
        clearInterval(pollTimer); pollTimer = null; return;
      }
      if (pending && latestImportIsNew(readState())) {
        clearInterval(pollTimer); pollTimer = null;
        setTimeout(applyEnrichment, 0);
        return;
      }
      if (attempts >= 60) {
        clearInterval(pollTimer); pollTimer = null;
        if (pending) applyEnrichment();
      }
    }, 100);
  }

  document.addEventListener("change", (event) => {
    if (event.target?.id !== "activeJobsWorkbookInput") return;
    const file = event.target.files?.[0];
    if (!file) return;
    const state = readState();
    baselineImportIds = new Set((state.activeJobImports || []).map((entry) => entry?.id).filter(Boolean));
    pending = null;
    applyRequested = false;
    parseFile(file).then((result) => {
      pending = result;
      if (applyRequested) startApplyPoll();
    }).catch((error) => {
      console.warn("Could not read report fields / Facility Profiles from the Active Jobs Master:", error);
      pending = null;
      updateStatus(`Report-data import warning: ${error.message}`);
    });
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#applyActiveJobsUpdateBtn")) {
      applyRequested = true;
      startApplyPoll();
    }
    if (event.target.closest?.("#cancelActiveJobsUpdateBtn")) {
      pending = null;
      applyRequested = false;
      baselineImportIds = new Set();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }
  }, true);

  window.addEventListener("mileage:state-changed", () => {
    if (applyRequested && pending && latestImportIsNew(readState())) setTimeout(applyEnrichment, 0);
  });

  window.MileageMasterReportDataImport = Object.freeze({ parseFile, applyEnrichment });
})();