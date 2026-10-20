import { polygonPoints, polygonDefaults, drawPolygon, finishPolygon, drawPolygonDraft } from "./polygons.js";
import { setupEditorControls, drawExportOverlay } from "./editor-controls.js";
import { contains, localPoint, corners, gridEdges } from "./geometry.js";
import { brushDefaults, svgFromDataUrl, loadBrushImage } from "./brush.js";
import { tileDefaults, tileVariation } from "./tiles.js";
import { buildBorderTopology } from "./borders.js";
import {
  drawScene,
  borderDefaults,
  lightDefaults,
  ambientDefaults,
  globalLightDefaults,
  bakeLighting,
  invalidateLightingBake,
  lightingSignature,
} from "./scene.js";
import { constants } from "./constants.js";

export class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.mouseX = 0;
    this.mouseY = 0;

    // Pan and zoom settings.
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    // Logical cell size (modifiable via HUD).
    this.baseCellSize = constants.baseCellSize;
    this.currentCellSize = constants.baseCellSize;

    // Flags
    this.isPanning = false;
    this.isDrawing = false;
    this.isSelecting = false;
    this.isMovingSelection = false;
    this.selectionDragStart = null;
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.selectionStart = null;
    this.selectionEnd = null;

    this.activeInstrument = "gridDraw";

    this.layers = [];
    this.layers.push({
      name: "Layer 1",
      objects: new Map(),

      gridShadowOptions: { ...constants.defaultGridShadowOptions },
      visible: true,
    });
    this.activeLayerIndex = 0;

    // FreeDraw objects and custom objects
    this.freeDrawObjects = new Map();
    this.customObjects = new Map();
    this.polygonSettings = { ...polygonDefaults };
    this.polygonDraft = [];

    // To support freeDraw period option
    this.lastFreeDrawPosition = null;

    // --- Global Settings (these settings do not belong to layers) ---
    this.emptyCellSettings = {
      fillColor: constants.defaultEmptyCellFillColor,
      borderColor: constants.defaultEmptyCellBorderColor,
      pattern: null,
      patternSrc: null,
    };

    this.gridBorderOptions = { ...borderDefaults };
    this.lightSettings = { ...lightDefaults };
    this.ambientLight = { ...ambientDefaults };
    this.bakedLighting = null;
    this.exportSettings = { colorMode: "color", padding: 1 };

    this.freeDrawSettings = {
      ...brushDefaults,
      period: 0,
      size: 1,
      fillColor: constants.defaultFreeFillColor,
      strokeColor: constants.defaultFreeBorderColor,
      connectSVG: true,
      image: null,
    };

    this.gridDrawSettings = {
      ...tileDefaults,
      type: "color",
      fillColor: constants.defaultGridDrawFillColor,
      borderColor: constants.defaultGridDrawBorderColor,
      image: null,
      imageSrc: null,
    };
    this.gridImageList = [];

    this.customObjectImage = null;
    this.customObjectImageSrc = null;

    this.selectedObjects = { grid: [], free: [], custom: [] };

    this.history = [];
    this.historyIndex = -1;
    this.copiedSelection = null;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    setupEditorControls(this);
    this.setupEventListeners();
    this.saveHistory();
    this.render();
  }

  /**
   * Saves the current state of the canvas to the history stack.
   * The state includes layers, free draw objects, custom objects, and various settings.
   * Ensures that the history stack does not exceed the defined limit.
   * If the history pointer is not at the end, truncates and redoes the branch before saving.
   *
   * State Details:
   * - Layers: Includes layer name, visibility, grid shadow options, and objects.
   * - Free Draw Objects: Includes object properties and image sources.
   * - Custom Objects: Includes object properties and image sources.
   * - Settings: Includes cell size, offsets, scale, active layer index, empty cell settings,
   *   grid border options, grid image list, grid draw settings, free draw settings, and custom object image sources.
   *
   * History Management:
   * - Stores the state as a JSON string in the history stack.
   * - Maintains a pointer to the current position in the history stack.
   * - Removes the oldest entry if the history stack exceeds the defined limit.
   */
  get gridBorderOptions() {
    const layer = this.layers[this.activeLayerIndex] || this.layers[0];
    return (layer.gridBorderOptions ||= { ...borderDefaults });
  }
  set gridBorderOptions(value) {
    const layer = this.layers[this.activeLayerIndex] || this.layers[0];
    layer.gridBorderOptions = { ...borderDefaults, ...value };
  }
  get globalLight() {
    const layer = this.layers[this.activeLayerIndex] || this.layers[0];
    return (layer.globalLight ||= { ...globalLightDefaults });
  }
  rebuildBorderTopology() {
    for (const layer of this.layers)
      layer.borderTopology = buildBorderTopology([layer]);
    this.borderTopology = buildBorderTopology(this.layers);
    this.borderTopologyBuilds = (this.borderTopologyBuilds || 0) + 1;
  }

  getTileImage(src) {
    this.tileImages ||= new Map();
    if (!src) return null;
    if (!this.tileImages.has(src)) {
      const image = new Image();
      image.onload = () => this.render();
      image.src = src;
      this.tileImages.set(src, image);
    }
    return this.tileImages.get(src);
  }
  setBrushSize(value) {
    this.freeDrawSettings.size =
      Math.round(Math.max(0.1, Math.min(30, value)) * 10) / 10;
    this.brushPreviewUntil = performance.now() + 1000;
    clearTimeout(this.brushPreviewTimer);
    this.brushPreviewTimer = setTimeout(() => this.render(), 1050);
    const slider = document.querySelector(
      '[aria-label="Size baseline (cells)"]',
    );
    if (slider) {
      slider.value = this.freeDrawSettings.size;
      slider.title = `${this.freeDrawSettings.size} cells`;
    }
    this.render();
  }
  async updateBrushImage(source) {
    const settings = this.freeDrawSettings;
    if (source) {
      settings.sourceImageSrc = source;
      settings.svgSource = svgFromDataUrl(source);
    }
    const request = (this.brushImageRequest =
      (this.brushImageRequest || 0) + 1);
    try {
      const image = await loadBrushImage(settings, (image) => {
        settings.image = image;
      });
      if (
        request === this.brushImageRequest &&
        settings === this.freeDrawSettings
      ) {
        settings.image = image;
        this.render();
      }
      return image;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  bakeLighting() {
    return bakeLighting(this);
  }

  historyContent(state) {
    const copy = { ...state, settings: { ...state.settings } };
    for (const key of ["offsetX", "offsetY", "scale", "activeLayerIndex"])
      delete copy.settings[key];
    return JSON.stringify(copy);
  }

  saveHistory() {
    const state = this.getMapData();
    if (
      this.history[this.historyIndex] &&
      this.historyContent(state) ===
        this.historyContent(JSON.parse(this.history[this.historyIndex]))
    )
      return;
    this.rebuildBorderTopology();
    invalidateLightingBake(this);
    const status = document.getElementById("saveStatus");
    if (status && window.hudInstance) status.textContent = "Unsaved changes";
    // If history pointer isn’t at the end, truncate the redo branch
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(JSON.stringify(state)); // Store as JSON string
    this.historyIndex++;
    this.storageManager?.scheduleSave();

    // Limit history size
    if (this.history.length > constants.historyLimit) {
      this.history.shift(); // Remove oldest entry
      this.historyIndex--; // Adjust index
    }
  }

  /**
   * Loads the application state from the provided state object.
   * This method initializes layers, free draw objects, custom objects, and settings,
   * recreating image objects where necessary and ensuring default values are applied
   * when data is missing or invalid.
   *
   * @param {Object} state - The state object to load.
   */
  loadStateData(state) {
    this.isDrawing = this.isSelecting = this.isMovingSelection = false;
    this.transformDrag = this.selectionStart = this.selectionEnd = null;
    this.selectionBase = null;
    this.polygonDraft = [];
    this.layers = state.layers.map((layerData) => {
      let newLayer = {
        name: layerData.name || "Unnamed Layer",
        visible: layerData.visible !== undefined ? layerData.visible : true,
        gridShadowOptions: {
          ...constants.defaultGridShadowOptions, // Start with defaults
          ...(layerData.gridShadowOptions || {}), // Override with loaded data if present
        },
        globalLight: Object.fromEntries(
          Object.keys(globalLightDefaults).map((key) => [
            key,
            (layerData.globalLight || state.settings?.ambientLight)?.[key] ??
              globalLightDefaults[key],
          ]),
        ),
        gridBorderOptions: {
          ...borderDefaults,
          ...(layerData.gridBorderOptions || state.settings?.gridBorderOptions),
        },
        objects: new Map(
          (layerData.objects || []).map(([key, cell]) => {
            // Recreate Image objects from src
            if (
              cell.type === "image" &&
              cell.image &&
              typeof cell.image === "string"
            ) {
              let img = new Image();
              img.src = cell.image;
              cell.imageSrc = cell.image; // Store src back
              cell.image = img; // Store Image object
              // TODO: Add onload/onerror handlers if needed for robustness during load
              img.onload = () => this.render(); // Re-render when images load
            } else {
              cell.image = null; // Ensure no broken image refs
              cell.imageSrc = null;
            }
            return [key, cell];
          }),
        ),
      };
      return newLayer;
    });
    // Ensure at least one layer exists
    if (this.layers.length === 0) {
      this.layers.push({
        name: "Layer 1",
        objects: new Map(),
        visible: true,
        gridShadowOptions: { ...constants.defaultGridShadowOptions },
      });
    }

    // Load rest of state (freeDraw, customObjects, settings)
    this.freeDrawObjects = new Map(
      (state.freeDrawObjects || []).map(([id, obj]) => {
        if (obj.image && typeof obj.image === "string") {
          let img = new Image();
          img.src = obj.image;
          obj.image = img;
          img.onload = () => this.render();
        } else {
          obj.image = null;
        }
        return [id, obj];
      }),
    );
    this.customObjects = new Map(
      (state.customObjects || []).map(([id, obj]) => {
        if (obj.image && typeof obj.image === "string") {
          let img = new Image();
          img.src = obj.image;
          obj.imageSrc = obj.image;
          obj.image = img;
          img.onload = () => this.render();
        } else {
          obj.image = null;
          obj.imageSrc = null;
        }
        return [id, obj];
      }),
    );

    // Load settings
    if (state.settings) {
      this.currentCellSize =
        state.settings.currentCellSize || constants.baseCellSize;
      this.offsetX = state.settings.offsetX || 0;
      this.offsetY = state.settings.offsetY || 0;
      this.scale = state.settings.scale || 1;
      this.activeLayerIndex = state.settings.activeLayerIndex || 0;
      // Ensure activeLayerIndex is valid
      if (
        this.activeLayerIndex >= this.layers.length ||
        this.activeLayerIndex < 0
      ) {
        this.activeLayerIndex = 0;
      }

      // Empty Cell Settings
      this.emptyCellSettings =
        state.settings.emptyCellSettings || this.emptyCellSettings;
      if (
        this.emptyCellSettings.pattern &&
        typeof this.emptyCellSettings.pattern === "string"
      ) {
        let img = new Image();
        img.src = this.emptyCellSettings.pattern;
        this.emptyCellSettings.patternSrc = this.emptyCellSettings.pattern;
        this.emptyCellSettings.pattern = img;
        img.onload = () => this.render();
      } else {
        this.emptyCellSettings.pattern = null;
        this.emptyCellSettings.patternSrc = null;
      }

      // Grid Draw Image List & Settings
      this.gridImageList = state.settings.gridImageList || [];
      this.gridDrawSettings = {
        ...tileDefaults,
        ...(state.settings.gridDrawSettings || this.gridDrawSettings),
      };
      if (
        this.gridDrawSettings.image &&
        typeof this.gridDrawSettings.image === "string"
      ) {
        let img = new Image();
        img.src = this.gridDrawSettings.image;
        this.gridDrawSettings.imageSrc = this.gridDrawSettings.image;
        this.gridDrawSettings.image = img;
        img.onload = () => this.render();
      } else {
        this.gridDrawSettings.image = null;
        this.gridDrawSettings.imageSrc = null;
      }

      // Free Draw Settings Image
      this.freeDrawSettings = {
        ...brushDefaults,
        ...(state.settings.freeDrawSettings || this.freeDrawSettings),
      };
      if (
        !this.freeDrawSettings.sourceImageSrc &&
        typeof this.freeDrawSettings.image === "string"
      ) {
        this.freeDrawSettings.sourceImageSrc = this.freeDrawSettings.image;
        this.freeDrawSettings.svgSource ||= svgFromDataUrl(
          this.freeDrawSettings.image,
        );
      }
      if (
        this.freeDrawSettings.image &&
        typeof this.freeDrawSettings.image === "string"
      ) {
        let img = new Image();
        img.src = this.freeDrawSettings.image;
        this.freeDrawSettings.image = img;
        img.onload = () => this.render();
      } else {
        this.freeDrawSettings.image = null;
      }

      if (
        this.freeDrawSettings.svgSource ||
        this.freeDrawSettings.sourceImageSrc
      )
        this.updateBrushImage();

      // Add Object Image
      this.customObjectImageSrc = state.settings.customObjectImageSrc || null;
      if (this.customObjectImageSrc) {
        let img = new Image();
        img.src = this.customObjectImageSrc;
        this.customObjectImage = img;
        // No immediate render needed for this one
      } else {
        this.customObjectImage = null;
      }
    }

    for (const layer of this.layers) {
      layer.gridBorderOptions = {
        ...borderDefaults,
        ...layer.gridBorderOptions,
      };
      for (const [imageKey, srcKey] of [
        ["image", "imageSrc"],
        ["cornerImage", "cornerImageSrc"],
      ]) {
        const src =
          layer.gridBorderOptions[srcKey] || layer.gridBorderOptions[imageKey];
        if (typeof src === "string" && src) {
          const image = new Image();
          image.onload = () => this.render();
          image.src = src;
          layer.gridBorderOptions[imageKey] = image;
          layer.gridBorderOptions[srcKey] = src;
        } else {
          layer.gridBorderOptions[imageKey] = null;
          layer.gridBorderOptions[srcKey] = null;
        }
      }
    }
    this.ambientLight = { ...ambientDefaults, ...state.settings?.ambientLight };
    this.exportSettings = {
      colorMode: "color",
      padding: 1,
      ...state.settings?.exportSettings,
    };
    this.polygonSettings = { ...polygonDefaults, ...state.settings?.polygonSettings };
    if (this.polygonSettings.imageSrc) {
      const image = new Image();
      image.onload = () => this.render();
      image.src = this.polygonSettings.imageSrc;
      this.polygonSettings.image = image;
    }
    this.bakedLighting = null;
    this.bakeStatus = "Live lighting";
    this.rebuildBorderTopology();
    this.lightSettings = {
      ...lightDefaults,
      ...(state.settings?.lightSettings || {}),
    };
    // Legacy global objects migrate to the first layer, preserving their relative order.
    for (const objects of [this.freeDrawObjects, this.customObjects])
      for (const obj of objects.values()) {
        obj.layerIndex =
          obj.layerIndex !== undefined &&
          obj.layerIndex !== null &&
          Number.isInteger(Number(obj.layerIndex))
            ? Math.max(
                0,
                Math.min(this.layers.length - 1, Number(obj.layerIndex)),
              )
            : 0;
        obj.rotation = obj.rotation || 0;
        if (obj.type === "light")
          Object.assign(obj, { ...lightDefaults, ...obj });
      }
    this.transformDrag = null;
    // Clear selection (we might not need to do that)
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  /**
   * Loads a history state from a JSON string, parses it, and applies the state to the canvas.
   * If the parsing fails, an error is logged to the console.
   *
   * @param {string} stateString - A JSON string representing the history state to be loaded.
   * @throws {SyntaxError} Throws an error if the provided string is not valid JSON.
   */
  loadHistoryState(stateString) {
    try {
      const state = JSON.parse(stateString);
      const view = {
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
      };
      const bake = this.bakedLighting,
        bakeStatus = this.bakeStatus;
      this.loadStateData(state);
      if (bake && bake.signature === lightingSignature(this)) {
        this.bakedLighting = bake;
        this.bakeStatus = bakeStatus;
      }
      Object.assign(this, view);
      this.history[this.historyIndex] = JSON.stringify(this.getMapData());
      window.hudInstance?.refresh();
      this.storageManager?.scheduleSave();
      this.render();
    } catch (e) {
      console.error("Error parsing history state:", e);
    }
  }

  /**
   * Undoes the last action by loading the previous state from history.
   */
  undo() {
    this.saveHistory();
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadHistoryState(this.history[this.historyIndex]);
    }
  }

  /**
   * Redoes the last undone action by loading the next state from history.
   */
  redo() {
    this.saveHistory();
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadHistoryState(this.history[this.historyIndex]);
    }
  }

  /**
   * Updates the cell size and re-renders the canvas.
   * @param {number} newSize - The new cell size to be set.
   */
  updateCellSize(newSize) {
    // TODO: Adjust view to keep center point stable during cell size change
    const ratio = newSize / this.currentCellSize;
    for (const objects of [this.freeDrawObjects, this.customObjects])
      for (const obj of objects.values()) {
        obj.x *= ratio;
        obj.y *= ratio;
        if (obj.size) obj.size *= ratio;
        if (obj.width) obj.width *= ratio;
        if (obj.height) obj.height *= ratio;
      }
    this.currentCellSize = newSize;
    this.render();
    // No history save here, assumed to be part of other actions or implicit
  }

  /**
   * Clears the canvas by resetting all objects and selections.
   */
  clearCanvas() {
    this.layers.forEach((layer) => layer.objects.clear());
    this.freeDrawObjects.clear();
    this.customObjects.clear();
    this.polygonDraft = [];
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
    // Don't reset history here, clearCanvas should be undoable
    this.render();
  }

  /**
   * Resizes the canvas to fit the window dimensions and re-renders the canvas.
   */
  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.render(); // Re-render after resize
  }

  /**
   * Converts screen coordinates to world coordinates based on the current
   * canvas offset and scale.
   *
   * @param {number} screenX - The x-coordinate on the screen.
   * @param {number} screenY - The y-coordinate on the screen.
   * @returns {{x: number, y: number}} An object containing the corresponding
   * world coordinates with `x` and `y` properties.
   */
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale,
    };
  }

  /**
   * Converts world coordinates to screen coordinates based on the current
   * canvas offset and scale.
   *
   * @param {number} worldX - The x-coordinate in the world.
   * @param {number} worldY - The y-coordinate in the world.
   * @returns {{x: number, y: number}} An object containing the corresponding
   * screen coordinates with `x` and `y` properties.
   */
  worldToScreen(worldX, worldY) {
    return {
      x: worldX * this.scale + this.offsetX,
      y: worldY * this.scale + this.offsetY,
    };
  }

  /**
   * Sets up event listeners for the canvas element to handle various user interactions.
   *
   * - Handles zooming with the mouse wheel, including clamping the zoom scale and adjusting offsets
   *   to keep the zoom centered on the mouse position.
   * - Handles mouse events for drawing, panning, and selection:
   *   - Left mouse button: Drawing or selecting objects.
   *   - Middle mouse button: Panning the canvas.
   *   - Right mouse button: Reserved for future context menu functionality.
   * - Handles mouse movement for updating drawing, panning, and selection actions in real-time.
   * - Handles mouse release to finalize actions such as drawing, selection, or panning.
   * - Prevents the default context menu from appearing on right-click.
   *
   * @listens wheel - Handles zooming in and out with the mouse wheel.
   * @listens mousedown - Handles initiating drawing, panning, or selection based on the mouse button.
   * @listens mousemove - Handles updating drawing, panning, or selection actions in real-time.
   * @listens mouseup - Handles finalizing drawing, panning, or selection actions.
   * @listens contextmenu - Prevents the default context menu from appearing on right-click.
   */
  setupEventListeners() {
    // Zooming with the mouse wheel
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (event.altKey && this.activeInstrument === "freeDraw") {
          const rect = this.canvas.getBoundingClientRect(),
            point = this.screenToWorld(
              event.clientX - rect.left,
              event.clientY - rect.top,
            );
          this.mouseX = point.x;
          this.mouseY = point.y;
          this.mouseOverCanvas = true;
          this.setBrushSize(
            this.freeDrawSettings.size +
              Math.sign(-event.deltaY) *
                Math.max(
                  0.1,
                  this.freeDrawSettings.size *
                    (Math.exp(Math.min(1000, Math.abs(event.deltaY)) * 0.002) -
                      1),
                ),
          );
          clearTimeout(this.brushSizeCommitTimer);
          this.brushSizeCommitTimer = setTimeout(() => this.saveHistory(), 180);
          return;
        }
        const zoomIntensity = 0.001;
        let zoomAmount = -event.deltaY * zoomIntensity; // Inverted for natural zooming

        const newScale = this.scale * (1 + zoomAmount);
        // Clamp scale
        const minScale = 0.1;
        const maxScale = 10;
        if (newScale < minScale || newScale > maxScale) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Get world coordinates before zoom
        const worldXBefore = (mouseX - this.offsetX) / this.scale;
        const worldYBefore = (mouseY - this.offsetY) / this.scale;

        this.scale = newScale;

        // Calculate new offset to keep mouse point stationary
        this.offsetX = mouseX - worldXBefore * this.scale;
        this.offsetY = mouseY - worldYBefore * this.scale;

        this.render();
      },
      { passive: false },
    ); // Need passive: false to preventDefault

    this.canvas.addEventListener("mouseleave", () => {
      this.mouseOverCanvas = false;
      this.render();
    });
    this.canvas.addEventListener("mouseenter", () => {
      this.mouseOverCanvas = true;
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (this.activeInstrument !== "freeDraw") return;
      if (event.key === "Alt") {
        this.brushSizeModifier = true;
        this.render();
      }
      if (["[", "]"].includes(event.key) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        this.setBrushSize(
          this.freeDrawSettings.size +
            (event.key === "]" ? 1 : -1) *
              Math.max(0.1, this.freeDrawSettings.size * 0.1),
        );
        this.saveHistory();
      }
    });
    document.addEventListener("keyup", (event) => {
      if (event.key === "Alt") {
        this.brushSizeModifier = false;
        this.render();
      }
    });
    window.addEventListener("blur", () => {
      this.brushSizeModifier = false;
      this.render();
    });

    // Combined mouse events for drawing, panning, and selection.
    // TODO: add right-click functionality
    this.canvas.addEventListener("mousedown", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const startX = event.clientX - rect.left;
      const startY = event.clientY - rect.top;
      const worldPos = this.screenToWorld(startX, startY);

      // Middle mouse button for panning
      if (event.button === 1 || (event.button === 0 && this.activeInstrument === "pan")) {
        // Middle mouse button
        this.isPanning = true;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        this.canvas.style.cursor = "grabbing";
        event.preventDefault(); // Prevent default middle-click scroll
      }

      // Left mouse button for drawing/selecting
      else if (event.button === 0) {
        if (this.activeInstrument === "layers") return;
        // Left mouse button
        if (this.activeInstrument === "select") {
          if (event.shiftKey) {
            this.isSelecting = true;
            this.selectionBase = structuredClone(this.selectedObjects);
            this.selectionStart = this.selectionEnd = worldPos;
            this.render();
            return;
          }
          this.selectionBase = null;
          const handle = this.hitHandle(worldPos);
          if (handle) {
            this.transformDrag = { ...handle, original: { ...handle.obj } };
            if (handle.obj.type === "group") {
              this.transformDrag.members = handle.obj.members.map((m) => ({
                obj: m.obj,
                original: { ...m.obj },
              }));
              this.transformDrag.startAngle = Math.atan2(
                worldPos.y - handle.obj.y,
                worldPos.x - handle.obj.x,
              );
            }
            return;
          }
          // Check if clicking inside the current selection bounding box (if any)
          const clickedObject = this.getObjectAtWorldPos(worldPos);
          const isSelected = this.isObjectSelected(clickedObject);

          if (clickedObject) {
            if (!isSelected) {
              if (!event.shiftKey)
                this.selectedObjects = { grid: [], free: [], custom: [] };
              this.selectedObjects[clickedObject.type].push(clickedObject.id);
            }
            this.expandGroupSelection();
            this.gridMoveRemainder = { x: 0, y: 0 };
            // Start moving the existing selection
            this.isMovingSelection = true;
            this.selectionDragStart = worldPos;
            // Keep existing selection
          } else {
            // Start a new selection
            this.isSelecting = true;
            this.selectionStart = worldPos;
            this.selectionEnd = worldPos;
            // Clear previous selection unless Shift is held (implement multi-select later)
            if (!event.shiftKey) {
              this.selectedObjects = { grid: [], free: [], custom: [] };
            }
          }
        } else {
          // Start drawing with other tools
          this.isDrawing = true;
          this.strokeCells = new Set();
          this.handleDrawing(worldPos, event); // Pass event if needed
        }
        this.render(); // Render everything immediately
      }
    });

    // Mouse move event for all actions
    this.canvas.addEventListener("mousemove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;
      const worldPos = this.screenToWorld(currentX, currentY);
      this.mouseX = worldPos.x;
      this.mouseY = worldPos.y;
      this.mouseOverCanvas = true;
      if (this.activeInstrument === "polygon") this.render();
      if (
        this.activeInstrument === "freeDraw" &&
        (this.brushSizeModifier ||
          performance.now() < (this.brushPreviewUntil || 0))
      )
        this.render();

      if (this.transformDrag) {
        this.updateTransform(worldPos, event.shiftKey);
        this.render();
        return;
      }
      if (this.activeInstrument === "select") {
        const handle = this.hitHandle(worldPos);
        this.canvas.style.cursor = handle
          ? handle.kind === "rotate"
            ? "grab"
            : "nwse-resize"
          : "default";
      }
      // Panning
      if (this.isPanning) {
        const dx = event.clientX - this.lastPanX;
        const dy = event.clientY - this.lastPanY;
        this.offsetX += dx;
        this.offsetY += dy;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        this.render();
        return; // Don't do other actions while panning
      }

      // Drawing
      if (this.isDrawing) {
        this.handleDrawing(worldPos, event);
      }

      // Selecting (updating selection rectangle)
      if (this.isSelecting) {
        this.selectionEnd = worldPos;
        this.render(); // Update selection rectangle visually
      }

      // Moving Selection
      if (this.isMovingSelection && this.selectionDragStart) {
        const dx = worldPos.x - this.selectionDragStart.x;
        const dy = worldPos.y - this.selectionDragStart.y;
        this.moveSelection(dx, dy);
        this.selectionDragStart = worldPos; // Update start for next delta
        this.render();
      }
    });

    // Use *window* mouseup to catch events outside canvas
    window.addEventListener("mouseup", (event) => {
      if (event.button === 0 && this.transformDrag) {
        this.transformDrag = null;
        this.saveHistory();
        window.hudInstance?.loadInstrumentSettings("select");
        return;
      }
      // Panning end
      if ((event.button === 1 || event.button === 0) && this.isPanning) {
        // Middle mouse button
        this.isPanning = false;
        this.canvas.style.cursor = "default";
      }
      // Drawing/Selecting end
      else if (event.button === 0) {
        // Left mouse button
        if (this.isDrawing) {
          this.isDrawing = false;
          this.strokeCells = null;
          this.lastFreeDrawPosition = null; // Reset for free draw period
          this.saveHistory(); // Rebuild the union once, after the entire stroke.
          this.render();
          window.hudInstance?.updateLayerList();
        }
        if (this.isSelecting) {
          this.isSelecting = false;
          this.finalizeSelection(); // Determine selected objects
          // Don't save history here, selection itself isn't a state change yet
          this.render(); // Render highlights
        }
        if (this.isMovingSelection) {
          this.isMovingSelection = false;
          this.selectionDragStart = null;
          this.saveHistory(); // Save state after moving selection
          window.hudInstance?.loadInstrumentSettings(this.activeInstrument);
          window.hudInstance?.updateLayerList();
        }
      }
    });

    this.canvas.addEventListener("dblclick", (event) => {
      if (this.activeInstrument !== "select" || this.selectionGroup()) return;
      const rect = this.canvas.getBoundingClientRect(),
        p = this.screenToWorld(
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      for (const id of this.selectedObjects.custom) {
        const obj = this.customObjects.get(id);
        if (!obj || obj.type === "light" || !this.editable(obj)) continue;
        const q = localPoint(obj, p),
          tolerance = 10 / this.scale;
        const horizontal =
          Math.abs(Math.abs(q.y) - obj.height / 2) < tolerance &&
          Math.abs(q.x) <= obj.width / 2 + tolerance;
        const vertical =
          Math.abs(Math.abs(q.x) - obj.width / 2) < tolerance &&
          Math.abs(q.y) <= obj.height / 2 + tolerance;
        if (!horizontal && !vertical) continue;
        const dimension = horizontal ? "width" : "height";
        const value = prompt(
          `Object ${dimension} (cells)`,
          (obj[dimension] / this.currentCellSize).toFixed(2),
        );
        if (
          value !== null &&
          Number.isFinite(Number(value)) &&
          Number(value) > 0
        ) {
          this.setObjectDimension(
            obj,
            dimension,
            Number(value) * this.currentCellSize,
          );
          this.saveHistory();
          this.render();
        }
        break;
      }
    });
    // Prevent context menu on canvas
    // TODO: add right-click context menu
    this.canvas.addEventListener("contextmenu", (event) =>
      event.preventDefault(),
    );
  }

  /**
   * Handles drawing operations on the canvas based on the active instrument and user interaction.
   *
   * @param {Object} worldPos - The world position where the drawing action occurs.
   * @param {number} worldPos.x - The x-coordinate in world space.
   * @param {number} worldPos.y - The y-coordinate in world space.
   * @param {Event} event - The event object associated with the drawing action. Currently unused.
   *
   * @throws {Error} Throws an error if an unsupported instrument is used.
   *
   * Instruments:
   * - "gridDraw": Draws or updates a grid cell on the active layer.
   * - "freeDraw": Draws freehand objects based on user input.
   * - "erase": Erases grid cells, free draw objects, or custom objects based on proximity or bounding box.
   * - "addObject": Adds a custom object (e.g., image) to the canvas at the specified position.
   *
   * Notes:
   * - For "gridDraw", the method checks if the cell data has changed before updating.
   * - For "freeDraw", the method respects a minimum distance (period) between points.
   * - For "erase", the method supports erasing grid cells, free draw objects, and custom objects.
   * - For "addObject", the method requires a selected image to place on the canvas.
   */
  handleDrawing(worldPos, event) {
    const cellX = Math.floor(worldPos.x / this.currentCellSize); // Cell index over x-axis
    const cellY = Math.floor(worldPos.y / this.currentCellSize); // Cell index over y-axis
    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
    if (!this.layers[this.activeLayerIndex]?.visible) return;

    if (!activeLayerObjects && this.activeInstrument === "gridDraw") {
      // currently only gridDraw is layer-dependent
      console.warn("No active layer to draw on.");
      return;
    }

    switch (this.activeInstrument) {
      case "gridDraw":
        const cellId = this._cellId(cellX, cellY);
        if (this.isDrawing && this.strokeCells?.has(cellId)) break;
        this.strokeCells?.add(cellId);
        const currentCell = activeLayerObjects.get(cellId);
        const settings = this.gridDrawSettings,
          choices = settings.type === "image" ? settings.tileset || [] : [],
          source = choices.length
            ? choices[Math.floor(Math.random() * choices.length)]
            : settings.imageSrc;
        const newCellData = {
          blocksLight: this.gridDrawSettings.blocksLight !== false,
          castsShadow: this.gridDrawSettings.castsShadow !== false,
          receivesGlobalShadow:
            (this.gridDrawSettings.receivesGlobalShadow ??
              this.gridDrawSettings.receivesShadow) === true,
          receivesLightShadow:
            this.gridDrawSettings.receivesLightShadow !== false,
          opacity: this.gridDrawSettings.opacity ?? 1,
          x: cellX,
          y: cellY,
          type: this.gridDrawSettings.type,
          fillColor: this.gridDrawSettings.fillColor,
          borderColor: this.gridDrawSettings.borderColor,
          outlineEnabled:
            settings.type === "image"
              ? settings.imageOutlineEnabled === true
              : settings.outlineEnabled !== false,
          image:
            settings.type === "image"
              ? this.getTileImage(source) || settings.image
              : null,
          imageSrc: settings.type === "image" ? source : null,
          ...(settings.type === "image" ? tileVariation(settings) : {}),
        };

        if (JSON.stringify(currentCell) !== JSON.stringify(newCellData)) {
          // If cells are not identical (if they are, we do nothing)
          activeLayerObjects.set(cellId, newCellData);
          this.render();
        }
        break;

      case "freeDraw":
        if (this.freeDrawSettings.period > 0 && this.lastFreeDrawPosition) {
          const dx = worldPos.x - this.lastFreeDrawPosition.x;
          const dy = worldPos.y - this.lastFreeDrawPosition.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Check distance against period in world units
          if (dist < this.freeDrawSettings.period * this.currentCellSize) {
            return; // Don't draw yet
          }
        }
        const id =
          Date.now().toString() + Math.random().toString(36).substring(2);
        this.freeDrawObjects.set(id, {
          layerIndex: this.activeLayerIndex,
          x:
            worldPos.x +
            (Math.random() * 2 - 1) *
              (this.freeDrawSettings.spread || 0) *
              this.currentCellSize,
          y:
            worldPos.y +
            (Math.random() * 2 - 1) *
              (this.freeDrawSettings.spread || 0) *
              this.currentCellSize,
          rotation:
            ((Math.random() * 2 - 1) *
              (this.freeDrawSettings.rotationRandomness || 0) *
              Math.PI) /
            180,
          mirrorX:
            ["horizontal", "both"].includes(this.freeDrawSettings.mirroring) &&
            Math.random() < 0.5,
          mirrorY:
            ["vertical", "both"].includes(this.freeDrawSettings.mirroring) &&
            Math.random() < 0.5,
          type: "freeDraw", // Keep type for potential differentiation
          fillColor: this.freeDrawSettings.fillColor,
          strokeColor: this.freeDrawSettings.strokeColor,
          size:
            this.freeDrawSettings.size *
            this.currentCellSize *
            Math.max(
              0.05,
              1 +
                (Math.random() * 2 - 1) *
                  (this.freeDrawSettings.sizeRandomness || 0),
            ),
          image: this.freeDrawSettings.image, // Store the Image object
        });
        this.lastFreeDrawPosition = worldPos; // Update last position
        // TODO: connecting SVG patterns logic
        // if (this.freeDrawSettings.connectSVG && this.freeDrawSettings.image?.src?.endsWith('.svg')) { ... }
        this.render();
        break;

      case "erase":
        // Erase grid cell on active layer
        const gridCellId = this._cellId(cellX, cellY);
        if (activeLayerObjects?.has(gridCellId)) {
          activeLayerObjects.delete(gridCellId);
        }

        // Erase free draw objects (check proximity)
        const eraseRadiusFreeWorld = this.currentCellSize / 2;
        for (let [fId, fObj] of this.freeDrawObjects) {
          if (!this.editable(fObj)) continue;
          const dxFree = fObj.x - worldPos.x;
          const dyFree = fObj.y - worldPos.y;
          // Check distance against object size or a fixed radius
          if (
            Math.sqrt(dxFree * dxFree + dyFree * dyFree) <
            (fObj.size / 2 || eraseRadiusFreeWorld)
          ) {
            this.freeDrawObjects.delete(fId);
          }
        }

        // Erase custom objects (check bounding box)
        for (let [cId, cObj] of this.customObjects) {
          if (this.editable(cObj) && contains(cObj, worldPos))
            this.customObjects.delete(cId);
        }
        this.render();
        break;

      case "polygon": {
        if (event.type !== "mousedown") break;
        const first = this.polygonDraft[0];
        if (first && this.polygonDraft.length >= 3 && Math.hypot(first.x-worldPos.x, first.y-worldPos.y) < 12/this.scale) {
          this.finishPolygon();
        } else {
          this.polygonDraft.push({ ...worldPos });
          window.hudInstance?.loadInstrumentSettings("polygon");
        }
        this.render();
        break;
      }
      case "light": {
        if (event.type !== "mousedown") break;
        const id = crypto.randomUUID();
        this.customObjects.set(id, {
          ...lightDefaults,
          ...this.lightSettings,
          type: "light",
          layerIndex: this.activeLayerIndex,
          x: worldPos.x,
          y: worldPos.y,
          width: this.currentCellSize * 0.6,
          height: this.currentCellSize * 0.6,
          rotation: 0,
        });
        this.render();
        break;
      }
      case "addObject":
        if (event.type !== "mousedown") break;
        if (this.customObjectImage) {
          const objId =
            Date.now().toString() + Math.random().toString(36).substring(2);
          // Place center at mouse position
          const objWidth =
            this.customObjectImage.naturalWidth *
            (this.currentCellSize / constants.baseCellSize); // Scale based on image size scaled by current cell size.
          const objHeight =
            this.customObjectImage.naturalHeight *
            (this.currentCellSize / constants.baseCellSize);

          this.customObjects.set(objId, {
            layerIndex: this.activeLayerIndex,
            blocksLight: true,
            x: worldPos.x,
            y: worldPos.y,
            width: objWidth,
            height: objHeight,
            rotation: 0, // Radians
            image: this.customObjectImage, // Store Image object
            imageSrc: this.customObjectImageSrc, // Store src
          });
          this.render();
        } else {
          // Maybe provide feedback that no image is selected
          console.log("Select an object image first.");
        }
        break;

      default:
        throw new Error(`Unsupported instrument: ${this.activeInstrument}`);
    }
  }

  /**
   * Retrieves the object located at the specified world position.
   *
   * This method checks for objects in the following order:
   * 1. Custom objects (checked in reverse order for top-most priority).
   * 2. Free draw objects (checked in reverse order for top-most priority).
   * 3. Grid cells on the active layer.
   *
   * @param {Object} worldPos - The world position to check.
   * @param {number} worldPos.x - The x-coordinate of the world position.
   * @param {number} worldPos.y - The y-coordinate of the world position.
   * @returns {Object|null} The object found at the specified position, or `null` if no object is found.
   * The returned object contains the following properties:
   * - `type` {string} - The type of the object ("custom", "free", or "grid").
   * - `id` {string|number} - The unique identifier of the object.
   * - `object` {Object} - The object itself.
   */
  getObjectAtWorldPos(worldPos) {
    if (!this.layers[this.activeLayerIndex]?.visible) return null;
    // Check Custom Objects first (faster, because they're usually on top) - reverse order for top-most
    const customIds = Array.from(this.customObjects.keys()).reverse();
    for (const id of customIds) {
      const obj = this.customObjects.get(id);
      if (this.editable(obj) && contains(obj, worldPos)) {
        return { type: "custom", id: id, object: obj };
      }
    }

    // Check Free Draw Objects - reverse order for top-most
    const freeIds = Array.from(this.freeDrawObjects.keys()).reverse();
    for (const id of freeIds) {
      const obj = this.freeDrawObjects.get(id);
      if (!this.editable(obj)) continue;
      const dx = obj.x - worldPos.x;
      const dy = obj.y - worldPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < obj.size / 2) {
        return { type: "free", id: id, object: obj };
      }
    }

    // Check Grid Cell on Active Layer
    const cellX = Math.floor(worldPos.x / this.currentCellSize);
    const cellY = Math.floor(worldPos.y / this.currentCellSize);
    const cellId = this._cellId(cellX, cellY);
    if (this.layers[this.activeLayerIndex]?.objects.has(cellId)) {
      return {
        type: "grid",
        id: cellId,
        object: this.layers[this.activeLayerIndex].objects.get(cellId),
      };
    }

    return null; // Nothing found
  }

  /**
   * Checks if a given object is selected based on its type and ID.
   *
   * @param {Object} objInfo - Information about the object to check.
   * @param {string} objInfo.type - The type of the object ('grid', 'free', or 'custom').
   * @param {string|number} objInfo.id - The unique identifier of the object.
   * @returns {boolean} Returns `true` if the object is selected, otherwise `false`.
   */
  isObjectSelected(objInfo) {
    if (!objInfo) return false;
    switch (objInfo.type) {
      case "grid":
        return this.selectedObjects.grid.includes(objInfo.id);
      case "free":
        return this.selectedObjects.free.includes(objInfo.id);
      case "custom":
        return this.selectedObjects.custom.includes(objInfo.id);
      default:
        return false;
    }
  }

  /**
   * Finalizes the selection process on the canvas.
   * Handles both single-click and drag-based selection of objects.
   * Updates the `selectedObjects` property based on the selection area or clicked object.
   * Clears the selection rectangle drawing points after processing.
   *
   * Behavior:
   * - Single-click: Selects a single object at the clicked position.
   * - Drag-selection: Selects all objects within the rectangular selection area.
   *
   * Selection Types:
   * - Grid objects: Selected based on their center point being within the selection rectangle.
   * - Free draw objects: Selected based on their position being within the selection rectangle.
   * - Custom objects: Selected based on their axis-aligned bounding box (AABB) intersecting the selection rectangle.
   *
   * Notes:
   * - Shift-drag adds to the selection without starting a move.
   * - Calls `window.hudInstance.loadInstrumentSettings` to update the HUD with the active instrument settings.
   */
  finalizeSelection() {
    if (!this.layers[this.activeLayerIndex]?.visible) return;
    this.selectedObjects = this.selectionBase || {
      grid: [],
      free: [],
      custom: [],
    };
    if (
      this.selectionStart &&
      this.selectionEnd &&
      Math.hypot(
        this.selectionStart.x - this.selectionEnd.x,
        this.selectionStart.y - this.selectionEnd.y,
      ) *
        this.scale <
        3
    ) {
      const hit = this.getObjectAtWorldPos(this.selectionStart);
      if (hit && !this.selectedObjects[hit.type].includes(hit.id))
        this.selectedObjects[hit.type].push(hit.id);
    }
    // If it was a drag selection
    else if (this.selectionStart && this.selectionEnd) {
      const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
      const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
      const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
      const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

      // Select grid cells (check center point within rect)
      const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
      if (activeLayerObjects) {
        activeLayerObjects.forEach((cell, cellId) => {
          const cellCenterX = (cell.x + 0.5) * this.currentCellSize;
          const cellCenterY = (cell.y + 0.5) * this.currentCellSize;
          if (
            cellCenterX >= startX &&
            cellCenterX < endX &&
            cellCenterY >= startY &&
            cellCenterY < endY
          ) {
            this.selectedObjects.grid.push(cellId);
          }
        });
      }

      // Select free draw objects (check center point within rect)
      this.freeDrawObjects.forEach((obj, id) => {
        if (!this.editable(obj)) return;
        if (
          obj.x >= startX &&
          obj.x < endX &&
          obj.y >= startY &&
          obj.y < endY
        ) {
          this.selectedObjects.free.push(id);
        }
      });

      // Select custom objects (check if AABB intersects rect)
      this.customObjects.forEach((obj, id) => {
        if (!this.editable(obj)) return;
        const objMinX = obj.x - obj.width / 2;
        const objMinY = obj.y - obj.height / 2;
        const objMaxX = obj.x + obj.width / 2;
        const objMaxY = obj.y + obj.height / 2;
        // Check for intersection
        if (
          objMaxX > startX &&
          objMinX < endX &&
          objMaxY > startY &&
          objMinY < endY
        ) {
          this.selectedObjects.custom.push(id);
        }
      });
    }

    for (const type of ["grid", "free", "custom"])
      this.selectedObjects[type] = [...new Set(this.selectedObjects[type])];
    this.expandGroupSelection();
    this.selectionBase = null;
    // Reset selection rectangle drawing points
    this.selectionStart = null;
    this.selectionEnd = null;
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
  }

  /**
   * Moves the currently selected objects on the canvas by the specified offsets in world coordinates.
   *
   * This method updates the positions of free draw objects and custom objects that are currently selected.
   * Grid cells move in whole-cell steps; images and freehand marks move freely.
   *
   * @param {number} dxWorld - The horizontal offset in world coordinates to move the selected objects.
   * @param {number} dyWorld - The vertical offset in world coordinates to move the selected objects.
   */
  moveSelection(dxWorld, dyWorld) {
    const remainder = (this.gridMoveRemainder ||= { x: 0, y: 0 });
    remainder.x += dxWorld;
    remainder.y += dyWorld;
    const gx = Math.trunc(remainder.x / this.currentCellSize),
      gy = Math.trunc(remainder.y / this.currentCellSize);
    if ((gx || gy) && this.selectedObjects.grid.length) {
      const cells = this.layers[this.activeLayerIndex].objects,
        moved = [];
      const selected = new Set(this.selectedObjects.grid);
      for (const id of selected) {
        const cell = cells.get(id);
        if (cell) {
          const target = this._cellId(cell.x + gx, cell.y + gy);
          if (cells.has(target) && !selected.has(target)) {
            remainder.x = remainder.y = 0;
            return;
          }
        }
      }
      for (const id of this.selectedObjects.grid) {
        const cell = cells.get(id);
        if (cell) moved.push({ ...cell, x: cell.x + gx, y: cell.y + gy });
        cells.delete(id);
      }
      this.selectedObjects.grid = moved.map((cell) => {
        const id = this._cellId(cell.x, cell.y);
        cells.set(id, cell);
        return id;
      });
      remainder.x -= gx * this.currentCellSize;
      remainder.y -= gy * this.currentCellSize;
    }

    // Move Free Draw Objects
    this.selectedObjects.free.forEach((id) => {
      const obj = this.freeDrawObjects.get(id);
      if (obj) {
        obj.x += dxWorld;
        obj.y += dyWorld;
      }
    });

    // Move Custom Objects
    this.selectedObjects.custom.forEach((id) => {
      const obj = this.customObjects.get(id);
      if (obj) {
        obj.x += dxWorld;
        obj.y += dyWorld;
      }
    });
  }

  /**
   * Calculates the center point of the currently selected objects on the canvas.
   *
   * The method computes the average position of all selected objects, including
   * grid-based objects, free-draw objects, and custom objects. If no objects are
   * selected, it returns `null`.
   *
   * @returns {{x: number, y: number} | null} The center point of the selection as an object
   * with `x` and `y` coordinates, or `null` if no objects are selected.
   */
  selectedMembers() {
    return ["free", "custom"].flatMap((kind) => {
      const objects =
        kind === "free" ? this.freeDrawObjects : this.customObjects;
      return this.selectedObjects[kind].flatMap((id) => {
        const obj = objects.get(id);
        return obj && this.editable(obj) ? [{ kind, id, obj }] : [];
      });
    });
  }

  expandGroupSelection() {
    const groups = new Set(
      this.selectedMembers()
        .map((m) => m.obj.groupId)
        .filter(Boolean),
    );
    if (!groups.size) return;
    for (const kind of ["free", "custom"]) {
      const objects =
        kind === "free" ? this.freeDrawObjects : this.customObjects;
      for (const [id, obj] of objects)
        if (
          this.editable(obj) &&
          groups.has(obj.groupId) &&
          !this.selectedObjects[kind].includes(id)
        )
          this.selectedObjects[kind].push(id);
    }
  }

  groupSelection() {
    this.expandGroupSelection();
    const members = this.selectedMembers();
    if (this.selectedObjects.grid.length || members.length < 2) return false;
    const id = crypto.randomUUID();
    for (const { obj } of members) {
      obj.groupId = id;
      obj.groupRotation = 0;
    }
    this.saveHistory();
    this.render();
    window.hudInstance?.loadInstrumentSettings(this.activeInstrument);
    return true;
  }

  ungroupSelection() {
    this.expandGroupSelection();
    for (const { obj } of this.selectedMembers()) {
      delete obj.groupId;
      delete obj.groupRotation;
    }
    this.saveHistory();
    this.render();
    window.hudInstance?.loadInstrumentSettings(this.activeInstrument);
  }

  selectionGroup() {
    if (this.selectedObjects.grid.length) return null;
    const members = this.selectedMembers(),
      id = members[0]?.obj.groupId;
    if (members.length < 2 || !id || members.some((m) => m.obj.groupId !== id))
      return null;
    const x = members.reduce((n, m) => n + m.obj.x, 0) / members.length,
      y = members.reduce((n, m) => n + m.obj.y, 0) / members.length,
      rotation = members[0].obj.groupRotation || 0,
      c = Math.cos(rotation),
      s = Math.sin(rotation);
    let halfWidth = 0,
      halfHeight = 0;
    for (const { kind, obj } of members) {
      const points = corners(
        kind === "free" ? { ...obj, width: obj.size, height: obj.size } : obj,
      );
      for (const p of points) {
        const dx = p.x - x,
          dy = p.y - y;
        halfWidth = Math.max(halfWidth, Math.abs(dx * c + dy * s));
        halfHeight = Math.max(halfHeight, Math.abs(-dx * s + dy * c));
      }
    }
    return {
      type: "group",
      groupId: id,
      layerIndex: this.activeLayerIndex,
      x,
      y,
      rotation,
      width: Math.max(halfWidth * 2, 1),
      height: Math.max(halfHeight * 2, 1),
      members,
    };
  }

  setGroupRotation(degrees) {
    const frame = this.selectionGroup();
    if (!frame) return;
    this.applyGroupRotation(
      frame,
      frame.members.map((m) => ({ obj: m.obj, original: { ...m.obj } })),
      (degrees * Math.PI) / 180,
    );
  }

  applyGroupRotation(frame, members, angle) {
    const delta = angle - frame.rotation,
      c = Math.cos(delta),
      s = Math.sin(delta);
    for (const { obj, original } of members) {
      const dx = original.x - frame.x,
        dy = original.y - frame.y;
      obj.x = frame.x + dx * c - dy * s;
      obj.y = frame.y + dx * s + dy * c;
      obj.rotation = (original.rotation || 0) + delta;
      obj.groupRotation = angle;
    }
  }

  getSelectionCenter() {
    let count = 0; // Total number of selected objects
    let sumX = 0; // Total x-coordinate of selected objects
    let sumY = 0; // Total y-coordinate of selected objects

    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
    if (activeLayerObjects) {
      this.selectedObjects.grid.forEach((cellId) => {
        const cell = activeLayerObjects.get(cellId);
        if (cell) {
          sumX += (cell.x + 0.5) * this.currentCellSize;
          sumY += (cell.y + 0.5) * this.currentCellSize;
          count++;
        }
      });
    }
    this.selectedObjects.free.forEach((id) => {
      const obj = this.freeDrawObjects.get(id);
      if (obj) {
        sumX += obj.x;
        sumY += obj.y;
        count++;
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      const obj = this.customObjects.get(id);
      if (obj) {
        sumX += obj.x;
        sumY += obj.y;
        count++;
      }
    });

    if (count === 0) {
      // No selection or empty selection
      return null;
    }
    // Return average position a.k.a. center
    return { x: sumX / count, y: sumY / count };
  }

  /**
   * Rotates the currently selected objects around their collective center by a specified angle.
   *
   * @param {number} deltaDegrees - The angle in degrees by which to rotate the selected objects.
   * Positive values rotate clockwise, and negative values rotate counterclockwise.
   *
   * This method calculates the center of the selected objects and rotates each object around that center.
   * - Free draw objects and custom objects rotate in place and orbit the shared center.
   * - Custom objects are repositioned and their internal rotation property is updated.
   * - Grid cells are not rotated as rotating grid cells is generally not practical.
   *
   * After performing the rotation, the method re-renders the canvas, updates the HUD with the active instrument's settings,
   * and saves the current state to the history for undo/redo functionality.
   */
  rotateSelection(deltaDegrees) {
    const center = this.getSelectionCenter();
    if (!center) return; // Nothing to rotate

    const rad = (deltaDegrees * Math.PI) / 180;
    const cosRad = Math.cos(rad);
    const sinRad = Math.sin(rad);

    // Rotate Free Draw Objects around center
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) {
        let dx = obj.x - center.x;
        let dy = obj.y - center.y;
        obj.x = center.x + dx * cosRad - dy * sinRad;
        obj.y = center.y + dx * sinRad + dy * cosRad;
        obj.rotation = (obj.rotation || 0) + rad;
        if (obj.groupId) obj.groupRotation = (obj.groupRotation || 0) + rad;
      }
    });

    // Rotate Custom Objects around center and update their internal rotation
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        let dx = obj.x - center.x;
        let dy = obj.y - center.y;
        obj.x = center.x + dx * cosRad - dy * sinRad;
        obj.y = center.y + dx * sinRad + dy * cosRad;
        obj.rotation = (obj.rotation + rad) % (2 * Math.PI);
        if (obj.groupId) obj.groupRotation = (obj.groupRotation || 0) + rad;
      }
    });

    // Note: We don't rotate cell formations because rotating grid cell formations is generally not practical.

    this.render();
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
    this.saveHistory();
  }

  /**
   * Resizes the currently selected objects on the canvas by a given scale factor.
   *
   * @param {number} scaleFactor - The factor by which to scale the selected objects. Must be greater than 0.
   *
   * This method adjusts the size and position of selected objects relative to their
   * center point. It supports resizing for free draw objects and custom objects,
   * but excludes cell formations as resizing them is not applicable. After resizing,
   * the canvas is re-rendered, the HUD instrument settings are updated, and the
   * action is saved to the history for undo/redo functionality.
   *
   * Notes:
   * Free draw objects: Adjusts `x`, `y`, and `size` properties.
   * Custom objects: Adjusts `x`, `y`, `width`, and `height` properties.
   *
   * The method ensures that invalid scale factors or empty selections are handled correctly.
   */
  resizeSelection(scaleFactor) {
    if (scaleFactor <= 0) return; // Invalid scale factor
    const center = this.getSelectionCenter();
    if (!center) return; // Nothing to resize

    // Resize Free Draw Objects relative to center
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) {
        obj.x = center.x + (obj.x - center.x) * scaleFactor;
        obj.y = center.y + (obj.y - center.y) * scaleFactor;
        obj.size *= scaleFactor; // Scale the size property
      }
    });

    // Resize Custom Objects relative to center
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        obj.x = center.x + (obj.x - center.x) * scaleFactor;
        obj.y = center.y + (obj.y - center.y) * scaleFactor;
        obj.width *= scaleFactor;
        obj.height *= scaleFactor;
      }
    });

    // Note: We don't allow resizing cell formations because resizing them is generally useless.

    this.render();
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
    this.saveHistory();
  }

  /**
   * Deletes the currently selected objects from the canvas.
   * This method removes objects from the active layer, free draw objects,
   * and custom objects based on the current selection. It also clears the
   * selection state and updates the canvas if any changes were made.
   */
  deleteSelection() {
    if (!this.layers[this.activeLayerIndex]?.visible) return;
    let changed = false;
    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

    this.selectedObjects.grid.forEach((cellId) => {
      if (activeLayerObjects?.delete(cellId)) {
        changed = true;
      }
    });
    this.selectedObjects.free.forEach((id) => {
      if (this.freeDrawObjects.delete(id)) {
        changed = true;
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      if (this.customObjects.delete(id)) {
        changed = true;
      }
    });

    // Clear selection state.
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;

    if (changed) {
      this.render();
      window.hudInstance.loadInstrumentSettings(this.activeInstrument);
      this.saveHistory();
      window.hudInstance?.updateLayerList();
    }
  }

  /**
   * Copies the currently selected objects from the active layer and stores them in `this.copiedSelection`.
   * The copied objects are deep-copied to ensure immutability, and image references are adjusted to use
   * their source paths (`imageSrc`) if available.
   *
   * The copied selection is categorized into three types:
   * - `grid`: Objects from the grid layer.
   * - `free`: Free-drawn objects.
   * - `custom`: Custom objects.
   *
   * After copying, the method logs the copied selection and updates the HUD instrument settings.
   */
  copySelection() {
    this.expandGroupSelection();
    this.copiedSelection = { grid: [], free: [], custom: [] };
    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

    this.selectedObjects.grid.forEach((cellId) => {
      if (activeLayerObjects?.has(cellId)) {
        // Deep copy cell data, ensuring image src is used if present
        let originalCell = activeLayerObjects.get(cellId);
        let cellCopy = { ...originalCell };
        if (cellCopy.imageSrc) cellCopy.image = cellCopy.imageSrc;
        else delete cellCopy.image;
        this.copiedSelection.grid.push(cellCopy);
      }
    });
    this.selectedObjects.free.forEach((id) => {
      if (this.freeDrawObjects.has(id)) {
        let originalObj = this.freeDrawObjects.get(id);
        let objCopy = { ...originalObj };
        if (objCopy.image?.src) objCopy.image = objCopy.image.src;
        else delete objCopy.image;
        this.copiedSelection.free.push(objCopy);
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      if (this.customObjects.has(id)) {
        let originalObj = this.customObjects.get(id);
        let objCopy = { ...originalObj };
        if (objCopy.imageSrc) objCopy.image = objCopy.imageSrc;
        else delete objCopy.image;
        this.copiedSelection.custom.push(objCopy);
      }
    });
    console.log("Copied:", this.copiedSelection); // we might replace this with a toast
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
  }

  /**
   * Pastes the copied selection onto the canvas at the current mouse position.
   * Handles pasting for grid cells, free draw objects, and custom objects.
   * Updates the canvas rendering, HUD instrument settings, and saves the action to history.
   *
   * Notes:
   * For grid cells, calculates the offset based on the mouse position and pastes them relative to their original positions.
   * For free draw and custom objects, calculates the offset based on the mouse position and pastes them relative to their original positions.
   * Ensures that image objects are properly loaded and rendered.
   */
  pasteSelection() {
    if (!this.copiedSelection || !this.layers[this.activeLayerIndex]?.visible)
      return;

    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
    if (!activeLayerObjects) return; // Cannot paste grid cells without active layer

    const pastedSelection = { grid: [], free: [], custom: [] };
    const mouseWorldPos = { x: this.mouseX, y: this.mouseY };

    // Calculate offset for grid cells
    const gridOffsetX = Math.floor(mouseWorldPos.x / this.currentCellSize);
    const gridOffsetY = Math.floor(mouseWorldPos.y / this.currentCellSize);

    // Calculate offset for free draw and custom objects
    const freeCustomOffsetX = mouseWorldPos.x;
    const freeCustomOffsetY = mouseWorldPos.y;

    const copiedObjects = [
        ...this.copiedSelection.free,
        ...this.copiedSelection.custom,
      ],
      minObjectX = Math.min(...copiedObjects.map((o) => o.x)),
      minObjectY = Math.min(...copiedObjects.map((o) => o.y)),
      pastedGroups = new Map();
    const remapGroup = (obj) => {
      if (!obj.groupId) return;
      if (!pastedGroups.has(obj.groupId))
        pastedGroups.set(obj.groupId, crypto.randomUUID());
      obj.groupId = pastedGroups.get(obj.groupId);
    };
    // Paste Grid Cells
    this.copiedSelection.grid.forEach((cellData) => {
      let newCell = { ...cellData };
      newCell.x =
        gridOffsetX +
        (newCell.x - Math.min(...this.copiedSelection.grid.map((c) => c.x)));
      newCell.y =
        gridOffsetY +
        (newCell.y - Math.min(...this.copiedSelection.grid.map((c) => c.y)));
      const newCellId = this._cellId(newCell.x, newCell.y);

      if (newCell.type === "image" && typeof newCell.image === "string") {
        let img = new Image();
        img.src = newCell.image;
        newCell.imageSrc = newCell.image;
        newCell.image = img;
        img.onload = () => this.render();
      }
      activeLayerObjects.set(newCellId, newCell);
      pastedSelection.grid.push(newCellId);
    });

    // Paste Free Draw Objects
    this.copiedSelection.free.forEach((objData) => {
      let newObj = { ...objData, layerIndex: this.activeLayerIndex };
      remapGroup(newObj);
      newObj.x = freeCustomOffsetX + (newObj.x - minObjectX);
      newObj.y = freeCustomOffsetY + (newObj.y - minObjectY);
      const newId =
        Date.now().toString() + Math.random().toString(36).substring(2);

      if (newObj.image && typeof newObj.image === "string") {
        let img = new Image();
        img.src = newObj.image;
        newObj.image = img;
        img.onload = () => this.render();
      }
      this.freeDrawObjects.set(newId, newObj);
      pastedSelection.free.push(newId);
    });

    // Paste Custom Objects
    this.copiedSelection.custom.forEach((objData) => {
      let newObj = { ...objData, layerIndex: this.activeLayerIndex };
      remapGroup(newObj);
      newObj.x = freeCustomOffsetX + (newObj.x - minObjectX);
      newObj.y = freeCustomOffsetY + (newObj.y - minObjectY);
      const newId =
        Date.now().toString() + Math.random().toString(36).substring(2);

      if (newObj.image && typeof newObj.image === "string") {
        let img = new Image();
        img.src = newObj.image;
        newObj.imageSrc = newObj.image;
        newObj.image = img;
        img.onload = () => this.render();
      }
      this.customObjects.set(newId, newObj);
      pastedSelection.custom.push(newId);
    });

    this.selectedObjects = pastedSelection;
    this.render();
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
    this.saveHistory();
  }

  /**
   * Requests a re-render of the canvas.
   * This method uses `requestAnimationFrame` for smoother rendering.
   */
  render() {
    if (this.renderPending) return;
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.renderPending = false;
      this._doRender();
    });
  }

  /**
   * Renders the canvas by clearing the current content, applying transformations,
   * and drawing various elements such as grid cells, layers, shadows, borders,
   * free-draw objects, custom objects, and selection highlights.
   *
   * The rendering process is optimized by calculating visible world bounds
   * and performing culling checks to avoid drawing off-screen elements.
   */
  _doRender() {
    const ctx = this.ctx;
    document.getElementById("draftActions").hidden = !(this.activeInstrument === "polygon" && this.polygonDraft.length);
    document.getElementById("finishPolygon").disabled = this.polygonDraft.length < 3;
    document.getElementById("finishExportArea").hidden = !this.exportOverlay;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Calculate visible world bounds for more optimized rendering
    const viewBounds = {
      minX: -this.offsetX / this.scale,
      minY: -this.offsetY / this.scale,
      maxX: (this.canvas.width - this.offsetX) / this.scale,
      maxY: (this.canvas.height - this.offsetY) / this.scale,
    };

    drawScene(this, ctx, viewBounds, { editor: true });
    drawPolygonDraft(this);
    drawExportOverlay(this, viewBounds);
    // Light markers are drawn within their own layer by the editor scene pass.
    // Draw Selection
    if (this.isSelecting && this.selectionStart && this.selectionEnd) {
      this.drawSelectionRect();
    }
    this.drawSelectionHighlights(); // Highlights based on global selection state
    if (
      this.activeInstrument === "freeDraw" &&
      this.mouseOverCanvas &&
      (this.brushSizeModifier ||
        performance.now() < (this.brushPreviewUntil || 0))
    ) {
      const radius = (this.freeDrawSettings.size * this.currentCellSize) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 / this.scale;
      ctx.stroke();
      ctx.strokeStyle = "#254e86";
      ctx.lineWidth = 1.5 / this.scale;
      ctx.setLineDash([5 / this.scale, 3 / this.scale]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Draws a grid on the canvas, filling empty cells with a specified appearance
   * and drawing borders around them. The grid is drawn based on the provided
   * view bounds and cell size.
   *
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context to draw on.
   * @param {number} cellSize - The size of each grid cell in pixels.
   * @param {Object} viewBounds - The visible bounds of the canvas.
   */
  drawGrid(ctx, cellSize, viewBounds, appearance = this.emptyCellSettings) {
    const startX = Math.floor(viewBounds.minX / cellSize) - 1;
    const startY = Math.floor(viewBounds.minY / cellSize) - 1;
    const endX = Math.ceil(viewBounds.maxX / cellSize) + 1;
    const endY = Math.ceil(viewBounds.maxY / cellSize) + 1;

    ctx.lineWidth = this.currentCellSize / constants.baseCellSize; // Ensure minimum visibility
    const emptyFill = appearance.fillColor;
    const emptyBorder = appearance.borderColor;
    const emptyPattern = appearance.pattern;

    ctx.fillStyle = emptyFill;
    ctx.strokeStyle = emptyBorder;

    for (let i = startX; i < endX; i++) {
      for (let j = startY; j < endY; j++) {
        const cellId = this._cellId(i, j);
        {
          const x = i * cellSize;
          const y = j * cellSize;
          // Draw empty cell appearance
          ctx.fillRect(x, y, cellSize, cellSize);
          if (
            emptyPattern &&
            emptyPattern.complete &&
            emptyPattern.naturalWidth > 0
          ) {
            try {
              ctx.drawImage(emptyPattern, x, y, cellSize, cellSize);
            } catch (e) {
              console.error("Error drawing empty cell pattern:", e);
              this.emptyCellSettings.pattern = null; // Clear broken pattern
              this.emptyCellSettings.patternSrc = null;
            }
          }
          // Draw the border
          if (appearance.showGrid !== false) ctx.strokeRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  /**
   * Draws shadows for cells for a given layer onto a canvas context. It does so
   * by creating an offscreen canvas to handle the shadow rendering, which is then
   * drawn onto the main canvas. It currently supports shadows of 1-cell size or less.
   *
   * @param {CanvasRenderingContext2D} ctx - The main canvas rendering context where shadows will be drawn.
   * @param {number} cellSize - The size of each grid cell in world units.
   * @param {Object} viewBounds - The visible bounds of the canvas in world coordinates.
   * @param {number} viewBounds.minX - The minimum X coordinate of the visible area.
   * @param {number} viewBounds.minY - The minimum Y coordinate of the visible area.
   * @param {number} viewBounds.maxX - The maximum X coordinate of the visible area.
   * @param {number} viewBounds.maxY - The maximum Y coordinate of the visible area.
   * @param {Map<string, Object>} layerObjects - A map of objects in the layer, keyed by their unique cell IDs.
   * @param {Object} shadowOptions - Configuration options for the shadows.
   * @param {boolean} shadowOptions.enabled - Whether shadows are enabled for this layer.
   * @param {number} shadowOptions.angle - The angle of the shadow in degrees (0 = right, 90 = down).
   * @param {number} shadowOptions.offset - The shadow offset as a multiple of the cell size.
   * @param {string} shadowOptions.color - The shadow color in #RRGGBBAA format (e.g., "#00000080").
   */
  drawGridShadows(ctx, cellSize, viewBounds, layerObjects, shadowOptions) {
    if (!shadowOptions?.enabled || !layerObjects.size) return;
    const casters = new Map(
      [...layerObjects].filter(([, cell]) => cell.castsShadow !== false),
    );
    if (!casters.size) return;
    const angle = (shadowOptions.angle * Math.PI) / 180,
      dx = Math.cos(angle) * shadowOptions.offset * cellSize,
      dy = Math.sin(angle) * shadowOptions.offset * cellSize;
    const buffer = document.createElement("canvas");
    buffer.width = ctx.canvas.width;
    buffer.height = ctx.canvas.height;
    const shadow = buffer.getContext("2d");
    shadow.setTransform(ctx.getTransform());
    shadow.fillStyle = shadowOptions.color;
    shadow.beginPath();
    for (const cell of casters.values()) {
      const x = cell.x * cellSize,
        y = cell.y * cellSize;
      shadow.rect(x + dx, y + dy, cellSize, cellSize);
    }
    for (const { a, b } of gridEdges(casters, cellSize)) {
      const points =
        (b.x - a.x) * dy - (b.y - a.y) * dx >= 0
          ? [a, b, { x: b.x + dx, y: b.y + dy }, { x: a.x + dx, y: a.y + dy }]
          : [b, a, { x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }];
      points.forEach((p, i) =>
        i ? shadow.lineTo(p.x, p.y) : shadow.moveTo(p.x, p.y),
      );
      shadow.closePath();
    }
    shadow.fill();
    if (shadowOptions.softness) {
      const blurred = document.createElement("canvas");
      blurred.width = buffer.width;
      blurred.height = buffer.height;
      const blur = blurred.getContext("2d");
      const transform = shadow.getTransform();
      blur.filter = `blur(${shadowOptions.softness * cellSize * Math.hypot(transform.a, transform.b)}px)`;
      blur.drawImage(buffer, 0, 0);
      shadow.save();
      shadow.resetTransform();
      shadow.clearRect(0, 0, buffer.width, buffer.height);
      shadow.drawImage(blurred, 0, 0);
      shadow.restore();
    }
    shadow.globalCompositeOperation = "destination-out";
    shadow.fillStyle = "#000";
    shadow.beginPath();
    for (const cell of layerObjects.values())
      if ((cell.receivesGlobalShadow ?? cell.receivesShadow) !== true)
        shadow.rect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
    shadow.fill();
    ctx.save();
    ctx.resetTransform();
    ctx.drawImage(buffer, 0, 0);
    ctx.restore();
  }

  /**
   * Draws a single grid cell on the canvas.
   *
   * @param {Object} cell - The cell object containing properties for rendering.
   * @param {number} cell.x - The x-coordinate of the cell in grid units.
   * @param {number} cell.y - The y-coordinate of the cell in grid units.
   * @param {string} cell.type - The type of the cell, either "color" or "image".
   * @param {string} [cell.fillColor] - The fill color of the cell (used if type is "color").
   * @param {HTMLImageElement} [cell.image] - The image to draw in the cell (used if type is "image").
   * @param {string} [cell.imageSrc] - The source URL of the image (used for error logging).
   * @param {string} cell.borderColor - The color of the cell's border.
   */
  drawLightMarker(obj) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.strokeStyle = "#254e86";
    ctx.lineWidth = 2 / this.scale;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 7 / this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawGridCell(cell, { showGrid = true } = {}) {
    const ctx = this.ctx;
    const x = cell.x * this.currentCellSize;
    const y = cell.y * this.currentCellSize;
    const size = this.currentCellSize;
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, cell.opacity ?? 1));

    if (cell.type === "color") {
      ctx.fillStyle = cell.fillColor;
      ctx.fillRect(x, y, size, size);
    } else if (
      cell.type === "image" &&
      cell.image &&
      cell.image.complete &&
      cell.image.naturalWidth > 0
    ) {
      try {
        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        ctx.rotate(cell.textureRotation || 0);
        ctx.scale(cell.textureMirrorX ? -1 : 1, cell.textureMirrorY ? -1 : 1);
        if (
          cell.hueShift ||
          (cell.saturation ?? 1) !== 1 ||
          (cell.brightness ?? 1) !== 1 ||
          (cell.contrast ?? 1) !== 1
        )
          ctx.filter = `hue-rotate(${cell.hueShift || 0}deg) saturate(${cell.saturation ?? 1}) brightness(${cell.brightness ?? 1}) contrast(${cell.contrast ?? 1})`;
        ctx.drawImage(cell.image, -size / 2, -size / 2, size, size);
        ctx.restore();
      } catch (e) {
        console.error("Error drawing grid cell image:", e, cell.imageSrc);
        // Draw fallback color if image fails
        ctx.fillStyle = constants.errorColor || "#ff00ff"; // Magenta fallback
        ctx.fillRect(x, y, size, size);
      }
    }
    // Draw border for the cell itself
    ctx.strokeStyle = cell.borderColor;
    ctx.lineWidth = this.currentCellSize / constants.baseCellSize; // Use same line width as grid
    if (showGrid && (cell.outlineEnabled ?? cell.type !== "image"))
      ctx.strokeRect(x, y, size, size);
    ctx.restore();
  }

  /**
   * Draws a free-draw object on the canvas. The object can either be an image
   * or a default shape (circle) if the image is not available or fails to load.
   *
   * @param {Object} obj - The object to be drawn.
   * @param {HTMLImageElement} [obj.image] - The image to be drawn, if available.
   * @param {number} obj.x - The x-coordinate of the object's center.
   * @param {number} obj.y - The y-coordinate of the object's center.
   * @param {number} obj.size - The size (diameter) of the object.
   * @param {string} [obj.fillColor] - The fill color for the default shape.
   * @param {string} [obj.strokeColor] - The stroke color for the default shape.
   */
  drawFreeDrawObject(obj) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(obj.x, obj.y);
    ctx.rotate(obj.rotation || 0);
    ctx.scale(obj.mirrorX ? -1 : 1, obj.mirrorY ? -1 : 1);
    ctx.lineWidth = this.currentCellSize / constants.baseCellSize; // Consistent line width

    if (obj.image && obj.image.complete && obj.image.naturalWidth > 0) {
      try {
        // Draw image centered at obj.x, obj.y with obj.size
        ctx.drawImage(
          obj.image,
          -obj.size / 2,
          -obj.size / 2,
          obj.size,
          obj.size,
        );
      } catch (e) {
        console.error("Error drawing freeDraw image:", e);
        // Fallback shape
        ctx.fillStyle = constants.errorColor || "#ff00ff";
        ctx.beginPath();
        ctx.arc(0, 0, obj.size / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else {
      // Draw default circle shape
      ctx.beginPath();
      ctx.arc(0, 0, obj.size / 2, 0, 2 * Math.PI);
      ctx.fillStyle = obj.fillColor;
      ctx.fill();
      ctx.strokeStyle = obj.strokeColor;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws a custom object on the canvas, including handling rotation, translation,
   * and fallback rendering if the object's image is not available or fails to load.
   *
   * @param {Object} obj - The object to be drawn.
   * @param {number} obj.x - The x-coordinate of the object's center.
   * @param {number} obj.y - The y-coordinate of the object's center.
   * @param {number} obj.rotation - The rotation of the object in radians.
   * @param {number} obj.width - The width of the object.
   * @param {number} obj.height - The height of the object.
   * @param {HTMLImageElement} [obj.image] - The image to be drawn for the object.
   * @param {string} [obj.imageSrc] - The source URL of the object's image (used for error logging).
   */
  drawCustomObject(obj) {
    if (obj.type === "polygon") return drawPolygon(this, obj);
    const ctx = this.ctx;
    ctx.save();
    // Translate to the object's center and rotate
    ctx.translate(obj.x, obj.y);
    ctx.rotate(obj.rotation); // Rotation is in radians
    ctx.scale(obj.mirrorX ? -1 : 1, obj.mirrorY ? -1 : 1);

    if (obj.image && obj.image.complete && obj.image.naturalWidth > 0) {
      try {
        // Draw image centered around the origin (since we translated)
        ctx.drawImage(
          obj.image,
          -obj.width / 2,
          -obj.height / 2,
          obj.width,
          obj.height,
        );
      } catch (e) {
        console.error("Error drawing custom object image:", e, obj.imageSrc);
        // Fallback rectangle
        ctx.fillStyle = constants.errorColor || "#ff00ff";
        ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
      }
    } else {
      // Draw a placeholder if no image or image failed to load
      ctx.fillStyle = constants.attentionColor; // Use attention color for placeholder
      ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1 / this.scale;
      ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
    }
    ctx.restore(); // Restore translation and rotation
  }

  /**
   * Draws a dashed rectangular selection area on the canvas.
   * The rectangle is defined by the `selectionStart` and `selectionEnd` points.
   * If either of these points is not defined, the function exits early.
   *
   * The rectangle's position, dimensions, and style are calculated based on
   * the current canvas scale and constants for styling.
   */
  drawSelectionRect() {
    const ctx = this.ctx;
    const start = this.selectionStart;
    const end = this.selectionEnd;
    if (!start || !end) return;

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    ctx.save();
    ctx.strokeStyle = constants.selectionRectColor;
    ctx.lineWidth = 1 / this.scale; // Thin line
    ctx.setLineDash([4 / this.scale, 2 / this.scale]); // Dashed line scaled
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  /**
   * Draws visual highlights around selected objects on the canvas.
   * Highlights include grid cells, free draw objects, and custom objects.
   * Each type of object is highlighted differently:
   * - Grid cells are highlighted with a rectangle.
   * - Free draw objects are highlighted with a circle.
   * - Custom objects are highlighted with a rotated bounding box.
   *
   * The method uses the current canvas context (`this.ctx`) and applies
   * transformations such as scaling and rotation to ensure accurate rendering.
   */
  drawSelectionHighlights() {
    const ctx = this.ctx;
    if (
      this.selectedObjects.grid.length === 0 &&
      this.selectedObjects.free.length === 0 &&
      this.selectedObjects.custom.length === 0
    ) {
      return; // Nothing selected
    }

    ctx.save();
    ctx.strokeStyle = constants.selectionHighlightColor; // Use a distinct color
    ctx.lineWidth = 2 / this.scale; // Make highlight slightly thicker
    ctx.setLineDash([]); // Solid line

    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

    if (!this.layers[this.activeLayerIndex]?.visible) {
      ctx.restore();
      return;
    }
    // Highlight Grid Cells
    if (activeLayerObjects) {
      this.selectedObjects.grid.forEach((cellId) => {
        const cell = activeLayerObjects.get(cellId);
        if (cell) {
          const x = cell.x * this.currentCellSize;
          const y = cell.y * this.currentCellSize;
          ctx.strokeRect(x, y, this.currentCellSize, this.currentCellSize);
        }
      });
    }

    const group = this.selectionGroup();
    if (group) {
      ctx.save();
      ctx.translate(group.x, group.y);
      ctx.rotate(group.rotation);
      ctx.strokeRect(
        -group.width / 2,
        -group.height / 2,
        group.width,
        group.height,
      );
      ctx.restore();
      this.drawHandles(group);
      ctx.restore();
      return;
    }
    // Highlight Free Draw Objects
    this.selectedObjects.free.forEach((id) => {
      const obj = this.freeDrawObjects.get(id);
      if (obj) {
        ctx.beginPath();
        // Draw circle slightly larger than the object
        ctx.arc(obj.x, obj.y, obj.size / 2 + ctx.lineWidth / 2, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    // Highlight Custom Objects (draw rotated bounding box)
    this.selectedObjects.custom.forEach((id) => {
      const obj = this.customObjects.get(id);
      if (obj) {
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);
        ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
        ctx.restore();
        this.drawHandles(obj);
      }
    });

    ctx.restore();
  }

  /**
   * Calculates the logical bounding box of all objects on the canvas.
   * The bounding box is determined based on grid cells, free draw objects,
   * and custom objects, with their coordinates converted to logical units.
   * If no content is present, a default bounding box of 10x10 cells is returned.
   *
   * @returns {Object} An object representing the bounding box with the following properties:
   *   - {number} minX - The minimum X coordinate of the bounding box.
   *   - {number} minY - The minimum Y coordinate of the bounding box.
   *   - {number} maxX - The maximum X coordinate of the bounding box.
   *   - {number} maxY - The maximum Y coordinate of the bounding box.
   *   - {number} width - The width of the bounding box (maxX - minX).
   *   - {number} height - The height of the bounding box (maxY - minY).
   */
  finishPolygon() { return finishPolygon(this); }

  getExportBounds(options = {}) {
    const region = this.exportSettings.region;
    return region ? { ...region, width: region.maxX-region.minX, height: region.maxY-region.minY } : this.getLogicalBoundingBox(options);
  }

  getLogicalBoundingBox({
    includeLights = false,
    includeObjects = true,
    padding = this.exportSettings?.padding ?? 1,
  } = {}) {
    const size = this.currentCellSize,
      points = [];
    this.layers.forEach((layer) => {
      const global = { ...ambientDefaults, ...layer.globalLight };
      if (!layer.visible) return;
      for (const cell of layer.objects.values()) {
        points.push(
          { x: cell.x * size, y: cell.y * size },
          { x: (cell.x + 1) * size, y: (cell.y + 1) * size },
        );
        if (cell.castsShadow === false) continue;
        const shadows = [layer.gridShadowOptions];
        if (global.globalEnabled)
          shadows.push({
            enabled: true,
            angle: global.angle,
            offset: global.shadowLength,
            softness: global.shadowSoftness,
          });
        for (const shadow of shadows)
          if (shadow?.enabled) {
            const angle = (shadow.angle * Math.PI) / 180,
              dx = Math.cos(angle) * shadow.offset * size,
              dy = Math.sin(angle) * shadow.offset * size,
              blur = (shadow.softness || 0) * size * 3;
            points.push(
              { x: cell.x * size + dx - blur, y: cell.y * size + dy - blur },
              {
                x: (cell.x + 1) * size + dx + blur,
                y: (cell.y + 1) * size + dy + blur,
              },
            );
          }
      }
    });
    for (const obj of this.freeDrawObjects.values())
      if (includeObjects && this.layers[obj.layerIndex]?.visible)
        points.push(
          ...corners({
            ...obj,
            width: obj.size,
            height: obj.size,
            rotation: obj.rotation || 0,
          }),
        );
    for (const obj of this.customObjects.values())
      if (this.layers[obj.layerIndex]?.visible) {
        if (obj.type === "light" && includeLights)
          points.push(
            { x: obj.x - obj.radius * size, y: obj.y - obj.radius * size },
            { x: obj.x + obj.radius * size, y: obj.y + obj.radius * size },
          );
        else if (obj.type !== "light" && (includeObjects || obj.type === "polygon")) {
          const shape = obj.type === "polygon" ? polygonPoints(obj) : corners(obj);
          points.push(...shape);
          if (obj.type === "polygon" && obj.blocksLight !== false) {
            const layer = this.layers[obj.layerIndex], global = { ...ambientDefaults, ...layer.globalLight };
            const shadows = [layer.gridShadowOptions];
            if (global.globalEnabled) shadows.push({enabled:true,angle:global.angle,offset:global.shadowLength,softness:global.shadowSoftness});
            for (const shadow of shadows) if (shadow?.enabled) {
              const angle = shadow.angle*Math.PI/180, blur = (shadow.softness || 0)*size*3;
              for (const p of shape) {
                const x = p.x+Math.cos(angle)*shadow.offset*size, y = p.y+Math.sin(angle)*shadow.offset*size;
                points.push({x:x-blur,y:y-blur},{x:x+blur,y:y+blur});
              }
            }
          }
        }
      }
    if (!points.length)
      return { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x / size);
      minY = Math.min(minY, p.y / size);
      maxX = Math.max(maxX, p.x / size);
      maxY = Math.max(maxY, p.y / size);
    }
    padding = Math.max(
      Math.max(0, Math.min(10, Number(padding) || 0)),
      ...this.layers
        .filter((l) => l.visible)
        .map((l) =>
          l.gridBorderOptions?.enabled ? l.gridBorderOptions.width : 0,
        ),
    );
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  /** Draw the same scene as the editor in logical cell coordinates, without editor helpers. */
  drawAll(ctx, exportScale, options = {}) {
    const bbox = options.bounds || this.getLogicalBoundingBox(options),
      size = this.currentCellSize;
    ctx.save();
    ctx.scale(1 / size, 1 / size);
    drawScene(
      this,
      ctx,
      {
        minX: bbox.minX * size,
        minY: bbox.minY * size,
        maxX: bbox.maxX * size,
        maxY: bbox.maxY * size,
      },
      { whiteBackground: options.colorMode && options.colorMode !== "color", showGrid: options.showGrid ?? true, lighting: options.lighting ?? true },
    );
    ctx.restore();
  }

  /**
   * Generates and returns the current map data state without modifying the history.
   *
   * @returns {Object} The map data state object containing:
   * - `layers` {Array<Object>} - An array of layer objects.
   * - `freeDrawObjects` {Array<Array>} - An array of key-value pairs representing free-draw objects.
   * - `customObjects` {Array<Array>} - An array of key-value pairs representing custom objects.
   * - `settings` {Object} - The settings for the map.
   */
  getMapData() {
    // Use the logic from saveHistory's state creation, but don't modify history
    const state = {
      layers: this.layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible !== undefined ? layer.visible : true,
        globalLight: { ...globalLightDefaults, ...layer.globalLight },
        gridBorderOptions: {
          ...borderDefaults,
          ...layer.gridBorderOptions,
          image: layer.gridBorderOptions?.imageSrc || null,
          cornerImage: layer.gridBorderOptions?.cornerImageSrc || null,
        },
        gridShadowOptions: layer.gridShadowOptions
          ? { ...layer.gridShadowOptions }
          : { ...constants.defaultGridShadowOptions },
        objects: Array.from(layer.objects.entries()).map(([key, cell]) => {
          let cellCopy = { ...cell };
          if (cellCopy.imageSrc) cellCopy.image = cellCopy.imageSrc;
          else delete cellCopy.image;
          return [key, cellCopy];
        }),
      })),
      freeDrawObjects: Array.from(this.freeDrawObjects.entries()).map(
        ([id, obj]) => {
          let copyObj = { ...obj };
          if (copyObj.image?.src) copyObj.image = copyObj.image.src;
          else delete copyObj.image;
          return [id, copyObj];
        },
      ),
      customObjects: Array.from(this.customObjects.entries()).map(
        ([id, obj]) => {
          let copyObj = { ...obj };
          if (copyObj.imageSrc) copyObj.image = copyObj.imageSrc;
          else delete copyObj.image;
          return [id, copyObj];
        },
      ),
      settings: {
        polygonSettings: { ...this.polygonSettings, image: null },
        exportSettings: { ...this.exportSettings },
        ambientLight: { ...this.ambientLight },
        lightSettings: { ...this.lightSettings },
        currentCellSize: this.currentCellSize,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
        activeLayerIndex: this.activeLayerIndex,
        emptyCellSettings: {
          ...this.emptyCellSettings,
          pattern: this.emptyCellSettings.patternSrc,
        },
        gridImageList: this.gridImageList,
        gridDrawSettings: {
          ...this.gridDrawSettings,
          image: this.gridDrawSettings.imageSrc,
        },
        freeDrawSettings: {
          ...this.freeDrawSettings,
          image:
            this.freeDrawSettings.sourceImageSrc ||
            this.freeDrawSettings.image?.src ||
            null,
        },
        customObjectImageSrc: this.customObjectImageSrc,
      },
    };
    return state;
  }

  /**
   * Loads map data into the application, initializes the state, and updates the HUD.
   *
   * @param {Object} data - The map data to be loaded.
   */
  loadMapData(data) {
    this.loadStateData(data); // Use common loading logic
    this.history = []; // Reset history
    this.historyIndex = -1; // The first action will have index of 0
    this.saveHistory(); // Save loaded state as initial history
    this.render();
    // Update HUD completely
    window.hudInstance?.refresh();
  }

  /**
   * Sets the active layer by its index and updates the application state accordingly.
   *
   * @param {number} index - The index of the layer to set as active. Must be within the range of existing layers.
   *
   * Updates the `activeLayerIndex` to the specified index.
   * Clears the current selection (`selectedObjects`, `selectionStart`, `selectionEnd`) when changing layers.
   * Triggers a re-render of the canvas.
   * Updates the HUD appearance controls for the new active layer if a HUD instance is available.
   */
  setActiveLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      if (this.activeLayerIndex !== index) {
        this.activeLayerIndex = index;
        this.polygonDraft = [];
        // Clear selection when changing layers. Optional, but often good UX.
        this.selectedObjects = { grid: [], free: [], custom: [] };
        this.selectionStart = null;
        this.selectionEnd = null;
        this.render();
        // Update HUD appearance controls for the new active layer
        if (window.hudInstance) {
          window.hudInstance.updateAppearanceControls();
        }
      }
    }
  }

  /**
   * Adds a new layer to the canvas, sets it as the active layer, and updates the UI.
   * The new layer is initialized with default properties, including a unique name,
   * an empty set of objects, visibility set to true, and default grid shadow options.
   *
   * Updates the HUD appearance controls if `hudInstance` is available.
   * Saves the current state to the history stack.
   * Triggers a re-render of the canvas.
   */
  addLayer() {
    const newLayer = {
      name: "Layer " + (this.layers.length + 1),
      objects: new Map(),
      visible: true,
      gridShadowOptions: { ...constants.defaultGridShadowOptions },
      globalLight: { ...globalLightDefaults },
      gridBorderOptions: { ...borderDefaults },
    };
    this.layers.push(newLayer);
    this.setActiveLayer(this.layers.length - 1);
    this.render();
    // Update HUD appearance controls for the new active layer
    if (window.hudInstance) {
      window.hudInstance.updateAppearanceControls();
    }
    this.saveHistory(); // Adding a layer is a state change
  }

  /**
   * Removes the currently active layer from the layers array if there is more than one layer.
   * Adjusts the active layer index to ensure it remains valid after the removal.
   * Triggers a re-render of the canvas and saves the current state to history.
   * Displays an alert if attempting to remove the last remaining layer.
   */
  removeActiveLayer() {
    if (this.layers.length > 1) {
      for (const objects of [this.freeDrawObjects, this.customObjects])
        for (const [id, obj] of objects) {
          if (obj.layerIndex === this.activeLayerIndex) objects.delete(id);
          else if (obj.layerIndex > this.activeLayerIndex) obj.layerIndex--;
        }
      this.selectedObjects = { grid: [], free: [], custom: [] };
      this.layers.splice(this.activeLayerIndex, 1);
      // Adjust active index if the last layer was removed or index is now out of bounds
      this.activeLayerIndex = Math.min(
        Math.max(0, this.activeLayerIndex - 1),
        this.layers.length - 1,
      );
      this.render();
      this.saveHistory(); // Removing a layer is a state change
    } else {
      alert("Cannot remove the last layer.");
    }
  }

  /**
   * Sets the active instrument for the canvas and updates the cursor style accordingly.
   *
   * @param {string} instrument - The name of the instrument to activate.
   * Possible values include:
   * - 'gridDraw': Sets the cursor to a crosshair.
   * - 'freeDraw': Sets the cursor to a crosshair.
   * - 'addObject': Sets the cursor to a crosshair.
   * - 'erase': Sets the cursor to a cell.
   * - 'select': Sets the cursor to default.
   * - Any other value defaults the cursor to default.
   */
  editable(obj) {
    return (
      obj.layerIndex === this.activeLayerIndex &&
      this.layers[this.activeLayerIndex]?.visible
    );
  }

  handlePoints(obj) {
    const points = [];
    if (obj.type === "light") return points;
    const c = Math.cos(obj.rotation || 0),
      s = Math.sin(obj.rotation || 0);
    for (const [hx, hy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -2],
    ]) {
      const x = (hx * obj.width) / 2,
        y =
          hy === -2 ? -obj.height / 2 - 28 / this.scale : (hy * obj.height) / 2;
      points.push({
        x: obj.x + x * c - y * s,
        y: obj.y + x * s + y * c,
        hx,
        hy,
        kind: hy === -2 ? "rotate" : "resize",
      });
    }
    return obj.type === "group"
      ? points.filter((p) => p.kind === "rotate")
      : points;
  }

  hitHandle(p) {
    const tolerance = (matchMedia("(pointer: coarse)").matches ? 22 : 9) / this.scale;
    const group = this.selectionGroup();
    if (group) {
      const h = this.handlePoints(group)[0];
      return Math.hypot(p.x - h.x, p.y - h.y) < tolerance
        ? { ...h, obj: group }
        : null;
    }
    for (const id of this.selectedObjects.custom) {
      const obj = this.customObjects.get(id);
      if (!obj || !this.editable(obj)) continue;
      for (const h of this.handlePoints(obj))
        if (Math.hypot(p.x - h.x, p.y - h.y) < tolerance)
          return { ...h, obj };
    }
    return null;
  }

  drawHandles(obj) {
    if (!this.editable(obj)) return;
    const ctx = this.ctx,
      points = this.handlePoints(obj),
      r = 4 / this.scale;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#3976c6";
    ctx.lineWidth = 1.5 / this.scale;
    if (obj.type === "group") {
      const top = {
        x: obj.x + (Math.sin(obj.rotation) * obj.height) / 2,
        y: obj.y - (Math.cos(obj.rotation) * obj.height) / 2,
      };
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(points[0].x, points[0].y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(obj.x - r * 2, obj.y);
      ctx.lineTo(obj.x + r * 2, obj.y);
      ctx.moveTo(obj.x, obj.y - r * 2);
      ctx.lineTo(obj.x, obj.y + r * 2);
      ctx.stroke();
    } else if (points.length) {
      ctx.beginPath();
      ctx.moveTo(points[1].x, points[1].y);
      ctx.lineTo(points[8].x, points[8].y);
      ctx.stroke();
    }
    for (const p of points) {
      ctx.beginPath();
      if (p.kind === "rotate") ctx.arc(p.x, p.y, r * 1.3, 0, Math.PI * 2);
      else ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  setSelectionCastsShadow(value) {
    const layer = this.layers[this.activeLayerIndex];
    if (!layer?.visible) return;
    for (const id of this.selectedObjects.grid) {
      const cell = layer.objects.get(id);
      if (cell) cell.castsShadow = value;
    }
    this.saveHistory();
    this.render();
  }

  setObjectDimension(obj, dimension, value) {
    const ratio = obj.width / obj.height;
    obj[dimension] = value;
    if (obj.lockAspectRatio) {
      if (dimension === "width") obj.height = value / ratio;
      else obj.width = value * ratio;
    }
  }

  updateTransform(p, keepAspect) {
    const { obj, original: o, hx, hy, kind } = this.transformDrag;
    if (obj.type === "group") {
      let delta =
        Math.atan2(p.y - o.y, p.x - o.x) - this.transformDrag.startAngle;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      let angle = o.rotation + delta;
      if (keepAspect)
        angle = (Math.round(angle / (Math.PI / 12)) * Math.PI) / 12;
      this.applyGroupRotation(o, this.transformDrag.members, angle);
      return;
    }
    if (kind === "rotate") {
      obj.rotation = Math.atan2(p.y - o.y, p.x - o.x) + Math.PI / 2;
      if (keepAspect)
        obj.rotation =
          (Math.round(obj.rotation / (Math.PI / 12)) * Math.PI) / 12;
      return;
    }
    const q = localPoint(o, p),
      min = 2 / this.scale;
    let width = hx ? Math.max(min, hx * q.x + o.width / 2) : o.width;
    let height = hy ? Math.max(min, hy * q.y + o.height / 2) : o.height;
    if (keepAspect || o.lockAspectRatio) {
      const sx = width / o.width,
        sy = height / o.height;
      const ratio = !hx
        ? sy
        : !hy
          ? sx
          : Math.abs(sx - 1) > Math.abs(sy - 1)
            ? sx
            : sy;
      width = o.width * ratio;
      height = o.height * ratio;
    }
    const dx = (hx * (width - o.width)) / 2,
      dy = (hy * (height - o.height)) / 2,
      c = Math.cos(o.rotation),
      s = Math.sin(o.rotation);
    Object.assign(obj, {
      width,
      height,
      x: o.x + dx * c - dy * s,
      y: o.y + dx * s + dy * c,
    });
  }

  setActiveInstrument(instrument) {
    this.isDrawing = false;
    this.isSelecting = false;
    this.isMovingSelection = false;
    this.transformDrag = null;
    if (instrument !== this.activeInstrument) this.polygonDraft = [];
    this.activeInstrument = instrument;
    // Update cursor style based on tool
    switch (instrument) {
      case "gridDraw":
      case "freeDraw":
      case "polygon":
      case "addObject":
        this.canvas.style.cursor = "crosshair";
        break;
      case "erase":
        this.canvas.style.cursor = "cell";
        break;
      case "select":
        this.canvas.style.cursor = "default";
        break;
      default:
        this.canvas.style.cursor = "default";
    }
    this.render();
    console.log("Active instrument set to:", instrument);
    // No history save needed for changing tool
  }

  /**
   * Returns a unique identifier for a cell based on its X and Y coordinates.
   *
   * @param {number} cellX - The X-coordinate of the cell.
   * @param {number} cellY - The Y-coordinate of the cell.
   * @returns {string} A string representing the unique identifier for the cell in the format "cellX_cellY".
   */
  _cellId(cellX, cellY) {
    return `${cellX}_${cellY}`;
  }

  /**
   * Checks if a specific cell at the given coordinates (x, y) is filled in the active layer.
   *
   * @param {number} x - The x-coordinate of the cell.
   * @param {number} y - The y-coordinate of the cell.
   * @returns {boolean} - Returns `true` if the cell is filled in the active layer, otherwise `false`.
   */
  _isCellFilled(x, y) {
    const activeLayer = this.layers[this.activeLayerIndex];
    if (!activeLayer) return false;
    const cellId = this._cellId(x, y);
    return activeLayer.objects.has(cellId);
  }
}
