(() => {
  "use strict";

  const RULE_ID = "inspectionActivityRulesV1";
  const STRUCTURAL_ACTIVITY = "Structural Steel Inspection";
  const VISUAL_ACTIVITY = "Visual / Final Inspection";
  const DIMENSIONAL_ACTIVITY = "Dimensional Inspection";
  const LEGACY_MATERIAL_ACTIVITY = "Material / MTR / PMI Review";
  const MATERIAL_ACTIVITY = "Material / MTR Review";
  const PMI_ACTIVITY = "PMI Review";
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";

  const STRUCTURAL_STEEL_LANGUAGE = "Performed visual and dimensional inspection of fabricated steel. Inspection was performed per the IFC drawings provided. Dimensions checked to IFC drawings with satisfactory results unless noted below, to allowable tolerances per DEP 34.28.00.31, AWS D1.1, and AISC. Weld sizes verified to drawing details/symbols. Beam copes and reentrant corners were properly radiused, with smooth contours and free of nicks, gouges, and stress risers.";

  function esc(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[ch]));
  }

  function activityInputs() {
    return [...document.querySelectorAll("[data-inspection-activity]")];
  }

  function inputFor(value) {
    return activityInputs().find((input) => input.value === value) || null;
  }

  function ensureSeparatedPmiControls() {
    const legacy = inputFor(LEGACY_MATERIAL_ACTIVITY);
    if (!legacy) return;
    const label = legacy.closest("label");
    if (!label || label.dataset.pmiSplitApplied === "1") return;

    const parent = label.parentElement;
    if (!parent) return;

    const legacyWasChecked = legacy.checked;
    label.dataset.pmiSplitApplied = "1";
    label.style.display = "none";
    legacy.checked = false;
    legacy.removeAttribute("data-inspection-activity");

    const materialLabel = document.createElement("label");
    materialLabel.className = label.className;
    materialLabel.dataset.pmiSplitGenerated = "material";
    materialLabel.innerHTML = `<input type="checkbox" data-inspection-activity value="${esc(MATERIAL_ACTIVITY)}"><span>${esc(MATERIAL_ACTIVITY)}</span>`;

    const pmiLabel = document.createElement("label");
    pmiLabel.className = label.className;
    pmiLabel.dataset.pmiSplitGenerated = "pmi";
    pmiLabel.innerHTML = `<input type="checkbox" data-inspection-activity value="${esc(PMI_ACTIVITY)}"><span>${esc(PMI_ACTIVITY)}</span>`;

    // Historical combined records are conservatively treated as Material/MTR only.
    // PMI is never inferred from the legacy combined selection.
    materialLabel.querySelector("input").checked = legacyWasChecked;
    pmiLabel.querySelector("input").checked = false;

    parent.insertBefore(materialLabel, label);
    parent.insertBefore(pmiLabel, label);
  }

  function applyStructuralDefaults() {
    const structural = inputFor(STRUCTURAL_ACTIVITY);
    if (!structural?.checked) return;
    const visual = inputFor(VISUAL_ACTIVITY);
    const dimensional = inputFor(DIMENSIONAL_ACTIVITY);
    if (visual) visual.checked = true;
    if (dimensional) dimensional.checked = true;
  }

  function refreshControls() {
    ensureSeparatedPmiControls();
    applyStructuralDefaults();
  }

  function installUiRules() {
    if (document.documentElement.dataset[RULE_ID] === "1") return;
    document.documentElement.dataset[RULE_ID] = "1";

    document.addEventListener("change", (event) => {
      const input = event.target.closest?.("[data-inspection-activity]");
      if (!input) return;
      if (input.value === STRUCTURAL_ACTIVITY && input.checked) applyStructuralDefaults();
    });

    document.addEventListener("click", () => setTimeout(refreshControls, 0), true);
    window.addEventListener("mileage:state-changed", () => setTimeout(refreshControls, 30));
    window.setInterval(refreshControls, 800);
    refreshControls();
  }

  function descendantsByLocalName(parent, localName) {
    return Array.from(parent?.getElementsByTagName?.("*") || []).filter((element) => element.localName === localName);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function paragraphText(paragraph) {
    return descendantsByLocalName(paragraph, "t").map((node) => node.textContent || "").join("");
  }

  function hasAncestor(node, localName) {
    let current = node?.parentElement || null;
    while (current) {
      if (current.localName === localName) return true;
      current = current.parentElement;
    }
    return false;
  }

  function findAuditHeading(documentXml) {
    return descendantsByLocalName(documentXml, "p")
      .filter((paragraph) => !hasAncestor(paragraph, "tc"))
      .find((paragraph) => normalizeText(paragraphText(paragraph)).startsWith("INSPECTION/AUDIT:")) || null;
  }

  function nextParagraph(paragraph) {
    let node = paragraph?.nextSibling || null;
    while (node) {
      if (node.nodeType === 1 && node.localName === "p") return node;
      node = node.nextSibling;
    }
    return null;
  }

  function setParagraphText(paragraph, value) {
    if (!paragraph) return;
    const documentXml = paragraph.ownerDocument;
    const firstRun = descendantsByLocalName(paragraph, "r")[0];
    const runProperties = firstRun ? descendantsByLocalName(firstRun, "rPr")[0]?.cloneNode(true) : null;
    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.localName === "pPr")) paragraph.removeChild(node);
    });
    String(value ?? "").split(/\r?\n/).forEach((line, index) => {
      const run = documentXml.createElementNS(WORD_NS, "w:r");
      if (runProperties) run.appendChild(runProperties.cloneNode(true));
      if (index) run.appendChild(documentXml.createElementNS(WORD_NS, "w:br"));
      const text = documentXml.createElementNS(WORD_NS, "w:t");
      text.setAttributeNS(XML_NS, "xml:space", "preserve");
      text.textContent = line || " ";
      run.appendChild(text);
      paragraph.appendChild(run);
    });
  }

  function structuralSelected(inspection) {
    const activities = Array.isArray(inspection?.activities) ? inspection.activities : [];
    return activities.includes(STRUCTURAL_ACTIVITY)
      || /structural steel/i.test(String(inspection?.inspectionType || ""));
  }

  function structuralAuditText(inspection) {
    const vendor = String(
      inspection?.reportingVendor
      || inspection?.inspectionLocation
      || inspection?.vendor
      || "the fabrication facility"
    ).trim();
    const opening = `Inspection visit made to ${vendor} to perform visual and dimensional inspection. The following are details of the inspection:`;

    const additional = [];
    const add = (value) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (/performed visual and dimensional inspection of fabricated steel/i.test(text)) return;
      if (!additional.some((item) => item.toLowerCase() === text.toLowerCase())) additional.push(text);
    };

    add(inspection?.generatedReportLanguage);
    add(inspection?.summary);
    add(inspection?.observations);

    return [opening, `• ${STRUCTURAL_STEEL_LANGUAGE}`, ...additional].join("\r\n");
  }

  function patchStructuralAudit(bytes, inspection) {
    if (!structuralSelected(inspection) || !window.fflate) return bytes;
    try {
      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      const documentBytes = files["word/document.xml"];
      if (!documentBytes) return bytes;
      const xml = window.fflate.strFromU8(documentBytes);
      const documentXml = new DOMParser().parseFromString(xml, "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0]) return bytes;

      const heading = findAuditHeading(documentXml);
      const body = nextParagraph(heading);
      if (!heading || !body) return bytes;
      setParagraphText(body, structuralAuditText(inspection));

      files["word/document.xml"] = window.fflate.strToU8(new XMLSerializer().serializeToString(documentXml));
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("Structural steel report language could not be applied:", error);
      return bytes;
    }
  }

  function installReportRules() {
    const base = window.MileageInspectionReportTesting;
    if (!base?.buildSAndBInspectionDocx || base.__structuralActivityRulesWrapped) return;
    const wrapped = {
      ...base,
      __structuralActivityRulesWrapped: true,
      async buildSAndBInspectionDocx(template, inspection, photos, filename) {
        const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename);
        return patchStructuralAudit(bytes, inspection);
      }
    };
    window.MileageInspectionReportTesting = Object.freeze(wrapped);
  }

  function install() {
    installUiRules();
    installReportRules();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.MileageInspectionActivityRules = Object.freeze({
    STRUCTURAL_STEEL_LANGUAGE,
    refreshControls,
    patchStructuralAudit
  });
})();
