(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const PHONE_MAX_WIDTH = 699;
  const PHONE_MAX_HEIGHT_LANDSCAPE = 559;
  const DESKTOP_MIN_WIDTH = 1180;
  let scheduled = false;
  let decorating = false;
  let lastMode = "";

  function isIPadLike() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    return /iPad/i.test(ua)
      || ((platform === "MacIntel" || /Macintosh/i.test(ua)) && touchPoints > 1);
  }

  function mode() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    if (width <= PHONE_MAX_WIDTH || (height <= PHONE_MAX_HEIGHT_LANDSCAPE && width < DESKTOP_MIN_WIDTH)) return "phone";
    if (isIPadLike()) return "tablet";
    if (width <= DESKTOP_MIN_WIDTH) return "tablet";
    return "desktop";
  }

  function setModeMarker(current) {
    document.documentElement.dataset.tripLogMode = current;
  }

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
    ].map((item) => String(item || "").trim()).filter(Boolean).join(" • ");
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
    if (document.getElementById("tripLogResponsiveStyles")) return;
    const style = document.createElement("style");
    style.id = "tripLogResponsiveStyles";
    style.textContent = `
      #responsiveTripLog { display:none; }

      html[data-trip-log-mode="desktop"] #responsiveTripLog { display:none !important; }
      html[data-trip-log-mode="desktop"] #logSection {
        width:min(1880px, calc(100vw - 28px)); max-width:none !important;
        margin-left:50%; margin-right:0; transform:translateX(-50%); padding:16px 18px 18px;
      }
      html[data-trip-log-mode="desktop"] #logSection .section-heading { margin-bottom:10px; }
      html[data-trip-log-mode="desktop"] #logSection .log-toolbar {
        display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; margin-bottom:10px;
      }
      html[data-trip-log-mode="desktop"] #logSection .table-wrap {
        display:block !important; max-height:calc(100vh - 265px); overflow:auto;
        border:1px solid var(--line); border-radius:12px; background:var(--card);
      }
      html[data-trip-log-mode="desktop"] #tripTable {
        width:100%; min-width:1120px; table-layout:fixed; font-size:.78rem;
        border-collapse:separate; border-spacing:0;
      }
      html[data-trip-log-mode="desktop"] #tripTable thead th {
        position:sticky; top:0; z-index:6; padding:9px 7px; white-space:nowrap;
        background:var(--card); box-shadow:inset 0 -1px 0 var(--line);
      }
      html[data-trip-log-mode="desktop"] #tripTable tbody > tr.trip-main-row > td {
        padding:8px 7px; vertical-align:middle; white-space:nowrap; line-height:1.25;
      }
      html[data-trip-log-mode="desktop"] #tripTable tbody > tr.trip-main-row:hover > td {
        background:color-mix(in srgb, var(--card), var(--info) 5%);
      }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(5),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(5),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(6),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(6),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(8),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(8),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(9),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(9),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(10),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(10),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(13),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(13),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(14),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(14),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(15),
      html[data-trip-log-mode="desktop"] #tripTable td:nth-child(15) { display:none; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(1), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(1) { width:92px; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(2), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(2) { width:120px; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(3), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(3),
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(4), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(4) { width:78px; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(7), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(7) { width:72px; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(11), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(11) { width:140px; white-space:normal; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(12), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(12) { width:130px; white-space:normal; }
      html[data-trip-log-mode="desktop"] #tripTable th:nth-child(16), html[data-trip-log-mode="desktop"] #tripTable td:nth-child(16) { width:70px; }
      html[data-trip-log-mode="desktop"] #tripTable th[data-trip-inspection-header],
      html[data-trip-log-mode="desktop"] #tripTable td.trip-inspection-cell { width:290px; }
      html[data-trip-log-mode="desktop"] #tripTable th:last-child,
      html[data-trip-log-mode="desktop"] #tripTable td:last-child { width:165px; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-inspection-cell { min-width:0; white-space:normal; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-inspection-stack { gap:4px; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-inspection-item { padding:4px 5px; border-radius:7px; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-inspection-label { margin:2px 0 4px; font-size:.70rem; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-inspection-actions .button,
      html[data-trip-log-mode="desktop"] #tripTable .trip-row-actions .button { min-height:30px; padding:5px 7px; font-size:.70rem; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-row-actions { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-row > td {
        display:table-cell !important; padding:0 !important; border-top:0; white-space:normal !important;
        background:color-mix(in srgb, var(--card), var(--bg) 26%);
      }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-row.hidden { display:none; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-panel { padding:12px 14px 14px; border-top:1px dashed var(--line); }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-item { min-width:0; padding:8px 9px; border:1px solid var(--line); border-radius:9px; background:var(--card); }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-item.wide { grid-column:span 2; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-item.full { grid-column:1/-1; }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-item > span {
        display:block; margin-bottom:4px; color:var(--muted); font-size:.68rem; font-weight:800;
        letter-spacing:.04em; text-transform:uppercase;
      }
      html[data-trip-log-mode="desktop"] #tripTable .trip-detail-value { overflow-wrap:anywhere; font-size:.8rem; }

      html[data-trip-log-mode="tablet"] #logSection .table-wrap,
      html[data-trip-log-mode="phone"] #logSection .table-wrap { display:none !important; }
      html[data-trip-log-mode="tablet"] #responsiveTripLog,
      html[data-trip-log-mode="phone"] #responsiveTripLog { display:grid !important; gap:10px; margin-top:10px; }
      html[data-trip-log-mode="tablet"] #logSection,
      html[data-trip-log-mode="phone"] #logSection { overflow:visible; }
      html[data-trip-log-mode="tablet"] .responsive-trip-card,
      html[data-trip-log-mode="phone"] .responsive-trip-card {
        border:1px solid var(--line); border-radius:13px; background:var(--card); overflow:hidden; min-width:0;
      }
      html[data-trip-log-mode="tablet"] .responsive-trip-main,
      html[data-trip-log-mode="phone"] .responsive-trip-main { padding:12px 13px; }
      html[data-trip-log-mode="tablet"] .responsive-trip-heading,
      html[data-trip-log-mode="phone"] .responsive-trip-heading {
        display:flex; align-items:flex-start; justify-content:space-between; gap:12px; min-width:0;
      }
      .responsive-trip-date { font-size:.84rem; color:var(--muted); font-weight:800; }
      .responsive-trip-project { margin-top:2px; font-size:1.02rem; font-weight:900; overflow-wrap:anywhere; }
      .responsive-trip-miles { flex:0 0 auto; font-size:1rem; font-weight:900; }
      .responsive-trip-meta { display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:8px; font-size:.88rem; min-width:0; }
      .responsive-trip-meta strong { font-weight:850; }
      .responsive-inspections { display:grid; gap:6px; margin-top:10px; min-width:0; }
      .responsive-inspection {
        padding:8px 9px; border:1px solid var(--line); border-radius:9px;
        background:color-mix(in srgb, var(--card), var(--bg) 28%); min-width:0;
      }
      .responsive-inspection-label { display:block; margin-bottom:6px; font-size:.78rem; font-weight:800; overflow-wrap:anywhere; }
      .responsive-inspection-actions, .responsive-trip-actions { display:flex; flex-wrap:wrap; gap:6px; min-width:0; }
      .responsive-trip-actions { margin-top:10px; }
      .responsive-trip-actions .button, .responsive-inspection-actions .button {
        min-height:34px; padding:7px 10px; font-size:.78rem; white-space:normal;
      }
      .responsive-trip-details {
        display:none; padding:11px 13px 13px; border-top:1px dashed var(--line);
        background:color-mix(in srgb, var(--card), var(--bg) 26%);
      }
      .responsive-trip-card.details-open .responsive-trip-details { display:block; }
      .responsive-detail-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .responsive-detail { padding:8px; border:1px solid var(--line); border-radius:9px; background:var(--card); min-width:0; }
      .responsive-detail.full { grid-column:1/-1; }
      .responsive-detail span { display:block; margin-bottom:3px; color:var(--muted); font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
      .responsive-detail strong, .responsive-detail div { overflow-wrap:anywhere; font-size:.82rem; }

      html[data-trip-log-mode="tablet"] #logSection { width:min(100%, 1120px); max-width:1120px; }
      html[data-trip-log-mode="tablet"] .responsive-trip-main {
        display:grid; grid-template-columns:minmax(150px, 190px) minmax(0,1fr) minmax(300px, 38%);
        gap:14px; align-items:start;
      }
      html[data-trip-log-mode="tablet"] .responsive-trip-heading { display:block; }
      html[data-trip-log-mode="tablet"] .responsive-trip-meta { margin-top:0; align-content:start; }
      html[data-trip-log-mode="tablet"] .responsive-inspections { margin-top:0; }
      html[data-trip-log-mode="tablet"] .responsive-trip-actions { grid-column:2 / -1; margin-top:0; }
      html[data-trip-log-mode="tablet"] .responsive-inspection-actions .button { flex:1 1 130px; }

      html[data-trip-log-mode="phone"] #logSection {
        width:auto; margin-left:0; margin-right:0; transform:none; padding:14px;
      }
      html[data-trip-log-mode="phone"] #logSection .section-heading { align-items:flex-start; }
      html[data-trip-log-mode="phone"] #logSection .log-toolbar { display:grid; grid-template-columns:1fr; gap:8px; }
      html[data-trip-log-mode="phone"] #logSection .log-toolbar .button { width:100%; }
      html[data-trip-log-mode="phone"] .responsive-detail-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      html[data-trip-log-mode="phone"] .responsive-trip-main { padding:11px; }
      html[data-trip-log-mode="phone"] .responsive-trip-meta { display:grid; grid-template-columns:1fr 1fr; gap:5px 10px; }
      html[data-trip-log-mode="phone"] .responsive-trip-actions .button,
      html[data-trip-log-mode="phone"] .responsive-inspection-actions .button { flex:1 1 auto; }

      @media (orientation:landscape) and (max-height:559px) {
        html[data-trip-log-mode="phone"] body { padding-bottom:64px; }
        html[data-trip-log-mode="phone"] .bottom-nav { gap:5px; padding:6px 8px calc(6px + env(safe-area-inset-bottom)); }
        html[data-trip-log-mode="phone"] .bottom-nav button { min-height:38px; padding:6px 8px; font-size:.74rem; }
        html[data-trip-log-mode="phone"] #responsiveTripLog { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
      }
    `;
    document.head.appendChild(style);
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

  function detailItem(label, value, cssClass = "") {
    const wrapper = document.createElement("div");
    wrapper.className = `trip-detail-item${cssClass ? ` ${cssClass}` : ""}`;
    const title = document.createElement("span");
    title.textContent = label;
    const body = document.createElement("div");
    body.className = "trip-detail-value";
    if (value instanceof Node) body.appendChild(value);
    else body.textContent = String(value ?? "—") || "—";
    wrapper.append(title, body);
    return wrapper;
  }

  function clonedCellContent(cell) {
    const holder = document.createElement("div");
    if (!cell) { holder.textContent = "—"; return holder; }
    [...cell.childNodes].forEach((node) => holder.appendChild(node.cloneNode(true)));
    if (!holder.textContent.trim() && !holder.querySelector("a,button")) holder.textContent = "—";
    return holder;
  }

  function createDetailRow(row, tripId, columnCount) {
    const detailRow = document.createElement("tr");
    detailRow.className = "trip-detail-row hidden";
    detailRow.dataset.tripDetailFor = tripId;
    const cell = document.createElement("td");
    cell.colSpan = columnCount;
    const panel = document.createElement("div");
    panel.className = "trip-detail-panel";
    const grid = document.createElement("div");
    grid.className = "trip-detail-grid";
    const cells = row.cells;
    grid.append(
      detailItem("Start odometer", cells[4]?.textContent.trim() || "—"),
      detailItem("End odometer", cells[5]?.textContent.trim() || "—"),
      detailItem("GPS miles", cells[7]?.textContent.trim() || "—"),
      detailItem("Difference", cells[8]?.textContent.trim() || "—"),
      detailItem("Customer", cells[9]?.textContent.trim() || "—"),
      detailItem("STA", clonedCellContent(cells[12]), "wide"),
      detailItem("Maps", clonedCellContent(cells[13]), "wide"),
      detailItem("Notes", cells[14]?.textContent.trim() || "—", "full")
    );
    panel.appendChild(grid);
    cell.appendChild(panel);
    detailRow.appendChild(cell);
    return detailRow;
  }

  function decorateDesktop() {
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) return;
    const columnCount = table.tHead?.rows?.[0]?.cells?.length || 18;
    [...tbody.rows].forEach((row) => {
      if (row.classList.contains("trip-detail-row")) {
        if (row.cells[0]) row.cells[0].colSpan = columnCount;
        return;
      }
      const editButton = row.querySelector("[data-edit-trip]");
      const tripId = editButton?.dataset.editTrip || "";
      if (!tripId) return;
      row.classList.add("trip-main-row");
      const actions = row.querySelector(".trip-row-actions");
      if (actions && !actions.querySelector("[data-trip-details]")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-secondary button-small";
        button.dataset.tripDetails = tripId;
        button.textContent = "Details";
        actions.insertBefore(button, actions.firstChild);
      }
      if (!tbody.querySelector(`tr.trip-detail-row[data-trip-detail-for="${CSS.escape(tripId)}"]`)) {
        row.insertAdjacentElement("afterend", createDetailRow(row, tripId, columnCount));
      }
    });
  }

  function cleanupDesktop() {
    const table = document.getElementById("tripTable");
    if (!table) return;
    table.querySelectorAll("tbody .trip-detail-row").forEach((row) => row.remove());
    table.querySelectorAll("tbody .trip-main-row").forEach((row) => row.classList.remove("trip-main-row"));
    table.querySelectorAll("[data-trip-details]").forEach((button) => button.remove());
  }

  function inspectionMarkup(inspections) {
    if (!inspections.length) return `<div class="responsive-inspections"><span class="trip-inspection-none">No linked inspection</span></div>`;
    return `<div class="responsive-inspections">${inspections.map((inspection) => `
      <div class="responsive-inspection">
        <span class="responsive-inspection-label">${escapeHTML(displayInspectionLabel(inspection))}</span>
        <div class="responsive-inspection-actions">
          <button class="button button-secondary button-small" type="button" data-responsive-open-inspection="${escapeHTML(inspection.id)}">Open Inspection</button>
          <button class="button inspection-button button-small" type="button" data-responsive-report-inspection="${escapeHTML(inspection.id)}">Word Report</button>
        </div>
      </div>`).join("")}</div>`;
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
            <div><div class="responsive-trip-date">${escapeHTML(trip.date || "")}</div><div class="responsive-trip-project">${escapeHTML(trip.projectNumber || "No project")}</div></div>
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

  function renderResponsive() {
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
  }

  function clickNative(selector) {
    const target = [...document.querySelectorAll(selector)].find((node) => !node.closest("#responsiveTripLog"));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }

  function schedule(delay = 0) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      decorate();
    }, delay);
  }

  function cleanupResponsive() {
    const container = document.getElementById("responsiveTripLog");
    if (container) container.innerHTML = "";
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      const current = mode();
      setModeMarker(current);
      if (current !== lastMode) {
        if (current === "desktop") cleanupResponsive();
        else cleanupDesktop();
        lastMode = current;
      }
      if (current === "desktop") decorateDesktop();
      else renderResponsive();
    } finally {
      decorating = false;
    }
  }

  function install() {
    ensureStyles();
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) {
      setTimeout(install, 300);
      return;
    }
    ensureResponsiveContainer();
    decorate();

    const observer = new MutationObserver(() => schedule(25));
    observer.observe(tbody, { childList:true });

    table.addEventListener("click", (event) => {
      const button = event.target.closest("[data-trip-details]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const row = tbody.querySelector(`tr.trip-detail-row[data-trip-detail-for="${CSS.escape(button.dataset.tripDetails)}"]`);
      if (!row) return;
      const opening = row.classList.contains("hidden");
      row.classList.toggle("hidden", !opening);
      button.textContent = opening ? "Hide Details" : "Details";
    });

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
        const identifier = button.getAttribute(responsiveAttr);
        if (!clickNative(`[${nativeAttr}="${CSS.escape(identifier)}"]`)) {
          if (nativeAttr === "data-trip-open-inspection") clickNative(`[data-edit-inspection="${CSS.escape(identifier)}"]`);
          else if (nativeAttr === "data-trip-export-inspection") clickNative(`[data-export-inspection="${CSS.escape(identifier)}"]`);
        }
        return;
      }
    });

    document.getElementById("searchBox")?.addEventListener("input", () => {
      if (mode() !== "desktop") schedule(0);
    });
    document.getElementById("clearSearch")?.addEventListener("click", () => {
      if (mode() !== "desktop") setTimeout(() => schedule(0), 0);
    });
    window.addEventListener("resize", () => schedule(80));
    window.addEventListener("orientationchange", () => schedule(120));
    window.addEventListener("mileage:state-changed", () => schedule(50));
    window.addEventListener("storage", (event) => {
      if (event.key === STATE_KEY) schedule(50);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();
