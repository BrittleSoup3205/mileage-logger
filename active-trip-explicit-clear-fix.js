(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const RELOAD_GUARD_KEY = "mileage_logger_finalized_active_cleanup_reload_v1";
  let running = false;

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function isCompletedTrip(trip) {
    return Boolean(
      trip &&
      trip.id &&
      (trip.endISO || trip.endTime || trip.endOdometer !== undefined && trip.endOdometer !== null && trip.endOdometer !== "")
    );
  }

  function clearCloudActiveTrip() {
    const sync = window.MileageMultiDeviceSync;
    if (!sync?.markDeleted) return;
    sync.markDeleted("active_trip", "current");
  }

  function reconcileFinalizedActiveTrip(options = {}) {
    if (running) return false;
    const state = readState();
    const activeTrip = state?.activeTrip;
    if (!activeTrip?.id || !Array.isArray(state?.trips)) return false;

    const completed = state.trips.find((trip) => trip?.id === activeTrip.id && isCompletedTrip(trip));
    if (!completed) return false;

    running = true;
    try {
      state.activeTrip = null;
      if (completed.endOdometer !== undefined && completed.endOdometer !== null && completed.endOdometer !== "") {
        state.lastOdometer = completed.endOdometer;
      }
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      clearCloudActiveTrip();

      window.dispatchEvent(new CustomEvent("mileage:state-changed", {
        detail: {
          source: "finalized-active-trip-cleanup",
          tripId: completed.id
        }
      }));

      if (options.reload !== false) {
        const prior = sessionStorage.getItem(RELOAD_GUARD_KEY);
        if (prior !== completed.id) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, completed.id);
          setTimeout(() => location.reload(), 120);
        }
      }
      return true;
    } finally {
      running = false;
    }
  }

  function onTripFinalized() {
    clearCloudActiveTrip();
    setTimeout(() => reconcileFinalizedActiveTrip({ reload: false }), 0);
  }

  window.addEventListener("mileage:trip-finalized", onTripFinalized);
  window.addEventListener("mileage:trip-cancelled", clearCloudActiveTrip);
  window.addEventListener("mileage:state-changed", (event) => {
    if (String(event.detail?.source || "") === "finalized-active-trip-cleanup") return;
    setTimeout(() => reconcileFinalizedActiveTrip(), 40);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(() => reconcileFinalizedActiveTrip(), 40);
  });

  setTimeout(() => reconcileFinalizedActiveTrip(), 40);
})();
