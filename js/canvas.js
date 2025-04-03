import { constants } from "./constants.js";

export class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Pan and zoom settings.
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    // Logical cell size (modifiable via HUD).
    this.baseCellSize = constants.baseCellSize;
    this.currentCellSize = constants.baseCellSize;

    // Flags.
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

    // Layers: Each layer now includes its own shadow options
    this.layers = [];
    this.layers.push({
      name: "Layer 1",
      objects: new Map(), // Map: cellId -> cellData
      // NEW: Per-layer shadow options
      gridShadowOptions: { ...constants.defaultGridShadowOptions }, // Clone defaults
      visible: true, // Add visibility flag for future use
    });
    this.activeLayerIndex = 0;

    // FreeDraw objects and custom objects (remain global for now)
    this.freeDrawObjects = new Map();
    this.customObjects = new Map();

    // To support freeDraw period
    this.lastFreeDrawPosition = null;

    // --- Global Settings (that don't belong to layers) ---
    this.emptyCellSettings = {
      fillColor: constants.defaultEmptyCellFillColor,
      borderColor: constants.defaultEmptyCellBorderColor,
      pattern: null,
      patternSrc: null,
    };

    // Grid Border Options (remains global for now, could be per-layer later if needed)
    this.gridBorderOptions = {
      enabled: false,
      image: null,
      imageSrc: null,
    };

    this.freeDrawSettings = {
      period: 0,
      size: 1,
      fillColor: constants.defaultFreeFillColor,
      strokeColor: constants.defaultFreeBorderColor,
      connectSVG: true,
      image: null,
    };

    this.gridDrawSettings = {
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
    this.setupEventListeners();
    this.saveHistory();
    this.render();
}

  // --- History Management ---
  saveHistory() {
    const state = {
      layers: this.layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible !== undefined ? layer.visible : true, // Save visibility
        // NEW: Save per-layer shadow options
        gridShadowOptions: layer.gridShadowOptions
          ? { ...layer.gridShadowOptions } // Deep copy options
          : { ...constants.defaultGridShadowOptions }, // Fallback if missing
        objects: Array.from(layer.objects.entries()).map(([key, cell]) => {
          let cellCopy = { ...cell };
          // Use stored imageSrc if available
          if (cellCopy.imageSrc) {
            cellCopy.image = cellCopy.imageSrc; // Save src string
          } else {
            delete cellCopy.image; // Ensure no Image object is saved
            delete cellCopy.imageSrc; // Clean up if inconsistent
          }
          return [key, cellCopy];
        }),
      })),
      freeDrawObjects: Array.from(this.freeDrawObjects.entries()).map(
        ([id, obj]) => {
          let copyObj = { ...obj };
          if (copyObj.image && copyObj.image.src) {
            copyObj.image = copyObj.image.src; // Save src
          } else {
            delete copyObj.image;
          }
          return [id, copyObj];
        }
      ),
      customObjects: Array.from(this.customObjects.entries()).map(
        ([id, obj]) => {
          let copyObj = { ...obj };
          // Use stored imageSrc if available
          if (copyObj.imageSrc) {
            copyObj.image = copyObj.imageSrc; // Save src
          } else {
            delete copyObj.image;
            delete copyObj.imageSrc;
          }
          return [id, copyObj];
        }
      ),
      settings: {
        currentCellSize: this.currentCellSize,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
        activeLayerIndex: this.activeLayerIndex,
        emptyCellSettings: {
          ...this.emptyCellSettings,
          pattern: this.emptyCellSettings.patternSrc, // Save src
        },
        gridBorderOptions: {
          ...this.gridBorderOptions,
          image: this.gridBorderOptions.imageSrc, // Save src
        },
        gridImageList: this.gridImageList, // Save the list of srcs
        gridDrawSettings: {
          ...this.gridDrawSettings,
          image: this.gridDrawSettings.imageSrc, // Save src
        },
        freeDrawSettings: {
          ...this.freeDrawSettings,
          image: this.freeDrawSettings.image?.src || null, // Save src if exists
        },
        customObjectImageSrc: this.customObjectImageSrc,
      },
    };
    // If history pointer isn’t at the end, truncate the redo branch.
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(JSON.stringify(state)); // Store as JSON string
    this.historyIndex++;

    // Limit history size (optional)
    if (this.history.length > constants.historyLimit) {
        this.history.shift(); // Remove oldest entry
        this.historyIndex--; // Adjust index
    }
  }


  // Restore state from saved history or loaded data (expects parsed object)
  loadStateData(state) {
    // --- Layers ---
    this.layers = state.layers.map((layerData) => {
      let newLayer = {
        name: layerData.name || "Unnamed Layer",
        visible: layerData.visible !== undefined ? layerData.visible : true,
        // NEW: Load per-layer shadow options, providing defaults if missing
        gridShadowOptions: {
            ...constants.defaultGridShadowOptions, // Start with defaults
            ...(layerData.gridShadowOptions || {}) // Override with loaded data if present
        },
        objects: new Map(
          (layerData.objects || []).map(([key, cell]) => {
            // Recreate Image objects from src
            if (cell.type === "image" && cell.image && typeof cell.image === "string") {
              let img = new Image();
              img.src = cell.image;
              cell.imageSrc = cell.image; // Store src back
              cell.image = img; // Store Image object
              // Add onload/onerror handlers if needed for robustness during load
              img.onload = () => this.render(); // Re-render when images load
            } else {
                cell.image = null; // Ensure no broken image refs
                cell.imageSrc = null;
            }
            return [key, cell];
          })
        ),
      };
      return newLayer;
    });
    // Ensure at least one layer exists
    if (this.layers.length === 0) {
        this.layers.push({
            name: "Layer 1", objects: new Map(), visible: true,
            gridShadowOptions: { ...constants.defaultGridShadowOptions }
        });
    }


    // --- Load rest of state (freeDraw, customObjects, settings) ---
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
      })
    );
    this.customObjects = new Map(
      (state.customObjects || []).map(([id, obj]) => {
        if (obj.image && typeof obj.image === "string") {
          let img = new Image();
          img.src = obj.image;
          obj.imageSrc = obj.image; // Store src back
          obj.image = img; // Store Image object
          img.onload = () => this.render();
        } else {
            obj.image = null;
            obj.imageSrc = null;
        }
        return [id, obj];
      })
    );

    if (state.settings) {
        this.currentCellSize = state.settings.currentCellSize || constants.baseCellSize;
        this.offsetX = state.settings.offsetX || 0;
        this.offsetY = state.settings.offsetY || 0;
        this.scale = state.settings.scale || 1;
        this.activeLayerIndex = state.settings.activeLayerIndex || 0;
        // Ensure activeLayerIndex is valid
        if (this.activeLayerIndex >= this.layers.length || this.activeLayerIndex < 0) {
            this.activeLayerIndex = 0;
        }

        // Empty Cell Settings
        this.emptyCellSettings = state.settings.emptyCellSettings || this.emptyCellSettings;
        if (this.emptyCellSettings.pattern && typeof this.emptyCellSettings.pattern === "string") {
          let img = new Image();
          img.src = this.emptyCellSettings.pattern;
          this.emptyCellSettings.patternSrc = this.emptyCellSettings.pattern;
          this.emptyCellSettings.pattern = img;
          img.onload = () => this.render();
        } else {
          this.emptyCellSettings.pattern = null;
          this.emptyCellSettings.patternSrc = null;
        }

        // Grid Border Options
        this.gridBorderOptions = state.settings.gridBorderOptions || this.gridBorderOptions;
        if (this.gridBorderOptions.image && typeof this.gridBorderOptions.image === "string") {
          let img = new Image();
          img.src = this.gridBorderOptions.image;
          this.gridBorderOptions.imageSrc = this.gridBorderOptions.image;
          this.gridBorderOptions.image = img;
          img.onload = () => this.render();
        } else {
          this.gridBorderOptions.image = null;
          this.gridBorderOptions.imageSrc = null;
        }

        // Grid Draw Image List & Settings
        this.gridImageList = state.settings.gridImageList || [];
        this.gridDrawSettings = state.settings.gridDrawSettings || this.gridDrawSettings;
        if (this.gridDrawSettings.image && typeof this.gridDrawSettings.image === "string") {
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
        this.freeDrawSettings = state.settings.freeDrawSettings || this.freeDrawSettings;
        if (this.freeDrawSettings.image && typeof this.freeDrawSettings.image === "string") {
            let img = new Image();
            img.src = this.freeDrawSettings.image;
            this.freeDrawSettings.image = img;
            img.onload = () => this.render();
        } else {
            this.freeDrawSettings.image = null;
        }

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

    // --- Clear selection ---
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  loadHistoryState(stateString) {
    try {
        const state = JSON.parse(stateString);
        this.loadStateData(state); // Use the common loading logic
        this.render();
    } catch (e) {
        console.error("Error parsing history state:", e);
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadHistoryState(this.history[this.historyIndex]);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadHistoryState(this.history[this.historyIndex]);
    }
  }

  // --- Canvas & View ---
  updateCellSize(newSize) {
    // Optional: Adjust view to keep center point stable during cell size change
    // ... (calculation logic if desired) ...
    this.currentCellSize = newSize;
    this.render();
    // No history save here, assumed to be part of other actions or implicit
  }

  clearCanvas() {
    this.layers.forEach((layer) => layer.objects.clear());
    this.freeDrawObjects.clear();
    this.customObjects.clear();
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
    // Don't reset history here, clearCanvas should be undoable
    this.render();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.render(); // Re-render after resize
  }

  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale,
    };
  }

  worldToScreen(worldX, worldY) {
    return {
      x: worldX * this.scale + this.offsetX,
      y: worldY * this.scale + this.offsetY,
    };
  }

  // --- Event Listeners Setup ---
  setupEventListeners() {
    // Zooming with the mouse wheel.
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const zoomIntensity = 0.001;
      let zoomAmount = -event.deltaY * zoomIntensity;

      // Clamp zoom speed for very small/large scales
      // zoomAmount = Math.max(-0.1, Math.min(0.1, zoomAmount));

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
    }, { passive: false }); // Need passive: false to preventDefault

    // Combined mouse events for drawing, panning, and selection.
    this.canvas.addEventListener("mousedown", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const startX = event.clientX - rect.left;
      const startY = event.clientY - rect.top;
      const worldPos = this.screenToWorld(startX, startY);

      // Middle mouse button for panning
      if (event.button === 1) { // Middle mouse button
        this.isPanning = true;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        this.canvas.style.cursor = "grabbing";
        event.preventDefault(); // Prevent default middle-click scroll
      }
      // Left mouse button for drawing/selecting
      else if (event.button === 0) { // Left mouse button
        if (this.activeInstrument === "select") {
          // Check if clicking inside the current selection bounding box (if any)
          // TODO: Implement more precise check (on object handles, etc.)
          const clickedObject = this.getObjectAtWorldPos(worldPos);
          const isSelected = this.isObjectSelected(clickedObject);

          if (clickedObject && isSelected) {
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
          this.handleDrawing(worldPos, event); // Pass event if needed
        }
        this.render(); // Render selection box immediately
      }
    });

    this.canvas.addEventListener("mousemove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const currentY = event.clientY - rect.top;
      const worldPos = this.screenToWorld(currentX, currentY);

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

    // Use window mouseup to catch events outside canvas
    window.addEventListener("mouseup", (event) => {
      // Panning end
      if (event.button === 1 && this.isPanning) { // Middle mouse button
        this.isPanning = false;
        this.canvas.style.cursor = "default"; // Or appropriate cursor
      }
      // Drawing/Selecting end
      else if (event.button === 0) { // Left mouse button
        if (this.isDrawing) {
          this.isDrawing = false;
          this.lastFreeDrawPosition = null; // Reset for free draw period
          this.saveHistory(); // Save state after drawing action
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
        }
      }
    });

    // Prevent context menu on canvas
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  // --- Drawing & Tool Logic ---
  handleDrawing(worldPos, event) {
    const cellX = Math.floor(worldPos.x / this.currentCellSize);
    const cellY = Math.floor(worldPos.y / this.currentCellSize);
    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

    if (!activeLayerObjects && this.activeInstrument === 'gridDraw') {
        console.warn("No active layer to draw on.");
        return;
    }

    switch (this.activeInstrument) {
      case "gridDraw":
        const cellId = this._cellId(cellX, cellY);
        const currentCell = activeLayerObjects.get(cellId);
        const newCellData = {
          x: cellX,
          y: cellY,
          type: this.gridDrawSettings.type,
          fillColor: this.gridDrawSettings.fillColor,
          borderColor: this.gridDrawSettings.borderColor,
          image: this.gridDrawSettings.image,
          imageSrc: this.gridDrawSettings.imageSrc,
        };
        // Avoid redundant updates if cell content is identical
        if (JSON.stringify(currentCell) !== JSON.stringify(newCellData)) {
            activeLayerObjects.set(cellId, newCellData);
            this.render(); // Render immediately for feedback
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
        const id = Date.now().toString() + Math.random().toString(36).substring(2);
        this.freeDrawObjects.set(id, {
          x: worldPos.x,
          y: worldPos.y,
          type: "freeDraw", // Keep type for potential differentiation
          fillColor: this.freeDrawSettings.fillColor,
          strokeColor: this.freeDrawSettings.strokeColor,
          size: this.freeDrawSettings.size * this.currentCellSize, // Store size in pixels
          image: this.freeDrawSettings.image, // Store the Image object
        });
        this.lastFreeDrawPosition = worldPos; // Update last position
        // Placeholder for connecting SVG patterns logic
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
        const eraseRadiusFree = (this.currentCellSize / 2) * this.scale; // Adjust radius based on zoom? Or keep fixed world size? Let's use world size.
        const eraseRadiusFreeWorld = this.currentCellSize / 2;
        for (let [fId, fObj] of this.freeDrawObjects) {
          const dxFree = fObj.x - worldPos.x;
          const dyFree = fObj.y - worldPos.y;
          // Check distance against object size or a fixed radius
          if (Math.sqrt(dxFree * dxFree + dyFree * dyFree) < (fObj.size / 2 || eraseRadiusFreeWorld)) {
            this.freeDrawObjects.delete(fId);
          }
        }

        // Erase custom objects (check bounding box)
        for (let [cId, cObj] of this.customObjects) {
            // Simple AABB check for now (ignores rotation)
            if (worldPos.x >= cObj.x - cObj.width / 2 &&
                worldPos.x <= cObj.x + cObj.width / 2 &&
                worldPos.y >= cObj.y - cObj.height / 2 &&
                worldPos.y <= cObj.y + cObj.height / 2) {
                this.customObjects.delete(cId);
            }
            // TODO: Add rotated bounding box check for more accuracy
        }
        this.render();
        break;

      case "addObject":
        if (this.customObjectImage) {
          const objId = Date.now().toString() + Math.random().toString(36).substring(2);
          // Place center at mouse position
          const objWidth = this.customObjectImage.naturalWidth * (this.currentCellSize / constants.baseCellSize); // Scale based on current cell size relative to base? Or fixed size? Let's use image size scaled by current cell size.
          const objHeight = this.customObjectImage.naturalHeight * (this.currentCellSize / constants.baseCellSize);
          // Alternative: Start with a fixed size like 2x2 cells
          // const objWidth = this.currentCellSize * 2;
          // const objHeight = this.currentCellSize * 2;

          this.customObjects.set(objId, {
            x: worldPos.x,
            y: worldPos.y,
            width: objWidth,
            height: objHeight,
            rotation: 0, // Radians
            image: this.customObjectImage, // Store Image object
            imageSrc: this.customObjectImageSrc, // Store src
          });
          this.render();
          // Optional: Deselect image after placing? Or allow multiple placements?
          // this.customObjectImage = null;
          // this.customObjectImageSrc = null;
          // if (window.hudInstance) window.hudInstance.loadInstrumentSettings('addObject');
        } else {
            // Maybe provide feedback that no image is selected
            console.log("Select an object image first.");
        }
        break;
    }
  }

  // --- Selection Logic ---

  // Find the topmost object at a given world position
  getObjectAtWorldPos(worldPos) {
      // Check Custom Objects first (usually on top) - reverse order for top-most
      const customIds = Array.from(this.customObjects.keys()).reverse();
      for (const id of customIds) {
          const obj = this.customObjects.get(id);
          // TODO: Implement rotated point-in-rect check
          // Simple AABB check for now:
          if (worldPos.x >= obj.x - obj.width / 2 && worldPos.x <= obj.x + obj.width / 2 &&
              worldPos.y >= obj.y - obj.height / 2 && worldPos.y <= obj.y + obj.height / 2) {
              return { type: "custom", id: id, object: obj };
          }
      }

      // Check Free Draw Objects - reverse order for top-most
      const freeIds = Array.from(this.freeDrawObjects.keys()).reverse();
      for (const id of freeIds) {
          const obj = this.freeDrawObjects.get(id);
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
          return { type: "grid", id: cellId, object: this.layers[this.activeLayerIndex].objects.get(cellId) };
      }

      return null; // Nothing found
  }

  isObjectSelected(objInfo) {
      if (!objInfo) return false;
      switch (objInfo.type) {
          case 'grid': return this.selectedObjects.grid.includes(objInfo.id);
          case 'free': return this.selectedObjects.free.includes(objInfo.id);
          case 'custom': return this.selectedObjects.custom.includes(objInfo.id);
          default: return false;
      }
  }


  finalizeSelection() {
    // If selectionStart and selectionEnd are the same (a click, not a drag)
    if (this.selectionStart && this.selectionEnd &&
        this.selectionStart.x === this.selectionEnd.x &&
        this.selectionStart.y === this.selectionEnd.y)
    {
        const clickedObject = this.getObjectAtWorldPos(this.selectionStart);
        if (clickedObject) {
            // TODO: Implement shift-click for multi-select
            this.selectedObjects = { grid: [], free: [], custom: [] }; // Clear previous
            if (clickedObject.type === 'grid') this.selectedObjects.grid.push(clickedObject.id);
            if (clickedObject.type === 'free') this.selectedObjects.free.push(clickedObject.id);
            if (clickedObject.type === 'custom') this.selectedObjects.custom.push(clickedObject.id);
        } else {
            // Clicked on empty space, clear selection
            this.selectedObjects = { grid: [], free: [], custom: [] };
        }
    }
    // If it was a drag selection
    else if (this.selectionStart && this.selectionEnd) {
        // TODO: Implement shift-click add to selection
        this.selectedObjects = { grid: [], free: [], custom: [] }; // Clear previous

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
                if (cellCenterX >= startX && cellCenterX < endX && cellCenterY >= startY && cellCenterY < endY) {
                    this.selectedObjects.grid.push(cellId);
                }
            });
        }

        // Select free draw objects (check center point within rect)
        this.freeDrawObjects.forEach((obj, id) => {
            if (obj.x >= startX && obj.x < endX && obj.y >= startY && obj.y < endY) {
                this.selectedObjects.free.push(id);
            }
        });

        // Select custom objects (check if AABB intersects rect)
        this.customObjects.forEach((obj, id) => {
            const objMinX = obj.x - obj.width / 2;
            const objMinY = obj.y - obj.height / 2;
            const objMaxX = obj.x + obj.width / 2;
            const objMaxY = obj.y + obj.height / 2;
            // Check for intersection
            if (objMaxX > startX && objMinX < endX && objMaxY > startY && objMinY < endY) {
                this.selectedObjects.custom.push(id);
            }
        });
    }

    // Reset selection rectangle drawing points
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  moveSelection(dxWorld, dyWorld) {
    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

    // Move Grid Cells (more complex - needs to delete old, create new)
    // This is tricky because grid cells are tied to the grid. Moving them
    // might mean changing their x/y indices. For now, let's disallow moving grid cells.
    // If needed later, it would involve:
    // 1. Storing the original data of selected cells.
    // 2. Deleting the selected cells.
    // 3. Calculating new cellX, cellY based on dxWorld, dyWorld.
    // 4. Creating new cells at the new locations with the stored data.
    // This can lead to overwriting or conflicts. A simpler approach might be
    // to only allow moving free/custom objects.

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

  // Calculate the center of the current selection
  getSelectionCenter() {
      let points = [];
      let count = 0;
      let sumX = 0;
      let sumY = 0;

      const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
      if (activeLayerObjects) {
          this.selectedObjects.grid.forEach(cellId => {
              const cell = activeLayerObjects.get(cellId);
              if (cell) {
                  sumX += (cell.x + 0.5) * this.currentCellSize;
                  sumY += (cell.y + 0.5) * this.currentCellSize;
                  count++;
              }
          });
      }
      this.selectedObjects.free.forEach(id => {
          const obj = this.freeDrawObjects.get(id);
          if (obj) {
              sumX += obj.x;
              sumY += obj.y;
              count++;
          }
      });
      this.selectedObjects.custom.forEach(id => {
          const obj = this.customObjects.get(id);
          if (obj) {
              sumX += obj.x;
              sumY += obj.y;
              count++;
          }
      });

      if (count === 0) {
          return null; // No selection or empty selection
      }
      return { x: sumX / count, y: sumY / count };
  }


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
        // Free draw objects don't have inherent rotation property
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
        obj.rotation = (obj.rotation + rad) % (2 * Math.PI); // Keep rotation within 0-2PI
      }
    });

    // Note: Rotating grid cells is generally not practical.

    this.render();
    this.saveHistory();
  }

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

    // Note: Resizing grid cells is not practical.

    this.render();
    this.saveHistory();
  }

  deleteSelection() {
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
        this.saveHistory();
    }
  }

  copySelection() {
      this.copiedSelection = { grid: [], free: [], custom: [] };
      const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

      this.selectedObjects.grid.forEach(cellId => {
          if (activeLayerObjects?.has(cellId)) {
              // Deep copy cell data, ensuring image src is used if present
              let originalCell = activeLayerObjects.get(cellId);
              let cellCopy = { ...originalCell };
              if (cellCopy.imageSrc) cellCopy.image = cellCopy.imageSrc;
              else delete cellCopy.image;
              this.copiedSelection.grid.push(cellCopy);
          }
      });
      this.selectedObjects.free.forEach(id => {
          if (this.freeDrawObjects.has(id)) {
              let originalObj = this.freeDrawObjects.get(id);
              let objCopy = { ...originalObj };
              if (objCopy.image?.src) objCopy.image = objCopy.image.src;
              else delete objCopy.image;
              this.copiedSelection.free.push(objCopy);
          }
      });
      this.selectedObjects.custom.forEach(id => {
          if (this.customObjects.has(id)) {
              let originalObj = this.customObjects.get(id);
              let objCopy = { ...originalObj };
              if (objCopy.imageSrc) objCopy.image = objCopy.imageSrc;
              else delete objCopy.image;
              this.copiedSelection.custom.push(objCopy);
          }
      });
      console.log("Copied:", this.copiedSelection);
  }

  pasteSelection() {
      if (!this.copiedSelection) return;

      const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
      if (!activeLayerObjects) return; // Cannot paste grid cells without active layer

      // Small offset for pasted items to avoid exact overlap
      const pasteOffset = this.currentCellSize * 0.5;

      // Paste Grid Cells
      this.copiedSelection.grid.forEach(cellData => {
          // Create a new cell object from the copied data
          let newCell = { ...cellData };
          // Calculate slightly offset position (adjust x, y indices)
          newCell.x += 1; // Simple offset by 1 cell for now
          newCell.y += 1;
          const newCellId = this._cellId(newCell.x, newCell.y);

          // Recreate Image object if needed
          if (newCell.type === 'image' && typeof newCell.image === 'string') {
              let img = new Image();
              img.src = newCell.image;
              newCell.imageSrc = newCell.image;
              newCell.image = img;
              img.onload = () => this.render();
          }
          activeLayerObjects.set(newCellId, newCell);
      });

      // Paste Free Draw Objects
      this.copiedSelection.free.forEach(objData => {
          let newObj = { ...objData };
          newObj.x += pasteOffset;
          newObj.y += pasteOffset;
          const newId = Date.now().toString() + Math.random().toString(36).substring(2);

          // Recreate Image object if needed
          if (newObj.image && typeof newObj.image === 'string') {
              let img = new Image();
              img.src = newObj.image;
              newObj.image = img;
              img.onload = () => this.render();
          }
          this.freeDrawObjects.set(newId, newObj);
      });

      // Paste Custom Objects
      this.copiedSelection.custom.forEach(objData => {
          let newObj = { ...objData };
          newObj.x += pasteOffset;
          newObj.y += pasteOffset;
          const newId = Date.now().toString() + Math.random().toString(36).substring(2);

          // Recreate Image object if needed
          if (newObj.image && typeof newObj.image === 'string') {
              let img = new Image();
              img.src = newObj.image;
              newObj.imageSrc = newObj.image;
              newObj.image = img;
              img.onload = () => this.render();
          }
          this.customObjects.set(newId, newObj);
      });

      this.render();
      this.saveHistory();
  }


  // --- Rendering Methods ---
  render() {
    // Request animation frame for smoother rendering
    requestAnimationFrame(() => {
        this._doRender();
    });
  }

  _doRender() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Optimization: Calculate visible world bounds
    const viewBounds = {
        minX: -this.offsetX / this.scale,
        minY: -this.offsetY / this.scale,
        maxX: (this.canvas.width - this.offsetX) / this.scale,
        maxY: (this.canvas.height - this.offsetY) / this.scale,
    };

    // Draw the base grid (empty cells) - considers all layers for emptiness
    this.drawGrid(ctx, this.currentCellSize, viewBounds);

    // --- Draw Layer Content (Cells, Shadows, Borders) ---
    this.layers.forEach((layer, index) => {
      // Check layer visibility
      if (!layer.visible) return; // Skip rendering if layer is not visible

      const layerObjects = layer.objects;
      const layerShadowOptions = layer.gridShadowOptions;

      // --- Draw Shadows for THIS layer (if enabled) ---
      if (layerShadowOptions && layerShadowOptions.enabled && layerObjects.size > 0) {
        // Pass the specific layer's objects and options
        this.drawGridShadows(ctx, this.currentCellSize, viewBounds, layerObjects, layerShadowOptions);
      }

      // --- Draw Borders (if enabled - still global for now) ---
      // If borders become per-layer, move this check inside the loop too
      if (this.gridBorderOptions.enabled && this.gridBorderOptions.image) {
         // Pass the specific layer's objects to check against
         this.drawGridBorders(ctx, this.currentCellSize, viewBounds, layerObjects);
      }

      // --- Draw Grid Cells for THIS layer ---
      layerObjects.forEach((cell) => {
        // Basic culling check
        const cellMaxX = (cell.x + 1) * this.currentCellSize;
        const cellMaxY = (cell.y + 1) * this.currentCellSize;
        if (cellMaxX > viewBounds.minX && cell.x * this.currentCellSize < viewBounds.maxX &&
            cellMaxY > viewBounds.minY && cell.y * this.currentCellSize < viewBounds.maxY)
        {
            this.drawGridCell(cell);
        }
      });
    }); // End layer loop

    // --- Draw Global Objects (Free Draw, Custom) ---
    // These are drawn *after* all layers
    this.freeDrawObjects.forEach((obj) => {
        const objBounds = { minX: obj.x - obj.size/2, minY: obj.y - obj.size/2, maxX: obj.x + obj.size/2, maxY: obj.y + obj.size/2 };
        if (objBounds.maxX > viewBounds.minX && objBounds.minX < viewBounds.maxX &&
            objBounds.maxY > viewBounds.minY && objBounds.minY < viewBounds.maxY)
        {
            this.drawFreeDrawObject(obj);
        }
    });
    this.customObjects.forEach((obj) => {
        // AABB check for culling (ignoring rotation for simplicity)
        const objBounds = { minX: obj.x - obj.width/2, minY: obj.y - obj.height/2, maxX: obj.x + obj.width/2, maxY: obj.y + obj.height/2 };
         if (objBounds.maxX > viewBounds.minX && objBounds.minX < viewBounds.maxX &&
             objBounds.maxY > viewBounds.minY && objBounds.minY < viewBounds.maxY)
         {
            this.drawCustomObject(obj);
         }
    });

    // --- Draw Selection ---
    if (this.isSelecting && this.selectionStart && this.selectionEnd) {
      this.drawSelectionRect();
    }
    this.drawSelectionHighlights(); // Highlights based on global selection state

    ctx.restore();
  }

  // Draw the background grid and empty cells
  drawGrid(ctx, cellSize, viewBounds) {
    const startX = Math.floor(viewBounds.minX / cellSize) - 1;
    const startY = Math.floor(viewBounds.minY / cellSize) - 1;
    const endX = Math.ceil(viewBounds.maxX / cellSize) + 1;
    const endY = Math.ceil(viewBounds.maxY / cellSize) + 1;

    ctx.lineWidth = Math.max(0.5, 1 / this.scale); // Ensure minimum visibility
    const emptyFill = this.emptyCellSettings.fillColor;
    const emptyBorder = this.emptyCellSettings.borderColor;
    const emptyPattern = this.emptyCellSettings.pattern;

    ctx.fillStyle = emptyFill;
    ctx.strokeStyle = emptyBorder;

    for (let i = startX; i < endX; i++) {
      for (let j = startY; j < endY; j++) {
        const cellId = this._cellId(i, j);
        // Check if *any* VISIBLE layer has this cell filled
        const isFilled = this.layers.some((layer) => layer.visible && layer.objects.has(cellId));

        if (!isFilled) {
          const x = i * cellSize;
          const y = j * cellSize;
          // Draw empty cell appearance
          ctx.fillRect(x, y, cellSize, cellSize);
          if (emptyPattern && emptyPattern.complete && emptyPattern.naturalWidth > 0) {
            try {
              ctx.drawImage(emptyPattern, x, y, cellSize, cellSize);
            } catch (e) {
              console.error("Error drawing empty cell pattern:", e);
              this.emptyCellSettings.pattern = null; // Clear broken pattern
              this.emptyCellSettings.patternSrc = null;
            }
          }
          // Draw the border
          ctx.strokeRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  drawGridShadows(ctx, cellSize, viewBounds, layerObjects, shadowOptions) {
    // This function now operates on the passed 'layerObjects' and 'shadowOptions'
    // instead of 'this.layers[this.activeLayerIndex].objects' and 'this.gridShadowOptions'

    if (!shadowOptions || !shadowOptions.enabled || !layerObjects || layerObjects.size === 0) {
        return; // Exit if shadows disabled for this layer or layer is empty
    }

    const angleRad = (shadowOptions.angle * Math.PI) / 180;
    const offsetPixels = shadowOptions.offset * cellSize;
    const baseShadowColor = shadowOptions.color.substring(0, 7); // Get #RRGGBB
    const shadowAlpha = parseInt(shadowOptions.color.substring(7, 9) || '80', 16) / 255; // Get alpha (default 0.5 if missing)

    const vo = { x: Math.cos(angleRad) * offsetPixels, y: Math.sin(angleRad) * offsetPixels };
    if (Math.abs(vo.x) < 1e-6 && Math.abs(vo.y) < 1e-6) return; // No offset, no shadow

    // --- Create Temporary Offscreen Canvas for Shadows ---
    // Calculate pixel dimensions of the view
    const viewWidthPixels = Math.max(1, Math.ceil((viewBounds.maxX - viewBounds.minX) * this.scale));
    const viewHeightPixels = Math.max(1, Math.ceil((viewBounds.maxY - viewBounds.minY) * this.scale));

    // Use a static or pooled canvas for performance? For now, create new.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = viewWidthPixels;
    shadowCanvas.height = viewHeightPixels;
    const shadowCtx = shadowCanvas.getContext('2d', { alpha: true }); // Ensure alpha channel

    if (!shadowCtx) {
        console.error("Failed to create shadow buffer context");
        return; // Cannot proceed without buffer
    }

    // --- Prepare Shadow Context Transform ---
    // We want to draw world coordinates onto this buffer.
    // The buffer's (0,0) pixel corresponds to world coordinate (viewBounds.minX, viewBounds.minY).
    // Transform should map world coords to buffer pixel coords.
    shadowCtx.scale(this.scale, this.scale);
    shadowCtx.translate(-viewBounds.minX, -viewBounds.minY);
    shadowCtx.fillStyle = baseShadowColor; // Opaque color for drawing fragments

    // Calculate visible cell range for culling (using indices)
    const startXIdx = Math.floor(viewBounds.minX / cellSize) - 1;
    const startYIdx = Math.floor(viewBounds.minY / cellSize) - 1;
    const endXIdx = Math.ceil(viewBounds.maxX / cellSize) + 1;
    const endYIdx = Math.ceil(viewBounds.maxY / cellSize) + 1;

    // --- Draw Shadow Fragments to Offscreen Buffer ---
    // Use the passed 'layerObjects' map here
    layerObjects.forEach((cell) => {
        // Cull check for the cell itself (using indices)
        if (cell.x < startXIdx || cell.x > endXIdx || cell.y < startYIdx || cell.y > endYIdx) return;

        const cx = cell.x; const cy = cell.y;
        const x1 = cx * cellSize; const y1 = cy * cellSize;
        const x2 = x1 + cellSize; const y2 = y1 + cellSize;

        // Corners and offset corners (same calculation as before)
        const TL = { x: x1, y: y1 }; const TR = { x: x2, y: y1 };
        const BR = { x: x2, y: y2 }; const BL = { x: x1, y: y2 };
        const TL_off = { x: TL.x + vo.x, y: TL.y + vo.y }; const TR_off = { x: TR.x + vo.x, y: TR.y + vo.y };
        const BR_off = { x: BR.x + vo.x, y: BR.y + vo.y }; const BL_off = { x: BL.x + vo.x, y: BL.y + vo.y };

        // Check 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue; // Skip self
                const nx = cx + dx; const ny = cy + dy;
                const neighborId = this._cellId(nx, ny);

                // Check emptiness based on the *passed* layerObjects
                if (!layerObjects.has(neighborId)) {
                    // Cull check for the neighbor cell (using indices)
                    if (nx < startXIdx || nx > endXIdx || ny < startYIdx || ny > endYIdx) continue;

                    const shadowDir = { x: dx, y: dy };
                    const dotProduct = shadowDir.x * vo.x + shadowDir.y * vo.y;

                    if (dotProduct > 1e-6) { // Cast shadow?
                        let shadowPolygon = [];
                        // Define polygon based on neighbor position (dx, dy)
                        if (dx === 0 && dy === -1) shadowPolygon = [TL, TR, TR_off, TL_off];         // Top
                        else if (dx === 1 && dy === 0) shadowPolygon = [TR, BR, BR_off, TR_off];      // Right
                        else if (dx === 0 && dy === 1) shadowPolygon = [BR, BL, BL_off, BR_off];      // Bottom
                        else if (dx === -1 && dy === 0) shadowPolygon = [BL, TL, TL_off, BL_off];     // Left
                        else if (dx === 1 && dy === -1) shadowPolygon = [TR, { x: TR_off.x, y: TR.y }, TR_off, { x: TR.x, y: TR_off.y }]; // Top-Right
                        else if (dx === 1 && dy === 1) shadowPolygon = [BR, { x: BR_off.x, y: BR.y }, BR_off, { x: BR.x, y: BR_off.y }]; // Bottom-Right
                        else if (dx === -1 && dy === 1) shadowPolygon = [BL, { x: BL_off.x, y: BL.y }, BL_off, { x: BL.x, y: BL_off.y }]; // Bottom-Left
                        else if (dx === -1 && dy === -1) shadowPolygon = [TL, { x: TL_off.x, y: TL.y }, TL_off, { x: TL.x, y: TL_off.y }]; // Top-Left

                        if (shadowPolygon.length > 0) {
                            // Draw fragment onto the SHADOW context (already transformed)
                            // Clipping is still needed to contain fragment within neighbor cell
                            shadowCtx.save();
                            shadowCtx.beginPath();
                            // Clip using world coordinates on the shadow context
                            shadowCtx.rect(nx * cellSize, ny * cellSize, cellSize, cellSize);
                            shadowCtx.clip();

                            shadowCtx.beginPath();
                            shadowPolygon.forEach((p, i) => { if (i === 0) shadowCtx.moveTo(p.x, p.y); else shadowCtx.lineTo(p.x, p.y); });
                            shadowCtx.closePath();
                            shadowCtx.fill(); // Fill on shadow buffer

                            shadowCtx.restore();
                        }
                    }
                }
            }
        }
    });

    // --- Draw Shadow Buffer to Main Canvas ---
    ctx.save();
    ctx.globalAlpha = shadowAlpha; // Apply user-defined transparency

    // The main context 'ctx' is already transformed (scaled and translated by offsetX/Y).
    // We need to draw the shadow buffer (which contains the correctly scaled and positioned shadows
    // relative to the viewBounds origin) at the correct location *within this transformed space*.
    // The top-left of the buffer corresponds to world coordinate (viewBounds.minX, viewBounds.minY).
    // So, we draw the image at these world coordinates.
    ctx.drawImage(shadowCanvas,
        viewBounds.minX, // Destination X in world coordinates
        viewBounds.minY, // Destination Y in world coordinates
        viewBounds.maxX - viewBounds.minX, // Width in world coordinates
        viewBounds.maxY - viewBounds.minY  // Height in world coordinates
    );

    ctx.restore(); // Restore alpha and any other saved state
  }


  drawAllGridShadows(ctx, logicalCellSize, layerObjects, shadowOptions) {
    // Operates on passed layerObjects and shadowOptions
    if (!shadowOptions || !shadowOptions.enabled || !layerObjects || layerObjects.size === 0) return;

    const angleRad = (shadowOptions.angle * Math.PI) / 180;
    const offsetLogical = shadowOptions.offset * logicalCellSize;
    const baseShadowColor = shadowOptions.color.substring(0, 7); // Get #RRGGBB
    const shadowAlpha = parseInt(shadowOptions.color.substring(7, 9) || '80', 16) / 255; // Get alpha

    const vo = { x: Math.cos(angleRad) * offsetLogical, y: Math.sin(angleRad) * offsetLogical };
    if (Math.abs(vo.x) < 1e-6 && Math.abs(vo.y) < 1e-6) return; // No offset, no shadow

    // --- Create Temporary Offscreen Canvas for Shadows ---
    // Match the target PDF context's canvas size
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = ctx.canvas.width;
    shadowCanvas.height = ctx.canvas.height;
    const shadowCtx = shadowCanvas.getContext('2d', { alpha: true });

    if (!shadowCtx) {
        console.error("PDF Export: Failed to create shadow buffer context");
        return; // Cannot proceed without buffer
    }

    // --- Prepare Shadow Context Transform ---
    // Make shadow context's coordinate system identical to the main PDF context's
    const transform = ctx.getTransform();
    shadowCtx.setTransform(transform);
    shadowCtx.fillStyle = baseShadowColor; // Opaque color

    // --- Draw Shadow Fragments to Offscreen Buffer (Logical Coords) ---
    // Use passed 'layerObjects'
    layerObjects.forEach((cell) => {
        const cx = cell.x; const cy = cell.y;
        const x1 = cx * logicalCellSize; const y1 = cy * logicalCellSize;
        const x2 = x1 + logicalCellSize; const y2 = y1 + logicalCellSize;

        // Corners and offset corners (logical)
        const TL = { x: x1, y: y1 }; const TR = { x: x2, y: y1 };
        const BR = { x: x2, y: y2 }; const BL = { x: x1, y: y2 };
        const TL_off = { x: TL.x + vo.x, y: TL.y + vo.y }; const TR_off = { x: TR.x + vo.x, y: TR.y + vo.y };
        const BR_off = { x: BR.x + vo.x, y: BR.y + vo.y }; const BL_off = { x: BL.x + vo.x, y: BL.y + vo.y };

        // Check 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue; // Skip self
                const nx = cx + dx; const ny = cy + dy;
                const neighborId = this._cellId(nx, ny);

                // Check emptiness based on passed layerObjects
                if (!layerObjects.has(neighborId)) {
                    const shadowDir = { x: dx, y: dy };
                    const dotProduct = shadowDir.x * vo.x + shadowDir.y * vo.y;

                    if (dotProduct > 1e-6) { // Cast shadow?
                        let shadowPolygon = [];
                        // Define polygon based on neighbor position (dx, dy)
                        if (dx === 0 && dy === -1) shadowPolygon = [TL, TR, TR_off, TL_off];         // Top
                        else if (dx === 1 && dy === 0) shadowPolygon = [TR, BR, BR_off, TR_off];      // Right
                        else if (dx === 0 && dy === 1) shadowPolygon = [BR, BL, BL_off, BR_off];      // Bottom
                        else if (dx === -1 && dy === 0) shadowPolygon = [BL, TL, TL_off, BL_off];     // Left
                        else if (dx === 1 && dy === -1) shadowPolygon = [TR, { x: TR_off.x, y: TR.y }, TR_off, { x: TR.x, y: TR_off.y }]; // Top-Right
                        else if (dx === 1 && dy === 1) shadowPolygon = [BR, { x: BR_off.x, y: BR.y }, BR_off, { x: BR.x, y: BR_off.y }]; // Bottom-Right
                        else if (dx === -1 && dy === 1) shadowPolygon = [BL, { x: BL_off.x, y: BL.y }, BL_off, { x: BL.x, y: BL_off.y }]; // Bottom-Left
                        else if (dx === -1 && dy === -1) shadowPolygon = [TL, { x: TL_off.x, y: TL.y }, TL_off, { x: TL.x, y: TL_off.y }]; // Top-Left

                        if (shadowPolygon.length > 0) {
                            // Draw fragment onto the SHADOW context (already transformed)
                            shadowCtx.save();
                            shadowCtx.beginPath();
                            // Clip using logical coordinates on the shadow context
                            shadowCtx.rect(nx * logicalCellSize, ny * logicalCellSize, logicalCellSize, logicalCellSize);
                            shadowCtx.clip();

                            shadowCtx.beginPath();
                            shadowPolygon.forEach((p, i) => { if (i === 0) shadowCtx.moveTo(p.x, p.y); else shadowCtx.lineTo(p.x, p.y); });
                            shadowCtx.closePath();
                            shadowCtx.fill(); // Fill on shadow buffer

                            shadowCtx.restore();
                        }
                    }
                }
            }
        }
    });

    // --- Draw Shadow Buffer to Main PDF Context ---
    ctx.save();
    ctx.globalAlpha = shadowAlpha; // Apply user-defined transparency

    // The target context 'ctx' for PDF is already transformed (scaled, translated).
    // The shadow buffer 'shadowCanvas' was drawn using the same transform.
    // We need to draw the buffer onto the target context. Since the coordinate
    // systems match, drawing the buffer at (0,0) *relative to the current transform*
    // is not correct. We need to draw it at (0,0) in the *untransformed* space.
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.drawImage(shadowCanvas, 0, 0); // Draw buffer at origin
    // Restore original transform AND alpha
    ctx.restore();
  }


  // Draw border patterns inside empty cells adjacent to filled cells
  drawGridBorders(ctx, cellSize, viewBounds, layerObjects) {
    // This function now uses the passed 'layerObjects' to determine
    // where borders should be drawn (adjacent to filled cells of *this* layer).
    // The global 'this.gridBorderOptions' is still used for image and enabled status.

    const borderImage = this.gridBorderOptions.image;
    // Check if borders are globally enabled and image exists
    if (!this.gridBorderOptions.enabled || !borderImage || !borderImage.complete || borderImage.naturalWidth === 0) return;
    // Check if the passed layer has objects
    if (!layerObjects || layerObjects.size === 0) return;

    const borderThickness = cellSize * 0.25; // Example thickness
    const startXIdx = Math.floor(viewBounds.minX / cellSize) - 1;
    const startYIdx = Math.floor(viewBounds.minY / cellSize) - 1;
    const endXIdx = Math.ceil(viewBounds.maxX / cellSize) + 1;
    const endYIdx = Math.ceil(viewBounds.maxY / cellSize) + 1;

    // Iterate through filled cells of the *passed layer*
    layerObjects.forEach((cell) => {
        // Cull check for the cell itself
        if (cell.x < startXIdx || cell.x > endXIdx || cell.y < startYIdx || cell.y > endYIdx) return;

        const cx = cell.x; const cy = cell.y;

        const neighbors = [
            { dx: 0, dy: -1, edge: "top" }, { dx: 1, dy: 0, edge: "right" },
            { dx: 0, dy: 1, edge: "bottom" }, { dx: -1, dy: 0, edge: "left" },
        ];

        neighbors.forEach((neighbor) => {
            const nx = cx + neighbor.dx; const ny = cy + neighbor.dy;
            const neighborId = this._cellId(nx, ny);

            // Check if the neighbor cell is EMPTY *in this layer*
            if (!layerObjects.has(neighborId)) {
                // Cull check for the neighbor cell
                if (nx < startXIdx || nx > endXIdx || ny < startYIdx || ny > endYIdx) return;

                let drawX, drawY, drawW, drawH;
                const neighborX = nx * cellSize;
                const neighborY = ny * cellSize;

                // Position the border *inside* the empty neighbor cell, along the edge
                switch (neighbor.edge) {
                    case "top":    drawX = neighborX; drawY = neighborY + cellSize - borderThickness; drawW = cellSize; drawH = borderThickness; break;
                    case "right":  drawX = neighborX; drawY = neighborY; drawW = borderThickness; drawH = cellSize; break;
                    case "bottom": drawX = neighborX; drawY = neighborY; drawW = cellSize; drawH = borderThickness; break;
                    case "left":   drawX = neighborX + cellSize - borderThickness; drawY = neighborY; drawW = borderThickness; drawH = cellSize; break;
                }

                ctx.save();
                try {
                    ctx.beginPath(); ctx.rect(drawX, drawY, drawW, drawH); ctx.clip();
                    // Draw image tiled or stretched - Stretching for simplicity
                    ctx.drawImage(borderImage, drawX, drawY, drawW, drawH);
                } catch (e) {
                    console.error("Error drawing border image:", e);
                    ctx.fillStyle = constants.attentionColor; // Fallback
                    ctx.fillRect(drawX, drawY, drawW, drawH);
                }
                ctx.restore();
            }
        });
    });
  }

  // Draw a single filled grid cell
  drawGridCell(cell) {
    const ctx = this.ctx;
    const x = cell.x * this.currentCellSize;
    const y = cell.y * this.currentCellSize;
    const size = this.currentCellSize;

    if (cell.type === "color") {
      ctx.fillStyle = cell.fillColor;
      ctx.fillRect(x, y, size, size);
    } else if (cell.type === "image" && cell.image && cell.image.complete && cell.image.naturalWidth > 0) {
      try {
        ctx.drawImage(cell.image, x, y, size, size);
      } catch (e) {
        console.error("Error drawing grid cell image:", e, cell.imageSrc);
        // Draw fallback color if image fails
        ctx.fillStyle = constants.errorColor || '#ff00ff'; // Magenta fallback
        ctx.fillRect(x, y, size, size);
      }
    }
    // Draw border for the cell itself
    ctx.strokeStyle = cell.borderColor;
    ctx.lineWidth = Math.max(0.5, 1 / this.scale); // Use same line width as grid
    ctx.strokeRect(x, y, size, size);
  }

  // Draw a single free-draw object
  drawFreeDrawObject(obj) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = Math.max(0.5, 1 / this.scale); // Consistent line width

    if (obj.image && obj.image.complete && obj.image.naturalWidth > 0) {
      try {
        // Draw image centered at obj.x, obj.y with obj.size
        ctx.drawImage(
          obj.image,
          obj.x - obj.size / 2,
          obj.y - obj.size / 2,
          obj.size,
          obj.size
        );
      } catch (e) {
        console.error("Error drawing freeDraw image:", e);
        // Fallback shape
        ctx.fillStyle = constants.errorColor || '#ff00ff';
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.size / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else {
      // Draw default circle shape
      ctx.beginPath();
      ctx.arc(obj.x, obj.y, obj.size / 2, 0, 2 * Math.PI);
      ctx.fillStyle = obj.fillColor;
      ctx.fill();
      ctx.strokeStyle = obj.strokeColor;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw a single custom object
  drawCustomObject(obj) {
    const ctx = this.ctx;
    ctx.save();
    // Translate to the object's center and rotate
    ctx.translate(obj.x, obj.y);
    ctx.rotate(obj.rotation); // Rotation is in radians

    if (obj.image && obj.image.complete && obj.image.naturalWidth > 0) {
      try {
        // Draw image centered around the origin (since we translated)
        ctx.drawImage(
          obj.image,
          -obj.width / 2,
          -obj.height / 2,
          obj.width,
          obj.height
        );
      } catch (e) {
        console.error("Error drawing custom object image:", e, obj.imageSrc);
        // Fallback rectangle
        ctx.fillStyle = constants.errorColor || '#ff00ff';
        ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
      }
    } else {
      // Draw a placeholder if no image or image failed to load
      ctx.fillStyle = constants.attentionColor; // Use attention color for placeholder
      ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1 / this.scale;
      ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
    }
    ctx.restore(); // Restore translation and rotation
  }

  // Draw the dashed rectangle during selection drag
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

  // Draw highlights around selected objects
  drawSelectionHighlights() {
    const ctx = this.ctx;
    if (this.selectedObjects.grid.length === 0 &&
        this.selectedObjects.free.length === 0 &&
        this.selectedObjects.custom.length === 0) {
      return; // Nothing selected
    }

    ctx.save();
    ctx.strokeStyle = constants.selectionHighlightColor; // Use a distinct color
    ctx.lineWidth = 2 / this.scale; // Make highlight slightly thicker
    ctx.setLineDash([]); // Solid line

    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;

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
        ctx.strokeRect(
          -obj.width / 2,
          -obj.height / 2,
          obj.width,
          obj.height
        );
        ctx.restore();
        // TODO: Add resize/rotate handles here later
      }
    });

    ctx.restore();
  }

  // --- PDF Export ---

  // Computes the smallest bounding box containing all drawn content in logical units
  getLogicalBoundingBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    // Grid cells (use cell indices directly)
    this.layers.forEach((layer) => {
      layer.objects.forEach((cell) => {
        minX = Math.min(minX, cell.x);
        minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x + 1); // Use x+1, y+1 for extent
        maxY = Math.max(maxY, cell.y + 1);
        hasContent = true;
      });
    });

    // Free draw objects (convert pixel coords to logical)
    this.freeDrawObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize;
      const ly = obj.y / this.currentCellSize;
      const lRadius = (obj.size / 2) / this.currentCellSize;
      minX = Math.min(minX, lx - lRadius);
      minY = Math.min(minY, ly - lRadius);
      maxX = Math.max(maxX, lx + lRadius);
      maxY = Math.max(maxY, ly + lRadius);
      hasContent = true;
    });

    // Custom objects (convert pixel coords to logical)
    // Note: This uses AABB, ignoring rotation for bounding box calculation.
    // A more accurate calculation would involve rotated corners.
    this.customObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize;
      const ly = obj.y / this.currentCellSize;
      const lWidth = obj.width / this.currentCellSize;
      const lHeight = obj.height / this.currentCellSize;
      // Approximate bounds using AABB
      const halfDiag = Math.sqrt(lWidth*lWidth + lHeight*lHeight) / 2;
      minX = Math.min(minX, lx - halfDiag);
      minY = Math.min(minY, ly - halfDiag);
      maxX = Math.max(maxX, lx + halfDiag);
      maxY = Math.max(maxY, ly + halfDiag);
      hasContent = true;
    });

    // If nothing was drawn, return a small default area (e.g., 10x10 cells)
    if (!hasContent) {
      return { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 };
    }

    // Add a small padding (e.g., 1 cell)
    const padding = 1;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  drawPdfBackgroundAndGrid(ctx, bbox) {
    const startX = bbox.minX;
    const startY = bbox.minY;
    const endX = bbox.maxX; // Use maxX/maxY from bbox
    const endY = bbox.maxY;
    const width = bbox.width;
    const height = bbox.height;

    const emptyFill = this.emptyCellSettings.fillColor || constants.defaultEmptyCellFillColor;
    const emptyBorder = this.emptyCellSettings.borderColor || constants.defaultEmptyCellBorderColor;
    const emptyPattern = this.emptyCellSettings.pattern; // The Image object

    // --- Background Fill ---
    ctx.fillStyle = emptyFill;
    ctx.fillRect(startX, startY, width, height);

    // --- Background Pattern ---
    if (emptyPattern && emptyPattern.complete && emptyPattern.naturalWidth > 0) {
        ctx.save();
        // Clip to the bounding box area before drawing pattern
        ctx.beginPath();
        ctx.rect(startX, startY, width, height);
        ctx.clip();
        try {
            // Create a pattern from the image
            // Note: Pattern scaling might need adjustment depending on desired look vs exportScale
            const pattern = ctx.createPattern(emptyPattern, 'repeat');
            if (pattern) {
                ctx.fillStyle = pattern;
                // Apply pattern fill. Need to ensure pattern origin aligns correctly.
                // If pattern should align with 0,0 logical origin:
                // ctx.translate(startX, startY);
                // ctx.fillRect(0, 0, width, height);
                // ctx.translate(-startX, -startY);
                // Simpler: Fill the clipped rect directly
                ctx.fillRect(startX, startY, width, height);
            } else {
                 console.error("PDF Export: Failed to create empty cell pattern.");
            }
        } catch (e) {
            console.error("PDF Export: Error drawing empty cell pattern:", e);
        }
        ctx.restore(); // Remove clip
    }

    // --- Grid Lines ---
    ctx.strokeStyle = emptyBorder;
    ctx.lineWidth = 0.02; // Thin line in logical units (adjust as needed)
    ctx.beginPath();
    // Draw vertical lines within the bounding box
    for (let x = Math.ceil(startX); x < endX; x++) { // Use < endX for lines between cells
      ctx.moveTo(x, startY); ctx.lineTo(x, endY);
    }
    // Draw horizontal lines within the bounding box
    for (let y = Math.ceil(startY); y < endY; y++) { // Use < endY for lines between cells
      ctx.moveTo(startX, y); ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  // Renders the entire map content onto a given context using logical coordinates
  drawAll(ctx, exportScale) {
    const bbox = this.getLogicalBoundingBox();
    if (bbox.width <= 0 || bbox.height <= 0) return; // Nothing to draw

    const startX = bbox.minX; const startY = bbox.minY;
    const endX = bbox.maxX; const endY = bbox.maxY;

    // --- Background and Grid Lines (Logical Coordinates) ---
    this.drawPdfBackgroundAndGrid(ctx, bbox); // Use helper

    // --- Draw Layer Content (Cells, Shadows, Borders) ---
    this.layers.forEach((layer) => {
        // Check layer visibility
        if (!layer.visible) return;

        const layerObjects = layer.objects;
        const layerShadowOptions = layer.gridShadowOptions;
        const logicalCellSize = 1; // Use 1 for logical size

        // --- Draw Shadows for THIS layer (if enabled) ---
        if (layerShadowOptions && layerShadowOptions.enabled && layerObjects.size > 0) {
            // Pass the specific layer's objects and options to the PDF shadow function
            this.drawAllGridShadows(ctx, logicalCellSize, layerObjects, layerShadowOptions);
        }

        // --- Draw Borders (if enabled - still global) ---
        // If borders become per-layer, move this check inside the loop too
        if (this.gridBorderOptions.enabled && this.gridBorderOptions.image) {
            // Pass the specific layer's objects to check against
            this.drawAllGridBorders(ctx, logicalCellSize, layerObjects);
        }

        // --- Draw Grid Cells for THIS layer ---
        layerObjects.forEach((cell) => {
            const x = cell.x; const y = cell.y;
            // Basic check if cell is within bounds
            if (x + 1 > startX && x < endX && y + 1 > startY && y < endY) {
                if (cell.type === "color") {
                  ctx.fillStyle = cell.fillColor;
                  ctx.fillRect(x, y, 1, 1); // Logical size 1x1
                } else if (cell.type === "image" && cell.image && cell.image.complete && cell.image.naturalWidth > 0) {
                  try {
                    ctx.drawImage(cell.image, x, y, 1, 1); // Logical size 1x1
                  } catch (e) { console.error("PDF Export: Error drawing grid cell image", e); }
                }
                // Draw cell border
                ctx.strokeStyle = cell.borderColor;
                ctx.strokeRect(x, y, 1, 1); // Logical size 1x1
            }
        });
    }); // End layer loop

    // --- Draw Global Objects (Free Draw, Custom) ---
    this.freeDrawObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize; // Convert to logical
      const ly = obj.y / this.currentCellSize;
      const lsize = obj.size / this.currentCellSize;
      // Basic check if object is within bounds
      if (lx + lsize/2 > startX && lx - lsize/2 < endX && ly + lsize/2 > startY && ly - lsize/2 < endY) {
          if (obj.image && obj.image.complete && obj.image.naturalWidth > 0) {
            try {
              ctx.drawImage(obj.image, lx - lsize / 2, ly - lsize / 2, lsize, lsize);
            } catch (e) { console.error("PDF Export: Error drawing freeDraw image", e); }
          } else {
            ctx.beginPath(); ctx.arc(lx, ly, lsize / 2, 0, 2 * Math.PI);
            ctx.fillStyle = obj.fillColor; ctx.fill();
            ctx.strokeStyle = obj.strokeColor; ctx.stroke();
          }
      }
    });
    this.customObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize; // Convert to logical
      const ly = obj.y / this.currentCellSize;
      const lwidth = obj.width / this.currentCellSize;
      const lheight = obj.height / this.currentCellSize;
      // Basic AABB check if object is within bounds
      if (lx + lwidth/2 > startX && lx - lwidth/2 < endX && ly + lheight/2 > startY && ly - lheight/2 < endY) {
          ctx.save();
          ctx.translate(lx, ly); ctx.rotate(obj.rotation);
          if (obj.image && obj.image.complete && obj.image.naturalWidth > 0) {
            try {
              ctx.drawImage(obj.image, -lwidth / 2, -lheight / 2, lwidth, lheight);
            } catch (e) { console.error("PDF Export: Error drawing custom object image", e); }
          } else {
            ctx.fillStyle = constants.attentionColor; // Placeholder
            ctx.fillRect(-lwidth / 2, -lheight / 2, lwidth, lheight);
          }
          ctx.restore();
      }
    });
  }

  // Draw borders for PDF export using logical coordinates
  drawAllGridBorders(ctx, logicalCellSize, layerObjects) {
    // Uses passed layerObjects for emptiness check
    const borderImage = this.gridBorderOptions.image;
    // Check if borders are globally enabled and image exists
    if (!this.gridBorderOptions.enabled || !borderImage || !borderImage.complete || !layerObjects || layerObjects.size === 0) return;

    const borderThicknessLogical = logicalCellSize * 0.25; // Logical border thickness

    // Iterate through filled cells of the *passed layer*
    layerObjects.forEach((cell) => {
        const cx = cell.x; const cy = cell.y;
        const neighbors = [
            { dx: 0, dy: -1, edge: "top" }, { dx: 1, dy: 0, edge: "right" },
            { dx: 0, dy: 1, edge: "bottom" }, { dx: -1, dy: 0, edge: "left" },
        ];

        neighbors.forEach((neighbor) => {
            const nx = cx + neighbor.dx; const ny = cy + neighbor.dy;
            const neighborId = this._cellId(nx, ny);

            // Check emptiness based on passed layerObjects
            if (!layerObjects.has(neighborId)) {
                let drawX, drawY, drawW, drawH; // Logical coordinates
                const neighborX = nx * logicalCellSize;
                const neighborY = ny * logicalCellSize;

                // Position the border *inside* the empty neighbor cell, along the edge
                switch (neighbor.edge) {
                    case "top":    drawX = neighborX; drawY = neighborY + logicalCellSize - borderThicknessLogical; drawW = logicalCellSize; drawH = borderThicknessLogical; break;
                    case "right":  drawX = neighborX; drawY = neighborY; drawW = borderThicknessLogical; drawH = logicalCellSize; break;
                    case "bottom": drawX = neighborX; drawY = neighborY; drawW = logicalCellSize; drawH = borderThicknessLogical; break;
                    case "left":   drawX = neighborX + logicalCellSize - borderThicknessLogical; drawY = neighborY; drawW = borderThicknessLogical; drawH = logicalCellSize; break;
                }

                ctx.save();
                try {
                    ctx.beginPath(); ctx.rect(drawX, drawY, drawW, drawH); ctx.clip();
                    // Draw image stretched into the logical border area
                    ctx.drawImage(borderImage, drawX, drawY, drawW, drawH);
                } catch (e) {
                    console.error("PDF Export: Error drawing border image:", e);
                    ctx.fillStyle = constants.attentionColor; // Fallback
                    ctx.fillRect(drawX, drawY, drawW, drawH);
                }
                ctx.restore();
            }
        });
    });
  }

  // --- Data Management & Layers ---
  getMapData() {
    // Use the logic from saveHistory's state creation, but don't modify history
    const state = {
      layers: this.layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible !== undefined ? layer.visible : true,
        gridShadowOptions: layer.gridShadowOptions ? { ...layer.gridShadowOptions } : { ...constants.defaultGridShadowOptions },
        objects: Array.from(layer.objects.entries()).map(([key, cell]) => {
          let cellCopy = { ...cell };
          if (cellCopy.imageSrc) cellCopy.image = cellCopy.imageSrc;
          else delete cellCopy.image;
          return [key, cellCopy];
        }),
      })),
      freeDrawObjects: Array.from(this.freeDrawObjects.entries()).map(([id, obj]) => {
         let copyObj = { ...obj };
         if (copyObj.image?.src) copyObj.image = copyObj.image.src;
         else delete copyObj.image;
         return [id, copyObj];
     }),
      customObjects: Array.from(this.customObjects.entries()).map(([id, obj]) => {
         let copyObj = { ...obj };
         if (copyObj.imageSrc) copyObj.image = copyObj.imageSrc;
         else delete copyObj.image;
         return [id, copyObj];
     }),
      settings: {
        currentCellSize: this.currentCellSize,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
        activeLayerIndex: this.activeLayerIndex,
        emptyCellSettings: { ...this.emptyCellSettings, pattern: this.emptyCellSettings.patternSrc },
        gridBorderOptions: { ...this.gridBorderOptions, image: this.gridBorderOptions.imageSrc },
        gridImageList: this.gridImageList,
        gridDrawSettings: { ...this.gridDrawSettings, image: this.gridDrawSettings.imageSrc },
        freeDrawSettings: { ...this.freeDrawSettings, image: this.freeDrawSettings.image?.src || null },
        customObjectImageSrc: this.customObjectImageSrc,
     },
    };
    return state;
  }

  loadMapData(data) {
    this.loadStateData(data); // Use common loading logic
    this.history = []; // Reset history
    this.historyIndex = -1;
    this.saveHistory(); // Save loaded state as initial history
    this.render();
    // Update HUD completely
    if (window.hudInstance) {
        window.hudInstance.updateLayerList(); // Updates active layer style
        window.hudInstance.updateAppearanceControls(); // Updates shadow controls for active layer
        // Update other relevant HUD parts
        document.getElementById('cellSize').value = this.currentCellSize;
        document.getElementById('emptyFillColor').value = this.emptyCellSettings.fillColor;
        document.getElementById('emptyBorderColor').value = this.emptyCellSettings.borderColor;
        document.getElementById('emptyPattern').value = ''; // Clear file input visually
        // Update border controls too
        const borderPatternPreview = document.getElementById("borderPatternPreview");
        if (this.gridBorderOptions.imageSrc) {
            borderPatternPreview.src = this.gridBorderOptions.imageSrc;
            borderPatternPreview.style.display = 'block';
        } else {
            borderPatternPreview.src = "#";
            borderPatternPreview.style.display = 'none';
        }
        document.getElementById("borderPattern").value = '';
        document.getElementById("bordersEnabled").checked = this.gridBorderOptions.enabled;

        window.hudInstance.loadInstrumentSettings(this.activeInstrument);
    } else {
        console.warn("HUD instance not found for updating after load.");
    }
  }

  setActiveLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      if (this.activeLayerIndex !== index) {
          this.activeLayerIndex = index;
          // Clear selection when changing layers? Optional, but often good UX.
          this.selectedObjects = { grid: [], free: [], custom: [] };
          this.selectionStart = null;
          this.selectionEnd = null;
          this.render();
          // NEW: Update HUD appearance controls for the new active layer
          if (window.hudInstance) {
              window.hudInstance.updateAppearanceControls();
          }
      }
    }
  }

  addLayer() {
    const newLayer = {
      name: "Layer " + (this.layers.length + 1),
      objects: new Map(),
      visible: true,
      // NEW: Add default shadow options to new layer
      gridShadowOptions: { ...constants.defaultGridShadowOptions }
    };
    this.layers.push(newLayer);
    this.activeLayerIndex = this.layers.length - 1; // Activate the new layer
    this.render();
    // NEW: Update HUD appearance controls for the new active layer
    if (window.hudInstance) {
        window.hudInstance.updateAppearanceControls();
    }
    this.saveHistory(); // Adding a layer is a state change
  }

  removeActiveLayer() {
    if (this.layers.length > 1) {
      this.layers.splice(this.activeLayerIndex, 1);
      // Adjust active index if the last layer was removed or index is now out of bounds
      this.activeLayerIndex = Math.min(Math.max(0, this.activeLayerIndex - 1), this.layers.length - 1);
      this.render();
      this.saveHistory(); // Removing a layer is a state change
    } else {
      alert("Cannot remove the last layer.");
    }
  }

  setActiveInstrument(instrument) {
    this.activeInstrument = instrument;
    // Reset selection state when switching away from select tool? Optional.
    if (instrument !== 'select') {
        // this.selectedObjects = { grid: [], free: [], custom: [] };
        // this.selectionStart = null;
        // this.selectionEnd = null;
    }
    // Update cursor style based on tool
    switch(instrument) {
        case 'gridDraw':
        case 'freeDraw':
        case 'addObject':
            this.canvas.style.cursor = 'crosshair'; break;
        case 'erase':
            this.canvas.style.cursor = 'cell'; break; // Or a custom eraser cursor
        case 'select':
            this.canvas.style.cursor = 'default'; break;
        default:
            this.canvas.style.cursor = 'default';
    }
    console.log("Active instrument set to:", instrument);
    // No history save needed for changing tool
  }

  // --- Utility ---
  _cellId(cellX, cellY) {
    return `${cellX}_${cellY}`;
  }

  _isCellFilled(x, y) {
      const activeLayer = this.layers[this.activeLayerIndex];
      if (!activeLayer) return false;
      const cellId = this._cellId(x, y);
      return activeLayer.objects.has(cellId);
  }

} // End of CanvasManager class
