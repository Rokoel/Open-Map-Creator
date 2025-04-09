import { constants } from "./constants.js";

export class StorageManager {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
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
          if (!data || typeof data !== 'object' || !data.settings || !data.layers) {
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

  /**
   * Automatically saves the current map data to the browser's localStorage.
   * Retrieves the map data from the canvas manager, updates the version, 
   * and stores it using a predefined localStorage key. Handles potential 
   * errors during the save process, including quota exceedance.
   */
  autoSaveMap() {
    try {
        const mapData = this.canvasManager.getMapData();
        mapData.version = constants.saveFileVersion;
        localStorage.setItem(constants.localStorageKey, JSON.stringify(mapData));
    } catch (error) {
        console.error("Error during auto-save:", error);
        // Avoid alerting frequently on auto-save errors
        if (error.name === 'QuotaExceededError') {
            console.warn("LocalStorage quota exceeded. Auto-save failed.");
            // Consider notifying user less intrusively once
        }
    }
  }

  /**
   * Automatically loads map data from localStorage if available.
   * 
   * This method attempts to retrieve and parse saved map data from localStorage
   * using a predefined key. If valid data is found, it is loaded into the canvas
   * manager. If the data is invalid or an error occurs during parsing, the
   * corrupted data is removed from localStorage.
   * 
   * Logs messages to the console to indicate the status of the operation.
   * 
   * @throws {Error} If the saved data format is invalid.
   */
  autoLoadMap() {
    const saved = localStorage.getItem(constants.localStorageKey);
    if (saved) {
      console.log("Found saved map data in localStorage.");
      try {
        const data = JSON.parse(saved);
        // Basic validation
        if (!data || typeof data !== 'object' || !data.settings || !data.layers) {
            throw new Error("Invalid saved data format.");
        }
        // Load the data into the canvas manager
        if (window.hudInstance) {
          this.canvasManager.loadMapData(data);
        }
        console.log("Map loaded from auto-save.");
      } catch (err) {
        console.error("Failed to load saved map data:", err);
        // Don't alert on auto-load failure, just clear bad data
        localStorage.removeItem(constants.localStorageKey);
      }
    } else {
        console.log("No saved map data found in localStorage.");
    }
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
  exportPDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        alert("Error: jsPDF library not loaded.");
        return;
    }

    // Configuration Prompts
    // TODO: Use a modal dialog instead of prompts for better UX
    let pageOrientation = prompt("Page orientation (portrait or landscape):", "landscape")?.toLowerCase();
    pageOrientation = (pageOrientation === "portrait") ? "portrait" : "landscape";

    let pageSizeInput = prompt("Page size (A4 or A3):", "A4")?.toUpperCase();
    pageSizeInput = (pageSizeInput === "A3") ? "A3" : "A4";

    let dpiInput = prompt("Printer DPI (e.g., 150, 300):", "300");
    let dpi = parseInt(dpiInput, 10);
    if (isNaN(dpi) || dpi <= 0) dpi = 300; // Default DPI

    let cellSizeCmInput = prompt("Desired cell size on paper (cm):", "3");
    let cellSizeCm = parseFloat(cellSizeCmInput);
    if (isNaN(cellSizeCm) || cellSizeCm <= 0) cellSizeCm = 3; // Default size (approx 1 inch)

    // Export scale: pixels per logical cell unit
    const exportScale = (cellSizeCm / 2.54) * dpi; // px per logical cell

    // Page dimensions in mm
    const pageSizesMM = constants.pageSizesMM;
    let pageSizeMM = pageSizesMM[pageSizeInput];
    if (pageOrientation === "landscape") {
      [pageSizeMM.width, pageSizeMM.height] = [pageSizeMM.height, pageSizeMM.width]; // Swap width/height
    }

    // Page dimensions in pixels
    const pxPerMm = dpi / 25.4;
    const pageWidthPx = Math.floor(pageSizeMM.width * pxPerMm);
    const pageHeightPx = Math.floor(pageSizeMM.height * pxPerMm);
    if (pageWidthPx <= 0 || pageHeightPx <= 0) {
        alert("Error: Calculated page dimensions are invalid. Check DPI and page size.");
        return;
    }

    // Get map content bounds in logical units
    const bbox = this.canvasManager.getLogicalBoundingBox();
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
        alert("Error: Calculated export dimensions are invalid. Check map content and export settings.");
        return;
    }

    console.log(`Exporting map: ${logicalWidth.toFixed(2)} x ${logicalHeight.toFixed(2)} logical units`);
    console.log(`Export scale: ${exportScale.toFixed(2)} px/unit`);
    console.log(`Total export size: ${exportWidthPx} x ${exportHeightPx} px`);
    console.log(`Page size: ${pageWidthPx} x ${pageHeightPx} px (${pageSizeInput} ${pageOrientation})`);

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
    offCtx.fillStyle = '#FFFFFF'; // White background
    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    // Prepare transformation for drawing using logical coordinates
    offCtx.save();
    offCtx.scale(exportScale, exportScale); // Scale up logical units to pixels
    offCtx.translate(-bbox.minX, -bbox.minY); // Translate origin to top-left of bbox

    // Draw the entire scene using logical coordinates onto the offscreen canvas
    this.canvasManager.drawAll(offCtx, exportScale); // Pass scale if needed by drawAll

    offCtx.restore(); // Restore context state

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
            const tileCanvas = document.createElement('canvas');
            tileCanvas.width = sWidth;
            tileCanvas.height = sHeight;
            const tileCtx = tileCanvas.getContext('2d');
            tileCtx.drawImage(offCanvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
            const tileImgData = tileCanvas.toDataURL("image/png"); // Use PNG for lossless

            if (px > 0 || py > 0) {
              pdf.addPage([pageWidthPx, pageHeightPx], pageOrientation);
            }
            // Add image to PDF page at top-left (0,0) with its actual dimensions
            pdf.addImage(tileImgData, "PNG", 0, 0, sWidth, sHeight, undefined, 'FAST'); // Use 'FAST' compression

            // Add page number/coordinates (optional)
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text(`Page ${pageNum} (${px + 1},${py + 1})`, 5, pageHeightPx - 5);

        } catch (tileError) {
            console.error(`Error processing tile for page ${pageNum}:`, tileError);
            alert(`Error creating PDF page ${pageNum}. The export might be incomplete.`);
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
