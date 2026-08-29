(() => {
  "use strict";

  const base = window.MileageInspectionReportTesting;
  if (!base || !window.fflate) return;

  const EMU_PER_INCH = 914400;
  const MAX_PHOTO_WIDTH = 3.25;
  const MAX_PHOTO_HEIGHT = 2.0;
  const IMAGE_EXTENSION_RE = /\.(?:jpe?g|png|heic|heif|webp)\b/gi;

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

  function patchDocx(bytes, photos = []) {
    try {
      const files = window.fflate.unzipSync(new Uint8Array(bytes));
      const documentBytes = files["word/document.xml"];
      if (!documentBytes) return bytes;

      const xml = window.fflate.strFromU8(documentBytes);
      const documentXml = new DOMParser().parseFromString(xml, "application/xml");
      if (documentXml.getElementsByTagName("parsererror")[0]) return bytes;

      stripFigureFileExtensions(documentXml);
      fitCroppedPhotos(documentXml, Array.isArray(photos) ? photos : []);

      files["word/document.xml"] = window.fflate.strToU8(
        new XMLSerializer().serializeToString(documentXml)
      );
      return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
    } catch (error) {
      console.error("Word photo fit correction could not be applied:", error);
      return bytes;
    }
  }

  const wrapped = {
    ...base,
    async buildSAndBInspectionDocx(template, inspection, photos, filename) {
      const bytes = await base.buildSAndBInspectionDocx(template, inspection, photos, filename);
      return patchDocx(bytes, photos);
    },
    async buildInspectionDocx(inspection, photos) {
      const bytes = await base.buildInspectionDocx(inspection, photos);
      return patchDocx(bytes, photos);
    }
  };

  window.MileageInspectionReportTesting = Object.freeze(wrapped);
  window.MileageWordPhotoFitFix = Object.freeze({ patchDocx });
})();
