(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let pendingInspectionId = "";
  let pendingTimer = null;

  function currentInspectionIds() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      const inspections = Array.isArray(state?.settings?.inspections) ? state.settings.inspections : [];
      return new Set(inspections.map((item) => item?.id).filter(Boolean));
    } catch (_) {
      return new Set();
    }
  }

  function clearPending() {
    pendingInspectionId = "";
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-delete-inspection]");
    if (!button?.dataset?.deleteInspection) return;
    pendingInspectionId = button.dataset.deleteInspection;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(clearPending, 30000);
  }, true);

  window.addEventListener("mileage:state-changed", (event) => {
    if (!pendingInspectionId) return;
    const source = String(event.detail?.source || "");
    if (source.startsWith("cloud-sync")) return;
    const ids = currentInspectionIds();
    if (ids.has(pendingInspectionId)) return;
    window.MileageMultiDeviceSync?.markDeleted?.("inspection", pendingInspectionId);
    clearPending();
  });
})();
