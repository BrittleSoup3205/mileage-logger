(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let decorating = false;

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
      return state;
    } catch (_) {
      return { settings: { inspections: [] } };
    }
  }

  function linkedInspections(tripId) {
    if (!tripId) return [];
    return readState().settings.inspections.filter((inspection) => inspection?.tripId === tripId);
  }

  function inspectionLabel(inspection) {
    return [
      inspection.activeJobId,
      inspection.sbInspectionNo || inspection.projectNumber,
      inspection.inspectionType || inspection.activity || "Inspection"
    ].map((value) => String(value || "").trim()).filter(Boolean).join(" • ");
  }

  function reportReady(inspection) {
    return Boolean(
      inspection && inspection.id && (
        inspection.date || inspection.inspectionDate || inspection.reportingVendor || inspection.vendor ||
        inspection.activity || inspection.summary || inspection.observations || inspection.generatedReportLanguage
      )
    );
  }

  function ensureStyles() {
    if (document.getElementById("tripInspectionLinkStyles")) return;
    const style = document.createElement("style");
    style.id = "tripInspectionLinkStyles";
    style.textContent = `
      #tripTable .trip-inspection-cell{min-width:210px;vertical-align:top}
      .trip-inspection-stack{display:grid;gap:8px}
      .trip-inspection-item{border:1px solid rgba(20,33,61,.14);border-radius:8px;padding:8px;background:rgba(255,255,255,.62)}
      .trip-inspection-label{display:block;font-size:.78rem;line-height:1.25;margin:5px 0 7px;overflow-wrap:anywhere}
      .trip-inspection-actions{display:flex;flex-wrap:wrap;gap:5px}
      .trip-inspection-status{display:inline-block;border-radius:999px;padding:2px 7px;font-size:.68rem;font-weight:700;letter-spacing:.02em;background:#e8f2ec;color:#235a38}
      .trip-inspection-status.multi{background:#e9eef8;color:#294f8d}
      .trip-inspection-none{color:#687386;font-size:.78rem}
      body.dark .trip-inspection-item{background:rgba(17,26,43,.7);border-color:rgba(255,255,255,.12)}
    `;
    document.head.appendChild(style);
  }

  function ensureHeader(table) {
    const row = table?.tHead?.rows?.[0];
    if (!row || row.querySelector("th[data-trip-inspection-header]")) return;
    const th = document.createElement("th");
    th.textContent = "Inspection";
    th.dataset.tripInspectionHeader = "1";
    const actionHeader = row.cells[row.cells.length - 1];
    row.insertBefore(th, actionHeader || null);
  }

  function renderCell(cell, inspections) {
    if (!inspections.length) {
      cell.innerHTML = `<span class="trip-inspection-none">No linked inspection</span>`;
      return;
    }
    const status = inspections.length === 1 ? "INSPECTION" : `${inspections.length} INSPECTIONS`;
    cell.innerHTML = `
      <div class="trip-inspection-stack">
        <span class="trip-inspection-status${inspections.length > 1 ? " multi" : ""}">${status}</span>
        ${inspections.map((inspection) => `
          <div class="trip-inspection-item" data-linked-inspection-id="${escapeHTML(inspection.id)}">
            <span class="trip-inspection-label">${escapeHTML(inspectionLabel(inspection))}</span>
            <div class="trip-inspection-actions">
              <button class="button button-secondary button-small" type="button" data-trip-open-inspection="${escapeHTML(inspection.id)}">Open Inspection</button>
              ${reportReady(inspection) ? `<button class="button inspection-button button-small" type="button" data-trip-export-inspection="${escapeHTML(inspection.id)}">Word Report</button>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function decorateRows() {
    if (decorating) return;
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) return;
    decorating = true;
    try {
      ensureHeader(table);
      [...tbody.rows].forEach((row) => {
        const editButton = row.querySelector("[data-edit-trip]");
        const tripId = editButton?.dataset.editTrip || "";
        if (!tripId) return;
        let cell = row.querySelector("td[data-trip-inspection-cell]");
        if (!cell) {
          cell = document.createElement("td");
          cell.dataset.tripInspectionCell = "1";
          cell.className = "trip-inspection-cell";
          const actionCell = editButton.closest("td");
          row.insertBefore(cell, actionCell || null);
        }
        renderCell(cell, linkedInspections(tripId));
      });
    } finally {
      decorating = false;
    }
  }

  function findNativeInspectionButton(attribute, inspectionId) {
    const selector = `[${attribute}="${CSS.escape(inspectionId)}"]`;
    return [...document.querySelectorAll(selector)].find((button) => !button.closest("#tripTable")) || null;
  }

  function activateNativeAction(attribute, inspectionId) {
    let target = findNativeInspectionButton(attribute, inspectionId);
    if (target) {
      target.click();
      return true;
    }

    // Inspection UI may still be completing its first render. Give it a short chance to appear.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      target = findNativeInspectionButton(attribute, inspectionId);
      if (target) {
        clearInterval(timer);
        target.click();
      } else if (attempts >= 8) {
        clearInterval(timer);
        window.alert("The linked inspection is saved, but its inspection workspace is not available on this screen yet. Open Inspections once, then return to Trip Log and try again.");
      }
    }, 250);
    return false;
  }

  function install() {
    ensureStyles();
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) {
      setTimeout(install, 300);
      return;
    }

    decorateRows();
    const observer = new MutationObserver(() => queueMicrotask(decorateRows));
    observer.observe(tbody, { childList: true, subtree: true });

    table.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-trip-open-inspection]");
      if (openButton) {
        event.preventDefault();
        event.stopPropagation();
        activateNativeAction("data-edit-inspection", openButton.dataset.tripOpenInspection);
        return;
      }
      const reportButton = event.target.closest("[data-trip-export-inspection]");
      if (reportButton) {
        event.preventDefault();
        event.stopPropagation();
        activateNativeAction("data-export-inspection", reportButton.dataset.tripExportInspection);
      }
    });

    window.addEventListener("mileage:state-changed", () => setTimeout(decorateRows, 50));
    window.addEventListener("storage", (event) => {
      if (event.key === STATE_KEY) setTimeout(decorateRows, 50);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
