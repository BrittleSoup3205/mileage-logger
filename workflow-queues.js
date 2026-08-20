(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const DATA = window.MileageWorkflowData;
  if (!DATA) return;

  let selectedConcurTrips = new Set();
  let visibleWeekStart = DATA.weekStartISO(new Date());
  let renderTimer = null;

  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function makeId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function todayISO() {
    return DATA.todayISO();
  }

  function readState() {
    try {
      return DATA.migrateState(JSON.parse(window.localStorage.getItem(STATE_KEY) || "{}"));
    } catch (error) {
      console.error("Workflow queues could not read Mileage Logger data:", error);
      return DATA.migrateState({ trips: [], settings: { inspections: [] } });
    }
  }

  function writeState(state) {
    const next = DATA.migrateState(state);
    const changedISO = new Date().toISOString();
    next.workflow.lastChangedISO = changedISO;
    next.backup = next.backup && typeof next.backup === "object" ? next.backup : {};
    next.backup.pendingChangeCount = Math.max(0, Number(next.backup.pendingChangeCount || 0)) + 1;
    next.backup.lastRequiredISO = changedISO;
    window.localStorage.setItem(STATE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("mileage:state-changed"));
    window.dispatchEvent(new CustomEvent("mileage:workflow-changed"));
    scheduleRender();
  }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3400);
  }

  function displayDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[2]}/${match[3]}/${match[1]}` : (value || "—");
  }

  function displayMoney(value) {
    return value === null || value === undefined || value === "" ? "Rate needed" : `$${Number(value).toFixed(2)}`;
  }

  function optionList(values, selected) {
    return values.map((value) => `<option${value === selected ? " selected" : ""}>${escapeHTML(value)}</option>`).join("");
  }

  function downloadCsv(filename, content) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function injectInterface() {
    if ($("workflowQueuesSection")) return;
    const settings = $("settingsSection");
    if (!settings) return;
    settings.insertAdjacentHTML("beforebegin", `
      <section id="workflowQueuesSection" class="card hidden" aria-labelledby="workflowQueuesTitle">
        <div class="section-heading">
          <div><p class="eyebrow">Administrative work — separate from inspections</p><h2 id="workflowQueuesTitle">Concur &amp; Timesheet Queues</h2></div>
          <button id="closeWorkflowQueuesBtn" class="button button-secondary button-small" type="button">Close</button>
        </div>
        <p class="muted">These administrative queues do not affect inspection completion, reports, mileage, or synchronization. Trips and inspections only suggest entries; you confirm reimbursement and actual work hours.</p>

        <section class="workflow-subsection">
          <div class="section-heading compact"><div><p class="eyebrow">Trip-level tracking</p><h3>Concur Mileage Reimbursement</h3></div><span id="concurQueueCount" class="pill"></span></div>
          <div class="workflow-settings-row">
            <label>Mileage reimbursement rate ($/mile)<input id="workflowMileageRate" inputmode="decimal" placeholder="Enter current approved rate"></label>
            <button id="saveMileageRateBtn" class="button button-secondary button-small" type="button">Save Rate</button>
            <button id="exportConcurCsvBtn" class="button button-secondary button-small" type="button">Export Concur CSV</button>
          </div>
          <div id="concurRateNotice" class="gps-status"></div>
          <div id="concurBatchBar" class="workflow-batch-bar"></div>
          <div id="concurQueueList" class="workflow-entry-list"></div>
          <details class="workflow-history-details"><summary>Submitted, reimbursed, and non-reimbursable history</summary><div id="concurHistoryList" class="workflow-entry-list"></div></details>
        </section>

        <section class="workflow-subsection">
          <div class="section-heading compact"><div><p class="eyebrow">User-confirmed work hours</p><h3>Weekly Timesheet Queue</h3></div><span id="timesheetWeekStatus" class="pill"></span></div>
          <div class="week-navigation">
            <button id="previousTimesheetWeekBtn" class="button button-secondary button-small" type="button">Previous</button>
            <label>Week of<input id="timesheetWeekInput" type="date"></label>
            <button id="nextTimesheetWeekBtn" class="button button-secondary button-small" type="button">Next</button>
            <button id="exportTimesheetCsvBtn" class="button button-secondary button-small" type="button">Export Timesheet CSV</button>
          </div>
          <div id="timesheetWeekSummary" class="workflow-week-summary"></div>
          <details class="manual-time-entry" open>
            <summary>Add work with no trip</summary>
            <form id="manualTimeEntryForm" class="inspection-form-grid">
              <label>Date<input id="manualTimeDate" type="date" required></label>
              <label>Activity<select id="manualTimeActivity"><option>Report Writing</option><option>Document Review</option><option>Phone / Coordination</option><option>Meeting</option><option>Admin</option><option>Training</option><option>PTO</option><option>Other</option></select></label>
              <label>AJ / S&B / Project<input id="manualTimeProject" placeholder="Optional"></label>
              <label>Client<input id="manualTimeClient" placeholder="Optional"></label>
              <label>Vendor / Location<input id="manualTimeVendor" placeholder="Optional"></label>
              <label>Timesheet hours<input id="manualTimeHours" inputmode="decimal" required placeholder="0.0"></label>
              <label>Charge code<input id="manualTimeCharge" placeholder="Optional"></label>
              <label>Regular / OT<select id="manualTimeRegularOt"><option>Regular</option><option>OT</option></select></label>
              <label class="full">Notes<textarea id="manualTimeNotes" rows="2" placeholder="Optional"></textarea></label>
              <button class="button inspection-button button-small" type="submit">Add Time Entry</button>
            </form>
          </details>
          <div id="timesheetDayList" class="timesheet-day-list"></div>
          <div class="form-actions wrap">
            <button id="submitTimesheetWeekBtn" class="button inspection-button" type="button">Mark Entire Week Submitted</button>
          </div>
        </section>
      </section>`);

    const quick = document.querySelector(".quick-actions");
    quick?.insertAdjacentHTML("beforeend", `<button id="workflowQueuesBtn" class="button button-secondary button-large" type="button">Administrative Queues</button>`);
    const nav = document.querySelector(".bottom-nav");
    nav?.insertAdjacentHTML("beforeend", `<button id="workflowQueuesNavBtn" type="button">Queues</button>`);
  }

  function hideOtherPrimarySections() {
    ["startSection", "endSection", "staSection", "logSection", "inspectionSection"].forEach((id) => $(id)?.classList.add("hidden"));
  }

  function showQueues() {
    hideOtherPrimarySections();
    $("workflowQueuesSection")?.classList.remove("hidden");
    renderAll();
    setTimeout(() => $("workflowQueuesSection")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  }

  function renderConcur() {
    const state = readState();
    const rows = DATA.concurRows(state);
    const queue = rows.filter(({ trip }) => trip.reimbursement.reimbursable && trip.reimbursement.status === "Not Submitted");
    const history = rows.filter(({ trip }) => !trip.reimbursement.reimbursable || trip.reimbursement.status !== "Not Submitted");
    const currentIds = new Set(queue.map(({ trip }) => trip.id));
    selectedConcurTrips = new Set([...selectedConcurTrips].filter((id) => currentIds.has(id)));
    $("workflowMileageRate").value = state.workflow.mileageRate;
    $("concurQueueCount").textContent = `${queue.length} TO ENTER`;
    $("concurRateNotice").className = `gps-status ${state.workflow.mileageRate === "" ? "warn" : "good"}`;
    $("concurRateNotice").textContent = state.workflow.mileageRate === ""
      ? "Enter the currently approved mileage rate to calculate estimates. No rate is hard-coded."
      : `Estimates use $${Number(state.workflow.mileageRate).toFixed(3)} per business mile.`;

    $("concurBatchBar").innerHTML = queue.length ? `
      <label class="workflow-select-all"><input id="selectAllConcurTrips" type="checkbox"${selectedConcurTrips.size === queue.length ? " checked" : ""}> Select all pending</label>
      <label>Submitted date<input id="concurBatchDate" type="date" value="${todayISO()}"></label>
      <label>Concur report / batch<input id="concurBatchName" placeholder="Optional"></label>
      <button id="markConcurSubmittedBtn" class="button inspection-button button-small" type="button"${selectedConcurTrips.size ? "" : " disabled"}>Mark ${selectedConcurTrips.size || "Selected"} Submitted</button>`
      : `<div class="inspection-empty compact">No reimbursable trips are waiting for Concur entry.</div>`;
    $("concurQueueList").innerHTML = queue.map((row) => concurCard(row, true)).join("");
    $("concurHistoryList").innerHTML = history.length ? history.map((row) => concurCard(row, false)).join("") : `<div class="inspection-empty compact">No reimbursement history yet.</div>`;
  }

  function concurCard({ trip, context, estimated }, selectable) {
    const item = trip.reimbursement;
    const aj = context.activeJobs.join(" | ");
    const project = context.sbProjects.join(" | ");
    return `<article class="workflow-entry-card" data-concur-trip="${escapeHTML(trip.id)}">
      <div class="workflow-entry-heading">
        ${selectable ? `<input class="concur-select" type="checkbox" value="${escapeHTML(trip.id)}"${selectedConcurTrips.has(trip.id) ? " checked" : ""} aria-label="Select trip">` : ""}
        <div><p class="eyebrow">${escapeHTML(displayDate(DATA.toISODate(trip.date)))} • ${escapeHTML(trip.miles)} business miles</p><h4>${escapeHTML(trip.vendor || "Destination not entered")}</h4><small>${escapeHTML(trip.purpose || "Purpose not entered")}</small></div>
        <div><span class="pill">${escapeHTML(item.status)}</span><strong class="workflow-estimate">${escapeHTML(displayMoney(estimated))}</strong></div>
      </div>
      <div class="workflow-context-grid"><span><strong>Client / project:</strong> ${escapeHTML(context.clients.join(" | ") || "—")}</span><span><strong>AJ:</strong> ${escapeHTML(aj || "—")}</span><span><strong>S&B:</strong> ${escapeHTML(project || "—")}</span></div>
      <details><summary>Edit reimbursement details & history</summary>
        <div class="inspection-form-grid concur-editor">
          <label>Reimbursable<select class="concur-reimbursable"><option value="yes"${item.reimbursable ? " selected" : ""}>Yes</option><option value="no"${!item.reimbursable ? " selected" : ""}>No</option></select></label>
          <label>Status<select class="concur-status">${optionList(DATA.REIMBURSEMENT_STATUSES, item.status)}</select></label>
          <label>Submitted date<input class="concur-submitted-date" type="date" value="${escapeHTML(item.submittedDate)}"></label>
          <label>Reimbursed date<input class="concur-reimbursed-date" type="date" value="${escapeHTML(item.reimbursedDate)}"></label>
          <label>Concur report / batch<input class="concur-report" value="${escapeHTML(item.concurReport)}"></label>
          <label class="full">Notes<textarea class="concur-notes" rows="2">${escapeHTML(item.notes)}</textarea></label>
          <button class="button button-secondary button-small save-concur-entry" type="button">Save Reimbursement Details</button>
        </div>
        ${item.history.length ? `<div class="workflow-status-history"><strong>Status history</strong>${item.history.map((entry) => `<small>${escapeHTML(entry.status)}${entry.date ? ` • ${escapeHTML(displayDate(entry.date))}` : ""}${entry.concurReport ? ` • ${escapeHTML(entry.concurReport)}` : ""}</small>`).join("")}</div>` : ""}
      </details>
    </article>`;
  }

  function renderTimesheet() {
    const state = readState();
    const summary = DATA.weekSummary(state, visibleWeekStart);
    visibleWeekStart = summary.weekStart;
    $("timesheetWeekInput").value = visibleWeekStart;
    $("manualTimeDate").value = summary.dates.includes($("manualTimeDate").value) ? $("manualTimeDate").value : visibleWeekStart;
    $("timesheetWeekStatus").textContent = summary.weekStatus.status.toUpperCase();
    const incompleteLabels = (summary.incompleteDetails || []).map((item) => {
      const day = new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
      return `${day} — ${(item.reasons || ["Hours need confirmation"]).join("; ")}`;
    });
    const warning = summary.incompleteDays.length
      ? `${summary.incompleteDays.length} day${summary.incompleteDays.length === 1 ? "" : "s"} need confirmed hours: ${incompleteLabels.join(" | ")}`
      : "All required days have confirmed hours.";
    $("timesheetWeekSummary").innerHTML = `<strong>${summary.total.toFixed(2)} hours for week of ${escapeHTML(displayDate(summary.weekStart))}</strong><span class="${summary.incompleteDays.length ? "workflow-warning" : "workflow-complete"}">${escapeHTML(warning)}</span>`;
    $("submitTimesheetWeekBtn").disabled = Boolean(summary.incompleteDays.length || summary.weekStatus.status === "Submitted" || summary.weekStatus.status === "Approved");
    $("submitTimesheetWeekBtn").textContent = summary.weekStatus.status === "Approved" ? "Week Approved" : summary.weekStatus.status === "Submitted" ? "Week Submitted" : "Mark Entire Week Submitted";
    $("timesheetDayList").innerHTML = summary.days.map((day) => {
      const label = new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      return `<section class="timesheet-day${day.incomplete ? " incomplete" : ""}">
        <div class="timesheet-day-heading"><div><h4>${escapeHTML(label)}</h4><small>${day.incomplete ? "Hours need confirmation" : "Complete"}</small></div><strong>${day.total.toFixed(2)} h</strong></div>
        ${day.entries.length ? day.entries.map(timesheetEntryCard).join("") : `<div class="inspection-empty compact">No suggested or manual activity.</div>`}
      </section>`;
    }).join("");
  }

  function timesheetEntryCard(entry) {
    return `<article class="timesheet-entry" data-timesheet-entry="${escapeHTML(entry.id)}">
      <div class="workflow-entry-heading"><div><p class="eyebrow">${escapeHTML(entry.sourceType === "manual" ? "NO TRIP" : `SUGGESTED FROM ${entry.sourceType.toUpperCase()}`)}</p><h4>${escapeHTML(entry.activity || "Activity needs review")}</h4><small>${escapeHTML(entry.vendorLocation || "No location")} ${entry.suggestedStart || entry.suggestedEnd ? `• ${escapeHTML(entry.suggestedStart || "?")}–${escapeHTML(entry.suggestedEnd || "?")}` : ""}</small></div><span class="pill">${escapeHTML(entry.status)}</span></div>
      <details${entry.status === "Not Entered" ? " open" : ""}><summary>Confirm or edit time entry</summary>
        <div class="inspection-form-grid timesheet-editor">
          <label>Date<input class="time-date" type="date" value="${escapeHTML(entry.date)}"></label>
          <label>AJ / S&B / Project<input class="time-project" value="${escapeHTML(entry.ajSbProject)}"></label>
          <label>Client<input class="time-client" value="${escapeHTML(entry.client)}"></label>
          <label>Vendor / Location<input class="time-vendor" value="${escapeHTML(entry.vendorLocation)}"></label>
          <label class="full">Activity<input class="time-activity" value="${escapeHTML(entry.activity)}"></label>
          <label>Suggested start<input class="time-start" value="${escapeHTML(entry.suggestedStart)}" placeholder="Optional"></label>
          <label>Suggested end<input class="time-end" value="${escapeHTML(entry.suggestedEnd)}" placeholder="Optional"></label>
          <label>Timesheet hours<input class="time-hours" inputmode="decimal" value="${escapeHTML(entry.hours)}" placeholder="Confirm hours"></label>
          <label>Charge code<input class="time-charge" value="${escapeHTML(entry.chargeCode)}" placeholder="Optional"></label>
          <label>Regular / OT<select class="time-regular-ot">${optionList(["Regular", "OT"], entry.laborType)}</select></label>
          <label>Status<select class="time-status">${optionList(DATA.TIMESHEET_STATUSES, entry.status)}</select></label>
          <label class="full">Notes<textarea class="time-notes" rows="2">${escapeHTML(entry.notes)}</textarea></label>
          <div class="form-actions wrap"><button class="button inspection-button button-small save-timesheet-entry" type="button">Save Time Entry</button>${entry.sourceType === "manual" ? `<button class="button button-danger-outline button-small delete-timesheet-entry" type="button">Delete Manual Entry</button>` : ""}</div>
        </div>
        ${entry.suggestedHours ? `<p class="muted">Inspection hours on site suggested ${escapeHTML(entry.suggestedHours)} h. Confirm the actual timesheet hours above.</p>` : ""}
      </details>
    </article>`;
  }

  function saveConcurCard(card) {
    const tripId = card.dataset.concurTrip;
    const state = readState();
    const trip = state.trips.find((item) => item.id === tripId);
    if (!trip) return;
    const prior = trip.reimbursement;
    const nextStatus = card.querySelector(".concur-status").value;
    const submittedDate = card.querySelector(".concur-submitted-date").value;
    const reimbursedDate = card.querySelector(".concur-reimbursed-date").value;
    if (nextStatus === "Submitted" && !submittedDate) {
      window.alert("Enter the submitted date before marking this trip Submitted.");
      return;
    }
    if (nextStatus === "Reimbursed" && !reimbursedDate) {
      window.alert("Enter the reimbursed date before marking this trip Reimbursed.");
      return;
    }
    if (["Submitted", "Reimbursed"].includes(prior.status) && nextStatus === "Not Submitted" && !window.confirm("Move this trip back to Not Submitted? Its prior submission stays in status history.")) return;
    const changed = prior.status !== nextStatus;
    trip.reimbursement = {
      ...prior,
      reimbursable: card.querySelector(".concur-reimbursable").value === "yes",
      status: nextStatus,
      submittedDate,
      reimbursedDate,
      concurReport: card.querySelector(".concur-report").value.trim(),
      notes: card.querySelector(".concur-notes").value.trim(),
      history: [...prior.history]
    };
    if (changed) trip.reimbursement.history.push({ status: nextStatus, date: nextStatus === "Reimbursed" ? reimbursedDate : submittedDate, changedISO: new Date().toISOString(), concurReport: trip.reimbursement.concurReport, notes: trip.reimbursement.notes });
    writeState(state);
    showToast("Reimbursement details saved.");
  }

  function saveTimesheetCard(card) {
    const state = readState();
    const entries = DATA.timesheetEntries(state);
    const source = entries.find((entry) => entry.id === card.dataset.timesheetEntry);
    if (!source) return;
    const hoursText = card.querySelector(".time-hours").value.trim();
    const hours = Number(hoursText);
    if (hoursText && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      window.alert("Enter timesheet hours from 0 to 24.");
      return;
    }
    let status = card.querySelector(".time-status").value;
    if (hoursText && status === "Not Entered") status = "Entered";
    if (["Entered", "Submitted", "Approved"].includes(status) && !hoursText) {
      window.alert("Enter confirmed timesheet hours before changing this entry's status.");
      return;
    }
    const existingIndex = state.workflow.timesheetEntries.findIndex((entry) => entry.id === source.id);
    const existing = existingIndex >= 0 ? state.workflow.timesheetEntries[existingIndex] : source;
    const saved = DATA.normalizeTimesheetEntry({
      ...source,
      date: card.querySelector(".time-date").value,
      ajSbProject: card.querySelector(".time-project").value,
      client: card.querySelector(".time-client").value,
      vendorLocation: card.querySelector(".time-vendor").value,
      activity: card.querySelector(".time-activity").value,
      suggestedStart: card.querySelector(".time-start").value,
      suggestedEnd: card.querySelector(".time-end").value,
      hours: hoursText,
      chargeCode: card.querySelector(".time-charge").value,
      laborType: card.querySelector(".time-regular-ot").value,
      notes: card.querySelector(".time-notes").value,
      status,
      history: [...(existing.history || [])]
    });
    if (existing.status !== status) saved.history.push({ status, changedISO: new Date().toISOString(), notes: saved.notes });
    if (existingIndex >= 0) state.workflow.timesheetEntries[existingIndex] = saved;
    else state.workflow.timesheetEntries.push(saved);
    writeState(state);
    showToast("Timesheet entry saved.");
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAll, 40);
  }

  function renderAll() {
    if (!$("workflowQueuesSection")) return;
    renderConcur();
    renderTimesheet();
  }

  function bindEvents() {
    $("workflowQueuesBtn")?.addEventListener("click", showQueues);
    $("workflowQueuesNavBtn")?.addEventListener("click", showQueues);
    $("closeWorkflowQueuesBtn")?.addEventListener("click", () => $("workflowQueuesSection")?.classList.add("hidden"));
    $("saveMileageRateBtn")?.addEventListener("click", () => {
      const value = $("workflowMileageRate").value.trim();
      if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        window.alert("Enter a valid non-negative mileage rate, or leave it blank.");
        return;
      }
      const state = readState();
      state.workflow.mileageRate = value;
      writeState(state);
      showToast("Mileage reimbursement rate saved.");
    });
    $("exportConcurCsvBtn")?.addEventListener("click", () => {
      downloadCsv("Mileage_Logger_Concur.csv", DATA.makeConcurCSV(readState()));
      showToast("Concur CSV created.");
    });
    $("exportTimesheetCsvBtn")?.addEventListener("click", () => {
      downloadCsv("Mileage_Logger_Timesheet.csv", DATA.makeTimesheetCSV(readState()));
      showToast("Timesheet CSV created.");
    });
    $("previousTimesheetWeekBtn")?.addEventListener("click", () => {
      const date = new Date(`${visibleWeekStart}T12:00:00`); date.setDate(date.getDate() - 7); visibleWeekStart = DATA.weekStartISO(date); renderTimesheet();
    });
    $("nextTimesheetWeekBtn")?.addEventListener("click", () => {
      const date = new Date(`${visibleWeekStart}T12:00:00`); date.setDate(date.getDate() + 7); visibleWeekStart = DATA.weekStartISO(date); renderTimesheet();
    });
    $("timesheetWeekInput")?.addEventListener("change", (event) => { visibleWeekStart = DATA.weekStartISO(event.target.value); renderTimesheet(); });

    $("manualTimeEntryForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const hoursText = $("manualTimeHours").value.trim();
      const hours = Number(hoursText);
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
        window.alert("Enter timesheet hours from 0 to 24.");
        return;
      }
      const state = readState();
      state.workflow.timesheetEntries.push(DATA.normalizeTimesheetEntry({
        id: makeId("timesheet-manual"), sourceType: "manual", date: $("manualTimeDate").value,
        ajSbProject: $("manualTimeProject").value, client: $("manualTimeClient").value,
        vendorLocation: $("manualTimeVendor").value, activity: $("manualTimeActivity").value,
        hours: hoursText, chargeCode: $("manualTimeCharge").value, laborType: $("manualTimeRegularOt").value,
        notes: $("manualTimeNotes").value, status: "Entered",
        history: [{ status: "Entered", changedISO: new Date().toISOString(), notes: $("manualTimeNotes").value }]
      }));
      visibleWeekStart = DATA.weekStartISO($("manualTimeDate").value);
      writeState(state);
      event.target.reset();
      showToast("No-trip work added to the timesheet.");
    });

    $("workflowQueuesSection")?.addEventListener("change", (event) => {
      if (event.target.classList.contains("concur-select")) {
        if (event.target.checked) selectedConcurTrips.add(event.target.value); else selectedConcurTrips.delete(event.target.value);
        renderConcur();
      }
      if (event.target.id === "selectAllConcurTrips") {
        const state = readState();
        const pending = DATA.concurRows(state).filter(({ trip }) => trip.reimbursement.reimbursable && trip.reimbursement.status === "Not Submitted").map(({ trip }) => trip.id);
        selectedConcurTrips = event.target.checked ? new Set(pending) : new Set();
        renderConcur();
      }
    });

    $("workflowQueuesSection")?.addEventListener("click", (event) => {
      const saveConcur = event.target.closest(".save-concur-entry");
      if (saveConcur) { saveConcurCard(saveConcur.closest("[data-concur-trip]")); return; }
      const saveTime = event.target.closest(".save-timesheet-entry");
      if (saveTime) { saveTimesheetCard(saveTime.closest("[data-timesheet-entry]")); return; }
      const deleteTime = event.target.closest(".delete-timesheet-entry");
      if (deleteTime) {
        const card = deleteTime.closest("[data-timesheet-entry]");
        if (!window.confirm("Delete this manual timesheet entry?")) return;
        const state = readState();
        state.workflow.timesheetEntries = state.workflow.timesheetEntries.filter((entry) => entry.id !== card.dataset.timesheetEntry);
        writeState(state); showToast("Manual timesheet entry deleted."); return;
      }
      if (event.target.id === "markConcurSubmittedBtn") {
        if (!selectedConcurTrips.size) return;
        const submittedDate = $("concurBatchDate").value;
        if (!submittedDate) { window.alert("Choose the submitted date."); return; }
        if (!window.confirm(`Mark ${selectedConcurTrips.size} selected trip${selectedConcurTrips.size === 1 ? "" : "s"} submitted to Concur?`)) return;
        const state = readState();
        let changed = 0;
        state.trips.forEach((trip) => {
          if (!selectedConcurTrips.has(trip.id) || !trip.reimbursement.reimbursable || trip.reimbursement.status !== "Not Submitted") return;
          trip.reimbursement.status = "Submitted";
          trip.reimbursement.submittedDate = submittedDate;
          trip.reimbursement.concurReport = $("concurBatchName").value.trim();
          trip.reimbursement.history.push({ status: "Submitted", date: submittedDate, changedISO: new Date().toISOString(), concurReport: trip.reimbursement.concurReport, notes: trip.reimbursement.notes });
          changed += 1;
        });
        if (!changed) { window.alert("No pending trips were changed. Submitted trips cannot be submitted twice."); return; }
        selectedConcurTrips = new Set();
        writeState(state); showToast(`${changed} trip${changed === 1 ? "" : "s"} marked Submitted.`); return;
      }
      if (event.target.id === "submitTimesheetWeekBtn") {
        const state = readState();
        const summary = DATA.weekSummary(state, visibleWeekStart);
        if (summary.incompleteDays.length) { window.alert("Confirm hours for every incomplete weekday before submitting the week."); return; }
        if (!window.confirm(`Mark the week of ${displayDate(summary.weekStart)} submitted?`)) return;
        const ids = new Set(summary.entries.map((entry) => entry.id));
        const current = new Map(DATA.timesheetEntries(state).map((entry) => [entry.id, entry]));
        ids.forEach((id) => {
          const source = current.get(id);
          if (!source || source.status === "Approved") return;
          const index = state.workflow.timesheetEntries.findIndex((entry) => entry.id === id);
          const saved = DATA.normalizeTimesheetEntry({ ...source, status: "Submitted", history: [...(source.history || []), { status: "Submitted", changedISO: new Date().toISOString(), notes: source.notes }] });
          if (index >= 0) state.workflow.timesheetEntries[index] = saved; else state.workflow.timesheetEntries.push(saved);
        });
        state.workflow.timesheetWeeks[summary.weekStart] = { status: "Submitted", submittedISO: new Date().toISOString(), approvedISO: "" };
        writeState(state); showToast("Timesheet week marked Submitted.");
      }
    });

    window.addEventListener("storage", scheduleRender);
    window.addEventListener("mileage:state-changed", scheduleRender);
  }

  function initialize() {
    injectInterface();
    bindEvents();
    renderAll();
    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "queues" || action === "concur" || action === "timesheet") setTimeout(showQueues, 80);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
