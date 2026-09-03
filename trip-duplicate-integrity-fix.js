(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  let running = false;

  function text(value) {
    return String(value ?? "").trim();
  }

  function isBlank(value) {
    return value === null || value === undefined || value === "";
  }

  function scoreTrip(trip) {
    if (!trip || typeof trip !== "object") return 0;
    let score = 0;
    Object.values(trip).forEach((value) => {
      if (Array.isArray(value)) score += Math.min(value.length, 20);
      else if (value && typeof value === "object") score += Object.keys(value).length;
      else if (!isBlank(value)) score += 1;
    });
    score += text(trip.notes).length / 100;
    score += (Array.isArray(trip.photos) ? trip.photos.length : 0) * 5;
    score += (Array.isArray(trip.routePoints) ? trip.routePoints.length : 0) / 10;
    return score;
  }

  function mergeUniqueArray(left, right, keyFn) {
    const output = [];
    const seen = new Set();
    [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].forEach((item, index) => {
      const key = keyFn(item, index);
      if (seen.has(key)) return;
      seen.add(key);
      output.push(item);
    });
    return output;
  }

  function photoKey(photo, index) {
    if (!photo || typeof photo !== "object") return `raw:${String(photo)}:${index}`;
    return text(photo.id) || [text(photo.filename || photo.name), text(photo.createdISO || photo.date), text(photo.size)].join("|") || `photo:${index}`;
  }

  function routeKey(point, index) {
    if (!point || typeof point !== "object") return `raw:${String(point)}:${index}`;
    return [text(point.timestamp || point.iso || point.time), text(point.latitude), text(point.longitude)].join("|") || `point:${index}`;
  }

  function mergeTrips(first, second) {
    const firstScore = scoreTrip(first);
    const secondScore = scoreTrip(second);
    const primary = firstScore >= secondScore ? { ...first } : { ...second };
    const secondary = firstScore >= secondScore ? second : first;

    Object.entries(secondary || {}).forEach(([key, value]) => {
      if (isBlank(primary[key]) && !isBlank(value)) primary[key] = value;
    });

    const firstNotes = text(first?.notes);
    const secondNotes = text(second?.notes);
    primary.notes = firstNotes.length >= secondNotes.length ? firstNotes : secondNotes;

    primary.photos = mergeUniqueArray(first?.photos, second?.photos, photoKey);

    const firstRoute = Array.isArray(first?.routePoints) ? first.routePoints : [];
    const secondRoute = Array.isArray(second?.routePoints) ? second.routePoints : [];
    primary.routePoints = firstRoute.length === secondRoute.length
      ? mergeUniqueArray(firstRoute, secondRoute, routeKey)
      : (firstRoute.length > secondRoute.length ? firstRoute : secondRoute);

    if (first?.reimbursement || second?.reimbursement) {
      primary.reimbursement = {
        ...(second?.reimbursement || {}),
        ...(first?.reimbursement || {}),
        ...(primary.reimbursement || {})
      };
    }

    primary.modifiedISO = [text(first?.modifiedISO), text(second?.modifiedISO)].sort().pop() || primary.modifiedISO;
    primary.id = text(first?.id) || text(second?.id);
    return primary;
  }

  function dedupeTrips() {
    if (running) return false;
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;

    let state;
    try {
      state = JSON.parse(raw);
    } catch (_) {
      return false;
    }

    if (!state || !Array.isArray(state.trips) || state.trips.length < 2) return false;

    running = true;
    try {
      const byId = new Map();
      const order = [];
      let duplicateCount = 0;

      state.trips.forEach((trip) => {
        const id = text(trip?.id);
        if (!id) {
          order.push({ anonymous: true, trip });
          return;
        }
        if (!byId.has(id)) {
          byId.set(id, trip);
          order.push({ id });
          return;
        }
        byId.set(id, mergeTrips(byId.get(id), trip));
        duplicateCount += 1;
      });

      if (!duplicateCount) return false;

      state.trips = order.map((entry) => entry.anonymous ? entry.trip : byId.get(entry.id)).filter(Boolean);
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent("mileage:state-changed", {
        detail: {
          source: "trip-id-dedupe",
          duplicateCount,
          uniqueTripCount: state.trips.length
        }
      }));
      setTimeout(() => window.MileageMultiDeviceSync?.syncNow?.({ reason: "trip-id-dedupe" }), 250);
      return true;
    } finally {
      running = false;
    }
  }

  setTimeout(dedupeTrips, 700);
  window.addEventListener("mileage:state-changed", (event) => {
    if (String(event.detail?.source || "") === "trip-id-dedupe") return;
    setTimeout(dedupeTrips, 300);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(dedupeTrips, 300);
  });
})();
