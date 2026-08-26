(() => {
  "use strict";

  const base = window.MileageActiveJobsData;
  if (!base) return;

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function excelDate(value) {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : text;
  }

  function uniqueValues(values) {
    return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
  }

  function activityNotes(...values) {
    return uniqueValues(values.flat()).join(" | ");
  }

  function makeActivityCSV(trips = [], inspections = []) {
    const exportedAt = new Date().toISOString();
    const linkedInspections = new Map();

    inspections.forEach((inspection) => {
      if (!inspection.tripId) return;
      if (!linkedInspections.has(inspection.tripId)) linkedInspections.set(inspection.tripId, []);
      linkedInspections.get(inspection.tripId).push(inspection);
    });

    const rows = [[
      "Visit ID", "Date", "Reporting Vendor", "Inspection Location", "Active Job / Inspection #",
      "Shop / Job #", "Client / Project", "Mileage", "Notes",
      "Active Job ID(s)", "Inspection Job #(s)", "Exported At"
    ]];

    inspections.filter((inspection) => !inspection.tripId).forEach((inspection) => {
      const activeJobIds = activityNotes(inspection.activeJobId);
      const inspectionJobNumbers = activityNotes(inspection.sbInspectionNo, inspection.projectNumber);
      rows.push([
        `inspection:${inspection.id}`,
        excelDate(inspection.date),
        inspection.reportingVendor || inspection.vendor || "",
        inspection.inspectionLocation || inspection.vendor || "",
        activityNotes(activeJobIds, inspectionJobNumbers),
        activityNotes(inspection.vendorJobNumber, inspection.purchaseOrderJob),
        activityNotes(inspection.customer, inspection.projectName),
        "",
        activityNotes(inspection.activity, inspection.quickNote, inspection.summary, inspection.observations),
        activeJobIds,
        inspectionJobNumbers,
        exportedAt
      ]);
    });

    trips.forEach((trip) => {
      const linked = linkedInspections.get(trip.id) || [];
      const activeJobIds = uniqueValues(linked.map((inspection) => inspection.activeJobId)).join(" | ");
      const inspectionJobNumbers = uniqueValues(
        linked.flatMap((inspection) => [inspection.sbInspectionNo, inspection.projectNumber])
      ).join(" | ") || trip.projectNumber || "";

      rows.push([
        `trip:${trip.id}`,
        excelDate(trip.date),
        uniqueValues(linked.map((inspection) => inspection.reportingVendor)).join(" | ") || trip.vendor || "",
        uniqueValues(linked.map((inspection) => inspection.inspectionLocation || inspection.vendor)).join(" | ") || trip.vendor || "",
        uniqueValues(linked.flatMap((inspection) => [inspection.activeJobId, inspection.sbInspectionNo, inspection.projectNumber])).join(" | ") || trip.projectNumber || "",
        uniqueValues(linked.flatMap((inspection) => [inspection.vendorJobNumber, inspection.purchaseOrderJob])).join(" | "),
        uniqueValues(linked.flatMap((inspection) => [inspection.customer, inspection.projectName])).join(" | ") || trip.customer || "",
        trip.miles ?? "",
        activityNotes(trip.purpose, trip.notes, linked.flatMap((inspection) => [inspection.activity, inspection.quickNote, inspection.summary, inspection.observations])),
        activeJobIds,
        inspectionJobNumbers,
        exportedAt
      ]);
    });

    return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  }

  window.MileageActiveJobsData = Object.freeze({
    ...base,
    makeActivityCSV
  });
})();
