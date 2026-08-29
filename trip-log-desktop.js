(() => {
  "use strict";

  const DESKTOP_QUERY = "(min-width: 1180px)";
  const media = window.matchMedia(DESKTOP_QUERY);
  let scheduled = false;
  let decorating = false;

  function ensureStyles() {
    if (document.getElementById("tripLogDesktopStyles")) return;
    const style = document.createElement("style");
    style.id = "tripLogDesktopStyles";
    style.textContent = `
      @media (min-width: 1180px) {
        #logSection {
          width: min(1880px, calc(100vw - 28px));
          max-width: none !important;
          margin-left: 50%;
          margin-right: 0;
          transform: translateX(-50%);
          padding: 16px 18px 18px;
        }
        #logSection .section-heading { margin-bottom: 10px; }
        #logSection .log-toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          margin-bottom: 10px;
        }
        #logSection .search-input { min-width: 0; }
        #logSection .table-wrap {
          max-height: calc(100vh - 265px);
          overflow: auto;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--card);
        }
        #tripTable {
          width: 100%;
          min-width: 1240px;
          table-layout: fixed;
          font-size: .78rem;
          border-collapse: separate;
          border-spacing: 0;
        }
        #tripTable thead th {
          position: sticky;
          top: 0;
          z-index: 6;
          padding: 9px 7px;
          white-space: nowrap;
          background: var(--card);
          box-shadow: inset 0 -1px 0 var(--line);
        }
        #tripTable tbody > tr.trip-main-row > td {
          padding: 8px 7px;
          vertical-align: middle;
          white-space: nowrap;
          line-height: 1.25;
        }
        #tripTable tbody > tr.trip-main-row:hover > td {
          background: color-mix(in srgb, var(--card), var(--info) 5%);
        }

        /* Desktop summary columns. Full information remains in Details. */
        #tripTable th:nth-child(5), #tripTable td:nth-child(5),
        #tripTable th:nth-child(6), #tripTable td:nth-child(6),
        #tripTable th:nth-child(8), #tripTable td:nth-child(8),
        #tripTable th:nth-child(9), #tripTable td:nth-child(9),
        #tripTable th:nth-child(10), #tripTable td:nth-child(10),
        #tripTable th:nth-child(13), #tripTable td:nth-child(13),
        #tripTable th:nth-child(14), #tripTable td:nth-child(14),
        #tripTable th:nth-child(15), #tripTable td:nth-child(15) {
          display: none;
        }

        #tripTable th:nth-child(1), #tripTable td:nth-child(1) { width: 92px; }
        #tripTable th:nth-child(2), #tripTable td:nth-child(2) { width: 126px; }
        #tripTable th:nth-child(3), #tripTable td:nth-child(3) { width: 82px; }
        #tripTable th:nth-child(4), #tripTable td:nth-child(4) { width: 82px; }
        #tripTable th:nth-child(7), #tripTable td:nth-child(7) { width: 78px; }
        #tripTable th:nth-child(11), #tripTable td:nth-child(11) { width: 150px; white-space: normal; }
        #tripTable th:nth-child(12), #tripTable td:nth-child(12) { width: 142px; white-space: normal; }
        #tripTable th:nth-child(16), #tripTable td:nth-child(16) { width: 82px; }
        #tripTable th[data-trip-inspection-header], #tripTable td.trip-inspection-cell { width: 310px; }
        #tripTable th:last-child, #tripTable td:last-child { width: 164px; }

        #tripTable .trip-inspection-cell { min-width: 0; white-space: normal; }
        #tripTable .trip-inspection-stack { gap: 5px; }
        #tripTable .trip-inspection-item { padding: 5px 6px; border-radius: 7px; }
        #tripTable .trip-inspection-label { margin: 3px 0 5px; font-size: .72rem; }
        #tripTable .trip-inspection-actions { gap: 4px; }
        #tripTable .trip-inspection-actions .button,
        #tripTable .trip-row-actions .button { padding: 6px 8px; font-size: .72rem; }
        #tripTable .trip-row-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          align-items: center;
        }
        #tripTable .desktop-details-button { min-width: 58px; }

        #tripTable .trip-detail-row > td {
          display: table-cell !important;
          padding: 0 !important;
          border-top: 0;
          white-space: normal !important;
          background: color-mix(in srgb, var(--card), var(--bg) 26%);
        }
        #tripTable .trip-detail-row.hidden { display: none; }
        #tripTable .trip-detail-panel {
          padding: 12px 14px 14px;
          border-top: 1px dashed var(--line);
        }
        #tripTable .trip-detail-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 8px;
        }
        #tripTable .trip-detail-item {
          min-width: 0;
          padding: 8px 9px;
          border: 1px solid var(--line);
          border-radius: 9px;
          background: var(--card);
        }
        #tripTable .trip-detail-item.wide { grid-column: span 2; }
        #tripTable .trip-detail-item.full { grid-column: 1 / -1; }
        #tripTable .trip-detail-item > span {
          display: block;
          margin-bottom: 4px;
          color: var(--muted);
          font-size: .68rem;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        #tripTable .trip-detail-value {
          overflow-wrap: anywhere;
          font-size: .8rem;
        }
        #tripTable .trip-detail-value .sta-actions-cell,
        #tripTable .trip-detail-value .map-links {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
      }
    `;
    document.head.appendChild(style);
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
    if (!cell) {
      holder.textContent = "—";
      return holder;
    }
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

  function decorate() {
    scheduled = false;
    if (decorating || !media.matches) return;
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) return;

    decorating = true;
    try {
      const columnCount = table.tHead?.rows?.[0]?.cells?.length || 18;
      [...tbody.rows].forEach((row) => {
        if (row.classList.contains("trip-detail-row")) {
          const detailCell = row.cells[0];
          if (detailCell) detailCell.colSpan = columnCount;
          return;
        }

        const editButton = row.querySelector("[data-edit-trip]");
        const tripId = editButton?.dataset.editTrip || "";
        if (!tripId) return;
        row.classList.add("trip-main-row");

        const actions = row.querySelector(".trip-row-actions");
        if (actions && !actions.querySelector("[data-trip-details]")) {
          const detailsButton = document.createElement("button");
          detailsButton.type = "button";
          detailsButton.className = "button button-secondary button-small desktop-details-button";
          detailsButton.dataset.tripDetails = tripId;
          detailsButton.textContent = "Details";
          actions.insertBefore(detailsButton, actions.firstChild);
        }

        let detailRow = tbody.querySelector(`tr.trip-detail-row[data-trip-detail-for="${CSS.escape(tripId)}"]`);
        if (!detailRow) {
          detailRow = createDetailRow(row, tripId, columnCount);
          row.insertAdjacentElement("afterend", detailRow);
        } else if (detailRow.cells[0]) {
          detailRow.cells[0].colSpan = columnCount;
        }
      });
    } finally {
      decorating = false;
    }
  }

  function removeDesktopRows() {
    const table = document.getElementById("tripTable");
    if (!table) return;
    table.querySelectorAll("tbody .trip-detail-row").forEach((row) => row.remove());
    table.querySelectorAll("tbody .trip-main-row").forEach((row) => row.classList.remove("trip-main-row"));
    table.querySelectorAll("[data-trip-details]").forEach((button) => button.remove());
  }

  function schedule(delay = 0) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(decorate, delay);
  }

  function install() {
    ensureStyles();
    const table = document.getElementById("tripTable");
    const tbody = table?.tBodies?.[0];
    if (!table || !tbody) {
      setTimeout(install, 300);
      return;
    }

    if (media.matches) decorate();

    const observer = new MutationObserver(() => {
      if (media.matches) schedule(20);
    });
    observer.observe(tbody, { childList: true });

    table.addEventListener("click", (event) => {
      const button = event.target.closest("[data-trip-details]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const detailRow = tbody.querySelector(`tr.trip-detail-row[data-trip-detail-for="${CSS.escape(button.dataset.tripDetails)}"]`);
      if (!detailRow) return;
      const opening = detailRow.classList.contains("hidden");
      detailRow.classList.toggle("hidden", !opening);
      button.textContent = opening ? "Hide Details" : "Details";
      button.setAttribute("aria-expanded", opening ? "true" : "false");
    });

    media.addEventListener("change", (event) => {
      if (event.matches) schedule(0);
      else removeDesktopRows();
    });

    window.addEventListener("mileage:state-changed", () => {
      if (media.matches) schedule(50);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
