(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";

  function text(value) {
    return String(value ?? "").trim();
  }

  function fnv32(input, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function legacyTripId(trip) {
    const source = trip && typeof trip === "object" ? trip : {};
    const fingerprint = [
      source.date,
      source.startISO,
      source.endISO,
      source.startTime,
      source.endTime,
      source.startOdometer,
      source.endOdometer,
      source.miles,
      source.customer,
      source.vendor,
      source.projectNumber,
      source.purpose,
      source.startLocation?.latitude,
      source.startLocation?.longitude,
      source.endLocation?.latitude,
      source.endLocation?.longitude
    ].map(text).join("\u241f");
    return `legacy-trip-${fnv32(fingerprint, 2166136261)}${fnv32(fingerprint, 2246822519)}`;
  }

  function assignTripIds(state) {
    if (!state || typeof state !== "object") return false;
    let changed = false;
    if (Array.isArray(state.trips)) {
      state.trips.forEach((trip) => {
        if (!trip || typeof trip !== "object" || text(trip.id)) return;
        trip.id = legacyTripId(trip);
        changed = true;
      });
    }
    if (state.activeTrip && typeof state.activeTrip === "object" && !text(state.activeTrip.id)) {
      state.activeTrip.id = legacyTripId(state.activeTrip);
      changed = true;
    }
    return changed;
  }

  function migrateStoredState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!assignTripIds(state)) return;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not assign legacy trip IDs:", error);
    }
  }

  function wrapWorkflowMigration() {
    const api = window.MileageWorkflowData;
    if (!api || api.__legacyTripIdFixApplied) return;
    const originalTrip = typeof api.migrateTrip === "function" ? api.migrateTrip.bind(api) : (trip) => trip;
    const originalState = typeof api.migrateState === "function" ? api.migrateState.bind(api) : (state) => state;

    api.migrateTrip = (trip) => {
      const migrated = originalTrip(trip) || {};
      if (!text(migrated.id)) migrated.id = legacyTripId(migrated);
      return migrated;
    };

    api.migrateState = (state) => {
      const migrated = originalState(state) || {};
      assignTripIds(migrated);
      return migrated;
    };

    api.__legacyTripIdFixApplied = true;
    api.legacyTripId = legacyTripId;
  }

  wrapWorkflowMigration();
  migrateStoredState();
})();
