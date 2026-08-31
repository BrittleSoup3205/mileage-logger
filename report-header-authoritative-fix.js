(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const base = window.MileageReportHeaderAutofill;
  if (!base?.patchReport || !window.fflate) return;

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
    return String(value || "").trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(company|co|inc|llc|ltd)\b/g, " ").replace(/\s+/g, " ").trim();
  }

  function sameName(left, right) {
    const a = norm(left);
    const b = norm(right);
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  }

  function namesFor(profile) {
    return [profile?.name, profile?.reportingVendor, profile?.shopFacilityName, profile?.normalInspectionLocation, profile?.reportName, ...(Array.isArray(profile?.aliases) ? profile.aliases : [])].filter(Boolean);
  }

  function findProfile(state, name) {
    if (!name) return null;
    return state.facilityProfiles.find((profile) => namesFor(profile).some((candidate) => norm(candidate) === norm(name)))
      || state.facilityProfiles.find((profile) => namesFor(profile).some((candidate) => sameName(candidate, name)))
      || null;
  }

  function activeJobFor(state, inspection) {
    return state.activeJobs.find((job) => job?.aj === inspection?.activeJobId)
      || (window.MileageActiveJobsData?.activeJobs || []).find((job) => job?.aj === inspection?.activeJobId)
      || null;
  }

  function descendants(parent, localName) {
    return Array.from(parent?.getElementsByTagName?.("*") || []).filter((node) => node.localName === localName);
  }
  function rows(table) { return Array.from(table?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === "tr"); }
  function cells(row) { return Array.from(row?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === "tc"); }
  function firstParagraph(container) { return descendants(container, "p")[0] || null; }

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

  function setParagraphText(paragraph, value, black = true) {
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
    text.textContent = String(value ?? "");
    run.appendChild(text);
    paragraph.appendChild(run);
  }

  function setCellText(table, rowIndex, cellIndex, value, black = true) {
    const row = rows(table)[rowIndex];
    const cell = row ? cells(row)[cellIndex] : null;
    if (!cell) return;
    let paragraph = firstParagraph(cell);
    if (!paragraph) {
      paragraph = cell.ownerDocument.createElementNS(WORD_NS, "w:p");
      cell.appendChild(paragraph);
    }
    setParagraphText(paragraph, value, black);
  }

  function cityStateZip(profile) {
    if (!profile) return "";
    const city = String(profile.city || "").trim();
    const state = String(profile.state || "").trim();
    const zip = String(profile.zip || "").trim();
    return [city ? `${city}${state ? "," : ""}` : "", state, zip].filter(Boolean).join(" ");
  }

  function footerDate(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${String(date.getFullYear()).slice(-2)}`;
  }

  function patchAuthoritative(bytes, inspection) {
    try {
      const state = readState();
      const job = activeJobFor(state, inspection);
      const reportingVendor = String(inspection?.reportingVendor || job?.reportingVendor || "").trim();
      const vendorProfile = findProfile(state, reportingVendor);
      const rawSubvendor = [inspection?.inspectionLocation, inspection?.vendor, job?.location, inspection?.tripSnapshot?.vendor]
        .map((value) => String(value || "").trim())
        .find((value) => value && !sameName(value, reportingVendor)) || "";
      const subProfile = findProfile(state, rawSubvendor);
      const subvendor = String(subProfile?.name || subProfile?.shopFacilityName || rawSubvendor).trim();
      const primaryEmail = String(inspection?.primaryContactEmail || job?.primaryContactEmail || vendorProfile?.email || "").trim();

      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      if (!files["word/document.xml"] || !files["word/footer1.xml"]) return bytes;
      const parser = new DOMParser();
      const documentXml = parser.parseFromString(window.fflate.strFromU8(files["word/document.xml"]), "application/xml");
      const footerXml = parser.parseFromString(window.fflate.strFromU8(files["word/footer1.xml"]), "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0] || footerXml.getElementsByTagName("parsererror")[0]) return bytes;

      const vendorTable = descendants(documentXml, "tbl")[0];
      if (vendorTable) {
        setCellText(vendorTable, 0, 1, reportingVendor, true);
        setCellText(vendorTable, 1, 1, vendorProfile?.streetAddress || "", true);
        setCellText(vendorTable, 2, 1, cityStateZip(vendorProfile), true);
        setCellText(vendorTable, 3, 1, vendorProfile?.phone || "", true);
        setCellText(vendorTable, 5, 1, primaryEmail, true);
        setCellText(vendorTable, 8, 1, "STA filed electronically", true);

        setCellText(vendorTable, 0, 3, subvendor, true);
        setCellText(vendorTable, 1, 3, subvendor ? (subProfile?.streetAddress || "") : "", true);
        setCellText(vendorTable, 2, 3, subvendor ? cityStateZip(subProfile) : "", true);
        setCellText(vendorTable, 3, 3, subvendor ? (subProfile?.phone || "") : "", true);
        setCellText(vendorTable, 4, 3, "", true);
      }

      const reportNumber = String(inspection?.reportNumber || "").trim();
      const sbJob = String(inspection?.sbInspectionNo || job?.inspectionNo || inspection?.projectNumber || "").trim();
      const project = String(inspection?.projectName || job?.projectName || "").trim();
      const footerVendor = String(vendorProfile?.reportName || inspection?.reportVendorName || job?.reportVendorName || reportingVendor).trim();
      const reportDate = inspection?.reportDate || new Date().toISOString().slice(0, 10);
      const footerLabel = [`S&B ${sbJob} Insp Rpt${reportNumber ? ` ${reportNumber}` : ""}`, project, footerVendor, footerDate(reportDate)].filter(Boolean).join(" - ");
      const footerParagraph = descendants(footerXml, "p").find((paragraph) => /\bInsp\s+Rpt\b/i.test(descendants(paragraph, "t").map((node) => node.textContent || "").join("")));
      if (footerParagraph) setParagraphText(footerParagraph, footerLabel, false);

      files["word/document.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(documentXml));
      files["word/footer1.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(footerXml));
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("Authoritative report header correction failed:", error);
      return bytes;
    }
  }

  window.MileageReportHeaderAutofill = Object.freeze({
    ...base,
    patchReport(bytes, inspection) {
      return patchAuthoritative(base.patchReport(bytes, inspection), inspection);
    }
  });
  window.MileageReportHeaderAuthoritativeFix = Object.freeze({ patchAuthoritative });
})();