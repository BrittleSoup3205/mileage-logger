(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let scheduled = false;
  let decorating = false;

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.trips = Array.isArray(state.trips) ? state.trips : [];
      return state;
    } catch (_) {
      return { trips: [] };
    }
  }

  function tripMap() {
    return new Map(readState().trips.filter((trip) => trip?.id).map((trip) => [trip.id, trip]));
  }

  function clockMinutes(value) {
    const text = String(value || "").trim().toUpperCase();
    const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3] || "";
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour %= 12;
      if (meridiem === "PM") hour += 12;
    } else if (hour > 23) {
      return null;
    }
    return hour * 60 + minute;
  }

  function durationMinutes(trip) {
    const startClock = clockMinutes(trip?.startTime);
    const endClock = clockMinutes(trip?.endTime);
    if (startClock !== null && endClock !== null) {
      let minutes = endClock - startClock;
      if (minutes < 0) minutes += 24 * 60;
      return minutes;
    }

    const start = Date.parse(trip?.startISO || "");
    const end = Date.parse(trip?.endISO || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.max(0, Math.round((end - start) / 60000));
  }

  function formatDuration(trip) {
    const total = durationMinutes(trip);
    if (!Number.isFinite(total)) return "—";
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (!hours) return `${minutes} min`;
    return `${hours} hr${hours === 1 ? "" : "s"} ${minutes} min`;
  }

  function ensureStyles() {
    if (document.getElementById("tripDurationLogStyles")) return;
    const style = document.createElement("style");
    style.id = "tripDurationLogStyles";
    style.textContent = `
      .trip-duration-cell { font-weight:800; white-space:nowrap; }
      .responsive-trip-duration { font-weight:800; }
      @media (min-width:1180px) {
        #tripTable { min-width:1220px !important; }
        #tripTable thead th,
        #tripTable tbody > tr:not(.trip-detail-row) > td { display:table-cell !important; }
        #tripTable th:nth-child(6), #tripTable td:nth-child(6),
        #tripTable th:nth-child(7), #tripTable td:nth-child(7),
        #tripTable th:nth-child(9), #tripTable td:nth-child(9),
        #tripTable th:nth-child(10), #tripTable td:nth-child(10),
        #tripTable th:nth-child(11), #tripTable td:nth-child(11),
        #tripTable th:nth-child(14), #tripTable td:nth-child(14),
        #tripTable th:nth-child(15), #tripTable td:nth-child(15),
        #tripTable th:nth-child(16), #tripTable td:nth-child(16) { display:none !important; }
        #tripTable th:nth-child(1), #tripTable td:nth-child(1) { width:92px !important; }
        #tripTable th:nth-child(2), #tripTable td:nth-child(2) { width:120px !important; }
        #tripTable th:nth-child(3), #tripTable td:nth-child(3),
        #tripTable th:nth-child(4), #tripTable td:nth-child(4) { width:78px !important; }
        #tripTable th:nth-child(5), #tripTable td:nth-child(5) { width:96px !important; }
        #tripTable th:nth-child(8), #tripTable td:nth-child(8) { width:72px !important; }
        #tripTable th:nth-child(12), #tripTable td:nth-child(12) { width:140px !important; white-space:normal !important; }
        #tripTable th:nth-child(13), #tripTable td:nth-child(13) { width:130px !important; white-space:normal !important; }
        #tripTable th:nth-child(17), #tripTable td:nth-child(17) { width:70px !important; }
        #tripTable th[data-trip-inspection-header], #tripTable td.trip-inspection-cell { width:290px !important; }
        #tripTable th:last-child, #tripTable td:last-child { width:165px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDurationHeader(table) {
    const header = table?.tHead?.rows?.[0];
    if (!header) return;
    let durationHeader = header.querySelector("th[data-trip-duration-header]");
    if (!durationHeader) {
      durationHeader = document.createElement("th");
      durationHeader.dataset.tripDurationHeader = "1";
      durationHeader.textContent = "Duration";
      const endHeader = [...header.cells].find((cell) => cell.textContent.trim() === "End");
      if (endHeader?.nextSibling) header.insertBefore(durationHeader, endHeader.nextSibling);
      else header.appendChild(durationHeader);
    }
  }

  function headerIndex(table, label) {
    const cells = [...(table?.tHead?.rows?.[0]?.cells || [])];
    return cells.findIndex((cell) => cell.textContent.trim() === label);
  }

  function cloneCell(cell) {
    const holder = document.createElement("div");
    if (!cell) {
      holder.textContent = "—";
      return holder;
    }
    [...cell.childNodes].forEach((node) => holder.appendChild(node.cloneNode(true)));
    if (!holder.textContent.trim() && !holder.querySelector("a,button")) holder.textContent = "—";
    return holder;
  }

  function repairDesktopDetails(table, row, tripId) {
    const detailRow = table.querySelector(`tbody tr.trip-detail-row[data-trip-detail-for="${CSS.escape(tripId)}"]`);
    if (!detailRow) return;
    if (detailRow.cells[0]) detailRow.cells[0].colSpan = table.tHead?.rows?.[0]?.cells?.length || row.cells.length;
    const grid = detailRow.querySelector(".trip-detail-grid");
    if (!grid) return;

    const mappings = [
      ["Start odometer", "Start Odo", false],
      ["End odometer", "End Odo", false],
      ["GPS miles", "GPS Miles", false],
      ["Difference", "Difference", false],
      ["Customer", "Customer", false],
      ["STA", "STA", true],
      ["Maps", "Maps", true],
      ["Notes", "Notes", false]
    ];

    mappings.forEach(([detailLabel, headerLabel, clone]) => {
      const item = [...grid.children].find((child) => child.querySelector(":scope > span")?.textContent.trim() === detailLabel);
      const body = item?.querySelector(".trip-detail-value");
      const index = headerIndex(table, headerLabel);
      if (!body || index < 0) return;
      const source = row.cells[index];
      body.replaceChildren();
      if (clone) body.appendChild(cloneCell(source));
      else body.textContent = source?.textContent.trim() || "—";
    });
  }

  function decorateNative(table, byId) {
    ensureDurationHeader(table);
    const headerCount = table.tHead?.rows?.[0]?.cells?.length || 0;
    [...(table.tBodies?.[0]?.rows || [])].forEach((row) => {
      if (row.classList.contains("trip-detail-row")) {
        if (row.cells[0]) row.cells[0].colSpan = headerCount;
        return;
      }
      const editButton = row.querySelector("[data-edit-trip]");
      const tripId = editButton?.dataset.editTrip || "";
      const trip = byId.get(tripId);
      if (!trip) return;
      let cell = row.querySelector("td[data-trip-duration-cell]");
      if (!cell) {
        cell = document.createElement("td");
        cell.dataset.tripDurationCell = "1";
        cell.className = "trip-duration-cell";
        const endIndex = headerIndex(table, "End");
        const endCell = endIndex >= 0 ? row.cells[endIndex] : row.cells[3];
        if (endCell?.nextSibling) row.insertBefore(cell, endCell.nextSibling);
        else row.appendChild(cell);
      }
      cell.textContent = formatDuration(trip);
      repairDesktopDetails(table, row, tripId);
    });
  }

  function decorateResponsive(byId) {
    document.querySelectorAll("#responsiveTripLog .responsive-trip-card[data-responsive-trip]").forEach((card) => {
      const trip = byId.get(card.dataset.responsiveTrip);
      const meta = card.querySelector(".responsive-trip-meta");
      if (!trip || !meta) return;

      let start = meta.querySelector("[data-trip-start-time]");
      let end = meta.querySelector("[data-trip-end-time]");
      let duration = meta.querySelector("[data-trip-duration]");
      const legacyTime = [...meta.children].find((child) => !child.hasAttribute("data-trip-start-time") && !child.hasAttribute("data-trip-end-time") && !child.hasAttribute("data-trip-duration") && child.textContent.includes("→"));

      if (!start) {
        start = document.createElement("span");
        start.dataset.tripStartTime = "1";
        if (legacyTime) meta.insertBefore(start, legacyTime);
        else meta.appendChild(start);
      }
      if (!end) {
        end = document.createElement("span");
        end.dataset.tripEndTime = "1";
        start.insertAdjacentElement("afterend", end);
      }
      if (!duration) {
        duration = document.createElement("span");
        duration.dataset.tripDuration = "1";
        duration.className = "responsive-trip-duration";
        end.insertAdjacentElement("afterend", duration);
      }
      if (legacyTime) legacyTime.remove();

      start.innerHTML = `<strong>Start</strong> ${String(trip.startTime || "—")}`;
      end.innerHTML = `<strong>End</strong> ${String(trip.endTime || "—")}`;
      duration.innerHTML = `<strong>Duration</strong> ${formatDuration(trip)}`;
    });
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      ensureStyles();
      const byId = tripMap();
      const table = document.getElementById("tripTable");
      if (table) decorateNative(table, byId);
      decorateResponsive(byId);
    } finally {
      decorating = false;
    }
  }

  function schedule(delay = 60) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      decorate();
    }, delay);
  }

  function install() {
    ensureStyles();
    const table = document.getElementById("tripTable");
    if (!table) {
      setTimeout(install, 250);
      return;
    }
    schedule(80);
    const tbody = table.tBodies?.[0];
    if (tbody) new MutationObserver(() => schedule(60)).observe(tbody, { childList:true });
    const responsive = document.getElementById("responsiveTripLog");
    if (responsive) new MutationObserver(() => schedule(40)).observe(responsive, { childList:true, subtree:false });
    window.addEventListener("mileage:state-changed", () => schedule(70));
    window.addEventListener("storage", (event) => { if (event.key === STATE_KEY) schedule(70); });
    window.addEventListener("resize", () => schedule(100));
    window.addEventListener("orientationchange", () => schedule(120));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();