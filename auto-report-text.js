(() => {
  "use strict";

  const STATE_KEY = "mileage_logger_state_v3";
  const PANEL_ID = "autoReportTextPanel";
  let pendingOverride = null;
  let patchingState = false;

  const PRESETS = {
    material: {
      label: "Material / MTR Review",
      defaultChecks: ["bom", "grade"],
      checks: [
        ["bom", "Drawing bill of materials verified"],
        ["grade", "Material grade verified"],
        ["trace", "Heat / material traceability verified"],
        ["noIssues", "No discrepancies noted"]
      ],
      extraFields: []
    },
    fabrication: {
      label: "In-Process Fabrication",
      defaultChecks: ["fitup", "material", "weld", "bevel", "workmanship"],
      checks: [
        ["fitup", "Fit-up"],
        ["material", "Material verification"],
        ["weld", "Weld appearance"],
        ["bevel", "Weld / bevel preparation"],
        ["orientation", "Orientation"],
        ["socketGap", "Socket-weld gap"],
        ["workmanship", "General workmanship"]
      ],
      extraFields: []
    },
    welding: {
      label: "Welding Surveillance",
      defaultChecks: ["wps", "welder"],
      checks: [
        ["wps", "WPS compliance verified"],
        ["welder", "Welder qualification / continuity verified"],
        ["machine", "Welding machine calibration verified"],
        ["parameters", "Welding parameters checked"],
        ["filler", "Filler metal verified"],
        ["preheat", "Preheat / interpass verified"]
      ],
      extraFields: [
        ["WPS / revision", "autoReportWps", "Example: WPS CI-106-2F Rev. 11"],
        ["Process / filler metal", "autoReportWeldDetails", "Example: GTAW, ER70S-2"]
      ]
    },
    hydro: {
      label: "Hydrostatic Test",
      defaultChecks: ["gauges", "stable", "noLeak"],
      checks: [
        ["gauges", "Calibrated pressure gauges verified"],
        ["stable", "Pressure remained stable"],
        ["noLeak", "No visible leakage"],
        ["zero", "Gauge return to zero verified"],
        ["water", "Test-water documentation reviewed"],
        ["drained", "Item drained after test"],
        ["docs", "Hydro documentation reviewed"]
      ],
      extraFields: [
        ["Test pressure", "autoReportPressure", "Example: 900 psi"],
        ["Hold duration", "autoReportDuration", "Example: 30 minutes"],
        ["Gauge IDs", "autoReportGaugeIds", "Optional"],
        ["Chloride result", "autoReportChloride", "Optional, example: < 50 mg/kg"]
      ]
    },
    nde: {
      label: "NDE Review / Witness",
      defaultChecks: ["reviewed"],
      checks: [
        ["reviewed", "Reports / records reviewed"],
        ["witnessed", "Examination witnessed"],
        ["film", "Film reviewed"],
        ["coverage", "Required coverage verified"],
        ["accepted", "Reported results acceptable"]
      ],
      extraFields: [
        ["NDE method", "autoReportNdeMethod", "Example: RT, PT, PAUT, MT, PMI, hardness"],
        ["Welds / items", "autoReportNdeItems", "Example: Spool 5D - W3, W4"],
        ["Stage", "autoReportNdeStage", "Optional: before PWHT, after PWHT, final"]
      ]
    },
    blast: {
      label: "Coating - Blast / Surface Prep",
      defaultChecks: ["clean", "environment"],
      checks: [
        ["clean", "Surface cleanliness satisfactory"],
        ["environment", "Environmental conditions acceptable"],
        ["blotter", "Blotter test satisfactory"],
        ["chloride", "Surface chloride testing satisfactory"],
        ["profile", "Anchor profile verified"]
      ],
      extraFields: [
        ["Surface-prep standard", "autoReportBlastStandard", "Example: SSPC-SP 10"],
        ["Anchor profile", "autoReportProfile", "Example: 2.5 mils or 3.0-5.0 mils"]
      ]
    },
    coatingFinal: {
      label: "Coating - Final / DFT",
      defaultChecks: ["appearance", "dft"],
      checks: [
        ["appearance", "Final appearance satisfactory"],
        ["dft", "DFT within required range"],
        ["runs", "No detrimental runs / sags / holidays observed"],
        ["touchup", "Minor touch-up completed"],
        ["report", "Vendor coating report reviewed"]
      ],
      extraFields: [
        ["Coating system", "autoReportCoatingSystem", "Example: Shell System 1"],
        ["DFT result", "autoReportDft", "Example: 11 mils avg. or 10-14 mils"]
      ]
    },
    postGalv: {
      label: "Structural Steel - Post-Galvanizing",
      defaultChecks: ["dimension", "weld", "galv"],
      checks: [
        ["dimension", "Dimensions within applicable tolerances"],
        ["weld", "Visible welds satisfactory"],
        ["galv", "Galvanized coating satisfactory"],
        ["holes", "Bolt holes adequately coated / clear"],
        ["marks", "Piece marks / tags verified"],
        ["package", "Packaging / palletization verified"]
      ],
      extraFields: [
        ["Galvanizing reference", "autoReportGalvReference", "Example: ASTM A123 / project DEP"],
        ["Weld size checked", "autoReportWeldSize", "Optional, example: 1/4 in."]
      ]
    },
    shipping: {
      label: "Final Vessel / Shipping Preparation",
      defaultChecks: ["dry", "clean", "markings"],
      checks: [
        ["dry", "Accessible internal areas dry"],
        ["clean", "Accessible internal areas clean"],
        ["internals", "Internals / loose-shipped items verified"],
        ["nameplate", "Nameplate information verified"],
        ["markings", "Required markings / stenciling verified"],
        ["flanges", "Flange faces / protective covers checked"],
        ["condition", "General shipping condition satisfactory"]
      ],
      extraFields: []
    }
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[ch]));
  }

  function value(id) {
    return document.getElementById(id)?.value?.trim() || "";
  }

  function checked(name) {
    return [...document.querySelectorAll(`[name="${name}"]:checked`)].map((el) => el.value);
  }

  function resultEnding(result) {
    switch (result) {
      case "Satisfactory": return "Results were satisfactory for the scope inspected.";
      case "Satisfactory except as noted": return "Results were satisfactory except as otherwise noted in this report.";
      case "Pending": return "Final acceptance remains pending completion of the noted inspection or documentation requirements.";
      case "Hold": return "The inspected scope remains on hold pending resolution of the noted items.";
      case "Rejected": return "The inspected scope was not accepted; deficiencies and required corrective actions are noted separately.";
      default: return "This entry documents the inspection activity performed; no acceptance statement is inferred.";
    }
  }

  function selectedLabels(presetKey) {
    const preset = PRESETS[presetKey];
    const keys = new Set(checked("autoReportCheck"));
    return preset.checks.filter(([key]) => keys.has(key)).map(([, label]) => label);
  }

  function scopePhrase() {
    const items = value("autoReportItems");
    return items ? ` for ${items}` : "";
  }

  function referencePhrase() {
    const ref = value("autoReportReference");
    return ref ? ` against ${ref}` : "";
  }

  function buildText() {
    const presetKey = value("autoReportPreset");
    const preset = PRESETS[presetKey];
    if (!preset) return "";
    const result = value("autoReportResult") || "Informational only";
    const labels = selectedLabels(presetKey);
    const scope = scopePhrase();
    const ref = referencePhrase();
    const bits = [];

    if (presetKey === "material") {
      bits.push(`Material test reports (MTRs) were reviewed${scope}${ref}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "fabrication") {
      bits.push(`Random in-process inspections were performed during fabrication${scope}${ref}.`);
      if (labels.length) bits.push(`Inspection activities included ${labels.join(", ").toLowerCase()}.`);
    } else if (presetKey === "welding") {
      bits.push(`Production welding was monitored during fabrication${scope}${ref}.`);
      const wps = value("autoReportWps");
      const details = value("autoReportWeldDetails");
      if (wps) bits.push(`Applicable welding procedure: ${wps}.`);
      if (details) bits.push(`Process / filler metal observed: ${details}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "hydro") {
      const pressure = value("autoReportPressure");
      const duration = value("autoReportDuration");
      bits.push(`Hydrostatic testing was witnessed${scope}${pressure ? ` at ${pressure}` : ""}${duration ? ` for ${duration}` : ""}${ref}.`);
      const gaugeIds = value("autoReportGaugeIds");
      const chloride = value("autoReportChloride");
      if (gaugeIds) bits.push(`Pressure gauge ID(s): ${gaugeIds}.`);
      if (chloride) bits.push(`Recorded chloride result: ${chloride}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "nde") {
      const method = value("autoReportNdeMethod") || "NDE";
      const ndeItems = value("autoReportNdeItems");
      const stage = value("autoReportNdeStage");
      bits.push(`${method} examination activity was documented${ndeItems ? ` for ${ndeItems}` : scope}${stage ? ` (${stage})` : ""}${ref}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "blast") {
      const standard = value("autoReportBlastStandard");
      const profile = value("autoReportProfile");
      bits.push(`Surface preparation was inspected prior to coating application${scope}${standard ? ` to ${standard}` : ref}.`);
      if (profile) bits.push(`Anchor profile: ${profile}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "coatingFinal") {
      const system = value("autoReportCoatingSystem");
      const dft = value("autoReportDft");
      bits.push(`Final coating inspection was performed following completion of coating activities${scope}${system ? ` for ${system}` : ""}${ref}.`);
      if (dft) bits.push(`Recorded DFT: ${dft}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "postGalv") {
      const galvRef = value("autoReportGalvReference");
      const weldSize = value("autoReportWeldSize");
      bits.push(`Final visual and dimensional inspection was performed on fabricated structural steel after hot-dip galvanizing${scope}${ref}.`);
      if (galvRef) bits.push(`Galvanized coating was reviewed to ${galvRef}.`);
      if (weldSize) bits.push(`Verified weld size: ${weldSize}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    } else if (presetKey === "shipping") {
      bits.push(`Final shipment preparation inspection was performed${scope}${ref}.`);
      if (labels.length) bits.push(`${labels.join(", ")}.`);
    }

    bits.push(resultEnding(result));
    return bits.join(" ").replace(/\s+/g, " ").trim();
  }

  function renderPresetFields() {
    const presetKey = value("autoReportPreset");
    const preset = PRESETS[presetKey];
    const checks = document.getElementById("autoReportChecks");
    const extra = document.getElementById("autoReportExtraFields");
    if (!preset || !checks || !extra) return;
    checks.innerHTML = preset.checks.map(([key, label]) => `
      <label class="auto-report-check"><input type="checkbox" name="autoReportCheck" value="${esc(key)}"${preset.defaultChecks.includes(key) ? " checked" : ""}><span>${esc(label)}</span></label>
    `).join("");
    extra.innerHTML = preset.extraFields.map(([label, id, placeholder]) => `
      <label>${esc(label)}<input id="${esc(id)}" placeholder="${esc(placeholder)}"></label>
    `).join("");
    const output = document.getElementById("autoReportOutput");
    if (output) output.value = "";
  }

  function useText() {
    const text = value("autoReportOutput") || buildText();
    if (!text) return;
    const output = document.getElementById("autoReportOutput");
    if (output) output.value = text;
    const preview = document.getElementById("inspectionReportPreview");
    if (preview) {
      preview.dataset.reportLanguage = text;
      preview.classList.remove("hidden");
      preview.innerHTML = `<strong>Auto report language</strong><p>${esc(text)}</p><small>Controlled phrase-library text. Review and edit before saving.</small>`;
    }
    pendingOverride = {
      text,
      activatedAt: Date.now(),
      activeJobId: value("inspectionActiveJobId"),
      date: value("inspectionDate"),
      activity: value("inspectionActivity")
    };
    const status = document.getElementById("autoReportStatus");
    if (status) status.textContent = "This text will be saved as Generated Report Language when you save the inspection.";
  }

  function injectPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const generate = document.getElementById("generateInspectionReportBtn");
    if (!generate) return;
    const host = generate.closest(".form-actions")?.parentElement || generate.parentElement;
    if (!host) return;

    const styleId = "autoReportTextStyles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .auto-report-panel{margin:14px 0;padding:14px;border:2px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--card),var(--bg) 24%)}
        .auto-report-panel h4{margin:0 0 4px}.auto-report-panel p{margin:0 0 10px}.auto-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .auto-report-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;margin:10px 0}.auto-report-check{display:flex;align-items:flex-start;gap:7px}
        .auto-report-check input{width:auto;margin-top:3px}.auto-report-output{width:100%;min-height:145px;margin-top:10px}.auto-report-status{display:block;margin-top:7px;color:var(--muted)}
        @media(max-width:760px){.auto-report-grid,.auto-report-checks{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "auto-report-panel";
    panel.innerHTML = `
      <h4>Auto Report Text - Phrase Library</h4>
      <p class="muted">Build controlled wording from facts you enter. Nothing is assumed from the preset alone.</p>
      <div class="auto-report-grid">
        <label>Preset<select id="autoReportPreset">${Object.entries(PRESETS).map(([key,p]) => `<option value="${esc(key)}">${esc(p.label)}</option>`).join("")}</select></label>
        <label>Result<select id="autoReportResult">
          <option>Satisfactory</option><option>Satisfactory except as noted</option><option>Pending</option><option>Hold</option><option>Rejected</option><option>Informational only</option>
        </select></label>
        <label>Items / scope<input id="autoReportItems" placeholder="Optional: spools, piece marks, vessel, welds"></label>
        <label>Reference / drawing / specification<input id="autoReportReference" placeholder="Optional"></label>
      </div>
      <div id="autoReportExtraFields" class="auto-report-grid"></div>
      <div id="autoReportChecks" class="auto-report-checks"></div>
      <div class="form-actions wrap">
        <button id="buildAutoReportTextBtn" class="button button-secondary button-small" type="button">Build Auto Text</button>
        <button id="useAutoReportTextBtn" class="button inspection-button button-small" type="button">Use as Generated Report Language</button>
      </div>
      <textarea id="autoReportOutput" class="auto-report-output" rows="7" placeholder="Generated text appears here. Edit freely before using it."></textarea>
      <small id="autoReportStatus" class="auto-report-status">The current Generate Draft Report Language button remains available below.</small>
    `;
    host.insertBefore(panel, generate.closest(".form-actions") || generate);

    document.getElementById("autoReportPreset")?.addEventListener("change", renderPresetFields);
    document.getElementById("buildAutoReportTextBtn")?.addEventListener("click", () => {
      const output = document.getElementById("autoReportOutput");
      if (output) output.value = buildText();
    });
    document.getElementById("useAutoReportTextBtn")?.addEventListener("click", useText);
    generate.addEventListener("click", () => {
      pendingOverride = null;
      const status = document.getElementById("autoReportStatus");
      if (status) status.textContent = "Built-in draft generator selected; the phrase-library override is cleared.";
    });
    renderPresetFields();
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function applyPendingOverride() {
    if (!pendingOverride || patchingState) return;
    const state = readState();
    const inspections = state?.settings?.inspections;
    if (!Array.isArray(inspections) || !inspections.length) return;
    const candidates = inspections.filter((item) => {
      if (pendingOverride.activeJobId && item.activeJobId !== pendingOverride.activeJobId) return false;
      if (pendingOverride.date && item.date !== pendingOverride.date) return false;
      if (pendingOverride.activity && item.activity !== pendingOverride.activity) return false;
      return true;
    }).sort((a,b) => String(b.modifiedISO || b.createdISO || "").localeCompare(String(a.modifiedISO || a.createdISO || "")));
    const target = candidates[0];
    if (!target) return;
    const modifiedMs = Date.parse(target.modifiedISO || target.createdISO || 0) || 0;
    if (modifiedMs && modifiedMs < pendingOverride.activatedAt - 5000) return;
    if (target.generatedReportLanguage === pendingOverride.text) {
      pendingOverride = null;
      return;
    }

    patchingState = true;
    const now = new Date().toISOString();
    target.generatedReportLanguage = pendingOverride.text;
    target.modifiedISO = now;
    state.settings = state.settings || {};
    state.settings.inspectionLastChangedISO = now;
    state.backup = state.backup && typeof state.backup === "object" ? state.backup : {};
    state.backup.pendingChangeCount = Math.max(1, Number(state.backup.pendingChangeCount || 0) + 1);
    state.backup.lastRequiredISO = now;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("mileage:state-changed"));
    pendingOverride = null;
    window.setTimeout(() => { patchingState = false; }, 50);
  }

  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "inspectionForm" || !pendingOverride) return;
    pendingOverride.activeJobId = value("inspectionActiveJobId");
    pendingOverride.date = value("inspectionDate");
    pendingOverride.activity = value("inspectionActivity");
    pendingOverride.activatedAt = Date.now();
    window.setTimeout(applyPendingOverride, 120);
    window.setTimeout(applyPendingOverride, 450);
  }, true);

  window.addEventListener("mileage:state-changed", () => {
    if (pendingOverride) window.setTimeout(applyPendingOverride, 30);
    window.setTimeout(injectPanel, 0);
  });

  const observer = new MutationObserver(() => injectPanel());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  injectPanel();

  window.MileageAutoReportText = Object.freeze({ PRESETS, buildText });
})();