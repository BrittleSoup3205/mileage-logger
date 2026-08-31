(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const CONFIG_KEY = "mileage_logger_sync_config_v1";
  const SESSION_KEY = "mileage_logger_sync_session_v1";
  let refreshing = false;

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null || value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  async function refreshReportData() {
    if (refreshing || !navigator.onLine) return false;
    refreshing = true;
    try {
      try { await window.MileageMultiDeviceSync?.syncNow?.({ reason: "report-export" }); }
      catch (_) {}

      const config = readJSON(CONFIG_KEY, {});
      const session = readJSON(SESSION_KEY, null);
      const projectUrl = String(config.projectUrl || "").trim().replace(/\/$/, "");
      const publishableKey = String(config.publishableKey || "").trim();
      const accessToken = String(session?.access_token || "").trim();
      if (!projectUrl || !publishableKey || !accessToken) return false;

      const query = "/rest/v1/mileage_sync_records?select=record_type,record_id,payload,modified_at,tombstone&record_type=in.(active_job,facility_profile)&tombstone=eq.false";
      const response = await fetch(`${projectUrl}${query}`, {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`
        },
        cache: "no-store"
      });
      if (!response.ok) return false;
      const rows = await response.json();
      if (!Array.isArray(rows)) return false;

      const state = readJSON(STATE_KEY, {});
      state.activeJobs = Array.isArray(state.activeJobs) ? state.activeJobs : [];
      state.facilityProfiles = Array.isArray(state.facilityProfiles) ? state.facilityProfiles : [];

      rows.forEach((row) => {
        const payload = row?.payload;
        if (!payload || row?.tombstone) return;
        if (row.record_type === "active_job") {
          const id = row.record_id || payload.aj;
          const index = state.activeJobs.findIndex((job) => job?.aj === id);
          if (index >= 0) state.activeJobs[index] = { ...state.activeJobs[index], ...payload };
          else state.activeJobs.push(payload);
        } else if (row.record_type === "facility_profile") {
          const id = row.record_id || payload.id;
          const index = state.facilityProfiles.findIndex((profile) => profile?.id === id);
          if (index >= 0) state.facilityProfiles[index] = { ...state.facilityProfiles[index], ...payload };
          else state.facilityProfiles.push(payload);
        }
      });

      // Deliberately do not dispatch mileage:state-changed here. The report export
      // immediately consumes this raw authoritative merge before any migration layer
      // can discard newly introduced report-only fields.
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn("Could not refresh report data immediately before export:", error);
      return false;
    } finally {
      refreshing = false;
    }
  }

  window.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("[data-export-inspection], [data-preview-export-inspection]");
    if (!button || button.dataset.reportCloudReady === "1") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Refreshing Report Data...";
    await refreshReportData();
    button.disabled = false;
    button.textContent = original;

    button.dataset.reportCloudReady = "1";
    try { button.click(); }
    finally { setTimeout(() => { delete button.dataset.reportCloudReady; }, 0); }
  }, true);

  window.MileageReportDataCloudRefresh = Object.freeze({ refreshReportData });
})();