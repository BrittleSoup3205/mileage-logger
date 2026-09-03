(() => {
  "use strict";
  const STATE_KEY = "mileage_logger_state_v3";
  const ARCHIVE_KEY = "mileage_logger_trip_duplicate_archive_v1";
  const SUMMARY_KEY = "mileage_logger_trip_integrity_summary_v1";
  let timer = null;
  let running = false;

  const parse = (value, fallback) => { try { const x = JSON.parse(value); return x ?? fallback; } catch (_) { return fallback; } };
  const text = (value) => String(value ?? "").trim();
  const hash = (input, seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  const fingerprint = (trip) => [
    trip?.date, trip?.startISO, trip?.endISO, trip?.startTime, trip?.endTime,
    trip?.startOdometer, trip?.endOdometer, trip?.miles, trip?.customer,
    trip?.vendor, trip?.projectNumber, trip?.purpose
  ].map(text).join("\u241f");
  const generatedId = (trip, prefix = "legacy-trip") => {
    const fp = fingerprint(trip);
    return `${prefix}-${hash(fp, 2166136261)}${hash(fp, 2246822519)}`;
  };
  const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
    return JSON.stringify(value);
  };
  const uniqueItems = (items) => {
    const seen = new Set();
    return (items || []).filter((item) => {
      const key = text(item?.id) || stable(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const score = (trip) => {
    let n = 0;
    Object.values(trip || {}).forEach((v) => {
      if (v === null || v === undefined || v === "") return;
      n += Array.isArray(v) ? Math.min(v.length, 10) + 1 : (typeof v === "object" ? Object.keys(v).length + 1 : 1);
    });
    if (trip?.endISO) n += 5;
    if (trip?.endOdometer !== undefined && trip?.endOdometer !== null && trip?.endOdometer !== "") n += 5;
    return n;
  };
  const mergeCopies = (copies) => {
    const winner = [...copies].sort((a, b) => score(b) - score(a))[0] || {};
    const merged = { ...winner };
    const keys = new Set(copies.flatMap((item) => Object.keys(item || {})));
    keys.forEach((key) => {
      if (key === "photos") {
        merged.photos = uniqueItems(copies.flatMap((item) => Array.isArray(item?.photos) ? item.photos : []));
      } else if (key === "routePoints") {
        merged.routePoints = copies.map((item) => Array.isArray(item?.routePoints) ? item.routePoints : []).sort((a, b) => b.length - a.length)[0] || [];
      } else if (key === "notes") {
        const notes = copies.map((item) => text(item?.notes)).filter(Boolean).sort((a, b) => b.length - a.length);
        if (notes.length) merged.notes = notes[0];
      } else if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
        const source = copies.find((item) => item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== "");
        if (source) merged[key] = source[key];
      }
    });
    return merged;
  };

  function repair() {
    if (running) return;
    running = true;
    try {
      const state = parse(localStorage.getItem(STATE_KEY), null);
      if (!state || !Array.isArray(state.trips)) return;
      let changed = false;
      let assignedIds = 0;
      let duplicateGroups = 0;
      let removedCopies = 0;
      let recoveredCollisions = 0;

      state.trips.forEach((trip) => {
        if (!trip || typeof trip !== "object" || text(trip.id)) return;
        trip.id = generatedId(trip);
        assignedIds += 1;
        changed = true;
      });

      const byId = new Map();
      state.trips.forEach((trip, index) => {
        const id = text(trip?.id);
        if (!id) return;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push({ trip, index });
      });

      const replacements = new Map();
      const remove = new Set();
      const archiveGroups = [];

      byId.forEach((entries, id) => {
        if (entries.length < 2) return;
        duplicateGroups += 1;
        archiveGroups.push({ id, entries: entries.map(({ trip }) => trip) });
        const byFp = new Map();
        entries.forEach((entry) => {
          const fp = fingerprint(entry.trip);
          if (!byFp.has(fp)) byFp.set(fp, []);
          byFp.get(fp).push(entry);
        });
        const groups = [...byFp.values()];
        const canonical = groups[groups.length - 1];
        const canonicalIndex = canonical[canonical.length - 1].index;
        const canonicalTrip = mergeCopies(canonical.map((x) => x.trip));
        canonicalTrip.id = id;
        replacements.set(canonicalIndex, canonicalTrip);
        canonical.slice(0, -1).forEach((x) => { remove.add(x.index); removedCopies += 1; });

        groups.slice(0, -1).forEach((group) => {
          const keepIndex = group[group.length - 1].index;
          const recovered = mergeCopies(group.map((x) => x.trip));
          recovered.id = generatedId(recovered, "recovered-trip");
          replacements.set(keepIndex, recovered);
          group.slice(0, -1).forEach((x) => { remove.add(x.index); removedCopies += 1; });
          recoveredCollisions += 1;
        });
      });

      if (archiveGroups.length) {
        const history = parse(localStorage.getItem(ARCHIVE_KEY), []);
        const next = Array.isArray(history) ? history.slice(-9) : [];
        next.push({ archivedISO: new Date().toISOString(), groups: archiveGroups });
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
      }

      if (duplicateGroups) {
        state.trips = state.trips.map((trip, index) => replacements.get(index) || trip).filter((_, index) => !remove.has(index));
        changed = true;
      }

      if (!changed) return;
      state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
      state.backup.pendingChangeCount = Math.max(0, Number(state.backup.pendingChangeCount || 0)) + 1;
      state.backup.lastRequiredISO = new Date().toISOString();
      const summary = { repairedISO: state.backup.lastRequiredISO, assignedIds, duplicateGroups, removedCopies, recoveredCollisions, resultingTripCount: state.trips.length };
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "trip-integrity-repair", ...summary } }));
      setTimeout(() => window.MileageMultiDeviceSync?.syncNow?.({ reason: "trip-integrity-repair" }), 250);
    } finally {
      running = false;
    }
  }

  function schedule(delay = 300) {
    clearTimeout(timer);
    timer = setTimeout(repair, delay);
  }

  schedule(200);
  window.addEventListener("mileage:state-changed", (event) => {
    if (String(event.detail?.source || "") === "trip-integrity-repair") return;
    schedule(500);
  });
  window.addEventListener("online", () => schedule(250));
})();
