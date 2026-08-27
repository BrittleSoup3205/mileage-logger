(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
      return state && typeof state === "object" ? state : null;
    } catch (_) {
      return null;
    }
  }

  function tripTime(trip) {
    const iso = String(trip?.endISO || "").trim();
    const parsedISO = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(parsedISO)) return parsedISO;

    const date = String(trip?.date || "").trim();
    const us = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]));

    const parsed = Date.parse(date);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function derivedLastOdometer(state) {
    const trips = Array.isArray(state?.trips) ? state.trips : [];
    const completed = trips
      .filter((trip) => trip?.endOdometer !== undefined && trip?.endOdometer !== null && String(trip.endOdometer).trim() !== "")
      .sort((left, right) => tripTime(right) - tripTime(left));
    return completed[0]?.endOdometer ?? "";
  }

  function reconcileLastOdometer() {
    const state = readState();
    if (!state) return "";
    const derived = derivedLastOdometer(state);
    if (derived === "") return "";
    if (String(state.lastOdometer ?? "") !== String(derived)) {
      state.lastOdometer = derived;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
    return derived;
  }

  function refreshStartOdometer() {
    const derived = reconcileLastOdometer();
    if (derived === "") return;
    const input = document.getElementById("startOdo");
    const section = document.getElementById("startSection");
    if (input && section && !section.classList.contains("hidden")) input.value = String(derived);
  }

  // Run immediately. This script is intentionally loaded before app.js so the
  // app reads a current lastOdometer when it initializes.
  reconcileLastOdometer();

  document.addEventListener("click", (event) => {
    if (event.target.closest("#startBtn, [data-show='startSection']")) {
      setTimeout(refreshStartOdometer, 0);
    }
  }, true);

  window.addEventListener("mileage:state-changed", () => {
    setTimeout(refreshStartOdometer, 50);
  });

  window.MileageLastOdometerFix = {
    reconcile: reconcileLastOdometer,
    current: () => derivedLastOdometer(readState())
  };
})();