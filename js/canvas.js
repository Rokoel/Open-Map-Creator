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
      visible: true, // Currently not used, preparation for future layer management
    });
    this.activeLayerIndex = 0;

    // FreeDraw objects and custom objects
    this.freeDrawObjects = new Map();
    this.customObjects = new Map();

    // To support freeDraw period option
    this.lastFreeDrawPosition = null;

    // --- Global Settings (these settings do not belong to layers) ---
    this.emptyCellSettings = {
      fillColor: constants.defaultEmptyCellFillColor,
      borderColor: constants.defaultEmptyCellBorderColor,
      pattern: null,
      patternSrc: null,
    };

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
  saveHistory() {
    const state = {
      layers: this.layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible !== undefined ? layer.visible : true, // Save visibility
        gridShadowOptions: layer.gridShadowOptions
          ? { ...layer.gridShadowOptions } // Copy options if present
          : { ...constants.defaultGridShadowOptions }, // Fallback to defaults if missing
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
            copyObj.image = copyObj.image.src;
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
            copyObj.image = copyObj.imageSrc;
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
          pattern: this.emptyCellSettings.patternSrc,
        },
        gridBorderOptions: {
          ...this.gridBorderOptions,
          image: this.gridBorderOptions.imageSrc,
        },
        gridImageList: this.gridImageList, // Save the list of srcs
        gridDrawSettings: {
          ...this.gridDrawSettings,
          image: this.gridDrawSettings.imageSrc,
        },
        freeDrawSettings: {
          ...this.freeDrawSettings,
          image: this.freeDrawSettings.image?.src || null,
        },
        customObjectImageSrc: this.customObjectImageSrc,
      },
    };
    // If history pointer isn’t at the end, truncate the redo branch
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(JSON.stringify(state)); // Store as JSON string
    this.historyIndex++;

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
    this.layers = state.layers.map((layerData) => {
      let newLayer = {
        name: layerData.name || "Unnamed Layer",
        visible: layerData.visible !== undefined ? layerData.visible : true,
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
              // TODO: Add onload/onerror handlers if needed for robustness during load
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
      })
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
      })
    );

    // Load settings
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
        this.loadStateData(state);
        this.render();
    } catch (e) {
        console.error("Error parsing history state:", e);
    }
  }

  /**
   * Undoes the last action by loading the previous state from history.
   */
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadHistoryState(this.history[this.historyIndex]);
    }
  }

  /**
   * Redoes the last undone action by loading the next state from history.
   */
  redo() {
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
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
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
    }, { passive: false }); // Need passive: false to preventDefault

    // Combined mouse events for drawing, panning, and selection.
    // TODO: add right-click functionality
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
      // Panning end
      if (event.button === 1 && this.isPanning) { // Middle mouse button
        this.isPanning = false;
        this.canvas.style.cursor = "default";
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
    // TODO: add right-click context menu
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
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

    if (!activeLayerObjects && this.activeInstrument === 'gridDraw') { // currently only gridDraw is layer-dependent
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
        
        if (JSON.stringify(currentCell) !== JSON.stringify(newCellData)) { // If cells are not identical (if they are, we do nothing)
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
          const objWidth = this.customObjectImage.naturalWidth * (this.currentCellSize / constants.baseCellSize); // Scale based on image size scaled by current cell size.
          const objHeight = this.customObjectImage.naturalHeight * (this.currentCellSize / constants.baseCellSize);

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
      // Check Custom Objects first (faster, because they're usually on top) - reverse order for top-most
      const customIds = Array.from(this.customObjects.keys()).reverse();
      for (const id of customIds) {
          const obj = this.customObjects.get(id);
          // TODO: Implement rotated point-in-rect check (should we even bother?)
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
          case 'grid': return this.selectedObjects.grid.includes(objInfo.id);
          case 'free': return this.selectedObjects.free.includes(objInfo.id);
          case 'custom': return this.selectedObjects.custom.includes(objInfo.id);
          default: return false;
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
   * - Clears previous selections unless shift-click functionality is implemented.
   * - Calls `window.hudInstance.loadInstrumentSettings` to update the HUD with the active instrument settings.
   */
  finalizeSelection() {
    // TODO: Implement shift-click add to selection
    // If selectionStart and selectionEnd are the same (a click, not a drag)
    if (this.selectionStart && this.selectionEnd &&
        this.selectionStart.x === this.selectionEnd.x &&
        this.selectionStart.y === this.selectionEnd.y)
    {
        const clickedObject = this.getObjectAtWorldPos(this.selectionStart);
        if (clickedObject) { // we have chosen an object
            this.selectedObjects = { grid: [], free: [], custom: [] }; // Clear previous (maybe for shift-click we shouldn't?)
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
        this.selectedObjects = { grid: [], free: [], custom: [] }; // Clear previous (maybe for shift-click we shouldn't?)

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
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
  }

  /**
   * Moves the currently selected objects on the canvas by the specified offsets in world coordinates.
   * 
   * This method updates the positions of free draw objects and custom objects that are currently selected.
   * Grid cells are not supported for movement.
   * 
   * @param {number} dxWorld - The horizontal offset in world coordinates to move the selected objects.
   * @param {number} dyWorld - The vertical offset in world coordinates to move the selected objects.
   */
  moveSelection(dxWorld, dyWorld) {
    // We don't currently support moving grid cells

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

    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
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
  getSelectionCenter() {
      let count = 0; // Total number of selected objects
      let sumX = 0; // Total x-coordinate of selected objects
      let sumY = 0; // Total y-coordinate of selected objects

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

      if (count === 0) { // No selection or empty selection
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
   * - Free draw objects are repositioned without modifying any inherent rotation property.
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
    if (!this.copiedSelection) return;

    const activeLayerObjects = this.layers[this.activeLayerIndex]?.objects;
    if (!activeLayerObjects) return; // Cannot paste grid cells without active layer

    const mouseWorldPos = {x: this.mouseX, y: this.mouseY};

    // Calculate offset for grid cells
    const gridOffsetX = Math.floor(mouseWorldPos.x / this.currentCellSize);
    const gridOffsetY = Math.floor(mouseWorldPos.y / this.currentCellSize);

    // Calculate offset for free draw and custom objects
    const freeCustomOffsetX = mouseWorldPos.x;
    const freeCustomOffsetY = mouseWorldPos.y;

    // Currently we treat each selection type separately (each type is being paste into the same position)
    // Paste Grid Cells
    this.copiedSelection.grid.forEach(cellData => {
      let newCell = { ...cellData };
      newCell.x = gridOffsetX + (newCell.x - Math.min(...this.copiedSelection.grid.map(c => c.x)));
      newCell.y = gridOffsetY + (newCell.y - Math.min(...this.copiedSelection.grid.map(c => c.y)));
      const newCellId = this._cellId(newCell.x, newCell.y);

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
      newObj.x = freeCustomOffsetX + (newObj.x - Math.min(...this.copiedSelection.free.map(o => o.x)));
      newObj.y = freeCustomOffsetY + (newObj.y - Math.min(...this.copiedSelection.free.map(o => o.y)));
      const newId = Date.now().toString() + Math.random().toString(36).substring(2);

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
      newObj.x = freeCustomOffsetX + (newObj.x - Math.min(...this.copiedSelection.custom.map(o => o.x)));
      newObj.y = freeCustomOffsetY + (newObj.y - Math.min(...this.copiedSelection.custom.map(o => o.y)));
      const newId = Date.now().toString() + Math.random().toString(36).substring(2);

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
    window.hudInstance.loadInstrumentSettings(this.activeInstrument);
    this.saveHistory();
  }

  /**
   * Requests a re-render of the canvas.
   * This method uses `requestAnimationFrame` for smoother rendering.
   */
  render() {
    // Request animation frame for smoother rendering
    requestAnimationFrame(() => {
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

    // Draw the base grid (empty cells) - considers all layers for emptiness
    this.drawGrid(ctx, this.currentCellSize, viewBounds);

    // Draw Layer Content (Cells, Shadows, Borders)
    this.layers.forEach((layer, index) => {
      if (!layer.visible) return; // Skip rendering if layer is not visible

      const layerObjects = layer.objects;
      const layerShadowOptions = layer.gridShadowOptions;

      // Draw Shadows for currently drawn layer (if enabled)
      if (layerShadowOptions && layerShadowOptions.enabled && layerObjects.size > 0) {
        // Pass the specific layer's objects and options
        this.drawGridShadows(ctx, this.currentCellSize, viewBounds, layerObjects, layerShadowOptions);
      }

      // Draw Borders if enabled (still global for now)
      if (this.gridBorderOptions.enabled && this.gridBorderOptions.image) {
         // Pass the specific layer's objects to check against
         this.drawGridBorders(ctx, this.currentCellSize, viewBounds, layerObjects);
      }

      // Draw Grid Cells for currently drawn layer
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
    });

    // Draw Global Objects (Free Draw, Custom)
    // These are drawn *after* all layers
    // TODO: make them layer-dependent
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

    // Draw Selection
    if (this.isSelecting && this.selectionStart && this.selectionEnd) {
      this.drawSelectionRect();
    }
    this.drawSelectionHighlights(); // Highlights based on global selection state

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
    if (!shadowOptions || !shadowOptions.enabled || !layerObjects || layerObjects.size === 0) {
        return; // Exit if shadows disabled for this layer or layer is empty
    }

    const angleRad = (shadowOptions.angle * Math.PI) / 180;
    const offsetPixels = shadowOptions.offset * cellSize;
    const baseShadowColor = shadowOptions.color.substring(0, 7); // Get #RRGGBB
    const shadowAlpha = parseInt(shadowOptions.color.substring(7, 9) || '80', 16) / 255; // Get alpha (default 0.5 if missing)

    const vo = { x: Math.cos(angleRad) * offsetPixels, y: Math.sin(angleRad) * offsetPixels }; // Vector offset
    if (Math.abs(vo.x) < 1e-6 && Math.abs(vo.y) < 1e-6) return; // No offset, no shadow

    // Create Temporary Offscreen Canvas for Shadows
    // Calculate pixel dimensions of the view
    const viewWidthPixels = Math.max(1, Math.ceil((viewBounds.maxX - viewBounds.minX) * this.scale));
    const viewHeightPixels = Math.max(1, Math.ceil((viewBounds.maxY - viewBounds.minY) * this.scale));

    // TODO: use a static or pooled canvas for performance
    // Create offscreen canvas
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = viewWidthPixels;
    shadowCanvas.height = viewHeightPixels;
    const shadowCtx = shadowCanvas.getContext('2d', { alpha: true }); // Ensure alpha channel

    if (!shadowCtx) {
        console.error("Failed to create shadow buffer context");
        return;
    }

    // Prepare Shadow Context Transform
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

    // Draw Shadow Fragments to Offscreen Buffer
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

        // Check 8 neighbors (currently, we assume 1-cell shadows or less).
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

    // Draw Shadow Buffer to Main Canvas
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

  /**
   * Basically drawGridShadows() but for the PDF export.
   * Draws shadows for all grid cells based on the provided layer objects and shadow options.
   * This function creates an offscreen canvas to render shadows and then draws the result
   * onto the main context. Shadows are calculated based on the logical positions of cells
   * and their neighbors. It currently supports shadows of 1-cell size or less.
   *
   * @param {CanvasRenderingContext2D} ctx - The rendering context of the target canvas.
   * @param {number} logicalCellSize - The size of a single logical grid cell in pixels.
   * @param {Map<string, Object>} layerObjects - A map of objects in the layer, keyed by their unique cell IDs.
   * @param {Object} shadowOptions - Configuration options for the shadows.
   * @param {boolean} shadowOptions.enabled - Whether shadows are enabled for this layer.
   * @param {number} shadowOptions.angle - The angle of the shadow in degrees (0 = right, 90 = down).
   * @param {number} shadowOptions.offset - The shadow offset as a multiple of the cell size.
   * @param {string} shadowOptions.color - The shadow color in #RRGGBBAA format (e.g., "#00000080").
   */
  drawAllGridShadows(ctx, logicalCellSize, layerObjects, shadowOptions) {
    // Operates on passed layerObjects and shadowOptions
    if (!shadowOptions || !shadowOptions.enabled || !layerObjects || layerObjects.size === 0) return;

    const angleRad = (shadowOptions.angle * Math.PI) / 180;
    const offsetLogical = shadowOptions.offset * logicalCellSize;
    const baseShadowColor = shadowOptions.color.substring(0, 7); // Get #RRGGBB
    const shadowAlpha = parseInt(shadowOptions.color.substring(7, 9) || '80', 16) / 255; // Get alpha

    const vo = { x: Math.cos(angleRad) * offsetLogical, y: Math.sin(angleRad) * offsetLogical };
    if (Math.abs(vo.x) < 1e-6 && Math.abs(vo.y) < 1e-6) return; // No offset, no shadow

    // Create Temporary Offscreen Canvas for Shadows
    // Match the target PDF context's canvas size
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = ctx.canvas.width;
    shadowCanvas.height = ctx.canvas.height;
    const shadowCtx = shadowCanvas.getContext('2d', { alpha: true });

    if (!shadowCtx) {
        console.error("PDF Export: Failed to create shadow buffer context");
        return;
    }

    // Prepare Shadow Context Transform
    // Make shadow context's coordinate system identical to the main PDF context's
    const transform = ctx.getTransform();
    shadowCtx.setTransform(transform);
    shadowCtx.fillStyle = baseShadowColor; // Opaque color

    // Draw Shadow Fragments to Offscreen Buffer (Logical Coords)
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

    // Draw Shadow Buffer to Main PDF Context
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

  /**
   * Draws grid borders around filled cells of the specified layer on a canvas.
   * Borders are drawn adjacent to empty neighboring cells within the view bounds.
   * 
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context used for drawing.
   * @param {number} cellSize - The size of each grid cell in pixels.
   * @param {Object} viewBounds - The visible bounds of the canvas, containing `minX`, `minY`, `maxX`, and `maxY` properties.
   * @param {Set<Object>} layerObjects - A set of objects representing filled cells in the current layer. Each object should have `x` and `y` properties.
   */
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

  /**
   * Draws a PDF background and grid on a canvas context within a specified bounding box.
   *
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context to draw on.
   * @param {Object} bbox - The bounding box defining the area to draw.
   * @param {number} bbox.minX - The minimum X-coordinate of the bounding box.
   * @param {number} bbox.minY - The minimum Y-coordinate of the bounding box.
   * @param {number} bbox.maxX - The maximum X-coordinate of the bounding box.
   * @param {number} bbox.maxY - The maximum Y-coordinate of the bounding box.
   * @param {number} bbox.width - The width of the bounding box.
   * @param {number} bbox.height - The height of the bounding box.

   * This function performs the following:
   * 1. Fills the bounding box area with a background color.
   * 2. Optionally overlays a repeating image pattern if provided.
   * 3. Draws a grid of vertical and horizontal lines within the bounding box.
   *
   * The grid lines are styled using the `emptyCellSettings.borderColor` or a default value.
   * The background fill and pattern are styled using `emptyCellSettings.fillColor` and
   * `emptyCellSettings.pattern` respectively.
   */
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

    // Background Fill
    ctx.fillStyle = emptyFill;
    ctx.fillRect(startX, startY, width, height);

    // Background Pattern
    if (emptyPattern && emptyPattern.complete && emptyPattern.naturalWidth > 0) {
        ctx.save();
        // Clip to the bounding box area before drawing pattern
        ctx.beginPath();
        ctx.rect(startX, startY, width, height);
        ctx.clip();
        try {
            // Create a pattern from the image
            const pattern = ctx.createPattern(emptyPattern, 'repeat');
            if (pattern) {
                ctx.fillStyle = pattern;
                // Apply pattern fill.
                ctx.fillRect(startX, startY, width, height);
            } else {
                 console.error("PDF Export: Failed to create empty cell pattern.");
            }
        } catch (e) {
            console.error("PDF Export: Error drawing empty cell pattern:", e);
        }
        ctx.restore(); // Remove clip
    }

    // Grid Lines
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

  /**
   * Draws all elements on the canvas, including background, grid lines, layers, 
   * grid cells, shadows, borders, free draw objects, and custom objects.
   *
   * @param {CanvasRenderingContext2D} ctx - The rendering context for the canvas.
   * @param {number} exportScale - The scale factor for exporting the canvas. Currently unused.
   *
   * This method performs the following steps:
   * 1. Calculates the logical bounding box of the canvas.
   * 2. Draws the background and grid lines based on logical coordinates.
   * 3. Iterates through each layer to draw its content, including:
   *    - Shadows (if enabled).
   *    - Borders (if enabled).
   *    - Grid cells (color or image-based).
   * 4. Draws global free draw objects, ensuring they are within bounds.
   * 5. Draws custom objects, applying transformations like rotation and scaling.
   */
  drawAll(ctx, exportScale) {
    const bbox = this.getLogicalBoundingBox();
    if (bbox.width <= 0 || bbox.height <= 0) return; // Nothing to draw

    const startX = bbox.minX; const startY = bbox.minY;
    const endX = bbox.maxX; const endY = bbox.maxY;

    // Background and Grid Lines (Logical Coordinates)
    this.drawPdfBackgroundAndGrid(ctx, bbox); // Use helper

    // Draw Layer Content (Cells, Shadows, Borders)
    this.layers.forEach((layer) => {
        // Check layer visibility
        if (!layer.visible) return;

        const layerObjects = layer.objects;
        const layerShadowOptions = layer.gridShadowOptions;
        const logicalCellSize = 1; // Use 1 for logical size

        // Draw Shadows for THIS layer (if enabled)
        if (layerShadowOptions && layerShadowOptions.enabled && layerObjects.size > 0) {
            // Pass the specific layer's objects and options to the PDF shadow function
            this.drawAllGridShadows(ctx, logicalCellSize, layerObjects, layerShadowOptions);
        }

        // Draw Borders (if enabled - still global)
        // If borders become per-layer, move this check inside the loop too
        if (this.gridBorderOptions.enabled && this.gridBorderOptions.image) {
            // Pass the specific layer's objects to check against
            this.drawAllGridBorders(ctx, logicalCellSize, layerObjects);
        }

        // Draw Grid Cells for THIS layer
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
    });

    // Draw Global Objects (Free Draw, Custom)
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

  /**
   * Draws all grid borders for a given layer of objects on the canvas.
   * Borders are drawn only for cells that are adjacent to empty cells in the provided layer.
   * 
   * @param {CanvasRenderingContext2D} ctx - The rendering context of the canvas.
   * @param {number} logicalCellSize - The size of a single logical cell in the grid.
   * @param {Set<Object>} layerObjects - A set of objects representing the filled cells in the layer.
   * Each object in the set should have an `x` and `y` property representing its grid coordinates.
   */
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
      gridShadowOptions: { ...constants.defaultGridShadowOptions }
    };
    this.layers.push(newLayer);
    this.activeLayerIndex = this.layers.length - 1; // Activate the new layer
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
      this.layers.splice(this.activeLayerIndex, 1);
      // Adjust active index if the last layer was removed or index is now out of bounds
      this.activeLayerIndex = Math.min(Math.max(0, this.activeLayerIndex - 1), this.layers.length - 1);
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
  setActiveInstrument(instrument) {
    this.activeInstrument = instrument;
    // Update cursor style based on tool
    switch(instrument) {
        case 'gridDraw':
        case 'freeDraw':
        case 'addObject':
            this.canvas.style.cursor = 'crosshair'; break;
        case 'erase':
            this.canvas.style.cursor = 'cell'; break;
        case 'select':
            this.canvas.style.cursor = 'default'; break;
        default:
            this.canvas.style.cursor = 'default';
    }
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
