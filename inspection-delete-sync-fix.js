(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const RECENT_END_WINDOW_MS = 10 * 60 * 1000;
  let pendingInspectionId = "";
  let pendingTimer = null;
  let pendingTripId = "";
  let pendingTripTimer = null;
  let feedbackTimer = null;

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      state.trips = Array.isArray(state.trips) ? state.trips : [];
      state.settings = state.settings && typeof state.settings === "object" ? state.settings : {};
      state.settings.inspections = Array.isArray(state.settings.inspections) ? state.settings.inspections : [];
      return state;
    } catch (_) {
      return { activeTrip: null, trips: [], settings: { inspections: [] } };
    }
  }

  function currentInspectionIds() {
    return new Set(readState().settings.inspections.map((item) => item?.id).filter(Boolean));
  }

  function clearPendingInspection() {
    pendingInspectionId = "";
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  function formatMiles(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) : "—";
  }

  function formatOdometer(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) : "—";
  }

  function formatTime(value) {
    if (value) return String(value);
    return "";
  }

  function ensureTripEndFeedback() {
    let box = document.getElementById("tripEndSuccessFeedback");
    if (box) return box;

    box = document.createElement("div");
    box.id = "tripEndSuccessFeedback";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    Object.assign(box.style, {
      position: "fixed",
      left: "max(16px, env(safe-area-inset-left))",
      right: "max(16px, env(safe-area-inset-right))",
      top: "max(82px, calc(env(safe-area-inset-top) + 70px))",
      zIndex: "10050",
      display: "none",
      padding: "14px 16px",
      borderRadius: "12px",
      border: "2px solid #22c55e",
      background: "#10261d",
      color: "#f4fff7",
      boxShadow: "0 12px 30px rgba(0,0,0,.35)",
      fontWeight: "700",
      lineHeight: "1.35"
    });
    document.body.appendChild(box);
    return box;
  }

  function showTripEnded(trip) {
    if (!trip?.id) return;
    const box = ensureTripEndFeedback();
    const endTime = formatTime(trip.endTime);
    box.innerHTML = `<strong>Trip ended successfully${endTime ? ` at ${endTime}` : ""}.</strong><br>${formatMiles(trip.miles)} mi • End odometer ${formatOdometer(trip.endOdometer)}<br><span style="font-weight:500;opacity:.9">The trip is saved. Complete the required backup when prompted.</span>`;
    box.style.display = "block";
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      box.style.display = "none";
    }, 9000);
  }

  function restoreEndButton() {
    const button = document.querySelector("#endForm button[type='submit'], #endForm input[type='submit']");
    if (!button) return;
    if (button.dataset.endOriginalText !== undefined) {
      if (button.tagName === "INPUT") button.value = button.dataset.endOriginalText;
      else button.textContent = button.dataset.endOriginalText;
      delete button.dataset.endOriginalText;
    }
    button.removeAttribute("aria-busy");
  }

  function clearPendingTrip() {
    pendingTripId = "";
    if (pendingTripTimer) clearInterval(pendingTripTimer);
    pendingTripTimer = null;
    restoreEndButton();
  }

  function checkPendingTripEnd() {
    if (!pendingTripId) return;
    const state = readState();
    const completed = state.trips.find((trip) => trip?.id === pendingTripId && trip?.endISO);
    if (completed && state.activeTrip?.id !== pendingTripId) {
      showTripEnded(completed);
      clearPendingTrip();
    }
  }

  function beginTripEndFeedback(form) {
    const state = readState();
    if (!state.activeTrip?.id) return;
    pendingTripId = state.activeTrip.id;

    const button = form?.querySelector("button[type='submit'], input[type='submit']");
    if (button && button.dataset.endOriginalText === undefined) {
      const original = button.tagName === "INPUT" ? button.value : button.textContent;
      button.dataset.endOriginalText = original || "End Trip";
      if (button.tagName === "INPUT") button.value = "Ending Trip…";
      else button.textContent = "Ending Trip…";
      button.setAttribute("aria-busy", "true");
    }

    if (pendingTripTimer) clearInterval(pendingTripTimer);
    pendingTripTimer = setInterval(checkPendingTripEnd, 150);
    setTimeout(() => {
      if (!pendingTripId) return;
      checkPendingTripEnd();
      if (pendingTripId) clearPendingTrip();
    }, 12000);
  }

  function showRecentCompletedTrip() {
    const state = readState();
    if (state.activeTrip) return;
    const latest = [...state.trips]
      .filter((trip) => trip?.endISO)
      .sort((a, b) => String(b.endISO).localeCompare(String(a.endISO)))[0];
    if (!latest?.endISO) return;
    const endedAt = Date.parse(latest.endISO);
    if (!Number.isFinite(endedAt) || Date.now() - endedAt > RECENT_END_WINDOW_MS) return;
    setTimeout(() => showTripEnded(latest), 450);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-delete-inspection]");
    if (!button?.dataset?.deleteInspection) return;
    pendingInspectionId = button.dataset.deleteInspection;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(clearPendingInspection, 30000);
  }, true);

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "endForm") return;
    beginTripEndFeedback(event.target);
  }, true);

  window.addEventListener("mileage:state-changed", (event) => {
    if (pendingInspectionId) {
      const source = String(event.detail?.source || "");
      if (!source.startsWith("cloud-sync")) {
        const ids = currentInspectionIds();
        if (!ids.has(pendingInspectionId)) {
          window.MileageMultiDeviceSync?.markDeleted?.("inspection", pendingInspectionId);
          clearPendingInspection();
        }
      }
    }
    checkPendingTripEnd();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STATE_KEY) checkPendingTripEnd();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showRecentCompletedTrip, { once: true });
  } else {
    showRecentCompletedTrip();
  }
})();
