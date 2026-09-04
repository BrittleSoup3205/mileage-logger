(() => {
  "use strict";

  function clearCloudActiveTrip() {
    const sync = window.MileageMultiDeviceSync;
    if (!sync?.markDeleted) return;
    sync.markDeleted("active_trip", "current");
  }

  window.addEventListener("mileage:trip-finalized", clearCloudActiveTrip);
  window.addEventListener("mileage:trip-cancelled", clearCloudActiveTrip);
})();
