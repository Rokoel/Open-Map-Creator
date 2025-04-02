import { constants } from "./constants.js";

export class StorageManager {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
  }

  exportMap() {
    const mapData = this.canvasManager.getMapData();
    const mapJSON = JSON.stringify(mapData);
    const blob = new Blob([mapJSON], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = constants.mapBackupFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  importMap() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          this.canvasManager.loadMapData(data);
        } catch (err) {
          console.error("Error parsing map data", err);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  autoSaveMap() {
    const mapData = this.canvasManager.getMapData();
    localStorage.setItem("mapData", JSON.stringify(mapData));
  }

  autoLoadMap() {
    const saved = localStorage.getItem("mapData");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.canvasManager.loadMapData(data);
      } catch (err) {
        console.error("Failed to load saved map data", err);
      }
    }
  }

  exportPDF() {
    const { jsPDF } = window.jspdf;
    
    // Prompt for export settings
    let pageOrientation = prompt("Enter page orientation (portrait or landscape):", "landscape");
    pageOrientation = (pageOrientation && pageOrientation.toLowerCase() === "portrait")
      ? "portrait" : "landscape";
  
    let pageSizeInput = prompt("Enter page size (A4 or A3):", "A4");
    pageSizeInput = (pageSizeInput && pageSizeInput.toUpperCase() === "A3") ? "A3" : "A4";
  
    let dpi = parseInt(prompt("Enter printer DPI:", "300"), 10) || 300;
    let cellSizeCm = parseFloat(prompt("Enter desired cell size in centimeters:", "1"));
    if (!cellSizeCm || cellSizeCm <= 0) cellSizeCm = 1;
    
    // Compute exported cell size (in pixels)
    // One logical cell, regardless of the current on‐screen cell size, will be rendered as
    const exportScale = (cellSizeCm / 2.54) * dpi; // in px per cell
    // In export, our logical coordinate system is independent of the on-screen cell pixel size
    
    // Determine PDF page dimensions (in pixels), based on page size, orientation, and DPI
    // Define page dimensions in mm for A4 and A3
    const pageSizesMM = constants.pageSizesMM;
    let pageSizeMM = pageSizesMM[pageSizeInput];
    // If orientation is landscape, swap width and height
    if (pageOrientation === "landscape") {
      const temp = pageSizeMM.width;
      pageSizeMM.width = pageSizeMM.height;
      pageSizeMM.height = temp;
    }
    // Compute conversion: 1 mm = dpi / 25.4 pixels
    const pxPerMm = dpi / 25.4;
    const pageWidth = pageSizeMM.width * pxPerMm;
    const pageHeight = pageSizeMM.height * pxPerMm;
    
    // Determine exportable area from logical bounding box
    const bbox = this.canvasManager.getLogicalBoundingBox();
    const logicalWidth = bbox.maxX - bbox.minX;
    const logicalHeight = bbox.maxY - bbox.minY;
    
    // The final exported image dimensions in pixels
    const exportWidth = logicalWidth * exportScale;
    const exportHeight = logicalHeight * exportScale;
    
    // Create an offscreen canvas and re-render the entire scene
    const offCanvas = document.createElement("canvas");
    offCanvas.width = exportWidth;
    offCanvas.height = exportHeight;
    const offCtx = offCanvas.getContext("2d");
    
    offCtx.save();
    // Set the transformation so that 1 logical unit corresponds to exportScale pixels
    offCtx.translate(-bbox.minX * exportScale, -bbox.minY * exportScale);
    offCtx.scale(exportScale, exportScale);
    // Draw the whole scene using logical coordinates
    this.canvasManager.drawAll(offCtx);
    offCtx.restore();
    
    // Create the jsPDF document (using unit "px") with computed page dimensions
    const pdf = new jsPDF({
      orientation: pageOrientation,
      unit: "px",
      format: [pageWidth, pageHeight]
    });
    
    // Tile the offscreen canvas into pages
    const pagesX = Math.ceil(exportWidth / pageWidth);
    const pagesY = Math.ceil(exportHeight / pageHeight);
    
    // Save total pages for assembly diagram
    const totalPages = pagesX * pagesY;
    
    for (let py = 0; py < pagesY; py++) {
      for (let px = 0; px < pagesX; px++) {
        // Compute the tile dimensions (they may be less than a full page on the right/bottom edges)
        const tileWidth = Math.min(pageWidth, exportWidth - px * pageWidth);
        const tileHeight = Math.min(pageHeight, exportHeight - py * pageHeight);
        
        // Create a tile canvas (in pixels)
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = tileWidth;
        tileCanvas.height = tileHeight;
        const tileCtx = tileCanvas.getContext("2d");
        
        // Draw the corresponding region from the offscreen canvas
        tileCtx.drawImage(
          offCanvas,
          px * pageWidth,
          py * pageHeight,
          tileWidth,
          tileHeight,
          0,
          0,
          tileWidth,
          tileHeight
        );
        
        const tileImgData = tileCanvas.toDataURL("image/png");
        if (px === 0 && py === 0) {
          // First page already exists
          pdf.addImage(tileImgData, "PNG", 0, 0, tileWidth, tileHeight);
        } else {
          pdf.addPage();
          pdf.addImage(tileImgData, "PNG", 0, 0, tileWidth, tileHeight);
        }
      }
    }
    pdf.save(constants.mapPDFFileName);
  }
}
