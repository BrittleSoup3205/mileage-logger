(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const base = window.MileageInspectionReportTesting;
  if (!base || !window.fflate) return;

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
      state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
      return state;
    } catch (_) {
      return { activeJobs: [], facilityProfiles: [] };
    }
  }

  function norm(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(company|co|inc|llc|ltd)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sameName(left, right) {
    const a = norm(left);
    const b = norm(right);
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  }

  function profileNames(profile) {
    return [profile?.name, profile?.reportingVendor, profile?.shopFacilityName, profile?.normalInspectionLocation, profile?.reportName, ...(Array.isArray(profile?.aliases) ? profile.aliases : [])].filter(Boolean);
  }

  function findProfile(state, name, excludeId = "") {
    if (!name) return null;
    const exact = state.facilityProfiles.find((profile) => profile?.id !== excludeId && profileNames(profile).some((candidate) => norm(candidate) === norm(name)));
    if (exact) return exact;
    return state.facilityProfiles.find((profile) => profile?.id !== excludeId && profileNames(profile).some((candidate) => sameName(candidate, name))) || null;
  }

  function activeJobFor(state, inspection) {
    return state.activeJobs.find((job) => job?.aj === inspection?.activeJobId) || (window.MileageActiveJobsData?.activeJobs || []).find((job) => job?.aj === inspection?.activeJobId) || null;
  }

  function descendants(parent, localName) { return Array.from(parent?.getElementsByTagName?.("*") || []).filter((node) => node.localName === localName); }
  function rows(table) { return Array.from(table?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === "tr"); }
  function cells(row) { return Array.from(row?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === "tc"); }
  function firstParagraph(container) { return descendants(container, "p")[0] || null; }
  function paragraphText(paragraph) { return descendants(paragraph, "t").map((node) => node.textContent || "").join(""); }

  function setRunColor(run) {
    if (!run) return;
    const doc = run.ownerDocument;
    let rPr = Array.from(run.childNodes).find((node) => node.nodeType === 1 && node.localName === "rPr");
    if (!rPr) { rPr = doc.createElementNS(WORD_NS, "w:rPr"); run.insertBefore(rPr, run.firstChild); }
    let color = descendants(rPr, "color")[0];
    if (!color) { color = doc.createElementNS(WORD_NS, "w:color"); rPr.appendChild(color); }
    color.setAttributeNS(WORD_NS, "w:val", "000000");
    color.setAttribute("w:val", "000000");
  }

  function setParagraphText(paragraph, value, black = true) {
    if (!paragraph) return;
    const doc = paragraph.ownerDocument;
    const firstRun = descendants(paragraph, "r")[0];
    const runProperties = firstRun ? descendants(firstRun, "rPr")[0]?.cloneNode(true) : null;
    Array.from(paragraph.childNodes).forEach((node) => { if (!(node.nodeType === 1 && node.localName === "pPr")) paragraph.removeChild(node); });
    const run = doc.createElementNS(WORD_NS, "w:r");
    if (runProperties) run.appendChild(runProperties);
    if (black) setRunColor(run);
    const text = doc.createElementNS(WORD_NS, "w:t");
    text.setAttributeNS(XML_NS, "xml:space", "preserve");
    text.textContent = String(value || " ");
    run.appendChild(text);
    paragraph.appendChild(run);
  }

  function setCellText(table, rowIndex, cellIndex, value) {
    const row = rows(table)[rowIndex];
    const cell = row ? cells(row)[cellIndex] : null;
    if (!cell) return;
    let paragraph = firstParagraph(cell);
    if (!paragraph) { paragraph = cell.ownerDocument.createElementNS(WORD_NS, "w:p"); cell.appendChild(paragraph); }
    setParagraphText(paragraph, value, true);
  }

  function cityStateZip(profile) {
    if (!profile) return "";
    const city = String(profile.city || "").trim();
    const state = String(profile.state || "").trim();
    const zip = String(profile.zip || "").trim();
    return [city ? `${city}${state ? "," : ""}` : "", state, zip].filter(Boolean).join(" ");
  }

  function ensurePageBreakBefore(paragraph) {
    if (!paragraph) return;
    const doc = paragraph.ownerDocument;
    let pPr = Array.from(paragraph.childNodes).find((node) => node.nodeType === 1 && node.localName === "pPr");
    if (!pPr) { pPr = doc.createElementNS(WORD_NS, "w:pPr"); paragraph.insertBefore(pPr, paragraph.firstChild); }
    if (!descendants(pPr, "pageBreakBefore").length) pPr.appendChild(doc.createElementNS(WORD_NS, "w:pageBreakBefore"));
  }

  function findBodyHeading(documentXml, label) {
    const wanted = String(label || "").replace(/\s+/g, " ").trim().toUpperCase();
    return descendants(documentXml, "p").find((paragraph) => {
      let node = paragraph.parentElement;
      while (node) { if (node.localName === "tc") return false; node = node.parentElement; }
      return paragraphText(paragraph).replace(/\s+/g, " ").trim().toUpperCase() === wanted;
    }) || null;
  }

  function subvendorCandidate(inspection, job, reportingVendor) {
    return [inspection?.inspectionLocation, inspection?.vendor, job?.location, inspection?.tripSnapshot?.vendor]
      .map((value) => String(value || "").trim()).find((value) => value && !sameName(value, reportingVendor)) || "";
  }

  function patch(bytes, inspection) {
    try {
      const state = readState();
      const job = activeJobFor(state, inspection);
      const reportingVendor = String(inspection?.reportingVendor || job?.reportingVendor || "").trim();
      const vendorProfile = findProfile(state, reportingVendor);
      const rawSubvendor = subvendorCandidate(inspection, job, reportingVendor);
      const subProfile = findProfile(state, rawSubvendor, vendorProfile?.id || "");
      const subvendorDisplay = String(subProfile?.name || subProfile?.shopFacilityName || subProfile?.reportName || rawSubvendor).trim();
      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      if (!files["word/document.xml"]) return bytes;
      const documentXml = new DOMParser().parseFromString(window.fflate.strFromU8(files["word/document.xml"]), "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0]) return bytes;
      const vendorTable = descendants(documentXml, "tbl")[0];
      if (vendorTable) {
        setCellText(vendorTable, 8, 1, "STA filed electronically");
        if (vendorProfile) {
          setCellText(vendorTable, 1, 1, vendorProfile.streetAddress || "");
          setCellText(vendorTable, 2, 1, cityStateZip(vendorProfile));
          setCellText(vendorTable, 3, 1, vendorProfile.phone || "");
          setCellText(vendorTable, 5, 1, inspection?.primaryContactEmail || job?.primaryContactEmail || vendorProfile.email || "");
        }
        if (subvendorDisplay) {
          setCellText(vendorTable, 0, 3, subvendorDisplay);
          setCellText(vendorTable, 1, 3, subProfile?.streetAddress || "");
          setCellText(vendorTable, 2, 3, cityStateZip(subProfile));
          setCellText(vendorTable, 3, 3, subProfile?.phone || "");
          setCellText(vendorTable, 4, 3, inspection?.subVendorJobNumber || job?.subVendorJobNumber || "");
        }
      }
      ensurePageBreakBefore(findBodyHeading(documentXml, "INSPECTION/AUDIT:"));
      files["word/document.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(documentXml));
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("Final revised-template correction failed:", error);
      return bytes;
    }
  }

  const wrapped = { ...base, async buildSAndBInspectionDocx(template, inspection, photos, filename) { const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename); return patch(bytes, inspection); } };
  window.MileageInspectionReportTesting = Object.freeze(wrapped);
  window.MileageReportTemplateFinalFix = Object.freeze({ patch });
})();
