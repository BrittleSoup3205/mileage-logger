(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let pendingSaveNormalization = null;
  let reportApiWrapped = false;

  function extractSystemCode(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";

    let match = text.match(/^(?:shell\s+)?(?:coating|paint)\s+system\s+([A-Za-z0-9][A-Za-z0-9._/-]*)/i);
    if (match) return match[1];

    match = text.match(/^system\s+([A-Za-z0-9][A-Za-z0-9._/-]*)/i);
    if (match) return match[1];

    match = text.match(/^([A-Za-z0-9][A-Za-z0-9._/-]*)\s*(?:\(|\u2014|\u2013| - |:)/);
    if (match) return match[1];

    if (/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(text)) return text;
    return "";
  }

  function coatingSystemLabel(raw) {
    const code = extractSystemCode(raw);
    return code ? `Coating System ${code}` : String(raw || "").trim();
  }

  function normalizeReportText(raw) {
    let text = String(raw || "");
    if (!text) return text;

    text = text.replace(
      /(selected\s+(?:coating|paint)\s+system\s+was\s+)(?!Coating\s+System\s+)([A-Za-z0-9][A-Za-z0-9._/-]*)(?:\s*\([^)]*\))?/gi,
      (_, prefix, code) => `${prefix}Coating System ${code}`
    );

    text = text.replace(
      /\b(?:Shell\s+)?(?:Coating|Paint)\s+System\s+([A-Za-z0-9][A-Za-z0-9._/-]*)\s*\([^)]*\)/gi,
      (_, code) => `Coating System ${code}`
    );

    text = text.replace(
      /\bShell\s+(?:Coating|Paint)\s+System\s+([A-Za-z0-9][A-Za-z0-9._/-]*)\b/gi,
      (_, code) => `Coating System ${code}`
    );

    text = text.replace(
      /\bPaint\s+System\s+([A-Za-z0-9][A-Za-z0-9._/-]*)\b/gi,
      (_, code) => `Coating System ${code}`
    );

    return text.replace(/\s+/g, " ").trim();
  }

  function normalizeAutoReportField() {
    const field = document.getElementById("autoReportCoatingSystem");
    if (!field) return;
    const selected = document.getElementById("coatingSystem")?.value || "";
    const source = field.value.trim() || selected;
    if (!source) return;
    field.value = coatingSystemLabel(source);
  }

  function normalizeVisiblePreview() {
    const preview = document.getElementById("inspectionReportPreview");
    if (!preview || preview.classList.contains("hidden")) return;
    const datasetText = preview.dataset.reportLanguage || "";
    const normalizedDataset = normalizeReportText(datasetText);
    if (normalizedDataset && normalizedDataset !== datasetText) {
      preview.dataset.reportLanguage = normalizedDataset;
    }
    const paragraph = preview.querySelector("p");
    if (paragraph) {
      const normalized = normalizeReportText(paragraph.textContent || "");
      if (normalized !== paragraph.textContent) paragraph.textContent = normalized;
    }
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function normalizeRecentSavedInspection() {
    if (!pendingSaveNormalization) return;
    const state = readState();
    const inspections = state?.settings?.inspections;
    if (!Array.isArray(inspections)) return;

    const matches = inspections.filter((item) => {
      if (pendingSaveNormalization.activeJobId && item.activeJobId !== pendingSaveNormalization.activeJobId) return false;
      if (pendingSaveNormalization.date && item.date !== pendingSaveNormalization.date) return false;
      if (pendingSaveNormalization.activity && item.activity !== pendingSaveNormalization.activity) return false;
      return true;
    }).sort((a, b) => String(b.modifiedISO || b.createdISO || "").localeCompare(String(a.modifiedISO || a.createdISO || "")));

    const target = matches[0];
    if (!target) return;
    const modifiedMs = Date.parse(target.modifiedISO || target.createdISO || 0) || 0;
    if (modifiedMs && modifiedMs < pendingSaveNormalization.savedAt - 5000) return;

    const before = String(target.generatedReportLanguage || "");
    const after = normalizeReportText(before);
    pendingSaveNormalization = null;
    if (!before || before === after) return;

    const now = new Date().toISOString();
    target.generatedReportLanguage = after;
    target.modifiedISO = now;
    state.settings = state.settings || {};
    state.settings.inspectionLastChangedISO = now;
    state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
    state.backup.pendingChangeCount = Math.max(1, Number(state.backup.pendingChangeCount || 0) + 1);
    state.backup.lastRequiredISO = now;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mileage:state-changed"));
  }

  function normalizedInspection(inspection) {
    if (!inspection || typeof inspection !== "object") return inspection;
    return {
      ...inspection,
      generatedReportLanguage: normalizeReportText(inspection.generatedReportLanguage || "")
    };
  }

  function wrapReportApi() {
    if (reportApiWrapped) return;
    const api = window.MileageInspectionReportTesting;
    if (!api || typeof api !== "object") return;

    const replacement = { ...api };
    if (typeof api.buildSAndBInspectionDocx === "function") {
      replacement.buildSAndBInspectionDocx = (inspection, photos, bytes) =>
        api.buildSAndBInspectionDocx(normalizedInspection(inspection), photos, bytes);
    }
    if (typeof api.buildInspectionDocx === "function") {
      replacement.buildInspectionDocx = (inspection, photos) =>
        api.buildInspectionDocx(normalizedInspection(inspection), photos);
    }
    window.MileageInspectionReportTesting = replacement;
    reportApiWrapped = true;
  }

  document.addEventListener("click", (event) => {
    const id = event.target?.closest?.("button")?.id || "";
    if (id === "buildAutoReportTextBtn" || id === "useAutoReportTextBtn") {
      normalizeAutoReportField();
    }
    if (id === "generateInspectionReportBtn") {
      window.setTimeout(normalizeVisiblePreview, 0);
      window.setTimeout(normalizeVisiblePreview, 50);
    }
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "inspectionForm") return;
    pendingSaveNormalization = {
      activeJobId: document.getElementById("inspectionActiveJobId")?.value || "",
      date: document.getElementById("inspectionDate")?.value || "",
      activity: document.getElementById("inspectionActivity")?.value?.trim() || "",
      savedAt: Date.now()
    };
    window.setTimeout(normalizeRecentSavedInspection, 120);
    window.setTimeout(normalizeRecentSavedInspection, 500);
  }, true);

  window.addEventListener("mileage:state-changed", () => {
    if (pendingSaveNormalization) window.setTimeout(normalizeRecentSavedInspection, 40);
    window.setTimeout(normalizeVisiblePreview, 0);
    window.setTimeout(normalizeAutoReportField, 0);
    window.setTimeout(wrapReportApi, 0);
  });

  const observer = new MutationObserver(() => {
    normalizeVisiblePreview();
    normalizeAutoReportField();
    wrapReportApi();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  normalizeVisiblePreview();
  normalizeAutoReportField();
  wrapReportApi();
  window.setTimeout(wrapReportApi, 250);

  window.MileageCoatingSystemLabel = Object.freeze({
    coatingSystemLabel,
    normalizeReportText
  });
})();
