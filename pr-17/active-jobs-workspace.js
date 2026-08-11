(() => {
  "use strict";

  const WORKSPACE_KEY = "mileage_logger_pr17_active_jobs_workspace_v1";

  const FACILITY_RULES = [
    { prefix: "E10379", client: "Shell", facility: "Norco" },
    { prefix: "E10372", client: "Shell", facility: "Geismar" },
    { prefix: "E10367", client: "Westlake", facility: "Plaquemine" }
  ];

  // Current Active Jobs Master rows are intentionally preserved as entered in the workbook.
  // The new reporting-unit rule is checked separately so conflicting legacy rows can be reviewed,
  // rather than silently combining or renumbering authoritative records.
  const ACTIVE_JOBS = [
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

  const COATING_SYSTEMS = {
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

  const $ = (id) => document.getElementById(id);
  let currentJob = null;
  let currentDraftId = null;
  let autosaveTimer = null;

  function nowISO() { return new Date().toISOString(); }
  function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function today() {
    const d = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function deriveClientFacility(inspectionNo, workbookClient) {
    const normalized = String(inspectionNo || "").trim().toUpperCase();
    const rule = FACILITY_RULES.find((item) => normalized.startsWith(item.prefix));
    if (rule) return { client: rule.client, facility: rule.facility, source: `Derived from ${rule.prefix}` };
    const text = String(workbookClient || "").trim();
    if (/^Shell\s+Norco$/i.test(text)) return { client: "Shell", facility: "Norco", source: "Workbook client" };
    if (/^Shell\s+Geismar$/i.test(text)) return { client: "Shell", facility: "Geismar", source: "Workbook client" };
    if (/^Westlake\s+Plaquemine$/i.test(text)) return { client: "Westlake", facility: "Plaquemine", source: "Workbook client" };
    return { client: text || "Unknown", facility: "", source: "Workbook client" };
  }

  function normalizedJob(job) {
    return { ...job, ...deriveClientFacility(job.inspectionNo, job.workbookClient) };
  }

  function loadWorkspaceState() {
    try {
      const state = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "{}");
      state.inspections = Array.isArray(state.inspections) ? state.inspections : [];
      return state;
    } catch {
      return { inspections: [] };
    }
  }

  function saveWorkspaceState(state) {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
  }

  function vendors() {
    return [...new Set(ACTIVE_JOBS.filter((j) => j.openClosed === "Open").map((j) => j.reportingVendor))].sort();
  }

  function reportingUnitConflicts(jobs) {
    const groups = new Map();
    jobs.forEach((job) => {
      const key = `${job.inspectionNo}||${job.reportingVendor}`.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(job);
    });
    return [...groups.values()].filter((group) => group.length > 1);
  }

  function renderVendorSelect() {
    const select = $("workspaceVendor");
    select.innerHTML = `<option value="">Choose vendor…</option>${vendors().map((vendor) => `<option>${escapeHtml(vendor)}</option>`).join("")}`;
  }

  function renderJobsForVendor() {
    const vendor = $("workspaceVendor").value;
    const jobs = ACTIVE_JOBS.filter((j) => j.openClosed === "Open" && j.reportingVendor === vendor).map(normalizedJob);
    const holder = $("activeJobCards");
    holder.innerHTML = jobs.length ? jobs.map((job) => `
      <article class="workspace-job-card">
        <p class="eyebrow">${escapeHtml(job.aj)} • ${escapeHtml(job.client)}${job.facility ? ` / ${escapeHtml(job.facility)}` : ""}</p>
        <h3>${escapeHtml(job.inspectionNo)} — ${escapeHtml(job.projectName)}</h3>
        <p><strong>Reporting vendor:</strong> ${escapeHtml(job.reportingVendor)}</p>
        <p><strong>Vendor job:</strong> ${escapeHtml(job.vendorJobs || "—")}</p>
        <p><strong>Status:</strong> ${escapeHtml(job.status)}</p>
        <button class="button button-primary button-small" type="button" data-job="${escapeHtml(job.aj)}">Work This Job</button>
      </article>`).join("") : `<p class="muted">Choose a vendor to see its open Active Jobs.</p>`;

    const conflictBox = $("jobConflictWarning");
    const conflicts = reportingUnitConflicts(jobs);
    if (conflicts.length) {
      conflictBox.classList.remove("hidden");
      conflictBox.innerHTML = `<strong>Review Active Jobs Master:</strong> ${conflicts.map((group) => `${escapeHtml(group.map((g) => g.aj).join(" / "))} share ${escapeHtml(group[0].inspectionNo)} + ${escapeHtml(group[0].reportingVendor)}`).join("; ")}. Under the new reporting-unit rule these may belong to one Active Job, so the workbook should be reviewed before any permanent merge/import.`;
    } else {
      conflictBox.classList.add("hidden");
      conflictBox.textContent = "";
    }
  }

  function chooseJob(aj) {
    saveCurrentDraft(true);
    const found = ACTIVE_JOBS.find((j) => j.aj === aj);
    currentJob = found ? normalizedJob(found) : null;
    currentDraftId = null;
    renderCurrentJob();
    resetInspectionForm();
    $("currentJobCard").classList.toggle("hidden", !currentJob);
    $("inspectionCard").classList.toggle("hidden", !currentJob);
    if (currentJob) $("inspectionCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderCurrentJob() {
    if (!currentJob) return;
    $("currentJobTitle").textContent = `${currentJob.aj} — ${currentJob.inspectionNo}`;
    $("currentJobSubtitle").textContent = `${currentJob.client}${currentJob.facility ? ` / ${currentJob.facility}` : ""} • ${currentJob.reportingVendor}`;
    const facts = [
      ["Project", currentJob.projectName],
      ["Client project #", currentJob.clientProjectNo || "—"],
      ["S&B order / PO", currentJob.sbOrder || "—"],
      ["Vendor job / shop #", currentJob.vendorJobs || "—"],
      ["Current status", currentJob.status],
      ["Facility rule", currentJob.source]
    ];
    $("currentJobFacts").innerHTML = facts.map(([label, value]) => `<div class="workspace-fact"><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</div>`).join("");
  }

  function resetInspectionForm() {
    $("inspectionForm").reset();
    $("inspectionDate").value = today();
    $("vendorJobNumber").value = currentJob?.vendorJobs || "";
    $("deficiencyDetails").classList.add("hidden");
    $("coatingSection").classList.add("hidden");
    $("structuralSection").classList.add("hidden");
    $("reportPreview").classList.add("hidden");
    $("reportPreview").textContent = "";
    renderCoatingSystems();
    $("draftStatus").textContent = "Draft saves automatically.";
  }

  function renderCoatingSystems() {
    const facility = currentJob?.facility;
    const systems = COATING_SYSTEMS[facility] || [];
    $("coatingSystem").innerHTML = systems.length
      ? `<option value="">Choose ${escapeHtml(facility)} system…</option>${systems.map((s) => `<option value="${escapeHtml(s[0])}">${escapeHtml(s[0])} — ${escapeHtml(s[1])}</option>`).join("")}`
      : `<option value="">No facility-specific coating library loaded</option>`;
    updateCoatingRequirementSummary();
  }

  function selectedCoatingSystem() {
    const systems = COATING_SYSTEMS[currentJob?.facility] || [];
    return systems.find((s) => s[0] === $("coatingSystem").value) || null;
  }

  function updateCoatingRequirementSummary() {
    const selected = selectedCoatingSystem();
    const box = $("coatingRequirementSummary");
    if (!selected) {
      box.innerHTML = currentJob?.facility
        ? `Select a ${escapeHtml(currentJob.facility)} coating system to display stored requirements.`
        : `No facility-specific coating library applies to this Active Job.`;
      return;
    }
    box.innerHTML = `<strong>${escapeHtml(currentJob.facility)} System ${escapeHtml(selected[0])}</strong><br>${escapeHtml(selected[1])}<br><strong>Surface preparation:</strong> ${escapeHtml(selected[2])}<br><strong>System summary:</strong> ${escapeHtml(selected[3])}`;
  }

  function updateInspectionTypeSections() {
    const type = $("inspectionType").value;
    const coating = type === "Coating Inspection";
    const structural = type.startsWith("Structural Steel");
    $("coatingSection").classList.toggle("hidden", !coating);
    $("structuralSection").classList.toggle("hidden", !structural);
    scheduleAutosave();
  }

  function formData(statusOverride) {
    if (!currentJob) return null;
    return {
      id: currentDraftId || makeId("inspection"),
      aj: currentJob.aj,
      inspectionNo: currentJob.inspectionNo,
      client: currentJob.client,
      facility: currentJob.facility,
      reportingVendor: currentJob.reportingVendor,
      inspectionLocation: $("workspaceVendor").value || currentJob.reportingVendor,
      date: $("inspectionDate").value,
      type: $("inspectionType").value,
      equipmentTag: $("equipmentTag").value.trim(),
      isoNumber: $("isoNumber").value.trim(),
      vendorJobNumber: $("vendorJobNumber").value.trim(),
      pieceSpoolNumber: $("pieceSpoolNumber").value.trim(),
      vendorLoadNumber: $("vendorLoadNumber").value.trim(),
      coating: {
        system: $("coatingSystem").value,
        manufacturer: $("coatingManufacturer").value.trim(),
        environment: $("coatEnvironment").value,
        blast: $("coatBlast").value,
        profile: $("coatProfile").value,
        products: $("coatProducts").value,
        dft: $("coatDft").value,
        appearance: $("coatAppearance").value,
        vendorQc: $("coatVendorQc").value,
        profileReadings: $("profileReadings").value.trim(),
        dftReadings: $("dftReadings").value.trim()
      },
      structural: {
        material: $("steelMaterial").value,
        welds: $("steelWelds").value,
        workmanship: $("steelWorkmanship").value,
        dimensions: $("steelDimensions").value,
        galvanizing: $("steelGalv").value
      },
      deficiencyStatus: $("deficiencyStatus").value,
      deficiencyItem: $("deficiencyItem").value.trim(),
      deficiencyCondition: $("deficiencyCondition").value.trim(),
      deficiencyDisposition: $("deficiencyDisposition").value,
      quickNote: $("quickNote").value.trim(),
      result: $("inspectionResult").value,
      release: $("inspectionRelease").value,
      status: statusOverride || "Draft",
      updatedISO: nowISO()
    };
  }

  function saveCurrentDraft(silent) {
    if (!currentJob || !$("inspectionType").value) return;
    const record = formData("Draft");
    const state = loadWorkspaceState();
    const index = state.inspections.findIndex((item) => item.id === record.id);
    if (index >= 0) state.inspections[index] = record; else state.inspections.push(record);
    saveWorkspaceState(state);
    currentDraftId = record.id;
    $("draftStatus").textContent = `Draft saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
    renderSavedInspections();
    if (!silent) $("draftStatus").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveCurrentDraft(true), 500);
  }

  function completeInspection(event) {
    event.preventDefault();
    if (!currentJob) return;
    if (!$("inspectionType").value) {
      alert("Choose an inspection type first.");
      return;
    }
    const record = formData("Complete");
    const state = loadWorkspaceState();
    const index = state.inspections.findIndex((item) => item.id === record.id);
    if (index >= 0) state.inspections[index] = record; else state.inspections.push(record);
    saveWorkspaceState(state);
    currentDraftId = record.id;
    $("draftStatus").textContent = "Inspection marked complete. The Active Job remains separate and may stay open.";
    renderSavedInspections();
    previewReportLanguage();
  }

  function readingsRange(text) {
    const values = String(text || "").split(/[;,\s]+/).map(Number).filter(Number.isFinite);
    if (!values.length) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${min}` : `${min}-${max}`;
  }

  function itemPhrase(data) {
    const pieces = [];
    if (data.vendorLoadNumber) pieces.push(`vendor load ${data.vendorLoadNumber}`);
    if (data.equipmentTag) pieces.push(`equipment ${data.equipmentTag}`);
    if (data.isoNumber) pieces.push(`ISO ${data.isoNumber}`);
    if (data.vendorJobNumber) pieces.push(`vendor job ${data.vendorJobNumber}`);
    if (data.pieceSpoolNumber) pieces.push(`piece/spool ${data.pieceSpoolNumber}`);
    return pieces.length ? pieces.join(", ") : "the identified work scope";
  }

  function previewReportLanguage() {
    if (!currentJob || !$("inspectionType").value) return;
    const data = formData("Draft");
    const sentences = [];
    sentences.push(`Performed ${data.type.toLowerCase()} for ${itemPhrase(data)} associated with ${data.inspectionNo} at ${data.inspectionLocation}.`);

    if (data.type === "Coating Inspection") {
      const system = selectedCoatingSystem();
      if (data.coating.system) sentences.push(`The applicable ${data.facility} coating system was identified as ${data.coating.system}${system ? ` (${system[1]})` : ""}.`);
      if (data.coating.environment === "Satisfactory") sentences.push("Vendor QC environmental conditions were observed/reviewed and were satisfactory for coating activities.");
      if (data.coating.blast === "Satisfactory") sentences.push("Surface preparation was visually examined and found satisfactory to the specified coating-system requirement.");
      if (data.coating.profile === "Satisfactory") {
        const range = readingsRange(data.coating.profileReadings);
        sentences.push(range ? `Representative anchor-profile measurements ranged from ${range} mils and were satisfactory.` : "Anchor profile was checked as applicable and found satisfactory.");
      }
      if (data.coating.products === "Yes") sentences.push("Specified coating products were verified and found consistent with the selected coating system.");
      if (data.coating.dft === "Satisfactory") {
        const range = readingsRange(data.coating.dftReadings);
        sentences.push(range ? `Representative DFT measurements ranged from ${range} mils and were satisfactory.` : "Dry-film-thickness results were observed/reviewed and found within the specified coating-system requirements.");
      }
      if (data.coating.appearance === "Satisfactory") sentences.push("Applied coating appearance was visually satisfactory with no significant coating defects noted during the inspection.");
      if (data.coating.vendorQc === "Satisfactory") sentences.push("Vendor QC activities/documentation reviewed during the visit were satisfactory as applicable.");
    }

    if (data.type.startsWith("Structural Steel")) {
      if (data.structural.material === "Satisfactory") sentences.push("Material condition and identification were reviewed and found satisfactory.");
      if (data.structural.welds === "Satisfactory") sentences.push("Visual weld condition was reviewed and found satisfactory.");
      if (data.structural.workmanship === "Satisfactory") sentences.push("General fabrication workmanship was satisfactory at the time of inspection.");
      if (data.structural.dimensions === "Satisfactory") sentences.push("Representative completed dimensions were checked and found satisfactory.");
      if (data.structural.galvanizing === "Satisfactory") sentences.push("Post-galvanizing condition was visually reviewed and found satisfactory.");
    }

    if (data.deficiencyStatus === "Issue noted") {
      sentences.push(`A condition was noted${data.deficiencyItem ? ` on ${data.deficiencyItem}` : ""}${data.deficiencyCondition ? `: ${data.deficiencyCondition}` : ""}. Disposition: ${data.deficiencyDisposition}.`);
    } else {
      sentences.push("No significant deficiencies were identified during the documented inspection activities.");
    }

    sentences.push(`Inspection disposition: ${data.result}.`);
    const box = $("reportPreview");
    box.classList.remove("hidden");
    box.innerHTML = `<strong>Draft report language</strong><p>${escapeHtml(sentences.join(" "))}</p><small>This is generated from the entered facts and should be reviewed before use in an S&B report.</small>`;
  }

  function renderSavedInspections() {
    const state = loadWorkspaceState();
    const rows = [...state.inspections].sort((a, b) => String(b.updatedISO).localeCompare(String(a.updatedISO)));
    $("savedInspectionList").innerHTML = rows.length ? rows.map((record) => `
      <article class="workspace-record">
        <p><strong>${escapeHtml(record.aj)} — ${escapeHtml(record.type || "Inspection")}</strong><span class="pill">${escapeHtml(record.status)}</span></p>
        <p>${escapeHtml(record.date || "")}${record.vendorLoadNumber ? ` • Load ${escapeHtml(record.vendorLoadNumber)}` : ""}${record.equipmentTag ? ` • ${escapeHtml(record.equipmentTag)}` : ""}</p>
        <p class="muted">${escapeHtml(record.inspectionNo)} • ${escapeHtml(record.reportingVendor)} • ${escapeHtml(record.result || "")}</p>
        <div class="workspace-mini-actions"><button class="button button-secondary button-small" type="button" data-reopen="${escapeHtml(record.id)}">Open</button></div>
      </article>`).join("") : `<p class="muted">No prototype inspection drafts saved yet.</p>`;
  }

  function reopenInspection(id) {
    const state = loadWorkspaceState();
    const record = state.inspections.find((item) => item.id === id);
    if (!record) return;
    const job = ACTIVE_JOBS.find((j) => j.aj === record.aj);
    if (!job) return;
    $("workspaceVendor").value = job.reportingVendor;
    renderJobsForVendor();
    currentJob = normalizedJob(job);
    currentDraftId = record.id;
    renderCurrentJob();
    $("currentJobCard").classList.remove("hidden");
    $("inspectionCard").classList.remove("hidden");
    $("inspectionDate").value = record.date || today();
    $("inspectionType").value = record.type || "";
    $("equipmentTag").value = record.equipmentTag || "";
    $("isoNumber").value = record.isoNumber || "";
    $("vendorJobNumber").value = record.vendorJobNumber || "";
    $("pieceSpoolNumber").value = record.pieceSpoolNumber || "";
    $("vendorLoadNumber").value = record.vendorLoadNumber || "";
    renderCoatingSystems();
    $("coatingSystem").value = record.coating?.system || "";
    $("coatingManufacturer").value = record.coating?.manufacturer || "";
    $("coatEnvironment").value = record.coating?.environment || "Satisfactory";
    $("coatBlast").value = record.coating?.blast || "Satisfactory";
    $("coatProfile").value = record.coating?.profile || "Satisfactory";
    $("coatProducts").value = record.coating?.products || "Yes";
    $("coatDft").value = record.coating?.dft || "Satisfactory";
    $("coatAppearance").value = record.coating?.appearance || "Satisfactory";
    $("coatVendorQc").value = record.coating?.vendorQc || "Satisfactory";
    $("profileReadings").value = record.coating?.profileReadings || "";
    $("dftReadings").value = record.coating?.dftReadings || "";
    $("steelMaterial").value = record.structural?.material || "Satisfactory";
    $("steelWelds").value = record.structural?.welds || "Satisfactory";
    $("steelWorkmanship").value = record.structural?.workmanship || "Satisfactory";
    $("steelDimensions").value = record.structural?.dimensions || "Satisfactory";
    $("steelGalv").value = record.structural?.galvanizing || "Not applicable";
    $("deficiencyStatus").value = record.deficiencyStatus || "None";
    $("deficiencyItem").value = record.deficiencyItem || "";
    $("deficiencyCondition").value = record.deficiencyCondition || "";
    $("deficiencyDisposition").value = record.deficiencyDisposition || "Marked for repair";
    $("quickNote").value = record.quickNote || "";
    $("inspectionResult").value = record.result || "Acceptable";
    $("inspectionRelease").value = record.release || "Not required";
    $("deficiencyDetails").classList.toggle("hidden", $("deficiencyStatus").value !== "Issue noted");
    updateInspectionTypeSections();
    updateCoatingRequirementSummary();
    $("draftStatus").textContent = `${record.status} record opened.`;
    $("inspectionCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function bindEvents() {
    $("workspaceVendor").addEventListener("change", () => { saveCurrentDraft(true); currentJob = null; currentDraftId = null; $("currentJobCard").classList.add("hidden"); $("inspectionCard").classList.add("hidden"); renderJobsForVendor(); });
    $("activeJobCards").addEventListener("click", (event) => { const aj = event.target?.dataset?.job; if (aj) chooseJob(aj); });
    $("switchJobBtn").addEventListener("click", () => { saveCurrentDraft(true); currentJob = null; currentDraftId = null; $("currentJobCard").classList.add("hidden"); $("inspectionCard").classList.add("hidden"); $("vendorWorkspaceTitle").scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("inspectionType").addEventListener("change", updateInspectionTypeSections);
    $("coatingSystem").addEventListener("change", () => { updateCoatingRequirementSummary(); scheduleAutosave(); });
    $("deficiencyStatus").addEventListener("change", () => { $("deficiencyDetails").classList.toggle("hidden", $("deficiencyStatus").value !== "Issue noted"); scheduleAutosave(); });
    $("inspectionForm").addEventListener("input", scheduleAutosave);
    $("inspectionForm").addEventListener("change", scheduleAutosave);
    $("saveDraftBtn").addEventListener("click", () => saveCurrentDraft(false));
    $("inspectionForm").addEventListener("submit", completeInspection);
    $("generateSummaryBtn").addEventListener("click", previewReportLanguage);
    $("savedInspectionList").addEventListener("click", (event) => { const id = event.target?.dataset?.reopen; if (id) reopenInspection(id); });
    window.addEventListener("beforeunload", () => saveCurrentDraft(true));
  }

  function init() {
    renderVendorSelect();
    renderJobsForVendor();
    renderSavedInspections();
    $("inspectionDate").value = today();
    bindEvents();
  }

  init();
})();
