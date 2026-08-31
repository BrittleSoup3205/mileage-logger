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
      state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
      state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
      return state;
    } catch (_) {
      return { settings: {}, activeJobs: [], facilityProfiles: [] };
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
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function profileNames(profile) {
    return [
      profile?.name,
      profile?.reportingVendor,
      profile?.shopFacilityName,
      profile?.normalInspectionLocation,
      profile?.reportName,
      ...(Array.isArray(profile?.aliases) ? profile.aliases : [])
    ].filter(Boolean);
  }

  function findProfile(state, name, excludeId = "") {
    if (!name) return null;
    const exact = state.facilityProfiles.find((profile) => (
      profile?.id !== excludeId && profileNames(profile).some((candidate) => norm(candidate) === norm(name))
    ));
    if (exact) return exact;
    return state.facilityProfiles.find((profile) => (
      profile?.id !== excludeId && profileNames(profile).some((candidate) => sameName(candidate, name))
    )) || null;
  }

  function activeJobFor(state, inspection) {
    return state.activeJobs.find((job) => job?.aj === inspection?.activeJobId)
      || (window.MileageActiveJobsData?.activeJobs || []).find((job) => job?.aj === inspection?.activeJobId)
      || null;
  }

  function vendorProfileFor(state, inspection, job) {
    const vendor = String(inspection?.reportingVendor || job?.reportingVendor || "").trim();
    const matched = findProfile(state, vendor);
    if (matched) return matched;
    const explicitId = job?.defaultFacilityProfileId || "";
    const explicit = state.facilityProfiles.find((profile) => profile?.id === explicitId) || null;
    return explicit && profileNames(explicit).some((name) => sameName(name, vendor)) ? explicit : null;
  }

  function subvendorNameFor(inspection, job, reportingVendor) {
    const inspectionLocation = String(inspection?.inspectionLocation || inspection?.vendor || "").trim();
    if (inspectionLocation && !sameName(inspectionLocation, reportingVendor)) return inspectionLocation;

    const jobLocation = String(job?.location || "").trim();
    if (jobLocation && !sameName(jobLocation, reportingVendor)) return jobLocation;

    const tripVendor = String(inspection?.tripSnapshot?.vendor || "").trim();
    if (tripVendor && !sameName(tripVendor, reportingVendor)) return tripVendor;
    return "";
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

  function paragraphText(paragraph) {
    return descendants(paragraph, "t").map((node) => node.textContent || "").join("");
  }

  function normText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function hasTableCellAncestor(node) {
    let current = node?.parentElement || null;
    while (current) {
      if (current.localName === "tc") return true;
      current = current.parentElement;
    }
    return false;
  }

  function bodyParagraphs(documentXml) {
    return descendants(documentXml, "p").filter((paragraph) => !hasTableCellAncestor(paragraph));
  }

  function findHeading(documentXml, label) {
    const wanted = normText(label);
    const paragraphs = bodyParagraphs(documentXml);
    return paragraphs.find((paragraph) => normText(paragraphText(paragraph)) === wanted)
      || paragraphs.find((paragraph) => normText(paragraphText(paragraph)).startsWith(wanted))
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

  function setRunColor(run) {
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
    colorNode.setAttributeNS(WORD_NS, "w:val", "000000");
    colorNode.setAttribute("w:val", "000000");
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

  function coatingsValue(inspection) {
    try {
      const automated = window.MileageInspectionReportAutomation?.automatedSections?.(inspection);
      if (String(automated?.coatings || "").trim()) return String(automated.coatings).trim();
    } catch (_) {}
    const reportCompletion = inspection?.reportCompletion && typeof inspection.reportCompletion === "object"
      ? inspection.reportCompletion : {};
    return String(
      reportCompletion.coatings
      || inspection?.reportCoatingsComplete
      || inspection?.coatingsComplete
      || "100%"
    ).trim();
  }

  function fillCoatingsComplete(documentXml, inspection) {
    const heading = findHeading(documentXml, "COATINGS COMPLETE:") || findHeading(documentXml, "COATINGS:");
    if (!heading) return;
    const value = coatingsValue(inspection);
    const headingText = normText(paragraphText(heading));
    if (headingText !== "COATINGS COMPLETE:" && headingText !== "COATINGS:") return;
    let target = nextParagraph(heading);
    const nextText = normText(paragraphText(target));
    if (!target || /^(INSPECTION\/AUDIT:|REFERENCE DOCUMENTS:|SHOP INSPECTION:)/.test(nextText)) {
      target = heading.ownerDocument.createElementNS(WORD_NS, "w:p");
      heading.parentNode?.insertBefore(target, heading.nextSibling);
    }
    setParagraphText(target, value, true);
  }

  function footerDate(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return text;
    return `${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}-${match[3].slice(-2)}`;
  }

  function reportDate(inspection) {
    const explicit = String(inspection?.reportDate || "").trim();
    if (explicit) {
      const match = explicit.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[2]}/${match[3]}/${match[1]}` : explicit;
    }
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  }

  function replaceFilenameFooter(footerXml, label) {
    const paragraphs = descendants(footerXml, "p");
    let target = paragraphs.find((paragraph) => descendants(paragraph, "instrText").some((node) => /\bFILENAME\b/i.test(node.textContent || "")));
    if (!target) target = paragraphs.find((paragraph) => /Insp\s+Rpt|\.docx/i.test(paragraphText(paragraph)));
    if (target) setParagraphText(target, label, false);
  }

  function patch(bytes, inspection) {
    try {
      const state = readState();
      const job = activeJobFor(state, inspection);
      const reportingVendor = String(inspection?.reportingVendor || job?.reportingVendor || "").trim();
      const vendorProfile = vendorProfileFor(state, inspection, job);
      const subvendor = subvendorNameFor(inspection, job, reportingVendor);
      const subProfile = findProfile(state, subvendor, vendorProfile?.id || "");

      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      if (!files["word/document.xml"] || !files["word/footer1.xml"]) return bytes;
      const parser = new DOMParser();
      const documentXml = parser.parseFromString(window.fflate.strFromU8(files["word/document.xml"]), "application/xml");
      const footerXml = parser.parseFromString(window.fflate.strFromU8(files["word/footer1.xml"]), "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0] || footerXml.getElementsByTagName("parsererror")[0]) return bytes;

      const tables = descendants(documentXml, "tbl");
      const vendorTable = tables[0];
      if (vendorTable) {
        if (vendorProfile) {
          setCellText(vendorTable, 1, 1, vendorProfile.streetAddress || "");
          setCellText(vendorTable, 2, 1, cityStateZip(vendorProfile));
          setCellText(vendorTable, 3, 1, vendorProfile.phone || "");
          const primaryEmail = String(inspection?.primaryContactEmail || job?.primaryContactEmail || vendorProfile.email || "").trim();
          setCellText(vendorTable, 5, 1, primaryEmail);
        }

        setCellText(vendorTable, 8, 1, "STA filed electronically");

        if (subvendor) {
          setCellText(vendorTable, 0, 3, subvendor);
          setCellText(vendorTable, 1, 3, subProfile?.streetAddress || "");
          setCellText(vendorTable, 2, 3, cityStateZip(subProfile));
          setCellText(vendorTable, 3, 3, subProfile?.phone || "");
          setCellText(vendorTable, 4, 3, inspection?.subVendorJobNumber || job?.subVendorJobNumber || "");
        } else {
          [0, 1, 2, 3, 4].forEach((rowIndex) => setCellText(vendorTable, rowIndex, 3, ""));
        }
      }

      fillCoatingsComplete(documentXml, inspection);

      const reportNumber = String(inspection?.reportNumber || "").trim();
      const sbJob = String(inspection?.sbInspectionNo || job?.inspectionNo || inspection?.projectNumber || "").trim();
      const project = String(inspection?.projectName || job?.projectName || "").trim();
      const footerVendor = String(
        inspection?.reportVendorName
        || job?.reportVendorName
        || vendorProfile?.reportName
        || reportingVendor
      ).trim();
      const date = reportDate(inspection);
      const footerLabel = [
        `S&B ${sbJob}${sbJob ? " " : ""}Insp Rpt${reportNumber ? ` ${reportNumber}` : ""}`,
        project,
        footerVendor,
        footerDate(date)
      ].filter(Boolean).join(" - ");
      replaceFilenameFooter(footerXml, footerLabel);

      files["word/document.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(documentXml));
      files["word/footer1.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(footerXml));
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("Revised S&B template correction failed:", error);
      return bytes;
    }
  }

  const wrapped = {
    ...base,
    async buildSAndBInspectionDocx(template, inspection, photos, filename) {
      const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename);
      return patch(bytes, inspection);
    }
  };

  window.MileageInspectionReportTesting = Object.freeze(wrapped);
  window.MileageReportTemplateV2Fix = Object.freeze({ patch, findProfile, subvendorNameFor });
})();
