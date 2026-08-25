(() => {
  "use strict";

  const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  let installed = false;

  function wordElements(parent, localName) {
    return Array.from(parent?.getElementsByTagNameNS?.(WORD_NS, localName) || []);
  }

  function directWordChild(parent, localName) {
    return Array.from(parent?.childNodes || []).find((node) => (
      node.nodeType === 1 && node.namespaceURI === WORD_NS && node.localName === localName
    )) || null;
  }

  function wordAncestor(node, localName) {
    let parent = node?.parentElement || null;
    while (parent) {
      if (parent.namespaceURI === WORD_NS && parent.localName === localName) return parent;
      parent = parent.parentElement;
    }
    return null;
  }

  function zeroPhotoCellSideMargins(documentXml, paragraph) {
    const cell = wordAncestor(paragraph, "tc");
    if (!cell) return;

    let cellProperties = directWordChild(cell, "tcPr");
    if (!cellProperties) {
      cellProperties = documentXml.createElementNS(WORD_NS, "w:tcPr");
      cell.insertBefore(cellProperties, cell.firstChild);
    }

    let cellMargins = directWordChild(cellProperties, "tcMar");
    if (!cellMargins) {
      cellMargins = documentXml.createElementNS(WORD_NS, "w:tcMar");
      cellProperties.appendChild(cellMargins);
    }

    ["left", "right", "start", "end"].forEach((side) => {
      let margin = directWordChild(cellMargins, side);
      if (!margin) {
        margin = documentXml.createElementNS(WORD_NS, `w:${side}`);
        cellMargins.appendChild(margin);
      }
      margin.setAttributeNS(WORD_NS, "w:w", "0");
      margin.setAttributeNS(WORD_NS, "w:type", "dxa");
    });
  }

  function resetPhotoParagraphIndents(bytes) {
    if (!window.fflate) return bytes;
    const files = window.fflate.unzipSync(new Uint8Array(bytes));
    const documentBytes = files["word/document.xml"];
    if (!documentBytes) return bytes;

    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    const documentXml = new DOMParser().parseFromString(decoder.decode(documentBytes), "application/xml");
    if (documentXml.getElementsByTagName("parsererror")[0]) {
      throw new Error("The generated S&B Word photo layout could not be finalized.");
    }

    wordElements(documentXml, "p").forEach((paragraph) => {
      if (!wordElements(paragraph, "drawing").length) return;

      let paragraphProperties = directWordChild(paragraph, "pPr");
      if (!paragraphProperties) {
        paragraphProperties = documentXml.createElementNS(WORD_NS, "w:pPr");
        paragraph.insertBefore(paragraphProperties, paragraph.firstChild);
      }

      let indentation = directWordChild(paragraphProperties, "ind");
      if (!indentation) {
        indentation = documentXml.createElementNS(WORD_NS, "w:ind");
        paragraphProperties.appendChild(indentation);
      }

      indentation.setAttributeNS(WORD_NS, "w:left", "0");
      indentation.setAttributeNS(WORD_NS, "w:right", "0");
      indentation.setAttributeNS(WORD_NS, "w:start", "0");
      indentation.setAttributeNS(WORD_NS, "w:end", "0");
      indentation.setAttributeNS(WORD_NS, "w:firstLine", "0");
      indentation.removeAttributeNS(WORD_NS, "hanging");

      let alignment = directWordChild(paragraphProperties, "jc");
      if (!alignment) {
        alignment = documentXml.createElementNS(WORD_NS, "w:jc");
        paragraphProperties.appendChild(alignment);
      }
      alignment.setAttributeNS(WORD_NS, "w:val", "center");

      zeroPhotoCellSideMargins(documentXml, paragraph);
    });

    files["word/document.xml"] = encoder.encode(new XMLSerializer().serializeToString(documentXml));
    return new Uint8Array(window.fflate.zipSync(files, { level: 6 }));
  }

  function install() {
    if (installed) return true;
    const api = window.MileageInspectionReportTesting;
    if (!api?.buildSAndBInspectionDocx) return false;

    const originalBuildSAndBInspectionDocx = api.buildSAndBInspectionDocx.bind(api);
    window.MileageInspectionReportTesting = Object.freeze({
      ...api,
      buildSAndBInspectionDocx: async (...args) => {
        const bytes = await originalBuildSAndBInspectionDocx(...args);
        return resetPhotoParagraphIndents(bytes);
      }
    });
    installed = true;
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }

  window.MileagePhotoIndentFix = Object.freeze({ resetPhotoParagraphIndents });
})();
