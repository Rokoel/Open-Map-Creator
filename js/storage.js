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
    a.download = "mapData.json";
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
    // Prompt for PDF export settings.
    let pageSize = prompt("Enter page size (A4 or A3):", "A4");
    pageSize = pageSize && pageSize.toUpperCase() === "A3" ? "a3" : "a4";
    let dpi = parseInt(prompt("Enter printer DPI:", "300"), 10) || 300;
    // Compute bounding box that covers all drawn content.
    const bbox = this.canvasManager.getBoundingBox();
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;

    // Create an offscreen canvas to draw only the bounded region.
    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d");

    // Apply same drawing routines with an offset.
    offCtx.translate(-bbox.minX, -bbox.minY);
    offCtx.drawImage(this.canvasManager.canvas, 0, 0);

    const imgData = offCanvas.toDataURL("image/png");

    // Create PDF.
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: pageSize,
    });
    pdf.addImage(imgData, "PNG", 0, 0, width, height);
    pdf.text(
      "Assembly Instructions: Print the pages and align them accordingly.",
      10,
      10
    );
    pdf.save("map.pdf");
  }
}
