import { CanvasManager } from "./canvas.js";
import { HUD } from "./hud.js";
import { StorageManager } from "./storage.js";
import { borderDefaults, lightDefaults, ambientDefaults } from "./scene.js";
import { brushDefaults } from "./brush.js";
import { constants } from "./constants.js";

document.addEventListener("DOMContentLoaded", async () => {
  const canvasEl = document.getElementById("mapCanvas");
  canvasEl.style.pointerEvents = "none";
  const canvasManager = new CanvasManager(canvasEl);
  const storageManager = new StorageManager(canvasManager);
  await storageManager.autoLoadMap();
  const hud = new HUD(canvasManager, storageManager);
  canvasEl.style.pointerEvents = "auto";
  window.appReady = true;
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

  for (const id of ["exportPDF", "exportPDFPrimary"])
    document.getElementById(id).addEventListener("click", () => {
      document.getElementById("pdfColorMode").value =
        canvasManager.exportSettings.colorMode;
      document.getElementById("pdfPadding").value =
        canvasManager.exportSettings.padding;
      document.getElementById("pdfDialog").showModal();
    });

  document
    .getElementById("pdfCancel")
    .addEventListener("click", () =>
      document.getElementById("pdfDialog").close(),
    );
  document.getElementById("pdfForm").addEventListener("submit", (event) => {
    event.preventDefault();
    document.getElementById("pdfDialog").close();
    storageManager.exportPDF({
      orientation: document.getElementById("pdfOrientation").value,
      paper: document.getElementById("pdfPaper").value,
      dpi: document.getElementById("pdfDpi").value,
      cellSize: document.getElementById("pdfCellSize").value,
      colorMode: document.getElementById("pdfColorMode").value,
      padding: document.getElementById("pdfPadding").value,
    });
  });

  document.getElementById("clearCanvas").addEventListener("click", () => {
    if (confirm("Clear artwork from all layers? You can undo this action.")) {
      canvasManager.clearCanvas();
      canvasManager.saveHistory();
    }
  });

  document.getElementById("restart").addEventListener("click", async () => {
    if (
      confirm(
        "Restarting will completely clear all data (layers, objects, settings, and saved progress). Continue?",
      )
    ) {
      // Clear Local Storage
      await storageManager.clearAutosave();

      // Reset Canvas Manager State
      canvasManager.clearCanvas();

      // Reset Layers
      canvasManager.layers = [
        {
          name: "Layer 1",
          objects: new Map(),
          visible: true,
          gridShadowOptions: { ...constants.defaultGridShadowOptions },
        },
      ];
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
      canvasManager.gridBorderOptions = { ...borderDefaults };
      canvasManager.lightSettings = { ...lightDefaults };
      canvasManager.ambientLight = { ...ambientDefaults };
      canvasManager.exportSettings = { colorMode: "color", padding: 1 };
      canvasManager.bakedLighting = null;
      canvasManager.bakeStatus = "Live lighting";

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
        ...brushDefaults,
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
      canvasManager.setActiveInstrument("gridDraw");

      // Reset History & Selection
      canvasManager.history = [];
      canvasManager.historyIndex = -1;
      canvasManager.copiedSelection = null;
      canvasManager.selectedObjects = { grid: [], free: [], custom: [] };
      canvasManager.selectionStart = null;
      canvasManager.selectionEnd = null;
      canvasManager.saveHistory(); // Save the initial empty state

      // Update HUD to Reflect Defaults
      if (window.hudInstance) {
        // Use global HUD instance
        // Update layer list
        window.hudInstance.updateLayerList();
        // Update appearance controls (shadows, borders)
        window.hudInstance.updateAppearanceControls();
        // Update canvas settings controls
        // Update empty cell controls
        document.getElementById("emptyFillColor").value =
          canvasManager.emptyCellSettings.fillColor;
        document.getElementById("emptyBorderColor").value =
          canvasManager.emptyCellSettings.borderColor;
        document.getElementById("emptyPattern").value = ""; // Clear file input
        // Reload instrument settings panel for the current (likely default) tool
        window.hudInstance.loadInstrumentSettings(
          canvasManager.activeInstrument,
        );
      }

      // Re-render the cleared canvas
      canvasManager.render();

      console.log("Application restarted to default state.");
    }
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const editingText = e.target.closest(
      'textarea, [contenteditable="true"], input[type="text"], input:not([type])',
    );
    if (editingText) return;
    const historyKey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z";
    if (!historyKey && e.target.closest("input, select")) return;

    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "g" &&
      canvasManager.activeInstrument === "select"
    ) {
      e.preventDefault();
      e.shiftKey
        ? canvasManager.ungroupSelection()
        : canvasManager.groupSelection();
      return;
    }
    // Undo (Ctrl+Z or Cmd+Z)
    if (
      (e.key === "Z" || e.key === "z") &&
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey
    ) {
      e.preventDefault(); // Prevent browser undo
      e.stopImmediatePropagation();
      canvasManager.undo();
      hud.updateAppearanceControls(); // Update HUD after undo/redo
      hud.updateLayerList();
    }
    // Redo (Ctrl+Shift+Z or Cmd+Shift+Z)
    else if (
      (e.key === "Z" || e.key === "z") &&
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey
    ) {
      e.preventDefault(); // Prevent browser redo
      e.stopImmediatePropagation();
      canvasManager.redo();
      hud.updateAppearanceControls(); // Update HUD after undo/redo
      hud.updateLayerList();
    }
    // Delete selected (Delete or Backspace)
    else if (e.key === "Delete" || e.key === "Backspace") {
      // Check if focus is not on an input field where backspace should work
      if (
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "TEXTAREA"
      ) {
        if (
          canvasManager.activeInstrument === "select" &&
          (canvasManager.selectedObjects.grid.length > 0 ||
            canvasManager.selectedObjects.free.length > 0 ||
            canvasManager.selectedObjects.custom.length > 0)
        ) {
          e.preventDefault(); // Prevent browser back navigation
          canvasManager.deleteSelection();
        }
      }
    }
    // Copy (Ctrl+C or Cmd+C)
    else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      if (
        canvasManager.activeInstrument === "select" &&
        (canvasManager.selectedObjects.grid.length > 0 ||
          canvasManager.selectedObjects.free.length > 0 ||
          canvasManager.selectedObjects.custom.length > 0)
      ) {
        e.preventDefault();
        canvasManager.copySelection();
      }
    }
    // Paste (Ctrl+V or Cmd+V)
    else if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
      if (
        canvasManager.activeInstrument === "select" &&
        canvasManager.copiedSelection
      ) {
        e.preventDefault();
        canvasManager.pasteSelection();
      }
    }
  });

  // Auto-Save
  setInterval(() => {
    storageManager.autoSaveMap();
    hud.updateLayerList();
  }, constants.autoSaveInterval);

  // Commit while the page is still alive; unload-time async writes are not reliable.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden")
      storageManager.autoSaveMap({ backup: true });
  });
  window.addEventListener("pagehide", () =>
    storageManager.autoSaveMap({ backup: true }),
  );
});
