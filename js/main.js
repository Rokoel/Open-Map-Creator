import { CanvasManager } from "./canvas.js";
import { HUD } from "./hud.js";
import { StorageManager } from "./storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const canvasEl = document.getElementById("mapCanvas");

  // Create the CanvasManager instance.
  const canvasManager = new CanvasManager(canvasEl);

  // Create the StorageManager instance.
  const storageManager = new StorageManager(canvasManager);

  // Auto-load saved map data (if any).
  storageManager.autoLoadMap();

  // Instantiate the HUD (passing canvasManager and storageManager).
  const hud = new HUD(canvasManager, storageManager);

  // Set up export, import, clear, and PDF export event listeners.
  document
    .getElementById("exportMap")
    .addEventListener("click", () => storageManager.exportMap());

  document
    .getElementById("importMap")
    .addEventListener("click", () => storageManager.importMap());

  document
    .getElementById("exportPDF")
    .addEventListener("click", () => storageManager.exportPDF());

  document
    .getElementById("clearCanvas")
    .addEventListener("click", () => {
      if (
        confirm(
          "Are you sure you want to clear the canvas? This cannot be undone."
        )
      ) {
        canvasManager.clearCanvas();
      }
    });

  // "Restart" button: clear canvas data and remove saved data.
  document.getElementById("restart").addEventListener("click", () => {
    if (
      confirm(
        "Restarting will completely clear all data (layers, objects, and saved progress). Continue?"
      )
    ) {
      localStorage.removeItem("mapData");
      canvasManager.clearCanvas();
      // Also reset layers
      canvasManager.layers = [
        { name: "Layer 1", objects: new Map() }
      ];
      canvasManager.activeLayerIndex = 0;
      hud.updateLayerList();
    }
  });

  // Auto-save every 5 seconds.
  setInterval(() => {
    storageManager.autoSaveMap();
  }, 5000);

  // Also auto-save before page unload.
  window.addEventListener("beforeunload", () => {
    storageManager.autoSaveMap();
  });
});
