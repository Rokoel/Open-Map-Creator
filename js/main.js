import { CanvasManager } from "./canvas.js";
import { HUD } from "./hud.js";
import { StorageManager } from "./storage.js";

document.addEventListener("DOMContentLoaded", () => {
  const canvasEl = document.getElementById("mapCanvas");
  const canvasManager = new CanvasManager(canvasEl);
  const storageManager = new StorageManager(canvasManager);

  storageManager.autoLoadMap();
  const hud = new HUD(canvasManager, storageManager);

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

  document.getElementById("restart").addEventListener("click", () => {
    if (
      confirm(
        "Restarting will completely clear all data (layers, objects, and saved progress). Continue?"
      )
    ) {
      localStorage.removeItem("mapData");
      canvasManager.clearCanvas();

      canvasManager.layers = [
        { name: "Layer 1", objects: new Map() }
      ];
      canvasManager.activeLayerIndex = 0;
      hud.updateLayerList();

      canvasManager.history = [];
      canvasManager.historyIndex = -1;
      canvasManager.copiedSelection = null;
      canvasManager.saveHistory();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.key === 'Z' || e.key === 'z') && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      canvasManager.redo();
      e.stopImmediatePropagation();
      e.preventDefault();
    } else if ((e.key === 'Z' || e.key === 'z') && (e.ctrlKey || e.metaKey)) {
      canvasManager.undo();
      e.stopImmediatePropagation();
      e.preventDefault();
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (canvasManager.activeInstrument === "select") {
        canvasManager.deleteSelection();
        e.preventDefault();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      if (canvasManager.activeInstrument === "select") {
        canvasManager.copiedSelection = {
          grid: [...canvasManager.selectedObjects.grid],
          free: [...canvasManager.selectedObjects.free],
          custom: [...canvasManager.selectedObjects.custom]
        };
        e.preventDefault();
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      if (canvasManager.activeInstrument === "select" && canvasManager.copiedSelection) {
        // For each copied object, duplicate it with a new ID
        canvasManager.copiedSelection.grid.forEach(cellId => {
          if (canvasManager.layers[canvasManager.activeLayerIndex].objects.has(cellId)) {
            let cell = canvasManager.layers[canvasManager.activeLayerIndex].objects.get(cellId);
            let newId = Date.now().toString() + Math.random().toString();
            let newCell = Object.assign({}, cell);
            canvasManager.layers[canvasManager.activeLayerIndex].objects.set(newId, newCell);
          }
        });
        canvasManager.copiedSelection.free.forEach(id => {
          if (canvasManager.freeDrawObjects.has(id)) {
            let obj = canvasManager.freeDrawObjects.get(id);
            let newId = Date.now().toString() + Math.random().toString();
            let newObj = Object.assign({}, obj);
            canvasManager.freeDrawObjects.set(newId, newObj);
          }
        });
        canvasManager.copiedSelection.custom.forEach(id => {
          if (canvasManager.customObjects.has(id)) {
            let obj = canvasManager.customObjects.get(id);
            let newId = Date.now().toString() + Math.random().toString();
            let newObj = Object.assign({}, obj);
            canvasManager.customObjects.set(newId, newObj);
          }
        });
        canvasManager.render();
        canvasManager.saveHistory();
        e.preventDefault();
      }
    }
  });

  // Auto-save every 5 seconds
  setInterval(() => {
    storageManager.autoSaveMap();
  }, 5000);

  // Also auto-save before page unload
  window.addEventListener("beforeunload", () => {
    storageManager.autoSaveMap();
  });
});