export class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Pan and zoom.
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    // Cell size (modifiable via HUD).
    this.baseCellSize = 32;
    this.currentCellSize = this.baseCellSize;

    // Flags.
    this.isPanning = false;
    this.isDrawing = false;
    this.isSelecting = false;
    this.isMovingSelection = false;
    this.selectionDragStart = null;

    this.activeInstrument = "gridDraw";

    // Layers array.
    this.layers = [];
    this.layers.push({
      name: "Layer 1",
      objects: new Map(),
    });
    this.activeLayerIndex = 0;

    // FreeDraw and custom objects.
    this.freeDrawObjects = new Map();
    this.customObjects = new Map();

    // For period in freeDraw.
    this.lastFreeDrawPosition = null;

    // Default instrument settings.
    this.freeDrawSettings = {
      period: 0,
      size: 1,
      fillColor: "#000000",
      strokeColor: "#000000",
      connectSVG: false,
      // Optionally add a free-draw pattern image here in future.
      image: null,
    };

    this.gridDrawSettings = {
      type: "color", // or "image"
      fillColor: "#a0a0a0",
      borderColor: "#000000",
      image: null, // If set, will be drawn in cell instead of a color fill.
    };

    // For addObject tool.
    this.customObjectImage = null;

    // Selection store.
    this.selectedObjects = {
      grid: [],
      free: [],
      custom: [],
    };

    this.smoothTransition = true;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    this.setupEventListeners();
    this.render();
  }

  // Clear the entire canvas data.
  clearCanvas() {
    // Clear objects in all layers.
    this.layers.forEach((layer) => layer.objects.clear());
    this.freeDrawObjects.clear();
    this.customObjects.clear();
    // Clear selection.
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.render();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.render();
  }

  setupEventListeners() {
    // Zoom with mouse wheel.
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      let zoomAmount = -event.deltaY * 0.001;
      const newScale = this.scale * (1 + zoomAmount);
      if (newScale < 0.1 || newScale > 10) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      this.scale = newScale;
      this.offsetX = mouseX - worldX * this.scale;
      this.offsetY = mouseY - worldY * this.scale;
      this.render();
    });

    // Mouse events.
    this.canvas.addEventListener("mousedown", (event) => {
      if (event.button === 1) {
        this.isPanning = true;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        this.canvas.style.cursor = "grabbing";
      }
      if (event.button === 0) {
        const rect = this.canvas.getBoundingClientRect();
        const worldPos = {
          x: (event.clientX - rect.left - this.offsetX) / this.scale,
          y: (event.clientY - rect.top - this.offsetY) / this.scale,
        };
        if (this.activeInstrument === "select") {
          if (this._inSelectionBounds(worldPos)) {
            this.isMovingSelection = true;
            this.selectionDragStart = worldPos;
          } else {
            this.isSelecting = true;
            this.selectionStart = worldPos;
            this.selectionEnd = worldPos;
          }
        } else {
          this.isDrawing = true;
          this.handleDrawing(worldPos);
        }
      }
    });

    this.canvas.addEventListener("mousemove", (event) => {
      if (this.isPanning) {
        const dx = event.clientX - this.lastPanX;
        const dy = event.clientY - this.lastPanY;
        this.offsetX += dx;
        this.offsetY += dy;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        this.render();
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const worldPos = {
        x: (event.clientX - rect.left - this.offsetX) / this.scale,
        y: (event.clientY - rect.top - this.offsetY) / this.scale,
      };
      if (this.isDrawing) {
        this.handleDrawing(worldPos);
      }
      if (this.isSelecting) {
        this.selectionEnd = worldPos;
        this.render();
      }
      if (this.isMovingSelection && this.selectionDragStart) {
        const dx = worldPos.x - this.selectionDragStart.x;
        const dy = worldPos.y - this.selectionDragStart.y;
        this.moveSelection(dx, dy);
        this.selectionDragStart = worldPos;
        this.render();
      }
    });

    window.addEventListener("mouseup", (event) => {
      if (event.button === 1) {
        this.isPanning = false;
        this.canvas.style.cursor = "default";
      }
      if (event.button === 0) {
        if (this.isDrawing) {
          this.isDrawing = false;
          this.lastFreeDrawPosition = null;
        }
        if (this.isSelecting) {
          this.isSelecting = false;
          this.finalizeSelection();
        }
        if (this.isMovingSelection) {
          this.isMovingSelection = false;
        }
      }
    });
  }

  _inSelectionBounds(worldPos) {
    if (!this.selectionStart || !this.selectionEnd) return false;
    const minX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const minY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);
    return (
      worldPos.x >= minX &&
      worldPos.x <= maxX &&
      worldPos.y >= minY &&
      worldPos.y <= maxY
    );
  }

  handleDrawing(worldPos) {
    const cellX = Math.floor(worldPos.x / this.currentCellSize);
    const cellY = Math.floor(worldPos.y / this.currentCellSize);
    if (this.activeInstrument === "gridDraw") {
      const cellId = this._cellId(cellX, cellY);
      this.layers[this.activeLayerIndex].objects.set(cellId, {
        x: cellX,
        y: cellY,
        type: this.gridDrawSettings.type,
        fillColor: this.gridDrawSettings.fillColor,
        borderColor: this.gridDrawSettings.borderColor,
        image: this.gridDrawSettings.image,
      });
    } else if (this.activeInstrument === "freeDraw") {
      if (this.freeDrawSettings.period > 0 && this.lastFreeDrawPosition) {
        const dx = worldPos.x - this.lastFreeDrawPosition.x;
        const dy = worldPos.y - this.lastFreeDrawPosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.freeDrawSettings.period * this.currentCellSize) {
          return;
        }
      }
      const id = Date.now().toString() + Math.random().toString();
      this.freeDrawObjects.set(id, {
        x: worldPos.x,
        y: worldPos.y,
        type: "freeDraw",
        fillColor: this.freeDrawSettings.fillColor,
        strokeColor: this.freeDrawSettings.strokeColor,
        size: this.freeDrawSettings.size * this.currentCellSize,
        image: this.freeDrawSettings.image, // if an image is set.
      });
      this.lastFreeDrawPosition = worldPos;
      if (this.freeDrawSettings.connectSVG) {
        // Placeholder for connecting paths
      }
    } else if (this.activeInstrument === "erase") {
      const cellId = this._cellId(cellX, cellY);
      this.layers[this.activeLayerIndex].objects.delete(cellId);
      for (let [id, obj] of this.freeDrawObjects) {
        const dx = obj.x - worldPos.x;
        const dy = obj.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < this.currentCellSize / 2) {
          this.freeDrawObjects.delete(id);
        }
      }
      for (let [id, obj] of this.customObjects) {
        const dx = obj.x - worldPos.x;
        const dy = obj.y - worldPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < this.currentCellSize) {
          this.customObjects.delete(id);
        }
      }
    } else if (this.activeInstrument === "addObject") {
      const id = Date.now().toString() + Math.random().toString();
      this.customObjects.set(id, {
        x: worldPos.x,
        y: worldPos.y,
        width: this.currentCellSize * 2,
        height: this.currentCellSize * 2,
        rotation: 0,
        image: this.customObjectImage,
      });
    }
    this.render();
  }

  finalizeSelection() {
    this.selectedObjects = { grid: [], free: [], custom: [] };
    if (!this.selectionStart || !this.selectionEnd) return;
    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);
    for (let [cellId, cell] of this.layers[this.activeLayerIndex].objects) {
      const cellPx = cell.x * this.currentCellSize;
      const cellPy = cell.y * this.currentCellSize;
      if (cellPx >= startX && cellPx < endX && cellPy >= startY && cellPy < endY) {
        this.selectedObjects.grid.push(cellId);
      }
    }
    for (let [id, obj] of this.freeDrawObjects) {
      if (obj.x >= startX && obj.x < endX && obj.y >= startY && obj.y < endY)
        this.selectedObjects.free.push(id);
    }
    for (let [id, obj] of this.customObjects) {
      if (
        obj.x - obj.width / 2 >= startX &&
        obj.x + obj.width / 2 < endX &&
        obj.y - obj.height / 2 >= startY &&
        obj.y + obj.height / 2 < endY
      )
        this.selectedObjects.custom.push(id);
    }
    // After an operation, we could clear the selection now.
    this.render();
  }

  moveSelection(dx, dy) {
    this.selectedObjects.grid.forEach((cellId) => {
      let cell = this.layers[this.activeLayerIndex].objects.get(cellId);
      if (cell) {
        this.layers[this.activeLayerIndex].objects.delete(cellId);
        cell.x += dx / this.currentCellSize;
        cell.y += dy / this.currentCellSize;
        const newId = this._cellId(cell.x, cell.y);
        this.layers[this.activeLayerIndex].objects.set(newId, cell);
      }
    });
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) {
        obj.x += dx;
        obj.y += dy;
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        obj.x += dx;
        obj.y += dy;
      }
    });
  }

  rotateSelection(deltaDegrees) {
    const delta = (deltaDegrees * Math.PI) / 180;
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        obj.rotation += delta;
      }
    });
    // Apply immediate update and then clear selection.
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.render();
  }

  resizeSelection(scaleFactor) {
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) {
        obj.size *= scaleFactor;
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        obj.width *= scaleFactor;
        obj.height *= scaleFactor;
      }
    });
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.render();
  }

  deleteSelection() {
    this.selectedObjects.grid.forEach((cellId) => {
      this.layers[this.activeLayerIndex].objects.delete(cellId);
    });
    this.selectedObjects.free.forEach((id) => {
      this.freeDrawObjects.delete(id);
    });
    this.selectedObjects.custom.forEach((id) => {
      this.customObjects.delete(id);
    });
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.render();
  }

  _cellId(cellX, cellY) {
    return `${cellX}_${cellY}`;
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    this.drawGrid();
    this.layers.forEach((layer) => {
      layer.objects.forEach((cell) => {
        this.drawGridCell(cell);
      });
    });
    this.freeDrawObjects.forEach((obj) => {
      this.drawFreeDrawObject(obj);
    });
    this.customObjects.forEach((obj) => {
      this.drawCustomObject(obj);
    });
    if (this.isSelecting && this.selectionStart && this.selectionEnd) {
      this.drawSelectionRect();
    }
    this.drawSelectionHighlights();
    this.ctx.restore();
  }

  drawGrid() {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.canvas.width, this.canvas.height);
    const startX = Math.floor(topLeft.x / this.currentCellSize) - 1;
    const startY = Math.floor(topLeft.y / this.currentCellSize) - 1;
    const endX = Math.ceil(bottomRight.x / this.currentCellSize) + 1;
    const endY = Math.ceil(bottomRight.y / this.currentCellSize) + 1;
    this.ctx.strokeStyle = "#e0e0e0";
    this.ctx.lineWidth = 1 / this.scale;
    for (let i = startX; i <= endX; i++) {
      let x = i * this.currentCellSize;
      this.ctx.beginPath();
      this.ctx.moveTo(x, startY * this.currentCellSize);
      this.ctx.lineTo(x, endY * this.currentCellSize);
      this.ctx.stroke();
    }
    for (let j = startY; j <= endY; j++) {
      let y = j * this.currentCellSize;
      this.ctx.beginPath();
      this.ctx.moveTo(startX * this.currentCellSize, y);
      this.ctx.lineTo(endX * this.currentCellSize, y);
      this.ctx.stroke();
    }
  }

  screenToWorld(x, y) {
    return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
  }

  drawGridCell(cell) {
    const x = cell.x * this.currentCellSize;
    const y = cell.y * this.currentCellSize;
    if (cell.type === "color") {
      this.ctx.fillStyle = cell.fillColor;
      this.ctx.fillRect(x, y, this.currentCellSize, this.currentCellSize);
    }
    if (cell.type === "image" && cell.image) {
      this.ctx.drawImage(
        cell.image,
        x,
        y,
        this.currentCellSize,
        this.currentCellSize
      );
    }
    this.ctx.strokeStyle = cell.borderColor;
    this.ctx.strokeRect(x, y, this.currentCellSize, this.currentCellSize);
  }

  drawFreeDrawObject(obj) {
    if (obj.image) {
      // If an image pattern is provided.
      this.ctx.drawImage(
        obj.image,
        obj.x - obj.size / 2,
        obj.y - obj.size / 2,
        obj.size,
        obj.size
      );
    } else {
      this.ctx.beginPath();
      this.ctx.arc(obj.x, obj.y, obj.size / 2, 0, 2 * Math.PI);
      this.ctx.fillStyle = obj.fillColor;
      this.ctx.fill();
      this.ctx.strokeStyle = obj.strokeColor;
      this.ctx.stroke();
    }
  }

  drawCustomObject(obj) {
    this.ctx.save();
    this.ctx.translate(obj.x, obj.y);
    this.ctx.rotate(obj.rotation);
    if (obj.image) {
      this.ctx.drawImage(
        obj.image,
        -obj.width / 2,
        -obj.height / 2,
        obj.width,
        obj.height
      );
    } else {
      this.ctx.fillStyle = "#ff0000";
      this.ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
    }
    this.ctx.restore();
  }

  drawSelectionRect() {
    const start = this.selectionStart;
    const end = this.selectionEnd;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    this.ctx.save();
    this.ctx.strokeStyle = "#0000ff";
    this.ctx.lineWidth = 2 / this.scale;
    this.ctx.setLineDash([5 / this.scale, 3 / this.scale]);
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.restore();
  }

  drawSelectionHighlights() {
    this.ctx.save();
    this.ctx.strokeStyle = "#ff0000";
    this.ctx.lineWidth = 2 / this.scale;
    this.selectedObjects.grid.forEach((cellId) => {
      const parts = cellId.split("_");
      const cellX = parseInt(parts[0], 10);
      const cellY = parseInt(parts[1], 10);
      const x = cellX * this.currentCellSize;
      const y = cellY * this.currentCellSize;
      this.ctx.strokeRect(x, y, this.currentCellSize, this.currentCellSize);
    });
    this.selectedObjects.free.forEach((id) => {
      const obj = this.freeDrawObjects.get(id);
      if (obj) {
        this.ctx.beginPath();
        this.ctx.arc(obj.x, obj.y, obj.size / 2 + 2 / this.scale, 0, 2 * Math.PI);
        this.ctx.stroke();
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      const obj = this.customObjects.get(id);
      if (obj) {
        this.ctx.strokeRect(
          obj.x - obj.width / 2,
          obj.y - obj.height / 2,
          obj.width,
          obj.height
        );
      }
    });
    this.ctx.restore();
  }

  // Returns an object with {minX, minY, maxX, maxY} covering all drawn elements.
  getBoundingBox() {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    // Grid-drawn cells.
    this.layers.forEach((layer) => {
      layer.objects.forEach((cell) => {
        let x = cell.x * this.currentCellSize;
        let y = cell.y * this.currentCellSize;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + this.currentCellSize);
        maxY = Math.max(maxY, y + this.currentCellSize);
      });
    });
    // FreeDraw.
    this.freeDrawObjects.forEach((obj) => {
      minX = Math.min(minX, obj.x - obj.size / 2);
      minY = Math.min(minY, obj.y - obj.size / 2);
      maxX = Math.max(maxX, obj.x + obj.size / 2);
      maxY = Math.max(maxY, obj.y + obj.size / 2);
    });
    // Custom Objects.
    this.customObjects.forEach((obj) => {
      minX = Math.min(minX, obj.x - obj.width / 2);
      minY = Math.min(minY, obj.y - obj.height / 2);
      maxX = Math.max(maxX, obj.x + obj.width / 2);
      maxY = Math.max(maxY, obj.y + obj.height / 2);
    });
    // If nothing was drawn:
    if (minX === Infinity) {
      minX = minY = 0;
      maxX = this.canvas.width;
      maxY = this.canvas.height;
    }
    return { minX, minY, maxX, maxY };
  }

  getMapData() {
    return {
      layers: this.layers.map((layer) => ({
        name: layer.name,
        objects: Array.from(layer.objects.entries()),
      })),
      freeDrawObjects: Array.from(this.freeDrawObjects.entries()),
      customObjects: Array.from(this.customObjects.entries()),
      settings: {
        cellSize: this.currentCellSize,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
        activeLayerIndex: this.activeLayerIndex,
      },
    };
  }

  loadMapData(data) {
    this.layers = [];
    if (data.layers) {
      data.layers.forEach((layerData) => {
        this.layers.push({
          name: layerData.name,
          objects: new Map(layerData.objects),
        });
      });
    } else {
      this.layers.push({ name: "Layer 1", objects: new Map() });
    }
    this.freeDrawObjects = new Map(data.freeDrawObjects || []);
    this.customObjects = new Map(data.customObjects || []);
    if (data.settings) {
      this.currentCellSize = data.settings.cellSize;
      this.offsetX = data.settings.offsetX;
      this.offsetY = data.settings.offsetY;
      this.scale = data.settings.scale;
      this.activeLayerIndex = data.settings.activeLayerIndex || 0;
    }
    this.render();
  }

  // Layer management.
  setActiveLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      this.activeLayerIndex = index;
      this.render();
    }
  }

  addLayer() {
    const newLayer = {
      name: "Layer " + (this.layers.length + 1),
      objects: new Map(),
    };
    this.layers.push(newLayer);
    this.activeLayerIndex = this.layers.length - 1;
    this.render();
  }

  removeActiveLayer() {
    if (this.layers.length > 1) {
      this.layers.splice(this.activeLayerIndex, 1);
      this.activeLayerIndex = Math.max(0, this.activeLayerIndex - 1);
      this.render();
    } else {
      alert("At least one layer must remain.");
    }
  }
  
  setActiveInstrument(instrument) {
    this.activeInstrument = instrument;
    console.log("Active instrument set to:", instrument);
  }
}
