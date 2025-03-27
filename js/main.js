import { CanvasManager } from "./canvas.js";
import { HUD } from "./hud.js";
import { StorageManager } from "./storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const canvasEl = document.getElementById("mapCanvas");

  // Instantiate the canvas manager.
  const canvasManager = new CanvasManager(canvasEl);

  // Auto-load stored map data if available.
  const storageManager = new StorageManager(canvasManager);
  storageManager.autoLoadMap();

  // Instantiate the HUD with access to canvasManager and storageManager.
  const hud = new HUD(canvasManager, storageManager);

  // Setup export/import/clear/PDF event listeners.
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
        confirm("Are you sure you want to clear the canvas? This cannot be undone.")
      ) {
        canvasManager.clearCanvas();
      }
    });

  // Auto-save every 5 seconds.
  setInterval(() => {
    storageManager.autoSaveMap();
  }, 5000);

  // Save before unload.
  window.addEventListener("beforeunload", () => {
    storageManager.autoSaveMap();
  });
});
