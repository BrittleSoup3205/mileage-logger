(() => {
  "use strict";

  const facilityRules = [
    { prefix: "E10379", client: "Shell", facility: "Norco" },
    { prefix: "E10372", client: "Shell", facility: "Geismar" },
    { prefix: "E10367", client: "Westlake", facility: "Plaquemine" }
  ];

  // These rows mirror the current Active Jobs Master. They are reference data:
  // conflicts are surfaced for review and are never combined or renumbered here.
  const activeJobs = [
    { aj: "AJ-001", inspectionNo: "E10379-407", workbookClient: "Shell Norco", projectName: "DHT E-2284", clientProjectNo: "E10105-M0001", sbOrder: "", reportingVendor: "Cembell", vendorJobs: "2607-8756", status: "IN PROCESS", openClosed: "Open" },
    { aj: "AJ-004", inspectionNo: "E10379-411", workbookClient: "Shell Norco", projectName: "T-F0507 Tank Renewal", clientProjectNo: "Confirm", sbOrder: "", reportingVendor: "Smith Tank", vendorJobs: "26-6935", status: "RELEASE PENDING", openClosed: "Open" },
    { aj: "AJ-006", inspectionNo: "E10379-425", workbookClient: "Shell Norco", projectName: "A-414 Tank Renewal", clientProjectNo: "USMF-07878", sbOrder: "", reportingVendor: "Repcon", vendorJobs: "260106", status: "MATERIAL / FINAL RELEASE OPEN", openClosed: "Open" },
    { aj: "AJ-009", inspectionNo: "E7347-A0001", workbookClient: "Phillips 66", projectName: "P66 Project", clientProjectNo: "Confirm", sbOrder: "E7347-A0001", reportingVendor: "Turner Industries - Port Allen", vendorJobs: "255424 / 255425", status: "IN PROCESS", openClosed: "Open" },
    { aj: "AJ-010", inspectionNo: "E10292-A0002", workbookClient: "Marathon", projectName: "Piping Fabrication Order", clientProjectNo: "Confirm", sbOrder: "E10292-A0002", reportingVendor: "Turner Industries - Port Allen", vendorJobs: "256345 / 256346 / 256349", status: "NCR / RECORDS OPEN", openClosed: "Open" },
    { aj: "AJ-002", inspectionNo: "E10379-410", workbookClient: "Shell Norco", projectName: "T-F0501-1 Tank Renewal", clientProjectNo: "Confirm", sbOrder: "", reportingVendor: "Smith Tank", vendorJobs: "26-6936", status: "REPAIR / ENGINEERING OPEN", openClosed: "Open" },
    { aj: "AJ-003", inspectionNo: "E10379-410", workbookClient: "Shell Norco", projectName: "T-F0498 Tank Renewal", clientProjectNo: "Confirm", sbOrder: "", reportingVendor: "Smith Tank", vendorJobs: "26-6937", status: "ENGINEERING / DOCUMENTS OPEN", openClosed: "Open" },
    { aj: "AJ-005", inspectionNo: "E10379-410", workbookClient: "Shell Norco", projectName: "Tank Support Package", clientProjectNo: "Confirm", sbOrder: "", reportingVendor: "Nugent Steel / SAS", vendorJobs: "Approx. 6922 - confirm", status: "IDENTIFIERS / DISPOSITION OPEN", openClosed: "Open" },
    { aj: "AJ-007", inspectionNo: "E10379-434", workbookClient: "Shell Norco", projectName: "DHT S2 Substation", clientProjectNo: "E8703 / USMF-07728", sbOrder: "E8703-S0001", reportingVendor: "Nugent Steel", vendorJobs: "6919", status: "GALVANIZING / REINSPECTION OPEN", openClosed: "Open" },
    { aj: "AJ-008", inspectionNo: "E10379-434", workbookClient: "Shell Norco", projectName: "Confirm exact E8703 package", clientProjectNo: "Confirm", sbOrder: "E8703-S0004", reportingVendor: "Nugent Steel", vendorJobs: "6958", status: "GALVANIZING INSPECTIONS UPCOMING", openClosed: "Open" },
    { aj: "AJ-011", inspectionNo: "E10367-401", workbookClient: "Westlake Plaquemine", projectName: "Train 1 Blowdown System Upgrade", clientProjectNo: "PIF 041167 / WBS 300325031", sbOrder: "", reportingVendor: "James Machine Works", vendorJobs: "8704", status: "FINAL ASSEMBLY / RELEASE CHECK", openClosed: "Open" }
  ];

  const coatingSystems = {
    Norco: [
      ["1", "Uninsulated carbon / low alloy steel, ambient to 225°F", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Inorganic zinc 1.5-3 mil; epoxy 4-6 mil; polyurethane 2-3 mil"],
      ["1A", "Repair system for System 1", "SSPC-SP6 / SSPC-SP11", "Zinc-rich epoxy 2-3 mil; epoxy 4-6 mil; polyurethane 2-3 mil"],
      ["2", "Uninsulated carbon / low alloy steel to 446°F", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Epoxy / multipolymeric matrix system"],
      ["2A", "Repair system for System 2", "SSPC-SP6 / SSPC-SP11", "Repair per local chart"],
      ["3", "Uninsulated carbon / low alloy steel to 1000°F", "SSPC-SP5 optimum / SSPC-SP10 minimum", "Multipolymeric matrix"],
      ["3A", "Repair system for System 3", "SSPC-SP10 / SSPC-SP11", "Multipolymeric matrix repair"],
      ["7", "Below wharf / underground piping", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Modified epoxy / coal tar epoxy"],
      ["7A", "Repair system for System 7", "SSPC-SP6 / SSPC-SP11", "Repair coating per local chart"],
      ["10", "Insulated stainless steel to 300°F", "SSPC-SP6", "Epoxy or high-temperature system"],
      ["11", "Insulated stainless steel to 1200°F", "SSPC-SP6 / SSPC-SP16", "Multipolymeric matrix"],
      ["12", "Tank external shell", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Epoxy / modified epoxy / polyurethane by tank zone"],
      ["12A", "Repair system for System 12", "SP10 / SP11 / SP6 as applicable", "Tank external repair system"],
      ["12B", "Fixed roofs / external floating roofs", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Epoxy / modified epoxy"],
      ["13", "Insulated carbon / low alloy steel to 300°F", "SSPC-SP5 optimum / SSPC-SP10 minimum", "TSA 10-20 mil or approved organic alternative"],
      ["14", "Safety color coding", "SSPC-SP6 / SP2 / SP3 / SP11", "Epoxy / polyurethane"],
      ["15", "Safety shower color coding", "SSPC-SP6 / SP2 / SP3 / SP11", "Epoxy + signal green system"],
      ["20", "Insulated carbon steel -300°F to 1200°F", "SSPC-SP5; repair SP11 or SP10", "Multipolymeric matrix"],
      ["23", "Cold-service uninsulated carbon steel, 0-75°F", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Epoxy / polyurethane"],
      ["23A", "Repair system for System 23", "SSPC-SP6 / SSPC-SP11", "Epoxy / polyurethane repair"],
      ["25", "Caustic & acid areas", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Three epoxy coats"],
      ["25A", "Repair system for System 25", "SP10 / SP2 / SP3 / SP11", "Epoxy repair system"],
      ["27", "Maintenance alternative to System 1", "SP10 / SP2 / SP3 / SP11 / SP6", "Surface-tolerant epoxy / polyurethane"],
      ["28", "Carbon steel under cementitious fireproofing", "SP10 / SP3 / SP11 / SP6", "Epoxy system"],
      ["32", "Temperature indicating paint", "SSPC-SP5 optimum / SSPC-SP10 minimum", "Silicone indicating coating"],
      ["35", "Galvanized steel coating repair", "SP6 / SP2 / SP3 / SP11", "Epoxy repair system"],
      ["36", "Near vapor plume / cooling tower", "SSPC-SP10 optimum / SSPC-SP6 minimum", "High-build epoxy / polyurethane or approved MCU"],
      ["36A", "Repair system for System 36", "SP10 / SP11 / SP6; maintenance variants", "Repair system"],
      ["38", "Furnace stacks / preheater duct work", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Epoxy, max total 15 mil"],
      ["38A", "Repair system for System 38", "SP10 / SP2 / SP3 / SP11 / SP6", "Epoxy repair"],
      ["39", "Fiberglass tanks & piping", "LPWC / SP1 / SP2 / SP3", "Epoxy / polyurethane"],
      ["40", "Sweating piping / vessels / equipment", "SSPC-SP10 optimum / SSPC-SP6 minimum", "Carbomastic 615, 3-5 mil each coat"],
      ["40A", "Repair system for System 40", "SSPC-SP6 / SSPC-SP11", "Carbomastic 615 repair"],
      ["41", "Stripe coating concrete / asphalt", "LPWC / SP2 / SP3", "Zone marking paint"],
      ["41A", "Stripe coating over carbon steel", "LPWC / SP1 / SP2 / SP3 / SP11", "Epoxy + zone marking paint"],
      ["42", "TSA for insulated carbon / low alloy steel", "SSPC-SP5 optimum / SSPC-SP10 minimum", "TSA Grade 1100, 10-20 mil; target 12-15 mil"]
    ],
    Geismar: [
      ["CSU-200N-IEPU", "Ambient to 200°F, uninsulated", "SP-10", "Interzinc 22 2.5-4.0 MDFT; Intergard 475HS 6-8; Interthane 990HS 2-3"],
      ["CSU-250N", "Ambient to 250°F, uninsulated", "SP-10", "Interzinc 22 2.5-4.0; Interseal 670HS 6-8 + 4-8"],
      ["CSB-300-Amb", "Ambient to 300°F, uninsulated", "SP-10", "Interzinc 22 2.5-4.0; Interplus 256 3-6 + 3-6"],
      ["CSU-700-Amb", "300°F to 700°F, cyclic, uninsulated", "SP-10", "Interzinc 22 2.5-4.0; optional silicone topcoat"],
      ["CSB-TSA-Amb", "-50°F to 1100°F, cyclic, insulated or uninsulated", "SP-10, 2.5-3.5 mil angular profile", "Aluminum wire flame spray 10-15 mil"],
      ["CSB-1100-Amb", "300°F to 1100°F, peak 1400°F", "SP-10", "Hi-Temp 1027, 5-6 mil coats"],
      ["SSI-1200-H500", "Stainless / duplex, ambient to 1100°F including sweating", "SP-1 + light abrasive sweep blast", "Hi-Temp 1027, 5-6 mil coats"],
      ["CS-FP-R", "Carbon steel under cementitious fireproofing to 300°F", "SP-10, 2-3 mil profile", "Interseal 670HS 3-4; Intergard 475HS 4-6"],
      ["GS-250-Spot", "Galvanized steel spot repair", "SP1 / SP3 / SP12 LPWJ", "Interseal 670HS AL 6-8"],
      ["LT4-N/M", "Internal carbon steel exchanger heads, river water service", "SP5 white metal, 2-4 mil profile", "ITW Futura CC4000, 15-20 mil, minimum two coats"],
      ["Fusion Bonded Epoxy", "Buried carbon steel piping to 230°F", "Per applicator / manufacturer", "FBE"],
      ["FBE Repairs & Field Weld Joints", "Buried carbon steel piping repairs", "SP10; limited SP11 bristle blast with approval", "SP-2888 R.G. 10-25 mil"]
    ]
  };

  function deriveClientFacility(inspectionNo, workbookClient) {
    const normalized = String(inspectionNo || "").trim().toUpperCase();
    const rule = facilityRules.find((item) => normalized.startsWith(item.prefix));
    if (rule) return { client: rule.client, facility: rule.facility, source: `Suggested from ${rule.prefix}` };
    const text = String(workbookClient || "").trim();
    if (/^Shell\s+Norco$/i.test(text)) return { client: "Shell", facility: "Norco", source: "Active Jobs Master" };
    if (/^Shell\s+Geismar$/i.test(text)) return { client: "Shell", facility: "Geismar", source: "Active Jobs Master" };
    if (/^Westlake\s+Plaquemine$/i.test(text)) return { client: "Westlake", facility: "Plaquemine", source: "Active Jobs Master" };
    return { client: text || "Unknown", facility: "", source: "Active Jobs Master" };
  }

  function normalizedJob(job) {
    return { ...job, ...deriveClientFacility(job.inspectionNo, job.workbookClient) };
  }

  function reportingUnitConflicts(jobs = activeJobs) {
    const groups = new Map();
    jobs.forEach((job) => {
      const key = `${job.inspectionNo}||${job.reportingVendor}`.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(normalizedJob(job));
    });
    return [...groups.values()].filter((group) => group.length > 1);
  }

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
    const linkedInspections = new Map();
    inspections.forEach((inspection) => {
      if (!inspection.tripId) return;
      if (!linkedInspections.has(inspection.tripId)) linkedInspections.set(inspection.tripId, []);
      linkedInspections.get(inspection.tripId).push(inspection);
    });
    const rows = [[
      "Visit ID", "Date", "Reporting Vendor", "Inspection Location", "Active Job / Inspection #",
      "Shop / Job #", "Client / Project", "Mileage", "Notes"
    ]];

    inspections.filter((inspection) => !inspection.tripId).forEach((inspection) => {
      rows.push([
        `inspection:${inspection.id}`,
        excelDate(inspection.date),
        inspection.reportingVendor || inspection.vendor || "",
        inspection.inspectionLocation || inspection.vendor || "",
        activityNotes(inspection.activeJobId, inspection.sbInspectionNo, inspection.projectNumber),
        activityNotes(inspection.vendorJobNumber, inspection.purchaseOrderJob),
        activityNotes(inspection.customer, inspection.projectName),
        "",
        activityNotes(inspection.activity, inspection.quickNote, inspection.summary, inspection.observations)
      ]);
    });

    trips.forEach((trip) => {
      const linked = linkedInspections.get(trip.id) || [];
      rows.push([
        `trip:${trip.id}`,
        excelDate(trip.date),
        uniqueValues(linked.map((inspection) => inspection.reportingVendor)).join(" | ") || trip.vendor || "",
        uniqueValues(linked.map((inspection) => inspection.inspectionLocation || inspection.vendor)).join(" | ") || trip.vendor || "",
        uniqueValues(linked.flatMap((inspection) => [inspection.activeJobId, inspection.sbInspectionNo, inspection.projectNumber])).join(" | ") || trip.projectNumber || "",
        uniqueValues(linked.flatMap((inspection) => [inspection.vendorJobNumber, inspection.purchaseOrderJob])).join(" | "),
        uniqueValues(linked.flatMap((inspection) => [inspection.customer, inspection.projectName])).join(" | ") || trip.customer || "",
        trip.miles ?? "",
        activityNotes(trip.purpose, trip.notes, linked.flatMap((inspection) => [inspection.activity, inspection.quickNote, inspection.summary, inspection.observations]))
      ]);
    });

    return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  }

  window.MileageActiveJobsData = Object.freeze({
    facilityRules,
    activeJobs,
    coatingSystems,
    deriveClientFacility,
    normalizedJob,
    reportingUnitConflicts,
    makeActivityCSV
  });
})();
