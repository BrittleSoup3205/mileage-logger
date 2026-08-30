(() => {
  "use strict";

  const base = window.MileageInspectionReportTesting;
  if (!base || !window.fflate) return;

  const EMU_PER_INCH = 914400;
  const MAX_PHOTO_WIDTH = 3.25;
  const MAX_PHOTO_HEIGHT = 2.0;
  const IMAGE_EXTENSION_RE = /\.(?:jpe?g|png|heic|heif|webp)\b/gi;
  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";

  const CONTROLLED_SECTION_LABELS = [
    "DESCRIPTION:",
    "ACTION ITEMS:",
    "ENGINEERING COMPLETE:",
    "MATERIAL COMPLETE:",
    "FABRICATION COMPLETE:",
    "COATINGS:",
    "INSPECTION/AUDIT:",
    "SHOP INSPECTION:",
    "NDE REVIEW:",
    "COATING INSPECTION:",
    "INSPECTION RELEASE:"
  ];

  function descendantsByLocalName(parent, localName) {
    return Array.from(parent?.getElementsByTagName?.("*") || [])
      .filter((element) => element.localName === localName);
  }

  function photoDescription(photo) {
    return String(photo?.caption || photo?.name || "").trim();
  }

  function fittedExtent(photo) {
    const rotated = ["left", "right"].includes(photo?.reportRotation);
    const rawWidth = Number(photo?.width);
    const rawHeight = Number(photo?.height);
    if (!(rawWidth > 0) || !(rawHeight > 0)) return null;

    const sourceWidth = rotated ? rawHeight : rawWidth;
    const sourceHeight = rotated ? rawWidth : rawHeight;
    const scale = Math.min(MAX_PHOTO_WIDTH / sourceWidth, MAX_PHOTO_HEIGHT / sourceHeight);
    return {
      cx: String(Math.round(Math.max(0.25, sourceWidth * scale) * EMU_PER_INCH)),
      cy: String(Math.round(Math.max(0.25, sourceHeight * scale) * EMU_PER_INCH))
    };
  }

  function matchingPhoto(inline, photos, usedIndexes) {
    const docPr = descendantsByLocalName(inline, "docPr")[0];
    const description = String(docPr?.getAttribute("descr") || "").trim();
    if (!description) return null;

    const index = photos.findIndex((photo, candidateIndex) => (
      !usedIndexes.has(candidateIndex)
      && photoDescription(photo) === description
    ));
    if (index < 0) return null;
    usedIndexes.add(index);
    return photos[index];
  }

  function fitCroppedPhotos(documentXml, photos) {
    const usedIndexes = new Set();
    const inlines = descendantsByLocalName(documentXml, "inline");

    inlines.forEach((inline) => {
      const cropRects = descendantsByLocalName(inline, "srcRect");
      if (!cropRects.length) return;

      const photo = matchingPhoto(inline, photos, usedIndexes);
      const extent = photo ? fittedExtent(photo) : null;
      if (!photo || !extent) return;

      cropRects.forEach((cropRect) => cropRect.parentNode?.removeChild(cropRect));

      const outerExtent = descendantsByLocalName(inline, "extent")[0];
      if (outerExtent) {
        outerExtent.setAttribute("cx", extent.cx);
        outerExtent.setAttribute("cy", extent.cy);
      }

      descendantsByLocalName(inline, "ext").forEach((innerExtent) => {
        innerExtent.setAttribute("cx", extent.cx);
        innerExtent.setAttribute("cy", extent.cy);
      });
    });
  }

  function stripFigureFileExtensions(documentXml) {
    descendantsByLocalName(documentXml, "t").forEach((textNode) => {
      const text = String(textNode.textContent || "");
      if (!/\bFigure\s+\d+\b/i.test(text)) return;
      textNode.textContent = text.replace(IMAGE_EXTENSION_RE, "");
    });
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function paragraphText(paragraph) {
    return descendantsByLocalName(paragraph, "t").map((node) => node.textContent || "").join("");
  }

  function hasAncestor(node, localName) {
    let current = node?.parentElement || null;
    while (current) {
      if (current.localName === localName) return true;
      current = current.parentElement;
    }
    return false;
  }

  function bodyParagraphs(documentXml) {
    return descendantsByLocalName(documentXml, "p").filter((paragraph) => !hasAncestor(paragraph, "tc"));
  }

  function findSectionParagraph(documentXml, label) {
    const expected = normalizeText(label);
    const paragraphs = bodyParagraphs(documentXml);
    return paragraphs.find((paragraph) => normalizeText(paragraphText(paragraph)) === expected)
      || paragraphs.find((paragraph) => normalizeText(paragraphText(paragraph)).startsWith(expected))
      || null;
  }

  function nextBodyParagraph(paragraph) {
    let node = paragraph?.nextSibling || null;
    while (node) {
      if (node.nodeType === 1 && node.localName === "p") return node;
      node = node.nextSibling;
    }
    return null;
  }

  function paragraphLooksLikeSectionHeading(paragraph) {
    const text = normalizeText(paragraphText(paragraph));
    return CONTROLLED_SECTION_LABELS.some((label) => text.startsWith(normalizeText(label)));
  }

  function setParagraphText(paragraph, value) {
    if (!paragraph) return;
    const documentXml = paragraph.ownerDocument;
    const firstRun = descendantsByLocalName(paragraph, "r")[0];
    const runProperties = firstRun ? descendantsByLocalName(firstRun, "rPr")[0]?.cloneNode(true) : null;

    Array.from(paragraph.childNodes).forEach((node) => {
      if (!(node.nodeType === 1 && node.localName === "pPr")) paragraph.removeChild(node);
    });

    String(value ?? "").split(/\r?\n/).forEach((line, index) => {
      const run = documentXml.createElementNS(WORD_NS, "w:r");
      if (runProperties) run.appendChild(runProperties.cloneNode(true));
      if (index) run.appendChild(documentXml.createElementNS(WORD_NS, "w:br"));
      const text = documentXml.createElementNS(WORD_NS, "w:t");
      text.setAttributeNS(XML_NS, "xml:space", "preserve");
      text.textContent = line || " ";
      run.appendChild(text);
      paragraph.appendChild(run);
    });
  }

  function insertNormalParagraphAfter(paragraph, value) {
    const documentXml = paragraph.ownerDocument;
    const newParagraph = documentXml.createElementNS(WORD_NS, "w:p");
    const run = documentXml.createElementNS(WORD_NS, "w:r");
    const text = documentXml.createElementNS(WORD_NS, "w:t");
    text.setAttributeNS(XML_NS, "xml:space", "preserve");
    text.textContent = String(value || " ");
    run.appendChild(text);
    newParagraph.appendChild(run);
    paragraph.parentNode?.insertBefore(newParagraph, paragraph.nextSibling);
    return newParagraph;
  }

  function runForTextNode(node) {
    let current = node?.parentElement || null;
    while (current) {
      if (current.localName === "r") return current;
      current = current.parentElement;
    }
    return null;
  }

  function replaceInlineSectionValue(paragraph, label, value) {
    const textNodes = descendantsByLocalName(paragraph, "t");
    const fullText = textNodes.map((node) => node.textContent || "").join("");
    const start = fullText.toUpperCase().indexOf(String(label).toUpperCase());
    if (start < 0) return false;
    const labelEnd = start + String(label).length;

    let cursor = 0;
    let labelRun = null;
    let valueRun = null;
    textNodes.forEach((node) => {
      const original = String(node.textContent || "");
      const nodeStart = cursor;
      const nodeEnd = cursor + original.length;
      cursor = nodeEnd;

      if (nodeEnd <= labelEnd) {
        labelRun = runForTextNode(node) || labelRun;
        return;
      }
      if (nodeStart < labelEnd) {
        node.textContent = original.slice(0, Math.max(0, labelEnd - nodeStart));
        labelRun = runForTextNode(node) || labelRun;
        return;
      }
      if (!valueRun) valueRun = runForTextNode(node);
      node.textContent = "";
    });

    if (valueRun) {
      let valueText = descendantsByLocalName(valueRun, "t")[0];
      if (!valueText) {
        valueText = paragraph.ownerDocument.createElementNS(WORD_NS, "w:t");
        valueRun.appendChild(valueText);
      }
      valueText.setAttributeNS(XML_NS, "xml:space", "preserve");
      valueText.textContent = ` ${value}`;
      return true;
    }

    const run = paragraph.ownerDocument.createElementNS(WORD_NS, "w:r");
    const text = paragraph.ownerDocument.createElementNS(WORD_NS, "w:t");
    text.setAttributeNS(XML_NS, "xml:space", "preserve");
    text.textContent = ` ${value}`;
    run.appendChild(text);
    if (labelRun?.parentNode === paragraph) paragraph.insertBefore(run, labelRun.nextSibling);
    else paragraph.appendChild(run);
    return true;
  }

  function setBlockSection(documentXml, label, value) {
    if (!String(value || "").trim()) return false;
    const paragraph = findSectionParagraph(documentXml, label);
    if (!paragraph) return false;
    const exact = normalizeText(paragraphText(paragraph)) === normalizeText(label);
    if (!exact) return replaceInlineSectionValue(paragraph, label, value);

    const next = nextBodyParagraph(paragraph);
    if (next && !paragraphLooksLikeSectionHeading(next)) {
      setParagraphText(next, value);
      return true;
    }
    insertNormalParagraphAfter(paragraph, value);
    return true;
  }

  function setCompletionSection(documentXml, label, value) {
    if (!String(value || "").trim()) return false;
    const paragraph = findSectionParagraph(documentXml, label);
    if (!paragraph) return false;
    const exact = normalizeText(paragraphText(paragraph)) === normalizeText(label);
    if (!exact) return replaceInlineSectionValue(paragraph, label, value);

    const next = nextBodyParagraph(paragraph);
    if (next && !paragraphLooksLikeSectionHeading(next)) {
      setParagraphText(next, value);
      return true;
    }
    return replaceInlineSectionValue(paragraph, label, value);
  }

  function textList(value) {
    return Array.isArray(value)
      ? value.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  }

  function naturalJoin(items) {
    const values = [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
    if (!values.length) return "inspection activities associated with the subject order";
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  function activityPhrase(inspection) {
    const activities = textList(inspection?.activities);
    const allText = [
      ...activities,
      inspection?.inspectionType,
      inspection?.activity
    ].filter(Boolean).join(" | ");

    if (/post[-\s]?galv|galvaniz/i.test(allText)) {
      return "visual and dimensional inspection of the fabricated steel after hot-dip galvanizing";
    }

    const mapped = [];
    const add = (value) => {
      if (value && !mapped.includes(value)) mapped.push(value);
    };

    [...activities, inspection?.inspectionType].filter(Boolean).forEach((activity) => {
      const text = String(activity);
      if (/structural.*shop visual|visual\s*\/\s*final|visual inspection/i.test(text)) add("visual inspection");
      else if (/structural.*dimensional|dimensional inspection/i.test(text)) add("dimensional inspection");
      else if (/hydro|pressure test/i.test(text)) add("hydrostatic testing");
      else if (/coating/i.test(text)) add("coating inspection");
      else if (/nde|non.?destructive/i.test(text)) add("NDE review");
      else if (/material|mtr|pmi/i.test(text)) add("material inspection and documentation review");
      else if (/welding/i.test(text)) add("welding surveillance");
      else if (/pre.?fab/i.test(text)) add("a pre-fabrication meeting");
      else if (/document/i.test(text)) add("document review");
      else if (/release/i.test(text)) add("final release inspection");
      else if (/final inspection/i.test(text)) add("final inspection");
    });

    if (!mapped.length && inspection?.activity) {
      const fallback = String(inspection.activity).trim().replace(/\.$/, "");
      if (fallback) add(fallback.charAt(0).toLowerCase() + fallback.slice(1));
    }
    return naturalJoin(mapped);
  }

  function hasStructuralScope(inspection) {
    const structural = inspection?.structural && typeof inspection.structural === "object"
      ? Object.values(inspection.structural).some((value) => String(value || "").trim())
      : false;
    const text = [
      ...(inspection?.activities || []),
      inspection?.inspectionType,
      inspection?.activity,
      inspection?.projectName
    ].filter(Boolean).join(" ");
    return structural || /structural steel|post[-\s]?galv|galvaniz/i.test(text);
  }

  function hasPipeSpoolScope(inspection) {
    const text = [
      inspection?.pieceSpoolNumber,
      inspection?.inspectionType,
      inspection?.activity,
      inspection?.projectName,
      ...(inspection?.activities || [])
    ].filter(Boolean).join(" ");
    return Boolean(inspection?.pieceSpoolNumber) || /pipe spool|spool|piping/i.test(text);
  }

  function descriptionFor(inspection, baseSections) {
    const explicit = String(inspection?.reportDescription || inspection?.description || "").trim();
    if (explicit) return explicit;
    if (hasStructuralScope(inspection)) return "Shop fabricated structural steel.";
    if (hasPipeSpoolScope(inspection)) return "Shop fabricated pipe spools.";

    const existing = String(baseSections?.description || "").trim();
    if (existing && existing.length <= 180 && existing !== String(inspection?.generatedReportLanguage || "").trim()) {
      return existing;
    }
    return "Shop fabrication associated with subject order.";
  }

  function actionItemsFor(inspection) {
    const items = [];
    const add = (value) => {
      const text = String(value || "").trim();
      if (text && !items.some((item) => item.toLowerCase() === text.toLowerCase())) items.push(text);
    };

    (inspection?.followUps || [])
      .filter((item) => String(item?.status || "Open").toLowerCase() !== "closed")
      .forEach((item) => add(item?.action));

    (inspection?.loads || [])
      .forEach((load) => add(load?.deficiencyFollowUp));

    add(inspection?.deficiencies);

    if (!items.length) return "None";
    if (items.length === 1) return items[0];
    return items.map((item, index) => `${index + 1}. ${item}`).join("\r\n");
  }

  function uniqueNarratives(values) {
    const output = [];
    values.forEach((value) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (!output.some((item) => item.toLowerCase() === text.toLowerCase())) output.push(text);
    });
    return output;
  }

  function inspectionAuditFor(inspection, baseSections) {
    const vendor = String(
      inspection?.reportingVendor
      || inspection?.inspectionLocation
      || inspection?.vendor
      || "the fabrication facility"
    ).trim();
    const opening = `Inspection visit made to ${vendor} to perform ${activityPhrase(inspection)}. The following are details of the inspection:`;

    const details = uniqueNarratives([
      inspection?.generatedReportLanguage,
      baseSections?.shopInspection,
      baseSections?.ndeReview,
      baseSections?.coatingInspection,
      baseSections?.inspectionRelease,
      inspection?.summary,
      inspection?.observations
    ]);

    return details.length ? `${opening}\r\n${details.join("\r\n")}` : opening;
  }

  function completionValue(inspection, name) {
    const reportCompletion = inspection?.reportCompletion && typeof inspection.reportCompletion === "object"
      ? inspection.reportCompletion
      : {};
    const directKeys = {
      engineering: ["reportEngineeringComplete", "engineeringComplete"],
      material: ["reportMaterialComplete", "materialComplete"],
      fabrication: ["reportFabricationComplete", "fabricationComplete"],
      coatings: ["reportCoatingsComplete", "coatingsComplete"]
    };
    const fromObject = String(reportCompletion?.[name] || "").trim();
    if (fromObject) return fromObject;
    for (const key of directKeys[name] || []) {
      const value = String(inspection?.[key] || "").trim();
      if (value) return value;
    }
    return "100%";
  }

  function automatedSections(inspection) {
    let baseSections = {};
    try {
      baseSections = typeof base.reportSectionText === "function" ? (base.reportSectionText(inspection) || {}) : {};
    } catch (_) {
      baseSections = {};
    }
    return {
      description: descriptionFor(inspection, baseSections),
      actionItems: actionItemsFor(inspection),
      engineering: completionValue(inspection, "engineering"),
      material: completionValue(inspection, "material"),
      fabrication: completionValue(inspection, "fabrication"),
      coatings: completionValue(inspection, "coatings"),
      inspectionAudit: inspectionAuditFor(inspection, baseSections)
    };
  }

  function patchControlledReportSections(documentXml, inspection) {
    const sections = automatedSections(inspection);
    setBlockSection(documentXml, "DESCRIPTION:", sections.description);
    setBlockSection(documentXml, "ACTION ITEMS:", sections.actionItems);
    setCompletionSection(documentXml, "ENGINEERING COMPLETE:", sections.engineering);
    setCompletionSection(documentXml, "MATERIAL COMPLETE:", sections.material);
    setCompletionSection(documentXml, "FABRICATION COMPLETE:", sections.fabrication);
    setCompletionSection(documentXml, "COATINGS:", sections.coatings);
    setBlockSection(documentXml, "INSPECTION/AUDIT:", sections.inspectionAudit);
    return sections;
  }

  function patchDocx(bytes, photos = [], inspection = null, automateControlledReport = false) {
    try {
      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      const documentBytes = files["word/document.xml"];
      if (!documentBytes) return bytes;

      const xml = window.fflate.strFromU8(documentBytes);
      const documentXml = new DOMParser().parseFromString(xml, "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0]) return bytes;

      stripFigureFileExtensions(documentXml);
      fitCroppedPhotos(documentXml, Array.isArray(photos) ? photos : []);
      if (automateControlledReport && inspection) patchControlledReportSections(documentXml, inspection);

      files["word/document.xml"] = window.fflate.strToU8(
        new XMLSerializer().serializeToString(documentXml)
      );
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("Word report correction could not be applied:", error);
      return bytes;
    }
  }

  const wrapped = {
    ...base,
    async buildSAndBInspectionDocx(template, inspection, photos, filename) {
      const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename);
      return patchDocx(bytes, photos, inspection, true);
    },
    async buildInspectionDocx(inspection, photos) {
      const bytes = await base.buildInspectionDocx(inspection, photos);
      return patchDocx(bytes, photos, inspection, false);
    }
  };

  window.MileageInspectionReportTesting = Object.freeze(wrapped);
  window.MileageWordPhotoFitFix = Object.freeze({ patchDocx });
  window.MileageInspectionReportAutomation = Object.freeze({ automatedSections, patchControlledReportSections });
})();
