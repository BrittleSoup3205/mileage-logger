(() => {
  "use strict";

  const api = window.MileageActiveJobsManagement;
  if (!api || !document) return;

  let pendingReview = null;

  const text = (value) => value === null || value === undefined ? "" : String(value);
  const trimmed = (value) => text(value).trim();
  const keyText = (value) => trimmed(value).toLowerCase();
  const escapeHTML = (value) => text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const JOB_FIELDS = [
    "aj", "inspectionNo", "workbookClient", "projectName", "clientProjectNo", "sbOrder",
    "reportingVendor", "vendorJobs", "location", "status", "nextAction", "openClosed",
    "lastInspectionDate", "lastMileageLoggerVisit", "nextExpectedInspection", "lastSourceReviewThrough",
    "workbookLastUpdated", "statusSource", "sourcePage", "dataQuality", "notes"
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function sameValue(left, right) {
    return text(left) === text(right);
  }

  function changesFor(existing, imported) {
    return JOB_FIELDS.filter((field) => !sameValue(existing?.[field], imported?.[field]));
  }

  function buildImportReviewAjFirst(currentJobs = [], importedJobs = []) {
    const existingByAj = new Map(currentJobs.map((job) => [trimmed(job.aj), job]));
    const ajCounts = new Map();

    importedJobs.forEach((job) => {
      const aj = trimmed(job?.aj);
      if (aj) ajCounts.set(aj, (ajCounts.get(aj) || 0) + 1);
    });

    const items = importedJobs.map((sourceJob) => {
      const aj = trimmed(sourceJob.aj);
      const existing = existingByAj.get(aj) || null;
      const job = clone(sourceJob);
      const warnings = Array.isArray(sourceJob._importWarnings) ? [...sourceJob._importWarnings] : [];
      delete job._importWarnings;

      if (existing) {
        [
          ["inspectionNo", "S&B Inspection Number", true],
          ["reportingVendor", "Reporting Vendor / Fabricator", true],
          ["openClosed", "Open / Closed value", false]
        ].forEach(([field, label, warnWhenUnavailable]) => {
          if (!trimmed(sourceJob[field]) && trimmed(existing[field])) {
            job[field] = existing[field];
            warnings.push(`Source blank — existing ${label} preserved.`);
          } else if (warnWhenUnavailable && !trimmed(sourceJob[field]) && !trimmed(existing[field])) {
            warnings.push(`Source blank — no stored ${label} is available for this existing AJ.`);
          }
        });
      }

      const reasons = [];
      if (!aj) reasons.push("Missing AJ / Record ID");
      if (!existing && !trimmed(job.inspectionNo)) reasons.push("Missing S&B Inspection Number");
      if (!existing && !trimmed(job.reportingVendor)) reasons.push("Missing Reporting Vendor / Fabricator");
      if (aj && ajCounts.get(aj) > 1) reasons.push("Duplicate AJ number in imported workbook");

      if (existing) {
        if (trimmed(sourceJob.inspectionNo) && trimmed(existing.inspectionNo) && !sameValue(existing.inspectionNo, sourceJob.inspectionNo)) {
          reasons.push("Existing AJ identity changed (S&B Inspection Number)");
        }
        if (trimmed(sourceJob.reportingVendor) && trimmed(existing.reportingVendor) && !sameValue(existing.reportingVendor, sourceJob.reportingVendor)) {
          reasons.push("Existing AJ identity changed (Reporting Vendor / Fabricator)");
        }
      }

      const changedFields = existing ? changesFor(existing, job) : [];
      let classification = "NO CHANGE";
      if (reasons.length) classification = "CONFLICT";
      else if (!existing) classification = "NEW";
      else if (keyText(job.openClosed) === "closed" && keyText(existing.openClosed) !== "closed") classification = "CLOSED";
      else if (changedFields.length) classification = "UPDATED";

      return {
        aj,
        job,
        sourceJob,
        existing,
        classification,
        changedFields,
        reasons,
        warnings: [...new Set(warnings)],
        resolution: ""
      };
    });

    const counts = { NEW: 0, UPDATED: 0, CLOSED: 0, "NO CHANGE": 0, CONFLICT: 0 };
    items.forEach((item) => { counts[item.classification] += 1; });
    return {
      items,
      counts,
      warningCount: items.filter((item) => item.warnings.length).length,
      importedCount: importedJobs.length
    };
  }

  function classificationClass(value) {
    return `active-jobs-${keyText(value).replace(/\s+/g, "-")}`;
  }

  function conflictCanBeAccepted(item) {
    if (!item?.aj || !trimmed(item.job?.inspectionNo) || !trimmed(item.job?.reportingVendor)) return false;
    return !(item.reasons || []).some((reason) => /duplicate aj/i.test(reason));
  }

  function unresolvedConflictCount(review) {
    return (review?.items || []).filter(
      (item) => item.classification === "CONFLICT" && !["keep", "accept"].includes(item.resolution)
    ).length;
  }

  function reviewMarkup(review) {
    if (!review) {
      return `<div class="active-jobs-empty">Choose Active Jobs Master.xlsx to prepare a review. Nothing changes until Apply Update is pressed.</div>`;
    }
    const count = (name) => Number(review.counts?.[name] || 0);
    return `
      <div class="active-jobs-review-counts">
        ${["NEW", "UPDATED", "CLOSED", "NO CHANGE", "CONFLICT"].map((name) => `<span class="${classificationClass(name)}"><strong>${count(name)}</strong> ${name}</span>`).join("")}
        <span class="active-jobs-warning"><strong>${Number(review.warningCount || 0)}</strong> WARNINGS</span>
      </div>
      <div class="active-jobs-review-list">${review.items.map((item, index) => `
        <article class="active-jobs-review-item ${classificationClass(item.classification)}">
          <span>${escapeHTML(item.classification)}</span>
          <strong>${escapeHTML(item.aj || `Row ${item.job.sourceRow || "?"}`)} — ${escapeHTML(item.job.inspectionNo || "No inspection number")}</strong>
          <small>${escapeHTML(item.job.reportingVendor || "No reporting vendor")}${item.changedFields.length ? ` • Changed: ${escapeHTML(item.changedFields.join(", "))}` : ""}</small>
          ${item.reasons.length ? `<p>${escapeHTML(item.reasons.join("; "))}</p>` : ""}
          ${item.warnings?.length ? `<p class="active-jobs-warning-text">${escapeHTML(item.warnings.join(" "))}</p>` : ""}
          ${item.classification === "CONFLICT" ? `<label>Required resolution<select data-aj-first-conflict-resolution="${index}"><option value=""${item.resolution ? "" : " selected"}>Choose…</option><option value="keep"${item.resolution === "keep" ? " selected" : ""}>Keep current data / skip row</option>${conflictCanBeAccepted(item) ? `<option value="accept"${item.resolution === "accept" ? " selected" : ""}>Accept workbook identity change</option>` : ""}</select></label><small>${conflictCanBeAccepted(item) ? "Accept is available because this is a complete AJ identity change." : "Correct the duplicate AJ number or missing identity data in the workbook and review it again."}</small>` : ""}
        </article>`).join("")}
      </div>`;
  }

  function renderReview() {
    const host = document.getElementById("activeJobsImportReview");
    if (host) host.innerHTML = reviewMarkup(pendingReview);
    const apply = document.getElementById("applyActiveJobsUpdateBtn");
    if (apply) apply.disabled = !pendingReview || unresolvedConflictCount(pendingReview) > 0;
    const cancel = document.getElementById("cancelActiveJobsUpdateBtn");
    if (cancel) cancel.disabled = !pendingReview;
  }

  async function prepareWorkbookReview(file) {
    const status = document.getElementById("activeJobsImportStatus");
    if (status) status.textContent = `Reading ${file.name}…`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = api.parseActiveJobsWorkbookBytes(bytes, window.fflate);
    const state = api.readState();
    const review = buildImportReviewAjFirst(api.getActiveJobs(state), parsed.jobs);
    pendingReview = {
      ...review,
      sourceFilename: file.name,
      sourceHash: await api.hashBytes(bytes),
      worksheetName: parsed.sheetName,
      headerRow: parsed.headerRow
    };

    renderReview();
    if (status) {
      status.textContent = `${parsed.jobs.length} Active Jobs rows read from ${parsed.sheetName}. ${review.warningCount || 0} non-blocking warning row${review.warningCount === 1 ? "" : "s"}. AJ number is the record identity; shared S&B inspection numbers/vendors are allowed.`;
      status.className = review.counts.CONFLICT || review.warningCount ? "gps-status warn" : "gps-status good";
    }
  }

  document.addEventListener("change", async (event) => {
    if (event.target.id === "activeJobsWorkbookInput") {
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        await prepareWorkbookReview(file);
      } catch (error) {
        console.error("AJ-first Active Jobs workbook import failed:", error);
        const status = document.getElementById("activeJobsImportStatus");
        if (status) {
          status.textContent = error.message;
          status.className = "gps-status warn";
        }
        window.alert(`Active Jobs could not be reviewed.\n\n${error.message}`);
      }
      return;
    }

    const resolution = event.target.closest("[data-aj-first-conflict-resolution]");
    if (resolution && pendingReview) {
      event.stopImmediatePropagation();
      const item = pendingReview.items[Number(resolution.dataset.ajFirstConflictResolution)];
      if (item?.classification === "CONFLICT") item.resolution = resolution.value;
      renderReview();
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("#cancelActiveJobsUpdateBtn")) {
      if (!pendingReview) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingReview = null;
      renderReview();
      const status = document.getElementById("activeJobsImportStatus");
      if (status) {
        status.textContent = "Choose an .xlsx file containing a worksheet named Active Jobs.";
        status.className = "gps-status";
      }
      return;
    }

    if (event.target.closest("#applyActiveJobsUpdateBtn") && pendingReview) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (unresolvedConflictCount(pendingReview)) {
        window.alert("Resolve every true AJ conflict before applying this update.");
        return;
      }
      if (!window.confirm("Apply all NEW, UPDATED, and CLOSED Active Jobs shown in this review, using AJ number as the authoritative record identity?")) return;

      const state = api.readState();
      const sync = window.MileageMultiDeviceSync;
      const config = sync?.getConfig?.() || {};
      const result = api.applyImportReview(state, pendingReview, {
        sourceFilename: pendingReview.sourceFilename,
        sourceHash: pendingReview.sourceHash,
        deviceId: sync?.getDeviceId?.() || "",
        deviceLabel: config.deviceLabel || "",
        importedISO: new Date().toISOString()
      });
      api.writeState(result.state);
      pendingReview = null;
      window.dispatchEvent(new CustomEvent("mileage:state-changed", { detail: { source: "active-jobs-import-aj-identity-fix" } }));
      window.alert("Active Jobs update applied. Distinct AJ records sharing an S&B inspection number/vendor were kept separate.");
    }
  }, true);

  window.MileageActiveJobsImportAjIdentityFix = Object.freeze({ buildImportReviewAjFirst });
})();