(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let pending = null;
  let baselineIds = new Set();
  let pollTimer = null;

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
      state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];
      state.activeJobImports = Array.isArray(state.activeJobImports) ? state.activeJobImports : [];
      return state;
    } catch (_) {
      return { activeJobs: [], facilityProfiles: [], activeJobImports: [] };
    }
  }

  async function mergePending() {
    if (!pending) return;
    const state = readState();
    const now = new Date().toISOString();

    (pending.jobExtras || []).forEach((source) => {
      const job = state.activeJobs.find((item) => item?.aj === source.aj);
      if (!job) return;
      (source.presentFields || []).forEach((field) => { job[field] = source[field] ?? ""; });
      job.modifiedISO = now;
    });

    (pending.facilityProfiles || []).forEach((source) => {
      let profile = state.facilityProfiles.find((item) => item?.id === source.id)
        || state.facilityProfiles.find((item) => String(item?.name || "").trim().toLowerCase() === String(source.name || "").trim().toLowerCase());
      if (!profile) {
        profile = { id: source.id, createdISO: now };
        state.facilityProfiles.push(profile);
      }
      Object.entries(source).forEach(([field, value]) => {
        if (field !== "id") profile[field] = value;
      });
      profile.modifiedISO = now;
    });

    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    try { await window.MileageMultiDeviceSync?.syncNow?.({ reason: "master-report-data" }); }
    catch (_) {}
    window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "master-report-data-capture-fix" } }));
    pending = null;
    baselineIds = new Set();
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    let tries = 0;
    pollTimer = setInterval(() => {
      tries += 1;
      const state = readState();
      const hasNewImport = state.activeJobImports.some((entry) => entry?.id && !baselineIds.has(entry.id));
      if (hasNewImport || tries >= 80) {
        clearInterval(pollTimer);
        pollTimer = null;
        mergePending();
      }
    }, 100);
  }

  window.addEventListener("change", (event) => {
    if (event.target?.id !== "activeJobsWorkbookInput") return;
    const file = event.target.files?.[0];
    if (!file || !window.MileageMasterReportDataImport?.parseFile) return;
    baselineIds = new Set(readState().activeJobImports.map((entry) => entry?.id).filter(Boolean));
    pending = null;
    window.MileageMasterReportDataImport.parseFile(file)
      .then((result) => { pending = result; })
      .catch((error) => console.warn("Could not capture report data from Active Jobs Master:", error));
  }, true);

  window.addEventListener("click", (event) => {
    if (!event.target?.closest?.("#applyActiveJobsUpdateBtn")) return;
    if (pending) startPoll();
  }, true);

  window.addEventListener("click", (event) => {
    if (!event.target?.closest?.("#cancelActiveJobsUpdateBtn")) return;
    pending = null;
    baselineIds = new Set();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }, true);

  window.MileageMasterReportDataCaptureFix = Object.freeze({ mergePending });
})();