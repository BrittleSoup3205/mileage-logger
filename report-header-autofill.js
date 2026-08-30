(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const REPORT_NUMBER_MAP_KEY = "mileage_logger_report_numbers_v1";
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const base = window.MileageInspectionReportTesting;
  if (!base || !window.fflate) return;

  let currentInspectionId = "";
  let restoringReportNumbers = false;

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null || value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function readState() {
    const state = readJSON(STATE_KEY, {});
    state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
    state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
    state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
    state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
    return state;
  }

  function writeStateSilently(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function reportNumberMap() {
    const map = readJSON(REPORT_NUMBER_MAP_KEY, {});
    return map && typeof map === "object" ? map : {};
  }

  function saveReportNumber(inspectionId, value) {
    if (!inspectionId) return false;
    const number = String(value || "").trim();
    const map = reportNumberMap();
    if (number) map[inspectionId] = number;
    else delete map[inspectionId];
    localStorage.setItem(REPORT_NUMBER_MAP_KEY, JSON.stringify(map));

    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
    if (!inspection) return false;
    if (String(inspection.reportNumber || "") === number) return true;
    inspection.reportNumber = number;
    inspection.modifiedISO = new Date().toISOString();
    writeStateSilently(state);
    window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "report-number" } }));
    return true;
  }

  function restoreReportNumbersIntoState() {
    if (restoringReportNumbers) return;
    const map = reportNumberMap();
    if (!Object.keys(map).length) return;
    const state = readState();
    let changed = false;
    state.settings.inspections.forEach((inspection) => {
      if (!inspection?.id || map[inspection.id] === undefined) return;
      const desired = String(map[inspection.id] || "").trim();
      if (String(inspection.reportNumber || "") !== desired) {
        inspection.reportNumber = desired;
        changed = true;
      }
    });
    if (!changed) return;
    restoringReportNumbers = true;
    try { writeStateSilently(state); }
    finally { restoringReportNumbers = false; }
  }

  window.addEventListener("mileage:state-changed", restoreReportNumbersIntoState);

  function norm(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function sameName(left, right) {
    const a = norm(left);
    const b = norm(right);
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  }

  function namesForProfile(profile) {
    return [
      profile?.name,
      profile?.shopFacilityName,
      profile?.normalInspectionLocation,
      profile?.reportingVendor,
      ...(Array.isArray(profile?.aliases) ? profile.aliases : [])
    ].filter(Boolean);
  }

  function activeJobFor(state, inspection) {
    return state.activeJobs.find((job) => job?.aj === inspection?.activeJobId)
      || (window.MileageActiveJobsData?.activeJobs || []).find((job) => job?.aj === inspection?.activeJobId)
      || null;
  }

  function profileById(state, id) {
    return state.facilityProfiles.find((profile) => profile?.id === id) || null;
  }

  function profileForName(state, name) {
    if (!name) return null;
    return state.facilityProfiles.find((profile) => namesForProfile(profile).some((candidate) => sameName(candidate, name))) || null;
  }

  function reportingVendorProfile(state, inspection, job) {
    const reportingVendor = inspection?.reportingVendor || job?.reportingVendor || "";
    const explicit = job?.defaultFacilityProfileId ? profileById(state, job.defaultFacilityProfileId) : null;
    if (explicit && namesForProfile(explicit).some((candidate) => sameName(candidate, reportingVendor))) return explicit;
    return profileForName(state, reportingVendor) || explicit || null;
  }

  function subvendorProfile(state, inspection, job, vendorProfile) {
    const location = inspection?.inspectionLocation || inspection?.vendor || "";
    const reportingVendor = inspection?.reportingVendor || job?.reportingVendor || "";
    if (!location || sameName(location, reportingVendor)) return null;
    const selected = inspection?.facilityProfileId ? profileById(state, inspection.facilityProfileId) : null;
    if (selected && selected.id !== vendorProfile?.id) return selected;
    return profileForName(state, location);
  }

  function displayDate(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[2]}/${match[3]}/${match[1]}`;
    return text;
  }

  function reportDate(inspection) {
    const explicit = String(inspection?.reportDate || "").trim();
    if (explicit) return displayDate(explicit);
    const date = new Date();
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function footerDate(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return text;
    return `${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}-${match[3].slice(-2)}`;
  }

  function cityStateZip(profile) {
    if (!profile) return "";
    const city = String(profile.city || "").trim();
    const state = String(profile.state || "").trim();
    const zip = String(profile.zip || "").trim();
    return [city ? `${city}${state ? "," : ""}` : "", state, zip].filter(Boolean).join(" ");
  }

  function uniqueParts(values) {
    const output = [];
    values.flatMap((value) => String(value || "").split(/[|,;]+/)).forEach((part) => {
      const text = part.trim();
      if (text && !output.some((item) => item.toLowerCase() === text.toLowerCase())) output.push(text);
    });
    return output;
  }

  function tagsFor(inspection, job) {
    return uniqueParts([
      job?.primaryTag,
      job?.additionalTags,
      job?.additionalTag,
      inspection?.primaryTag,
      inspection?.additionalTags,
      inspection?.equipmentTag
    ]).join(", ");
  }

  function shortDescription(inspection) {
    const explicit = String(inspection?.reportTableDescription || "").trim();
    if (explicit) return explicit;
    const text = [inspection?.inspectionType, inspection?.activity, ...(inspection?.activities || [])].join(" ");
    if (/structural steel|structural/i.test(text)) return "Fabricated Structural Steel";
    if (/pipe spool|spool|piping/i.test(text) || inspection?.pieceSpoolNumber) return "Fabricated Pipe Spools";
    if (/vessel|reactor/i.test(text)) return "Pressure Vessel Fabrication";
    if (/exchanger|bundle|tube sheet|tubesheet/i.test(text)) return "Heat Exchanger Fabrication";
    return String(inspection?.activity || "").trim();
  }

  function descendants(parent, localName) {
    return Array.from(parent?.getElementsByTagName?.("*") || []).filter((node) => node.localName === localName);
  }

  function rows(table) {
    return Array.from(table?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === "tr");
  }

  function cells(row) {
    return Array.from(row?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === "tc");
  }

  function firstParagraph(container) {
    return descendants(container, "p")[0] || null;
  }

  function setRunColor(run, color = "000000") {
    if (!run) return;
    const doc = run.ownerDocument;
    let rPr = Array.from(run.childNodes).find((node) => node.nodeType === 1 && node.localName === "rPr");
    if (!rPr) {
      rPr = doc.createElementNS(WORD_NS, "w:rPr");
      run.insertBefore(rPr, run.firstChild);
    }
    let colorNode = descendants(rPr, "color")[0];
    if (!colorNode) {
      colorNode = doc.createElementNS(WORD_NS, "w:color");
      rPr.appendChild(colorNode);
    }
    colorNode.setAttributeNS(WORD_NS, "w:val", color);
    colorNode.setAttribute("w:val", color);
  }

  function setParagraphText(paragraph, value, black = false) {
    if (!paragraph) return;
    const doc = paragraph.ownerDocument;
    const firstRun = descendants(paragraph, "r")[0];
    const runProperties = firstRun ? descendants(firstRun, "rPr")[0]?.cloneNode(true) : null;
    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.localName === "pPr")) paragraph.removeChild(node);
    });
    const run = doc.createElementNS(WORD_NS, "w:r");
    if (runProperties) run.appendChild(runProperties);
    if (black) setRunColor(run);
    const text = doc.createElementNS(WORD_NS, "w:t");
    text.setAttributeNS(XML_NS, "xml:space", "preserve");
    text.textContent = String(value || " ");
    run.appendChild(text);
    paragraph.appendChild(run);
  }

  function setCellText(table, rowIndex, cellIndex, value, black = false) {
    const cell = cells(rows(table)[rowIndex])[cellIndex];
    if (!cell) return;
    let paragraph = firstParagraph(cell);
    if (!paragraph) {
      paragraph = cell.ownerDocument.createElementNS(WORD_NS, "w:p");
      cell.appendChild(paragraph);
    }
    setParagraphText(paragraph, value, black);
  }

  function setHeaderCell(table, rowIndex, cellIndex, label, value) {
    setCellText(table, rowIndex, cellIndex, `${label}${value ? ` ${value}` : " "}`, false);
  }

  function setLabelOnly(cell, label) {
    const paragraph = firstParagraph(cell);
    if (paragraph) setParagraphText(paragraph, label, false);
  }

  function paragraphText(paragraph) {
    return descendants(paragraph, "t").map((node) => node.textContent || "").join("");
  }

  function normText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function bodyParagraphs(documentXml) {
    return descendants(documentXml, "p").filter((paragraph) => {
      let node = paragraph.parentElement;
      while (node) {
        if (node.localName === "tc") return false;
        node = node.parentElement;
      }
      return true;
    });
  }

  function findHeading(documentXml, label) {
    const wanted = normText(label);
    return bodyParagraphs(documentXml).find((paragraph) => normText(paragraphText(paragraph)) === wanted)
      || bodyParagraphs(documentXml).find((paragraph) => normText(paragraphText(paragraph)).startsWith(wanted))
      || null;
  }

  function nextParagraph(paragraph) {
    let node = paragraph?.nextSibling || null;
    while (node) {
      if (node.nodeType === 1 && node.localName === "p") return node;
      node = node.nextSibling;
    }
    return null;
  }

  function blackParagraph(paragraph) {
    descendants(paragraph, "r").forEach((run) => setRunColor(run));
  }

  function blackSectionValue(documentXml, label) {
    const heading = findHeading(documentXml, label);
    if (!heading) return;
    const headingText = normText(paragraphText(heading));
    if (headingText === normText(label)) {
      const next = nextParagraph(heading);
      if (next) blackParagraph(next);
      return;
    }
    const runs = descendants(heading, "r");
    const full = runs.map((run) => descendants(run, "t").map((n) => n.textContent || "").join("")).join("");
    const cutoff = full.toUpperCase().indexOf(label.toUpperCase()) + label.length;
    let cursor = 0;
    runs.forEach((run) => {
      const text = descendants(run, "t").map((n) => n.textContent || "").join("");
      const start = cursor;
      cursor += text.length;
      if (cursor > cutoff && start >= cutoff - 1) setRunColor(run);
    });
  }

  function patchReport(bytes, inspection) {
    try {
      const state = readState();
      const job = activeJobFor(state, inspection);
      const vendorProfile = reportingVendorProfile(state, inspection, job);
      const subProfile = subvendorProfile(state, inspection, job, vendorProfile);
      const reportingVendor = String(inspection?.reportingVendor || job?.reportingVendor || "").trim();
      const location = String(inspection?.inspectionLocation || inspection?.vendor || "").trim();
      const subvendor = location && !sameName(location, reportingVendor) ? location : "";
      const reportNo = String(inspection?.reportNumber || reportNumberMap()[inspection?.id] || "").trim();
      const reportDateText = reportDate(inspection);
      const clientPoSb = String(inspection?.clientPoToSbInspection || job?.clientPoToSbInspection || "").trim();
      const clientPoVendor = String(inspection?.clientPoToVendor || job?.clientPoToVendor || "").trim();
      const primaryEmail = String(inspection?.primaryContactEmail || job?.primaryContactEmail || vendorProfile?.email || "").trim();
      const inspectorName = String(state.settings?.inspectorName || inspection?.inspectorName || "Jeremy Coussou").trim();
      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      const parser = new DOMParser();
      const documentXml = parser.parseFromString(window.fflate.strFromU8(files["word/document.xml"]), "application/xml");
      const headerXml = parser.parseFromString(window.fflate.strFromU8(files["word/header1.xml"]), "application/xml");
      const footerXml = parser.parseFromString(window.fflate.strFromU8(files["word/footer1.xml"]), "application/xml");
      if ([documentXml, headerXml, footerXml].some((doc) => doc.getElementsByTagName("parsererror")[0])) return bytes;

      const headerTable = descendants(headerXml, "tbl")[0];
      if (headerTable) {
        setHeaderCell(headerTable, 1, 0, "CLIENT:", inspection?.customer || job?.client || job?.workbookClient || "");
        setHeaderCell(headerTable, 1, 1, "CLIENT PROJECT:", inspection?.projectName || job?.projectName || "");
        setHeaderCell(headerTable, 2, 0, "CLIENT PROJECT NUMBER:", job?.clientProjectNo || inspection?.clientProjectNo || "");
        setHeaderCell(headerTable, 2, 1, "CLIENT PO TO S&B INSPECTION:", clientPoSb);
        setHeaderCell(headerTable, 3, 0, "CLIENT PO TO VENDOR:", clientPoVendor);
        setHeaderCell(headerTable, 3, 1, "S&B INSPECTION JOB:", inspection?.sbInspectionNo || job?.inspectionNo || inspection?.projectNumber || "");
        setHeaderCell(headerTable, 4, 0, "REPORT NUMBER:", reportNo);
        setHeaderCell(headerTable, 4, 1, "DATE OF REPORT:", reportDateText);
      }

      const tables = descendants(documentXml, "tbl");
      const vendorTable = tables[0];
      if (vendorTable) {
        setCellText(vendorTable, 0, 1, reportingVendor, true);
        setCellText(vendorTable, 1, 1, vendorProfile?.streetAddress || "", true);
        setCellText(vendorTable, 2, 1, cityStateZip(vendorProfile), true);
        setCellText(vendorTable, 3, 1, vendorProfile?.phone || "", true);
        setCellText(vendorTable, 4, 1, inspection?.vendorJobNumber || job?.vendorJobs || "", true);
        setCellText(vendorTable, 5, 1, primaryEmail, true);
        setCellText(vendorTable, 6, 1, inspectorName, true);
        setCellText(vendorTable, 7, 1, inspection?.visitDateRange || displayDate(inspection?.date), true);
        const sta = inspection?.tripSnapshot?.staFileName || "";
        setCellText(vendorTable, 8, 1, sta, true);

        setCellText(vendorTable, 0, 3, subvendor, true);
        setCellText(vendorTable, 1, 3, subvendor ? (subProfile?.streetAddress || "") : "", true);
        setCellText(vendorTable, 2, 3, subvendor ? cityStateZip(subProfile) : "", true);
        setCellText(vendorTable, 3, 3, subvendor ? (subProfile?.phone || "") : "", true);
        setCellText(vendorTable, 4, 3, inspection?.subVendorJobNumber || job?.subVendorJobNumber || "", true);
        setCellText(vendorTable, 7, 3, shortDescription(inspection), true);
        const row8cells = cells(rows(vendorTable)[8]);
        if (row8cells[2]) setLabelOnly(row8cells[2], "TAGS:");
        setCellText(vendorTable, 8, 3, tagsFor(inspection, job), true);
      }

      ["DESCRIPTION:", "ACTION ITEMS:", "ENGINEERING COMPLETE:", "MATERIAL COMPLETE:", "FABRICATION COMPLETE:", "COATINGS:", "INSPECTION/AUDIT:"].forEach((label) => blackSectionValue(documentXml, label));
      bodyParagraphs(documentXml).forEach((paragraph) => {
        if (/^Figure\s+\d+/i.test(paragraphText(paragraph).trim())) blackParagraph(paragraph);
      });

      const footerVendor = String(inspection?.reportVendorName || job?.reportVendorName || vendorProfile?.reportName || reportingVendor).trim();
      const footerProject = String(inspection?.projectName || job?.projectName || "").trim();
      const sbJob = String(inspection?.sbInspectionNo || job?.inspectionNo || inspection?.projectNumber || "").trim();
      const footerLabel = [
        `S&B ${sbJob}${sbJob ? " " : ""}Insp Rpt${reportNo ? ` ${reportNo}` : ""}`,
        footerProject,
        footerVendor,
        footerDate(reportDateText)
      ].filter(Boolean).join(" - ");
      descendants(footerXml, "t").forEach((textNode) => {
        const text = String(textNode.textContent || "");
        if (/Insp\s+Rpt/i.test(text) || /\.docx/i.test(text)) textNode.textContent = footerLabel;
      });

      files["word/document.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(documentXml));
      files["word/header1.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(headerXml));
      files["word/footer1.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(footerXml));
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("S&B report header autofill failed:", error);
      return bytes;
    }
  }

  function resolveFormInspectionId() {
    const state = readState();
    if (currentInspectionId && state.settings.inspections.some((item) => item.id === currentInspectionId)) return currentInspectionId;
    const activeJobId = document.getElementById("inspectionActiveJobId")?.value || "";
    const tripId = document.getElementById("inspectionTripId")?.value || "";
    const date = document.getElementById("inspectionDate")?.value || "";
    const candidates = state.settings.inspections
      .filter((item) => (!activeJobId || item.activeJobId === activeJobId) && (!tripId || item.tripId === tripId) && (!date || item.date === date))
      .sort((a, b) => String(b.modifiedISO || "").localeCompare(String(a.modifiedISO || "")));
    currentInspectionId = candidates[0]?.id || "";
    return currentInspectionId;
  }

  function injectReportNumberField() {
    const form = document.getElementById("inspectionForm");
    if (!form || document.getElementById("inspectionReportNumber")) return;
    const context = form.querySelector("details.inspection-form-section .inspection-form-grid");
    if (!context) return;
    const id = resolveFormInspectionId();
    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === id);
    const value = String(inspection?.reportNumber || reportNumberMap()[id] || "");
    const label = document.createElement("label");
    label.innerHTML = `Report number<input id="inspectionReportNumber" value="${value.replace(/&/g,"&amp;").replace(/\"/g,"&quot;").replace(/</g,"&lt;")}" placeholder="Example: 001"><small>Manual field. Used in both the report header and footer; never auto-numbered.</small>`;
    context.appendChild(label);
  }

  document.addEventListener("click", (event) => {
    const edit = event.target.closest?.("[data-edit-inspection], [data-open-workspace-inspection], [data-preview-edit-inspection]");
    if (edit) currentInspectionId = edit.dataset.editInspection || edit.dataset.openWorkspaceInspection || edit.dataset.previewEditInspection || "";
    if (event.target.closest?.("#newInspectionBtn, #standaloneInspectionBtn, [data-new-workspace-inspection], [data-create-inspection-trip], [data-duplicate-inspection]")) currentInspectionId = "";
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.id !== "inspectionReportNumber") return;
    const value = event.target.value;
    let id = resolveFormInspectionId();
    if (id) saveReportNumber(id, value);
    else setTimeout(() => {
      id = resolveFormInspectionId();
      if (id) saveReportNumber(id, value);
    }, 900);
  }, true);

  const observer = new MutationObserver(() => injectReportNumberField());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectReportNumberField, { once: true });
  else injectReportNumberField();

  const wrapped = {
    ...base,
    async buildSAndBInspectionDocx(template, inspection, photos, filename) {
      const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename);
      const enriched = { ...inspection, reportNumber: inspection.reportNumber || reportNumberMap()[inspection.id] || "" };
      return patchReport(bytes, enriched);
    }
  };

  window.MileageInspectionReportTesting = Object.freeze(wrapped);
  window.MileageReportHeaderAutofill = Object.freeze({ patchReport, saveReportNumber, restoreReportNumbersIntoState });
  restoreReportNumbersIntoState();
})();
