(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const RELOAD_SIGNATURE_KEY = "mileage_logger_cloud_reload_signature_v2";
  let reloadTimer = null;
  let pendingWhileHidden = false;
  let pendingWhileEditing = false;

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function currentSignature() {
    const raw = localStorage.getItem(STATE_KEY) || "";
    return `${raw.length}:${hashText(raw)}`;
  }

  function inspectionFormIsOpen() {
    const panel = document.getElementById("inspectionFormPanel");
    if (!panel) return false;
    return !panel.classList.contains("hidden") && panel.offsetParent !== null;
  }

  function scheduleReload() {
    if (document.visibilityState === "hidden") {
      pendingWhileHidden = true;
      return;
    }

    // Cloud synchronization must never tear down the inspection form while the
    // inspector is entering data. The merged state is already safe in
    // localStorage; defer the visual reload until the form is closed.
    if (inspectionFormIsOpen()) {
      pendingWhileEditing = true;
      return;
    }

    const signature = currentSignature();
    if (!signature || sessionStorage.getItem(RELOAD_SIGNATURE_KEY) === signature) return;
    sessionStorage.setItem(RELOAD_SIGNATURE_KEY, signature);

    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      window.location.reload();
    }, 250);
  }

  function retryDeferredReload() {
    if (document.visibilityState !== "visible") return;
    if (inspectionFormIsOpen()) return;
    if (!pendingWhileHidden && !pendingWhileEditing) return;
    pendingWhileHidden = false;
    pendingWhileEditing = false;
    scheduleReload();
  }

  window.addEventListener("mileage:state-changed", (event) => {
    const source = String(event.detail?.source || "");
    if (!source.startsWith("cloud-sync")) return;
    scheduleReload();
  });

  document.addEventListener("visibilitychange", retryDeferredReload);
  document.addEventListener("click", () => {
    if (!pendingWhileEditing) return;
    setTimeout(retryDeferredReload, 0);
  }, true);
})();
