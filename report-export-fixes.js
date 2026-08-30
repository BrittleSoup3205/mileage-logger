(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const PRIVATE_FILE_DB_NAME = "MileageLoggerPrivateFiles";
  const PRIVATE_FILE_DB_VERSION = 1;
  const PRIVATE_FILE_DB_STORE = "privateFiles";
  const INSPECTION_REPORT_TEMPLATE_KEY = "inspectionReportTemplate";
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const S_AND_B_OLD_PHOTO_CX = String(Math.round(3.65 * 914400));
  const S_AND_B_OLD_PHOTO_CY = String(Math.round(2.25 * 914400));
  const S_AND_B_SAFE_PHOTO_CX = String(Math.round(3.25 * 914400));
  const S_AND_B_SAFE_PHOTO_CY = String(Math.round(2.0 * 914400));

  function readState() {
    try {
      const state = JSON.parse(window.localStorage.getItem(STATE_KEY) || "{}");
      state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
      return state;
    } catch (error) {
      throw new Error(`Mileage Logger data could not be read: ${error.message}`);
    }
  }

  function safeFilePart(value, fallback = "record") {
    const cleaned = String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 70);
    return cleaned || fallback;
  }

  function packageBaseName(inspection) {
    return [
      "Inspection",
      inspection.date || new Date().toISOString().slice(0, 10),
      inspection.vendor || inspection.inspectionLocation || "Facility",
      inspection.projectNumber || inspection.equipmentTag || "Record"
    ].map((part, index) => safeFilePart(part, index === 0 ? "Inspection" : "Record")).join("_");
  }

  function openTemplateDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(PRIVATE_FILE_DB_NAME, PRIVATE_FILE_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PRIVATE_FILE_DB_STORE)) {
          database.createObjectStore(PRIVATE_FILE_DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Private Word template storage could not be opened."));
    });
  }

  async function readTemplateRecord() {
    const database = await openTemplateDatabase();
    if (!database) return null;
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(PRIVATE_FILE_DB_STORE, "readonly");
        const request = transaction.objectStore(PRIVATE_FILE_DB_STORE).get(INSPECTION_REPORT_TEMPLATE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Private Word template could not be read."));
      });
    } finally {
      database.close();
    }
  }

  function wordElements(parent, localName) {
    return Array.from(parent?.getElementsByTagNameNS?.(WORD_NS, localName) || []);
  }

  function wordNodeText(parent) {
    return wordElements(parent, "t").map((node) => node.textContent || "").join("");
  }

  function normalizedWordText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function hasWordAncestor(node, localName) {
    let parent = node?.parentElement || null;
    while (parent) {
      if (parent.namespaceURI === WORD_NS && parent.localName === localName) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function findWordParagraph(document, label) {
    const expected = normalizedWordText(label);
    return wordElements(document, "p").find((paragraph) => (
      !hasWordAncestor(paragraph, "tc")
      && normalizedWordText(wordNodeText(paragraph)) === expected
    )) || null;
  }

  function nextWordParagraph(paragraph) {
    let node = paragraph?.nextSibling || null;
    while (node) {
      if (node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "p") return node;
      node = node.nextSibling;
    }
    return null;
  }

  function setWordParagraphText(paragraph, value) {
    const document = paragraph.ownerDocument;
    const firstRun = wordElements(paragraph, "r")[0];
    const runProperties = firstRun ? wordElements(firstRun, "rPr")[0]?.cloneNode(true) : null;
    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === "pPr")) {
        paragraph.removeChild(node);
      }
    });
    String(value ?? "").split(/\r?\n/).forEach((line, index) => {
      const run = document.createElementNS(WORD_NS, "w:r");
      if (runProperties) run.appendChild(runProperties.cloneNode(true));
      if (index) run.appendChild(document.createElementNS(WORD_NS, "w:br"));
      const text = document.createElementNS(WORD_NS, "w:t");
      text.setAttributeNS(XML_NS, "xml:space", "preserve");
      text.textContent = line || " ";
      run.appendChild(text);
      paragraph.appendChild(run);
    });
  }

  function setParagraphAfterLabel(document, label, value) {
    if (!String(value || "").trim()) return false;
    const labelParagraph = findWordParagraph(document, label);
    const valueParagraph = nextWordParagraph(labelParagraph);
    if (!valueParagraph) return false;
    setWordParagraphText(valueParagraph, value);
    return true;
  }

  function patchSAndBReport(bytes) {
    if (!window.fflate) return bytes;
    const files = window.fflate.unzipSync(new Uint8Array(bytes));
    const documentBytes = files["word/document.xml"];
    if (!documentBytes) return bytes;

    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(decoder.decode(documentBytes), "application/xml");
    if (documentXml.getElementsByTagName("parsererror")[0]) {
      throw new Error("The generated S&B Word report could not be finalized.");
    }

    Array.from(documentXml.getElementsByTagName("*")).forEach((element) => {
      if (element.getAttribute("cx") === S_AND_B_OLD_PHOTO_CX && element.getAttribute("cy") === S_AND_B_OLD_PHOTO_CY) {
        element.setAttribute("cx", S_AND_B_SAFE_PHOTO_CX);
        element.setAttribute("cy", S_AND_B_SAFE_PHOTO_CY);
      }
    });

    files["word/document.xml"] = encoder.encode(new XMLSerializer().serializeToString(documentXml));
    return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 4000);
  }

  async function deliver(filename, bytes) {
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const blob = new Blob([bytes], { type });
    const file = new File([blob], filename, { type });
    const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)")?.matches;
    const forceDownload = new URLSearchParams(window.location.search).get("download") === "1";
    if (!forceDownload && touchDevice && navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        showToast("Word report ready to save or share.");
        return true;
      } catch (error) {
        if (error?.name === "AbortError") {
          showToast("Word report was not saved.");
          return false;
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Word report downloaded.");
    return true;
  }

  function markExported(inspectionId) {
    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
    if (!inspection) return;
    const exportedISO = new Date().toISOString();
    inspection.handoffExportedISO = exportedISO;
    inspection.handoffExportedModifiedISO = inspection.modifiedISO || inspection.createdISO || exportedISO;
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  async function buildWordReport(state, inspection) {
    const api = window.MileageInspectionReportTesting;
    const photoApi = window.MileageInspectionPhotoExportHotfix;
    if (!api?.buildInspectionDocx || !api?.buildSAndBInspectionDocx) {
      throw new Error("The Mileage Logger Word report engine is unavailable. Reload the app and try again.");
    }
    if (!photoApi?.loadReportPhotos) {
      throw new Error("The Mileage Logger photo report loader is unavailable. Reload the app and try again.");
    }

    const photos = await photoApi.loadReportPhotos(state, inspection);
    const filename = `${packageBaseName(inspection)}_Editable_Report.docx`;
    const template = await readTemplateRecord();
    if (!template?.bytes) {
      return { filename, bytes: await api.buildInspectionDocx(inspection, photos) };
    }

    const bytes = await api.buildSAndBInspectionDocx(template, inspection, photos, filename);
    let finalized = patchSAndBReport(bytes);
    if (window.MileageReportHeaderAutofill?.patchReport) {
      finalized = window.MileageReportHeaderAutofill.patchReport(finalized, inspection);
    }
    return { filename, bytes: finalized };
  }

  async function exportWord(inspectionId, button) {
    const state = readState();
    const inspection = state.settings.inspections.find((item) => item.id === inspectionId);
    if (!inspection) throw new Error("The selected inspection could not be found.");
    const original = button?.textContent || "Export Word Report";
    if (button) {
      button.disabled = true;
      button.textContent = "Building Word Report...";
    }
    try {
      const report = await buildWordReport(state, inspection);
      const delivered = await deliver(report.filename, report.bytes);
      if (delivered) markExported(inspection.id);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }

  function updateCloudPhaseText() {
    const card = document.getElementById("multiDeviceSyncCard");
    if (!card) return false;
    const note = Array.from(card.querySelectorAll(".privacy-note, .compact-note")).find((element) => (
      String(element.textContent || "").includes("Actual photo files")
    ));
    if (!note) return false;
    note.innerHTML = "<strong>Current phase:</strong> trips, active trip, inspections, vendor-load details, Active Jobs, Facility Profiles, import audit history, Concur status, timesheet entries/weeks, and durable app preferences synchronize. Photo files now synchronize through private cloud storage and remain cached locally for offline use. The private STA master PDF and other documents remain device-local.";
    return true;
  }

  function scheduleCloudPhaseTextUpdate() {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (updateCloudPhaseText() || attempts >= 20) window.clearInterval(timer);
    }, 250);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-export-inspection], [data-preview-export-inspection]");
    if (!button) return;
    const inspectionId = button.dataset.exportInspection || button.dataset.previewExportInspection;
    if (!inspectionId) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    exportWord(inspectionId, button).catch((error) => {
      console.error("Inspection report export fix failed:", error);
      window.alert(`The Word report could not be created.\n\n${error.message}`);
    });
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleCloudPhaseTextUpdate, { once: true });
  } else {
    scheduleCloudPhaseTextUpdate();
  }

  window.MileageInspectionReportExportFixes = Object.freeze({
    patchSAndBReport,
    updateCloudPhaseText
  });
})();
