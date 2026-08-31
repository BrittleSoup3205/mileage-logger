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
      .trim().toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(company|co|inc|llc|ltd)\b/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function sameName(left, right) {
    const a = norm(left);
    const b = norm(right);
    return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
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

  function descendants(parent, localName) {
    return Array.from(parent?.getElementsByTagName?.("*") || []).filter((node) => node.localName === localName);
  }

  function directChildren(parent, localName) {
    return Array.from(parent?.childNodes || []).filter((node) => node.nodeType === 1 && node.localName === localName);
  }

  function rows(table) { return directChildren(table, "tr"); }
  function cells(row) { return directChildren(row, "tc"); }
  function paragraphs(cell) { return directChildren(cell, "p"); }
  function paragraphText(paragraph) { return descendants(paragraph, "t").map((node) => node.textContent || "").join(""); }
  function cellText(cell) { return descendants(cell, "t").map((node) => node.textContent || "").join(""); }

  function setRunColor(run) {
    if (!run) return;
    const doc = run.ownerDocument;
    let rPr = directChildren(run, "rPr")[0];
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

  function replaceCellText(cell, value, black = true) {
    if (!cell) return;
    const doc = cell.ownerDocument;
    const existingParagraphs = paragraphs(cell);
    const sourceParagraph = existingParagraphs[0] || null;
    const sourcePPr = sourceParagraph ? directChildren(sourceParagraph, "pPr")[0]?.cloneNode(true) : null;
    const sourceRun = sourceParagraph ? descendants(sourceParagraph, "r")[0] : null;
    const sourceRPr = sourceRun ? directChildren(sourceRun, "rPr")[0]?.cloneNode(true) : null;

    Array.from(cell.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.localName === "tcPr")) cell.removeChild(node);
    });

    const paragraph = doc.createElementNS(WORD_NS, "w:p");
    if (sourcePPr) paragraph.appendChild(sourcePPr);
    const run = doc.createElementNS(WORD_NS, "w:r");
    if (sourceRPr) run.appendChild(sourceRPr);
    if (black) setRunColor(run);
    const text = doc.createElementNS(WORD_NS, "w:t");
    text.setAttributeNS(XML_NS, "xml:space", "preserve");
    text.textContent = String(value ?? "");
    run.appendChild(text);
    paragraph.appendChild(run);
    cell.appendChild(paragraph);
  }

  function labelKey(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function findVendorTable(documentXml) {
    return descendants(documentXml, "tbl").find((table) => {
      const labels = rows(table).flatMap((row) => cells(row).map((cell) => labelKey(cellText(cell))));
      return labels.includes("VENDOR:") && labels.includes("STA #:");
    }) || null;
  }

  function setValueBesideLabel(table, label, value, side = "any", options = {}) {
    const wanted = labelKey(label);
    for (const row of rows(table)) {
      const rowCells = cells(row);
      for (let index = 0; index < rowCells.length - 1; index += 1) {
        if (labelKey(cellText(rowCells[index])) !== wanted) continue;
        if (side === "left" && index > 1) continue;
        if (side === "right" && index < 2) continue;
        if (options.onlyWhenValue && !String(value || "").trim()) return false;
        replaceCellText(rowCells[index + 1], value, options.black !== false);
        return true;
      }
    }
    return false;
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
    let pPr = directChildren(paragraph, "pPr")[0];
    if (!pPr) {
      pPr = doc.createElementNS(WORD_NS, "w:pPr");
      paragraph.insertBefore(pPr, paragraph.firstChild);
    }
    if (!descendants(pPr, "pageBreakBefore").length) {
      pPr.appendChild(doc.createElementNS(WORD_NS, "w:pageBreakBefore"));
    }
  }

  function findBodyHeading(documentXml, label) {
    const wanted = labelKey(label);
    return descendants(documentXml, "p").find((paragraph) => {
      let node = paragraph.parentElement;
      while (node) {
        if (node.localName === "tc") return false;
        node = node.parentElement;
      }
      return labelKey(paragraphText(paragraph)) === wanted;
    }) || null;
  }

  function subvendorCandidate(inspection, job, reportingVendor) {
    return [inspection?.inspectionLocation, inspection?.vendor, job?.location, inspection?.tripSnapshot?.vendor]
      .map((value) => String(value || "").trim())
      .find((value) => value && !sameName(value, reportingVendor)) || "";
  }

  function patch(bytes, inspection) {
    try {
      const state = readState();
      const job = activeJobFor(state, inspection);
      const reportingVendor = String(inspection?.reportingVendor || job?.reportingVendor || "").trim();
      const vendorProfile = findProfile(state, reportingVendor);
      const rawSubvendor = subvendorCandidate(inspection, job, reportingVendor);
      const subProfile = findProfile(state, rawSubvendor, vendorProfile?.id || "");
      const subvendorDisplay = String(subProfile?.name || subProfile?.shopFacilityName || rawSubvendor).trim();

      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      if (!files["word/document.xml"]) return bytes;
      const documentXml = new DOMParser().parseFromString(window.fflate.strFromU8(files["word/document.xml"]), "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0]) return bytes;

      const vendorTable = findVendorTable(documentXml);
      if (vendorTable) {
        setValueBesideLabel(vendorTable, "STA #:", "STA filed electronically", "left");

        if (vendorProfile) {
          setValueBesideLabel(vendorTable, "ADDRESS:", vendorProfile.streetAddress || "", "left");
          setValueBesideLabel(vendorTable, "CITY/STATE/ZIP:", cityStateZip(vendorProfile), "left");
          setValueBesideLabel(vendorTable, "PHONE NO.:", vendorProfile.phone || "", "left");
          setValueBesideLabel(
            vendorTable,
            "EMAIL:",
            inspection?.primaryContactEmail || job?.primaryContactEmail || vendorProfile.email || "",
            "left"
          );
        }

        if (subvendorDisplay) {
          setValueBesideLabel(vendorTable, "SUB VENDOR:", subvendorDisplay, "right");
          if (subProfile) {
            setValueBesideLabel(vendorTable, "ADDRESS:", subProfile.streetAddress || "", "right");
            setValueBesideLabel(vendorTable, "CITY/STATE/ZIP:", cityStateZip(subProfile), "right");
            setValueBesideLabel(vendorTable, "PHONE NO.:", subProfile.phone || "", "right");
          }
          setValueBesideLabel(vendorTable, "SHOP ORDER NO:", inspection?.subVendorJobNumber || job?.subVendorJobNumber || "", "right");
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

  const wrapped = {
    ...base,
    async buildSAndBInspectionDocx(template, inspection, photos, filename) {
      const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename);
      return patch(bytes, inspection);
    }
  };

  window.MileageInspectionReportTesting = Object.freeze(wrapped);
  window.MileageReportTemplateFinalFix = Object.freeze({ patch });
})();