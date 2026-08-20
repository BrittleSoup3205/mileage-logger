(() => {
  "use strict";

  const WORKFLOW_SCHEMA_VERSION = 2;
  const REIMBURSEMENT_STATUSES = ["Not Submitted", "Submitted", "Reimbursed"];
  const TIMESHEET_STATUSES = ["Not Entered", "Entered", "Submitted", "Approved"];
  const LOAD_STATUSES = ["Not Recorded", "Accepted", "Accepted with Follow-up", "Released", "Hold", "Rejected"];
  const INSPECTION_ACTIVITIES = [
    "Hydro / Pressure Test",
    "Visual / Final Inspection",
    "Dimensional Inspection",
    "Coating Inspection",
    "NDE Review",
    "Material / MTR / PMI Review",
    "Documentation Review",
    "Inspection Release",
    "Structural Steel Inspection"
  ];

  function text(value) {
    return String(value ?? "");
  }

  function unique(values) {
    return [...new Set(values.map((value) => text(value).trim()).filter(Boolean))];
  }

  function csvEscape(value) {
    const string = text(value);
    return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
  }

  function toISODate(value) {
    const raw = text(value).trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function defaultWorkflowState() {
    return {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      mileageRate: "",
      timesheetEntries: [],
      timesheetWeeks: {}
    };
  }

  function normalizeLoad(load, fallbackId = "") {
    const source = load && typeof load === "object" ? load : {};
    return {
      id: text(source.id || fallbackId),
      identifier: text(source.identifier ?? source.vendorLoadNumber).trim(),
      status: LOAD_STATUSES.includes(source.status) ? source.status : "Not Recorded",
      notes: text(source.notes).trim(),
      deficiencyFollowUp: text(source.deficiencyFollowUp ?? source.deficiency ?? source.followUp).trim(),
      photoIds: unique(Array.isArray(source.photoIds) ? source.photoIds : []),
      createdISO: text(source.createdISO),
      modifiedISO: text(source.modifiedISO)
    };
  }

  function inspectionLoads(inspection) {
    const record = inspection && typeof inspection === "object" ? inspection : {};
    const supplied = Array.isArray(record.loads) ? record.loads : [];
    const normalized = supplied
      .map((load, index) => normalizeLoad(load, `${record.id || "inspection"}-load-${index + 1}`))
      .filter((load) => load.identifier || load.notes || load.deficiencyFollowUp || load.photoIds.length);
    if (normalized.length) return normalized;

    const legacyIdentifier = text(record.vendorLoadNumber).trim();
    if (!legacyIdentifier) return [];
    return [normalizeLoad({
      id: `${record.id || "inspection"}-legacy-load`,
      identifier: legacyIdentifier,
      status: LOAD_STATUSES.includes(record.acceptanceStatus) ? record.acceptanceStatus : "Not Recorded",
      deficiencyFollowUp: record.deficiencies || "",
      createdISO: record.createdISO || "",
      modifiedISO: record.modifiedISO || ""
    })];
  }

  function inspectionActivities(inspection) {
    const record = inspection && typeof inspection === "object" ? inspection : {};
    const supplied = Array.isArray(record.activities) ? unique(record.activities) : [];
    if (supplied.length) return supplied;
    const legacy = text(record.inspectionType).trim();
    if (!legacy || legacy === "Inspection" || legacy === "Other") return [];
    const mappings = [
      [/hydro|pressure/i, "Hydro / Pressure Test"],
      [/final|visual/i, "Visual / Final Inspection"],
      [/dimension/i, "Dimensional Inspection"],
      [/coat/i, "Coating Inspection"],
      [/nde/i, "NDE Review"],
      [/material|mtr|pmi/i, "Material / MTR / PMI Review"],
      [/document/i, "Documentation Review"],
      [/release/i, "Inspection Release"],
      [/structural|steel/i, "Structural Steel Inspection"]
    ];
    const mapped = mappings.find(([pattern]) => pattern.test(legacy));
    return mapped ? [mapped[1]] : [];
  }

  function migrateInspection(inspection) {
    const record = inspection && typeof inspection === "object" ? inspection : {};
    const loads = inspectionLoads(record);
    return {
      ...record,
      schemaVersion: Math.max(5, Number(record.schemaVersion || 0)),
      activities: inspectionActivities(record),
      loads,
      // Retain the legacy field as an alias for older exports and backups.
      vendorLoadNumber: text(record.vendorLoadNumber).trim() || (loads[0]?.identifier || "")
    };
  }

  function normalizeReimbursement(reimbursement, trip = {}) {
    const source = reimbursement && typeof reimbursement === "object" ? reimbursement : {};
    const legacyReimbursable = trip.reimbursable;
    const reimbursable = source.reimbursable === false || legacyReimbursable === false
      ? false
      : true;
    const legacyStatus = text(trip.reimbursementStatus);
    const status = REIMBURSEMENT_STATUSES.includes(source.status)
      ? source.status
      : (REIMBURSEMENT_STATUSES.includes(legacyStatus) ? legacyStatus : "Not Submitted");
    return {
      reimbursable,
      status,
      submittedDate: toISODate(source.submittedDate || trip.reimbursementSubmittedDate),
      reimbursedDate: toISODate(source.reimbursedDate || trip.reimbursementReimbursedDate),
      concurReport: text(source.concurReport ?? source.reportBatch ?? trip.concurReport).trim(),
      notes: text(source.notes ?? trip.reimbursementNotes).trim(),
      history: (Array.isArray(source.history) ? source.history : []).map((item) => ({
        status: REIMBURSEMENT_STATUSES.includes(item?.status) ? item.status : "Not Submitted",
        date: toISODate(item?.date),
        changedISO: text(item?.changedISO),
        concurReport: text(item?.concurReport).trim(),
        notes: text(item?.notes).trim()
      }))
    };
  }

  function migrateTrip(trip) {
    const record = trip && typeof trip === "object" ? trip : {};
    return {
      ...record,
      reimbursement: normalizeReimbursement(record.reimbursement, record)
    };
  }

  function normalizeTimesheetEntry(entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    return {
      id: text(source.id),
      sourceType: ["trip", "inspection", "manual"].includes(source.sourceType) ? source.sourceType : "manual",
      sourceId: text(source.sourceId),
      date: toISODate(source.date),
      ajSbProject: text(source.ajSbProject).trim(),
      client: text(source.client).trim(),
      vendorLocation: text(source.vendorLocation).trim(),
      activity: text(source.activity).trim(),
      suggestedStart: text(source.suggestedStart).trim(),
      suggestedEnd: text(source.suggestedEnd).trim(),
      suggestedHours: text(source.suggestedHours).trim(),
      hours: text(source.hours).trim(),
      chargeCode: text(source.chargeCode).trim(),
      laborType: source.laborType === "OT" ? "OT" : "Regular",
      notes: text(source.notes).trim(),
      status: TIMESHEET_STATUSES.includes(source.status) ? source.status : "Not Entered",
      createdISO: text(source.createdISO),
      modifiedISO: text(source.modifiedISO),
      history: (Array.isArray(source.history) ? source.history : []).map((item) => ({
        status: TIMESHEET_STATUSES.includes(item?.status) ? item.status : "Not Entered",
        changedISO: text(item?.changedISO),
        notes: text(item?.notes).trim()
      }))
    };
  }

  function normalizeWorkflow(workflow) {
    const source = workflow && typeof workflow === "object" ? workflow : {};
    const rate = source.mileageRate === "" || source.mileageRate === null || source.mileageRate === undefined
      ? ""
      : text(source.mileageRate).trim();
    const weeks = source.timesheetWeeks && typeof source.timesheetWeeks === "object"
      ? source.timesheetWeeks
      : {};
    return {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      lastChangedISO: text(source.lastChangedISO),
      mileageRate: rate,
      timesheetEntries: (Array.isArray(source.timesheetEntries) ? source.timesheetEntries : [])
        .map(normalizeTimesheetEntry)
        .filter((entry) => entry.id),
      timesheetWeeks: Object.fromEntries(Object.entries(weeks).map(([week, value]) => [week, {
        status: TIMESHEET_STATUSES.includes(value?.status) ? value.status : "Not Entered",
        submittedISO: text(value?.submittedISO),
        approvedISO: text(value?.approvedISO)
      }]))
    };
  }

  function migrateState(state) {
    const source = state && typeof state === "object" ? state : {};
    const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
    return {
      ...source,
      activeTrip: source.activeTrip || null,
      trips: (Array.isArray(source.trips) ? source.trips : []).map(migrateTrip),
      settings: {
        ...settings,
        inspections: (Array.isArray(settings.inspections) ? settings.inspections : []).map(migrateInspection)
      },
      workflow: normalizeWorkflow(source.workflow)
    };
  }

  function linkedInspections(state, tripId) {
    return (state.settings?.inspections || []).filter((inspection) => text(inspection.tripId) === text(tripId));
  }

  function linkedInspectionContext(state, trip) {
    const inspections = linkedInspections(state, trip.id);
    return {
      inspections,
      activeJobs: unique(inspections.map((inspection) => inspection.activeJobId)),
      sbProjects: unique([
        ...inspections.map((inspection) => inspection.sbInspectionNo || inspection.projectNumber),
        trip.projectNumber
      ]),
      clients: unique([trip.customer, ...inspections.map((inspection) => inspection.customer)]),
      vendors: unique([trip.vendor, ...inspections.map((inspection) => inspection.inspectionLocation || inspection.vendor || inspection.reportingVendor)]),
      activities: unique([trip.purpose, ...inspections.map((inspection) => inspection.activity)])
    };
  }

  function estimatedReimbursement(trip, mileageRate) {
    if (mileageRate === "" || mileageRate === null || mileageRate === undefined) return null;
    const rate = Number(mileageRate);
    const miles = Number(trip?.miles);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(miles) || miles < 0) return null;
    return Math.round(rate * miles * 100) / 100;
  }

  function concurRows(inputState) {
    const state = migrateState(inputState);
    return state.trips
      .map((trip) => {
        const context = linkedInspectionContext(state, trip);
        return {
          trip,
          context,
          estimated: estimatedReimbursement(trip, state.workflow.mileageRate)
        };
      })
      .sort((a, b) => `${b.trip.date || ""}|${b.trip.endISO || ""}`.localeCompare(`${a.trip.date || ""}|${a.trip.endISO || ""}`));
  }

  function suggestionForTrip(state, trip) {
    const context = linkedInspectionContext(state, trip);
    const recordedHours = unique(context.inspections.map((inspection) => inspection.hoursOnSite));
    return normalizeTimesheetEntry({
      id: `timesheet-trip-${trip.id}`,
      sourceType: "trip",
      sourceId: trip.id,
      date: trip.date,
      ajSbProject: unique([...context.activeJobs, ...context.sbProjects]).join(" | "),
      client: context.clients.join(" | "),
      vendorLocation: context.vendors.join(" | "),
      activity: context.activities.join(" | "),
      suggestedStart: trip.startTime,
      suggestedEnd: trip.endTime,
      suggestedHours: recordedHours.length === 1 ? recordedHours[0] : "",
      hours: "",
      notes: trip.notes,
      status: "Not Entered"
    });
  }

  function suggestionForInspection(inspection) {
    return normalizeTimesheetEntry({
      id: `timesheet-inspection-${inspection.id}`,
      sourceType: "inspection",
      sourceId: inspection.id,
      date: inspection.date,
      ajSbProject: unique([inspection.activeJobId, inspection.sbInspectionNo || inspection.projectNumber]).join(" | "),
      client: inspection.customer,
      vendorLocation: inspection.inspectionLocation || inspection.vendor || inspection.reportingVendor,
      activity: inspection.activity || inspection.inspectionType,
      suggestedStart: inspection.startTime,
      suggestedEnd: inspection.endTime,
      suggestedHours: inspection.hoursOnSite,
      hours: "",
      notes: inspection.quickNote || inspection.summary,
      status: "Not Entered"
    });
  }

  function timesheetSuggestions(inputState) {
    const state = migrateState(inputState);
    return [
      ...state.trips.map((trip) => suggestionForTrip(state, trip)),
      ...state.settings.inspections.filter((inspection) => !inspection.tripId).map(suggestionForInspection)
    ];
  }

  function timesheetEntries(inputState) {
    const state = migrateState(inputState);
    const stored = new Map(state.workflow.timesheetEntries.map((entry) => [entry.id, entry]));
    const entries = timesheetSuggestions(state).map((suggestion) => ({
      ...suggestion,
      ...(stored.get(suggestion.id) || {})
    }));
    const generatedIds = new Set(entries.map((entry) => entry.id));
    state.workflow.timesheetEntries.forEach((entry) => {
      if (!generatedIds.has(entry.id)) entries.push(entry);
    });
    return entries.sort((a, b) => `${a.date}|${a.suggestedStart}|${a.id}`.localeCompare(`${b.date}|${b.suggestedStart}|${b.id}`));
  }

  function weekStartISO(value) {
    const iso = toISODate(value) || todayISO();
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return toISODate(date);
  }

  function weekDates(value) {
    const start = weekStartISO(value);
    const [year, month, day] = start.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Array.from({ length: 7 }, (_, index) => {
      const item = new Date(date);
      item.setDate(date.getDate() + index);
      return toISODate(item);
    });
  }

  function weekSummary(inputState, value) {
    const state = migrateState(inputState);
    const dates = weekDates(value);
    const entries = timesheetEntries(state).filter((entry) => dates.includes(entry.date));
    const days = dates.map((date, index) => {
      const dayEntries = entries.filter((entry) => entry.date === date);
      const total = dayEntries.reduce((sum, entry) => {
        const hours = Number(entry.hours);
        return sum + (Number.isFinite(hours) && hours >= 0 ? hours : 0);
      }, 0);
      const incomplete = (index < 5 && dayEntries.length === 0) || dayEntries.some((entry) => (
        !Number.isFinite(Number(entry.hours)) || Number(entry.hours) <= 0 || entry.status === "Not Entered"
      ));
      const incompleteReasons = [];
      if (index < 5 && dayEntries.length === 0) incompleteReasons.push("No hours entered");
      dayEntries.forEach((entry) => {
        if (!Number.isFinite(Number(entry.hours)) || Number(entry.hours) <= 0) {
          incompleteReasons.push(`${entry.activity || entry.vendorLocation || "Work entry"} needs confirmed hours`);
        } else if (entry.status === "Not Entered") {
          incompleteReasons.push(`${entry.activity || entry.vendorLocation || "Work entry"} status is not confirmed`);
        }
      });
      return { date, entries: dayEntries, total, incomplete, incompleteReasons: unique(incompleteReasons) };
    });
    return {
      weekStart: dates[0],
      dates,
      days,
      entries,
      total: days.reduce((sum, day) => sum + day.total, 0),
      incompleteDays: days.filter((day) => day.incomplete).map((day) => day.date),
      incompleteDetails: days.filter((day) => day.incomplete).map((day) => ({ date: day.date, reasons: day.incompleteReasons })),
      weekStatus: state.workflow.timesheetWeeks[dates[0]] || { status: "Not Entered", submittedISO: "", approvedISO: "" }
    };
  }

  function makeConcurCSV(inputState) {
    const state = migrateState(inputState);
    const header = [
      "Trip ID", "Date", "Business Miles", "Destination / Vendor", "Purpose", "Customer / Project",
      "Active Job", "S&B Inspection / Project", "Reimbursable", "Status", "Mileage Rate",
      "Estimated Reimbursement", "Submitted Date", "Reimbursed Date", "Concur Report / Batch", "Notes"
    ];
    const rows = concurRows(state).map(({ trip, context, estimated }) => [
      trip.id, trip.date, trip.miles, trip.vendor, trip.purpose,
      unique([trip.customer, trip.projectNumber]).join(" / "), context.activeJobs.join(" | "),
      context.sbProjects.join(" | "), trip.reimbursement.reimbursable ? "Yes" : "No",
      trip.reimbursement.status, state.workflow.mileageRate, estimated ?? "",
      trip.reimbursement.submittedDate, trip.reimbursement.reimbursedDate,
      trip.reimbursement.concurReport, trip.reimbursement.notes
    ]);
    return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function makeTimesheetCSV(inputState) {
    const header = [
      "Entry ID", "Source", "Date", "AJ / S&B / Project", "Client", "Vendor / Location", "Activity",
      "Suggested Start", "Suggested End", "Suggested Hours", "Timesheet Hours", "Charge Code",
      "Regular / OT", "Notes", "Status"
    ];
    const rows = timesheetEntries(inputState).map((entry) => [
      entry.id, entry.sourceType, entry.date, entry.ajSbProject, entry.client, entry.vendorLocation,
      entry.activity, entry.suggestedStart, entry.suggestedEnd, entry.suggestedHours, entry.hours,
      entry.chargeCode, entry.laborType, entry.notes, entry.status
    ]);
    return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  window.MileageWorkflowData = {
    WORKFLOW_SCHEMA_VERSION,
    REIMBURSEMENT_STATUSES,
    TIMESHEET_STATUSES,
    LOAD_STATUSES,
    INSPECTION_ACTIVITIES,
    defaultWorkflowState,
    normalizeLoad,
    inspectionLoads,
    inspectionActivities,
    migrateInspection,
    normalizeReimbursement,
    migrateTrip,
    normalizeTimesheetEntry,
    normalizeWorkflow,
    migrateState,
    linkedInspections,
    linkedInspectionContext,
    estimatedReimbursement,
    concurRows,
    timesheetSuggestions,
    timesheetEntries,
    weekStartISO,
    weekDates,
    weekSummary,
    toISODate,
    todayISO,
    makeConcurCSV,
    makeTimesheetCSV
  };
})();
