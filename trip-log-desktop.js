(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let scheduled = false;
  let rendering = false;

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.trips = Array.isArray(state.trips) ? state.trips : [];
      state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
      return state;
    } catch (_) {
      return { trips: [], settings: { inspections: [] } };
    }
  }

  function inspectionsByTrip(state) {
    const map = new Map();
    state.settings.inspections.forEach((inspection) => {
      if (!inspection?.tripId) return;
      if (!map.has(inspection.tripId)) map.set(inspection.tripId, []);
      map.get(inspection.tripId).push(inspection);
    });
    return map;
  }

  function displayInspectionLabel(inspection) {
    return [
      inspection.activeJobId,
      inspection.sbInspectionNo || inspection.projectNumber,
      inspection.inspectionType || inspection.activity || "Inspection"
    ].map((value) => String(value || "").trim()).filter(Boolean).join(" • ");
  }

  function fmtNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) : "—";
  }

  function tripSearchText(trip, inspections) {
    return [
      trip.date, trip.projectNumber, trip.startTime, trip.endTime, trip.customer, trip.vendor,
      trip.purpose, trip.notes,
      ...inspections.flatMap((inspection) => [
        inspection.activeJobId, inspection.sbInspectionNo, inspection.projectNumber,
        inspection.reportingVendor, inspection.vendor, inspection.inspectionType, inspection.activity
      ])
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function mapUrl(location) {
    const lat = Number(location?.latitude ?? location?.lat);
    const lon = Number(location?.longitude ?? location?.lng ?? location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
  }

  function ensureStyles() {
    let style = document.getElementById("tripLogResponsiveStyles");
    if (!style) {
      style = document.createElement("style");
      style.id = "tripLogResponsiveStyles";
      document.head.appendChild(style);
    }
    style.textContent = `
      #logSection { width:min(1480px, calc(100vw - 28px)) !important; max-width:1480px !important; overflow:visible !important; }
      #logSection .table-wrap { display:none !important; }
      #responsiveTripLog { display:grid !important; gap:10px; margin-top:10px; }
      #logSection .log-toolbar { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; margin-bottom:10px; }

      .responsive-trip-card { min-width:0; border:1px solid var(--line); border-radius:13px; background:var(--card); overflow:hidden; }
      .responsive-trip-main { min-width:0; padding:12px 13px; display:grid; grid-template-columns:minmax(165px,210px) minmax(0,1fr) minmax(330px,430px); gap:14px; align-items:start; }
      .responsive-trip-heading { min-width:0; }
      .responsive-trip-date { font-size:.84rem; color:var(--muted); font-weight:800; }
      .responsive-trip-project { margin-top:2px; font-size:1.02rem; font-weight:900; overflow-wrap:anywhere; }
      .responsive-trip-miles { margin-top:6px; font-size:1rem; font-weight:900; }
      .responsive-trip-meta { min-width:0; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 14px; font-size:.88rem; }
      .responsive-trip-meta span { min-width:0; overflow-wrap:anywhere; }
      .responsive-trip-meta strong { font-weight:850; }
      .responsive-inspections { min-width:0; display:grid; gap:6px; }
      .responsive-inspection { min-width:0; padding:8px 9px; border:1px solid var(--line); border-radius:9px; background:color-mix(in srgb, var(--card), var(--bg) 28%); }
      .responsive-inspection-count { display:block; margin-bottom:5px; color:var(--muted); font-size:.68rem; font-weight:850; letter-spacing:.03em; text-transform:uppercase; }
      .responsive-inspection-label { display:block; margin-bottom:6px; font-size:.78rem; font-weight:800; overflow-wrap:anywhere; }
      .responsive-inspection-actions, .responsive-trip-actions { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
      .responsive-inspection-actions .button, .responsive-trip-actions .button { min-height:34px; padding:7px 10px; font-size:.78rem; white-space:normal; }
      .responsive-inspection-actions .button { flex:1 1 130px; }
      .responsive-trip-actions { grid-column:2 / -1; margin-top:0; }

      .responsive-trip-details { display:none; padding:11px 13px 13px; border-top:1px dashed var(--line); background:color-mix(in srgb, var(--card), var(--bg) 26%); }
      .responsive-trip-card.details-open .responsive-trip-details { display:block; }
      .responsive-detail-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
      .responsive-detail { min-width:0; padding:8px; border:1px solid var(--line); border-radius:9px; background:var(--card); }
      .responsive-detail.full { grid-column:1/-1; }
      .responsive-detail span { display:block; margin-bottom:3px; color:var(--muted); font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
      .responsive-detail strong, .responsive-detail div { overflow-wrap:anywhere; font-size:.82rem; }

      @media (max-width:999px) {
        #logSection { width:auto !important; max-width:none !important; margin-left:0 !important; margin-right:0 !important; transform:none !important; }
        #logSection .log-toolbar { grid-template-columns:1fr; }
        #logSection .log-toolbar .button { width:100%; }
        .responsive-trip-main { display:block; padding:11px; }
        .responsive-trip-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .responsive-trip-miles { flex:0 0 auto; margin-top:0; }
        .responsive-trip-meta { margin-top:8px; }
        .responsive-inspections { margin-top:10px; }
        .responsive-trip-actions { margin-top:10px; }
        .responsive-detail-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      }

      @media (max-width:599px) {
        .responsive-trip-meta { grid-template-columns:1fr; }
        .responsive-detail-grid { grid-template-columns:1fr; }
        .responsive-trip-actions .button, .responsive-inspection-actions .button { flex:1 1 auto; }
      }
    `;
  }

  function ensureResponsiveContainer() {
    const wrap = document.querySelector("#logSection .table-wrap");
    if (!wrap) return null;
    let container = document.getElementById("responsiveTripLog");
    if (!container) {
      container = document.createElement("div");
      container.id = "responsiveTripLog";
      container.setAttribute("aria-live", "polite");
      wrap.insertAdjacentElement("beforebegin", container);
    }
    return container;
  }

  function cleanupLegacyDesktopDecorations() {
    const table = document.getElementById("tripTable");
    if (!table) return;
    table.querySelectorAll("tbody .trip-detail-row").forEach((row) => row.remove());
    table.querySelectorAll("tbody .trip-main-row").forEach((row) => row.classList.remove("trip-main-row"));
    table.querySelectorAll("[data-trip-details]").forEach((button) => button.remove());
    document.documentElement.dataset.tripLogMode = "cards";
  }

  function inspectionMarkup(inspections) {
    if (!inspections.length) {
      return `<div class="responsive-inspections"><span class="trip-inspection-none">No linked inspection</span></div>`;
    }
    const count = inspections.length === 1 ? "1 inspection" : `${inspections.length} inspections`;
    return `<div class="responsive-inspections">
      <span class="responsive-inspection-count">${count}</span>
      ${inspections.map((inspection) => `
        <div class="responsive-inspection">
          <span class="responsive-inspection-label">${escapeHTML(displayInspectionLabel(inspection))}</span>
          <div class="responsive-inspection-actions">
            <button class="button button-secondary button-small" type="button" data-responsive-open-inspection="${escapeHTML(inspection.id)}">Open Inspection</button>
            <button class="button inspection-button button-small" type="button" data-responsive-report-inspection="${escapeHTML(inspection.id)}">Word Report</button>
          </div>
        </div>`).join("")}
    </div>`;
  }

  function responsiveCard(trip, inspections) {
    const gps = Number(trip.gpsRouteMiles || 0);
    const diff = gps > 0 ? Math.abs(Number(trip.miles || 0) - gps) : null;
    const startMap = mapUrl(trip.startLocation);
    const endMap = mapUrl(trip.endLocation);
    return `
      <article class="responsive-trip-card" data-responsive-trip="${escapeHTML(trip.id)}">
        <div class="responsive-trip-main">
          <div class="responsive-trip-heading">
            <div>
              <div class="responsive-trip-date">${escapeHTML(trip.date || "")}</div>
              <div class="responsive-trip-project">${escapeHTML(trip.projectNumber || "No project")}</div>
            </div>
            <div class="responsive-trip-miles">${fmtNumber(trip.miles)} mi</div>
          </div>
          <div class="responsive-trip-meta">
            <span><strong>${escapeHTML(trip.vendor || "—")}</strong></span>
            <span>${escapeHTML(trip.purpose || "—")}</span>
            <span>${escapeHTML(trip.startTime || "—")} → ${escapeHTML(trip.endTime || "—")}</span>
            <span>${escapeHTML(trip.customer || "—")}</span>
          </div>
          ${inspectionMarkup(inspections)}
          <div class="responsive-trip-actions">
            <button class="button button-secondary button-small" type="button" data-responsive-details="${escapeHTML(trip.id)}">Details</button>
            ${(trip.photos || []).length ? `<button class="button button-secondary button-small" type="button" data-responsive-photos="${escapeHTML(trip.id)}">Photos ${(trip.photos || []).length}</button>` : ""}
            <button class="button button-secondary button-small" type="button" data-responsive-edit="${escapeHTML(trip.id)}">Edit</button>
          </div>
        </div>
        <div class="responsive-trip-details">
          <div class="responsive-detail-grid">
            <div class="responsive-detail"><span>Start odometer</span><strong>${fmtNumber(trip.startOdometer)}</strong></div>
            <div class="responsive-detail"><span>End odometer</span><strong>${fmtNumber(trip.endOdometer)}</strong></div>
            <div class="responsive-detail"><span>GPS miles</span><strong>${gps > 0 ? fmtNumber(gps) : "—"}</strong></div>
            <div class="responsive-detail"><span>Difference</span><strong>${diff !== null ? fmtNumber(diff) : "—"}</strong></div>
            <div class="responsive-detail"><span>STA</span><div>${trip.staGenerated ? "Generated" : "Not generated"}<br><button class="button button-secondary button-small" type="button" data-responsive-sta="${escapeHTML(trip.id)}">${trip.staGenerated ? "Generate Again" : "Create STA"}</button></div></div>
            <div class="responsive-detail"><span>Maps</span><div>${startMap ? `<a href="${startMap}" target="_blank" rel="noopener">Start</a>` : "—"}${endMap ? ` · <a href="${endMap}" target="_blank" rel="noopener">End</a>` : ""}</div></div>
            <div class="responsive-detail full"><span>Notes</span><div>${escapeHTML(trip.notes || "—")}</div></div>
            <div class="responsive-detail full"><span>Record actions</span><div class="responsive-trip-actions"><button class="button button-danger-outline button-small" type="button" data-responsive-delete="${escapeHTML(trip.id)}">Delete Trip</button></div></div>
          </div>
        </div>
      </article>`;
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      ensureStyles();
      cleanupLegacyDesktopDecorations();
      const container = ensureResponsiveContainer();
      if (!container) return;
      const state = readState();
      const byTrip = inspectionsByTrip(state);
      const query = document.getElementById("searchBox")?.value.trim().toLowerCase() || "";
      const trips = [...state.trips]
        .filter((trip) => !query || tripSearchText(trip, byTrip.get(trip.id) || []).includes(query))
        .sort((a, b) => String(b.endISO || b.date || "").localeCompare(String(a.endISO || a.date || "")));
      container.innerHTML = trips.map((trip) => responsiveCard(trip, byTrip.get(trip.id) || [])).join("")
        || `<div class="empty-state">No trips match this search.</div>`;
    } finally {
      rendering = false;
    }
  }

  function schedule(delay = 0) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      render();
    }, delay);
  }

  function clickNative(selector) {
    const target = [...document.querySelectorAll(selector)].find((node) => !node.closest("#responsiveTripLog"));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }

  function install() {
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) {
      setTimeout(install, 250);
      return;
    }

    ensureStyles();
    ensureResponsiveContainer();
    render();

    const observer = new MutationObserver(() => schedule(25));
    observer.observe(tbody, { childList:true });

    const responsive = document.getElementById("responsiveTripLog");
    responsive.addEventListener("click", (event) => {
      const details = event.target.closest("[data-responsive-details]");
      if (details) {
        const card = details.closest(".responsive-trip-card");
        const opening = !card.classList.contains("details-open");
        card.classList.toggle("details-open", opening);
        details.textContent = opening ? "Hide Details" : "Details";
        return;
      }

      const mappings = [
        ["data-responsive-edit", "data-edit-trip"],
        ["data-responsive-delete", "data-delete-trip"],
        ["data-responsive-photos", "data-open-trip-photos"],
        ["data-responsive-sta", "data-open-sta"],
        ["data-responsive-open-inspection", "data-trip-open-inspection"],
        ["data-responsive-report-inspection", "data-trip-export-inspection"]
      ];

      for (const [responsiveAttr, nativeAttr] of mappings) {
        const button = event.target.closest(`[${responsiveAttr}]`);
        if (!button) continue;
        const value = button.getAttribute(responsiveAttr);
        if (!clickNative(`[${nativeAttr}="${CSS.escape(value)}"]`)) {
          if (nativeAttr === "data-trip-open-inspection") clickNative(`[data-edit-inspection="${CSS.escape(value)}"]`);
          else if (nativeAttr === "data-trip-export-inspection") clickNative(`[data-export-inspection="${CSS.escape(value)}"]`);
        }
        return;
      }
    });

    document.getElementById("searchBox")?.addEventListener("input", () => schedule(0));
    document.getElementById("clearSearch")?.addEventListener("click", () => setTimeout(() => schedule(0), 0));
    window.addEventListener("resize", () => schedule(80));
    window.addEventListener("orientationchange", () => schedule(120));
    window.addEventListener("mileage:state-changed", () => schedule(50));
    window.addEventListener("storage", (event) => { if (event.key === STATE_KEY) schedule(50); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
