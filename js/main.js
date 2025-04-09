import { CanvasManager } from "./canvas.js";
import { HUD } from "./hud.js";
import { StorageManager } from "./storage.js";
import { constants } from "./constants.js";

document.addEventListener("DOMContentLoaded", () => {
  const canvasEl = document.getElementById("mapCanvas");
  const canvasManager = new CanvasManager(canvasEl);
  const storageManager = new StorageManager(canvasManager);
  const hud = new HUD(canvasManager, storageManager);
  storageManager.autoLoadMap();
  // Ensure HUD reflects the state (either default or loaded)
  hud.updateLayerList();
  hud.updateAppearanceControls();
  hud.loadInstrumentSettings(canvasManager.activeInstrument); // Load initial tool settings

  // Event Listeners for Data Controls
  document
    .getElementById("exportMap")
    .addEventListener("click", () => storageManager.exportMap());

  document
    .getElementById("importMap")
    .addEventListener("click", () => storageManager.importMap());

  document
    .getElementById("exportPDF")
    .addEventListener("click", () => storageManager.exportPDF());

  document.getElementById("clearCanvas").addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to clear the canvas? This cannot be undone."
      )
    ) {
      canvasManager.clearCanvas();
      canvasManager.saveHistory();
    }
  });

  document.getElementById("restart").addEventListener("click", () => {
    if (
      confirm(
        "Restarting will completely clear all data (layers, objects, settings, and saved progress). Continue?"
      )
    ) {
      // Clear Local Storage
      localStorage.removeItem(constants.localStorageKey);

      // Reset Canvas Manager State
      canvasManager.clearCanvas();

      // Reset Layers
      canvasManager.layers = [{
          name: "Layer 1",
          objects: new Map(),
          visible: true,
          gridShadowOptions: { ...constants.defaultGridShadowOptions }
      }];
      canvasManager.activeLayerIndex = 0;

      // Reset View
      canvasManager.offsetX = 0;
      canvasManager.offsetY = 0;
      canvasManager.scale = 1;

      // Reset Core Settings
      canvasManager.currentCellSize = constants.baseCellSize;
      canvasManager.emptyCellSettings = {
        fillColor: constants.defaultEmptyCellFillColor,
        borderColor: constants.defaultEmptyCellBorderColor,
        pattern: null,
        patternSrc: null,
      };
      // Reset Global Border Options
      canvasManager.gridBorderOptions = {
        enabled: false,
        image: null,
        imageSrc: null,
      };

      // Reset Instrument-Specific Settings
      // Reset Grid Draw Settings
      canvasManager.gridDrawSettings = {
        type: "color",
        fillColor: constants.defaultGridDrawFillColor,
        borderColor: constants.defaultGridDrawBorderColor,
        image: null,
        imageSrc: null,
      };
      canvasManager.gridImageList = []; // Clear uploaded grid patterns

      // Reset Free Draw Settings
      canvasManager.freeDrawSettings = {
        period: 0,
        size: 1,
        fillColor: constants.defaultFreeFillColor,
        strokeColor: constants.defaultFreeBorderColor,
        connectSVG: true,
        image: null,
      };

      // Reset Add Object Tool Image
      canvasManager.customObjectImage = null;
      canvasManager.customObjectImageSrc = null;

      // Reset Active Instrument
      canvasManager.setActiveInstrument('gridDraw');

      // Reset History & Selection
      canvasManager.history = [];
      canvasManager.historyIndex = -1;
      canvasManager.copiedSelection = null;
      canvasManager.selectedObjects = { grid: [], free: [], custom: [] };
      canvasManager.selectionStart = null;
      canvasManager.selectionEnd = null;
      canvasManager.saveHistory(); // Save the initial empty state

      // Update HUD to Reflect Defaults
      if (window.hudInstance) { // Use global HUD instance
          // Update layer list
          window.hudInstance.updateLayerList();
          // Update appearance controls (shadows, borders)
          window.hudInstance.updateAppearanceControls();
          // Update canvas settings controls
          document.getElementById("cellSize").value = canvasManager.currentCellSize;
          // Update empty cell controls
          document.getElementById("emptyFillColor").value = canvasManager.emptyCellSettings.fillColor;
          document.getElementById("emptyBorderColor").value = canvasManager.emptyCellSettings.borderColor;
          document.getElementById("emptyPattern").value = ''; // Clear file input
          // Reload instrument settings panel for the current (likely default) tool
          window.hudInstance.loadInstrumentSettings(canvasManager.activeInstrument);
      }

      // Re-render the cleared canvas
      canvasManager.render();

      console.log("Application restarted to default state.");
    }
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    // Allow input fields to work normally
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Allow Ctrl+Z/Shift+Z even in inputs if needed, otherwise return
        if (!((e.key === 'Z' || e.key === 'z') && (e.ctrlKey || e.metaKey))) {
            return;
        }
    }

    // Undo (Ctrl+Z or Cmd+Z)
    if ((e.key === "Z" || e.key === "z") && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault(); // Prevent browser undo
      e.stopImmediatePropagation();
      canvasManager.undo();
      hud.updateAppearanceControls(); // Update HUD after undo/redo
      hud.updateLayerList();
    }
    // Redo (Ctrl+Shift+Z or Cmd+Shift+Z)
    else if ((e.key === "Z" || e.key === "z") && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault(); // Prevent browser redo
      e.stopImmediatePropagation();
      canvasManager.redo();
      hud.updateAppearanceControls(); // Update HUD after undo/redo
      hud.updateLayerList();
    }
    // Delete selected (Delete or Backspace)
    else if (e.key === "Delete" || e.key === "Backspace") {
      // Check if focus is not on an input field where backspace should work
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          if (canvasManager.activeInstrument === "select" &&
              (canvasManager.selectedObjects.grid.length > 0 ||
               canvasManager.selectedObjects.free.length > 0 ||
               canvasManager.selectedObjects.custom.length > 0))
          {
              e.preventDefault(); // Prevent browser back navigation
              canvasManager.deleteSelection();
          }
      }
    }
    // Copy (Ctrl+C or Cmd+C)
    else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      if (canvasManager.activeInstrument === "select" &&
          (canvasManager.selectedObjects.grid.length > 0 ||
           canvasManager.selectedObjects.free.length > 0 ||
           canvasManager.selectedObjects.custom.length > 0))
      {
        e.preventDefault();
        canvasManager.copySelection();
      }
    }
    // Paste (Ctrl+V or Cmd+V)
    else if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
      if (canvasManager.activeInstrument === "select" && canvasManager.copiedSelection) {
        e.preventDefault();
        canvasManager.pasteSelection();
      }
    }
  });

  // Auto-Save
  setInterval(() => {
    storageManager.autoSaveMap();
  }, constants.autoSaveInterval);

  // Also auto-save before page unload
  window.addEventListener("beforeunload", () => {
    storageManager.autoSaveMap();
  });
});
