import { ProjectStore, packProject, unpackProject } from "./project-store.js";
import { constants } from "./constants.js";

export class StorageManager {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
    canvasManager.storageManager = this;
    this.store = new ProjectStore();
    this.saveQueue = Promise.resolve();
    this.revision = 0;
  }

  /**
   * Exports the current map data as a JSON file.
   * The exported file includes versioning information and app identification.
   * The file is named using a predefined constant and the current date in the format `YYYY-MM-DD`.
   */
  exportMap() {
    try {
      const mapData = this.canvasManager.getMapData();
      // Add versioning info
      mapData.version = constants.saveFileVersion;
      mapData.appName = "OpenMapCreator"; // Identify the app

      const mapJSON = JSON.stringify(mapData, null, 2); // Pretty print JSON
      const blob = new Blob([mapJSON], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Suggest a filename
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      a.download = `${constants.mapBackupFileName}_${timestamp}.json`;
      document.body.appendChild(a); // Required for Firefox
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("Map exported successfully.");
    } catch (error) {
      console.error("Error exporting map:", error);
      alert("Failed to export map data. See console for details.");
    }
  }

  /**
   * Handles the import of a map file in JSON format.
   *
   * This method allows the user to select a JSON file containing map data.
   * It validates the file's content and, upon confirmation, replaces the current map
   * with the imported data. If the file is invalid or an error occurs during the process,
   * appropriate error messages are displayed.
   *
   * @throws {Error} If the file content is not a valid JSON or does not match the expected map format.
   */
  importMap() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json"; // Accept .json extension
    input.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          // Basic validation (optional but recommended)
          if (
            !data ||
            typeof data !== "object" ||
            !data.settings ||
            !data.layers
          ) {
            throw new Error("Invalid map file format.");
          }

          // Confirm overwrite
          if (confirm("Importing will replace the current map. Continue?")) {
            this.canvasManager.loadMapData(data);
            console.log("Map imported successfully.");
          }
        } catch (err) {
          console.error("Error parsing or loading map data:", err);
          alert(`Failed to import map: ${err.message}`);
        }
      };
      reader.onerror = (e) => {
        console.error("Error reading file:", e);
        alert("Failed to read the selected file.");
      };
      reader.readAsText(file);
    });
    input.click();
  }

  status(message) {
    const status = document.getElementById("saveStatus");
    if (status) status.textContent = message;
  }
  scheduleSave() {
    if (!this.ready) return;
    this.loadFailed = false;
    this.revision++;
    clearTimeout(this.saveTimer);
    this.status("Unsaved changes");
    this.saveTimer = setTimeout(() => this.autoSaveMap(), 600);
  }
  autoSaveMap({ backup = false } = {}) {
    clearTimeout(this.saveTimer);
    if (!this.ready || this.loadFailed) return Promise.resolve(false);
    let packed, signature;
    try {
      const data = this.canvasManager.getMapData();
      data.version = constants.saveFileVersion;
      packed = packProject(data);
      signature = JSON.stringify(packed);
    } catch (error) {
      this.status("Save failed · export JSON");
      console.error(error);
      return Promise.resolve(false);
    }
    const revision = ++this.revision;
    const savedAt = Math.max(Date.now(), (this.lastSavedAt || 0) + 1);
    this.lastSavedAt = savedAt;
    const record = { savedAt, payload: packed };
    // A compact synchronous journal protects final edits if the browser closes
    // before an async transaction can commit. Normal saves use IndexedDB.
    if (backup && signature !== this.lastSavedSignature) {
      try {
        localStorage.setItem(constants.localStorageKey, JSON.stringify(record));
      } catch {}
    }
    const save = async () => {
      if (signature === this.lastSavedSignature) {
        if (revision === this.revision) this.status("Saved locally");
        return true;
      }
      if (revision === this.revision) this.status("Saving…");
      try {
        await this.store.write(constants.localStorageKey, record);
        // The durable transaction has committed before removing the legacy copy.
        try {
          const raw = localStorage.getItem(constants.localStorageKey);
          if (raw && (JSON.parse(raw).savedAt || 0) <= record.savedAt)
            localStorage.removeItem(constants.localStorageKey);
        } catch {}
        this.lastSavedSignature = signature;
        if (revision === this.revision) this.status("Saved locally");
        return true;
      } catch (error) {
        try {
          localStorage.setItem(
            constants.localStorageKey,
            JSON.stringify(record),
          );
          this.lastSavedSignature = signature;
          if (revision === this.revision)
            this.status("Saved locally · backup storage");
          return true;
        } catch (fallbackError) {
          if (revision === this.revision)
            this.status("Save failed · export JSON");
          console.error("Auto-save failed", error, fallbackError);
          return false;
        }
      }
    };
    const pending = this.saveQueue.then(save, save);
    this.saveQueue = pending;
    return pending;
  }
  async autoLoadMap() {
    this.status("Loading saved map…");
    let stored,
      legacy,
      rawLegacy,
      legacyCorrupt = false;
    try {
      stored = await this.store.read(constants.localStorageKey);
    } catch (error) {
      console.warn("IndexedDB unavailable", error);
    }
    try {
      rawLegacy = localStorage.getItem(constants.localStorageKey);
      if (rawLegacy) legacy = JSON.parse(rawLegacy);
    } catch (error) {
      legacyCorrupt = !!rawLegacy;
      console.warn("Legacy save unavailable", error);
    }
    const candidates = [stored, legacy]
      .filter(Boolean)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    this.lastSavedAt = Math.max(
      0,
      ...candidates.map((record) => record.savedAt || 0),
    );
    let restored = false;
    for (const record of candidates) {
      try {
        const data = unpackProject(record.payload || record);
        if (!data?.settings || !Array.isArray(data.layers))
          throw Error("Invalid saved project");
        this.canvasManager.loadMapData(data);
        restored = true;
        break;
      } catch (error) {
        console.error("Could not restore saved project", error);
      }
    }
    this.ready = true;
    this.loadFailed = (!!candidates.length || legacyCorrupt) && !restored;
    this.status(
      restored
        ? "Saved locally"
        : this.loadFailed
          ? "Could not load save · open JSON"
          : "Saved locally",
    );
    // Migrate old localStorage projects only after successful restoration.
    if (restored) await this.autoSaveMap();
    return restored;
  }
  async clearAutosave() {
    clearTimeout(this.saveTimer);
    await this.saveQueue;
    try {
      await this.store.delete(constants.localStorageKey);
    } catch (error) {
      console.warn(error);
    }
    try {
      localStorage.removeItem(constants.localStorageKey);
    } catch {}
    this.lastSavedSignature = null;
    this.loadFailed = false;
  }

  /**
   * Exports the current map as a multi-page PDF document.
   *
   * This function generates a PDF by rendering the map content onto an offscreen canvas,
   * tiling the rendered content into pages, and saving the result as a PDF file. The user
   * is prompted to configure export settings such as page orientation, page size, DPI, and
   * cell size.
   *
   * The export process involves:
   * - Calculating the export scale and page dimensions based on user input.
   * - Rendering the map content to an offscreen canvas at the specified scale.
   * - Splitting the rendered content into tiles that fit within the page dimensions.
   * - Adding each tile as a page in the PDF.
   */
  exportPNG(options = {}) {
    options = { ...this.canvasManager.exportSettings, ...options };
    const manager = this.canvasManager,
      bounds = manager.getExportBounds(options);
    const cellPixels = 64,
      width = Math.ceil(bounds.width * cellPixels),
      height = Math.ceil(bounds.height * cellPixels);
    if (width * height > 64000000 || width > 16384 || height > 16384) {
      alert(
        "This map is too large for a single PNG. Export it as tiled PDF or save JSON instead.",
      );
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.scale(cellPixels, cellPixels);
    ctx.translate(-bounds.minX, -bounds.minY);
    manager.drawAll(ctx, cellPixels, { ...options, bounds });
    this.applyExportColor(canvas, options.colorMode);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = constants.mapBackupFileName + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  applyExportColor(canvas, mode) {
    if (!["bw", "grayscale"].includes(mode)) return;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
      data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = Math.round(
        0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2],
      );
      const value = mode === "bw" ? (luminance >= 180 ? 255 : 0) : luminance;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  }

  exportPDF(options = {}) {
    options = { ...this.canvasManager.exportSettings, ...options };
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      alert("Error: jsPDF library not loaded.");
      return;
    }

    const pageOrientation =
      options.orientation === "portrait" ? "portrait" : "landscape";
    const pageSizeInput = options.paper === "A3" ? "A3" : "A4";
    const dpi = Math.max(36, Math.min(600, Number(options.dpi) || 150));
    const cellSizeCm = Math.max(
      0.1,
      Math.min(10, Number(options.cellSize) || 2.5),
    );

    // Export scale: pixels per logical cell unit
    const exportScale = (cellSizeCm / 2.54) * dpi; // px per logical cell

    // Page dimensions in mm
    const pageSizesMM = constants.pageSizesMM;
    let pageSizeMM = { ...pageSizesMM[pageSizeInput] };
    if (pageOrientation === "landscape") {
      [pageSizeMM.width, pageSizeMM.height] = [
        pageSizeMM.height,
        pageSizeMM.width,
      ]; // Swap width/height
    }

    // Page dimensions in pixels
    const pxPerMm = dpi / 25.4;
    const pageWidthPx = Math.floor(pageSizeMM.width * pxPerMm);
    const pageHeightPx = Math.floor(pageSizeMM.height * pxPerMm);
    if (pageWidthPx <= 0 || pageHeightPx <= 0) {
      alert(
        "Error: Calculated page dimensions are invalid. Check DPI and page size.",
      );
      return;
    }

    // Get map content bounds in logical units
    const bbox = this.canvasManager.getExportBounds(options);
    if (bbox.width <= 0 || bbox.height <= 0) {
      alert("Map is empty. Nothing to export.");
      return;
    }
    const logicalWidth = bbox.width;
    const logicalHeight = bbox.height;

    // Total export image dimensions in pixels
    const exportWidthPx = Math.ceil(logicalWidth * exportScale);
    const exportHeightPx = Math.ceil(logicalHeight * exportScale);
    if (exportWidthPx <= 0 || exportHeightPx <= 0) {
      alert(
        "Error: Calculated export dimensions are invalid. Check map content and export settings.",
      );
      return;
    }

    console.log(
      `Exporting map: ${logicalWidth.toFixed(2)} x ${logicalHeight.toFixed(2)} logical units`,
    );
    console.log(`Export scale: ${exportScale.toFixed(2)} px/unit`);
    console.log(`Total export size: ${exportWidthPx} x ${exportHeightPx} px`);
    console.log(
      `Page size: ${pageWidthPx} x ${pageHeightPx} px (${pageSizeInput} ${pageOrientation})`,
    );

    if (
      exportWidthPx * exportHeightPx > 64000000 ||
      exportWidthPx > 16384 ||
      exportHeightPx > 16384
    ) {
      alert(
        "The render is too large at these settings. Reduce DPI or physical cell size and try again.",
      );
      return;
    }

    // Offscreen Rendering
    const offCanvas = document.createElement("canvas");
    offCanvas.width = exportWidthPx;
    offCanvas.height = exportHeightPx;
    const offCtx = offCanvas.getContext("2d");
    if (!offCtx) {
      alert("Error: Could not create offscreen canvas context.");
      return;
    }

    // Set background for the entire offscreen canvas (optional, helps with transparency)
    offCtx.fillStyle = "#FFFFFF"; // White background
    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    // Prepare transformation for drawing using logical coordinates
    offCtx.save();
    offCtx.scale(exportScale, exportScale); // Scale up logical units to pixels
    offCtx.translate(-bbox.minX, -bbox.minY); // Translate origin to top-left of bbox

    // Draw the entire scene using logical coordinates onto the offscreen canvas
    this.canvasManager.drawAll(offCtx, exportScale, {
      ...options,
      bounds: bbox,
    }); // Pass scale if needed by drawAll

    offCtx.restore(); // Restore context state
    this.applyExportColor(offCanvas, options.colorMode);

    // PDF Generation & Tiling
    console.log("Rendering complete. Generating PDF...");
    const pdf = new jsPDF({
      orientation: pageOrientation,
      unit: "px", // Use pixels for page dimensions and image placement
      format: [pageWidthPx, pageHeightPx],
      // hotfixes: ['px_scaling'], // May be needed for some jsPDF versions/browsers
    });

    const pagesX = Math.ceil(exportWidthPx / pageWidthPx);
    const pagesY = Math.ceil(exportHeightPx / pageHeightPx);
    const totalPages = pagesX * pagesY;

    console.log(`Tiling into ${pagesX} x ${pagesY} = ${totalPages} pages.`);

    // Add map pages
    for (let py = 0; py < pagesY; py++) {
      for (let px = 0; px < pagesX; px++) {
        const pageNum = py * pagesX + px + 1;
        console.log(`Adding page ${pageNum}/${totalPages}...`);

        // Calculate source region on the offscreen canvas
        const sx = px * pageWidthPx;
        const sy = py * pageHeightPx;
        const sWidth = Math.min(pageWidthPx, exportWidthPx - sx);
        const sHeight = Math.min(pageHeightPx, exportHeightPx - sy);

        if (sWidth <= 0 || sHeight <= 0) continue; // Skip if tile has no dimensions

        try {
          // Create a temporary canvas for the tile to get Data URL
          // This avoids potential issues with drawImage directly from large offscreen canvas in jsPDF
          const tileCanvas = document.createElement("canvas");
          tileCanvas.width = sWidth;
          tileCanvas.height = sHeight;
          const tileCtx = tileCanvas.getContext("2d");
          tileCtx.drawImage(
            offCanvas,
            sx,
            sy,
            sWidth,
            sHeight,
            0,
            0,
            sWidth,
            sHeight,
          );
          const tileImgData = tileCanvas.toDataURL("image/png"); // Use PNG for lossless

          if (px > 0 || py > 0) {
            pdf.addPage([pageWidthPx, pageHeightPx], pageOrientation);
          }
          // Add image to PDF page at top-left (0,0) with its actual dimensions
          pdf.addImage(
            tileImgData,
            "PNG",
            0,
            0,
            sWidth,
            sHeight,
            undefined,
            "FAST",
          ); // Use 'FAST' compression

          // Add page number/coordinates (optional)
          pdf.setFontSize(8);
          pdf.setTextColor(options.colorMode === "bw" ? 0 : 150);
          pdf.text(
            `Page ${pageNum} (${px + 1},${py + 1})`,
            5,
            pageHeightPx - 5,
          );
        } catch (tileError) {
          console.error(
            `Error processing tile for page ${pageNum}:`,
            tileError,
          );
          alert(
            `Error creating PDF page ${pageNum}. The export might be incomplete.`,
          );
          // Optionally add a blank page or error message in the PDF
          if (px > 0 || py > 0) pdf.addPage();
          pdf.setTextColor(255, 0, 0);
          pdf.text(`Error rendering page ${pageNum}`, 20, 20);
        }
      }
    }

    // Save PDF
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      pdf.save(`${constants.mapPDFFileName}_${timestamp}.pdf`);
      console.log("PDF saved successfully.");
    } catch (saveError) {
      console.error("Error saving PDF:", saveError);
      alert("Failed to save the PDF file. See console for details.");
    }
  }
}
