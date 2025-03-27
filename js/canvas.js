export class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Pan and zoom settings.
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    // Logical cell size (modifiable via HUD).
    this.baseCellSize = 32;
    this.currentCellSize = this.baseCellSize;

    // Flags.
    this.isPanning = false;
    this.isDrawing = false;
    this.isSelecting = false;
    this.isMovingSelection = false;
    this.selectionDragStart = null;

    this.activeInstrument = "gridDraw";

    // Layers (each layer is an object with a name and a Map of cells).
    this.layers = [];
    this.layers.push({
      name: "Layer 1",
      objects: new Map(),
    });
    this.activeLayerIndex = 0;

    // FreeDraw objects and custom objects.
    this.freeDrawObjects = new Map();
    this.customObjects = new Map();

    // To support freeDraw period.
    this.lastFreeDrawPosition = null;

    // Default settings for instruments.
    this.freeDrawSettings = {
      period: 0, // 0 means continuous drawing.
      size: 1, // Now allows float values; HUD input will have step=0.1.
      fillColor: "#000000",
      strokeColor: "#000000",
      connectSVG: false,
      image: null, // Optional image pattern.
    };

    this.gridDrawSettings = {
      type: "color", // can be "color" or "image"
      fillColor: "#a0a0a0",
      borderColor: "#000000",
      image: null, // If an image is uploaded for a cell pattern.
    };

    this.emptyCellSettings = {
      fillColor: "#ffffff",    // Default white background.
      borderColor: "#e0e0e0",  // Default light gray grid lines.
      pattern: null            // No default pattern.
    };

    // For the addObject tool.
    this.customObjectImage = null;

    // For selection tool: store selected object IDs.
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

  // New method to update the cell size.
  updateCellSize(newSize) {
    this.currentCellSize = newSize;
    this.render();
  }

  // Clear the entire canvas (all layers, freeDraw and custom objects, and selection).
  clearCanvas() {
    this.layers.forEach((layer) => layer.objects.clear());
    this.freeDrawObjects.clear();
    this.customObjects.clear();
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.render();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.render();
  }

  setupEventListeners() {
    // Zooming with the mouse wheel.
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

    // Combined mouse events for drawing, panning, and selection.
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
        image: this.freeDrawSettings.image,
      });
      this.lastFreeDrawPosition = worldPos;
      if (this.freeDrawSettings.connectSVG) {
        // Placeholder for connecting SVG patterns.
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
    // After selection, render the highlights.
    this.render();
    this.selectionStart = null;
    this.selectionEnd = null;
  }

  // Group transformation: compute group center and rotate all freeDraw and custom objects.
  rotateSelection(deltaDegrees) {
    // (Assuming you already compute the group center and rotate each object)
    let pts = [];
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) pts.push({ x: obj.x, y: obj.y });
    });
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) pts.push({ x: obj.x, y: obj.y });
    });
    if (pts.length === 0) return;
    let center = pts.reduce((acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y
    }), { x: 0, y: 0 });
    center.x /= pts.length;
    center.y /= pts.length;
    const rad = (deltaDegrees * Math.PI) / 180;
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) {
        let dx = obj.x - center.x;
        let dy = obj.y - center.y;
        obj.x = center.x + dx * Math.cos(rad) - dy * Math.sin(rad);
        obj.y = center.y + dx * Math.sin(rad) + dy * Math.cos(rad);
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        let dx = obj.x - center.x;
        let dy = obj.y - center.y;
        obj.x = center.x + dx * Math.cos(rad) - dy * Math.sin(rad);
        obj.y = center.y + dx * Math.sin(rad) + dy * Math.cos(rad);
        obj.rotation += rad;
      }
    });
    
    // Clear selection state to allow a fresh new selection.
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
    this.render();
  }
  
  resizeSelection(scaleFactor) {
    let pts = [];
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) pts.push({ x: obj.x, y: obj.y });
    });
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) pts.push({ x: obj.x, y: obj.y });
    });
    if (pts.length === 0) return;
    let center = pts.reduce((acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y
    }), { x: 0, y: 0 });
    center.x /= pts.length;
    center.y /= pts.length;
    
    this.selectedObjects.free.forEach((id) => {
      let obj = this.freeDrawObjects.get(id);
      if (obj) {
        obj.x = center.x + (obj.x - center.x) * scaleFactor;
        obj.y = center.y + (obj.y - center.y) * scaleFactor;
        obj.size *= scaleFactor;
      }
    });
    this.selectedObjects.custom.forEach((id) => {
      let obj = this.customObjects.get(id);
      if (obj) {
        obj.x = center.x + (obj.x - center.x) * scaleFactor;
        obj.y = center.y + (obj.y - center.y) * scaleFactor;
        obj.width *= scaleFactor;
        obj.height *= scaleFactor;
      }
    });
    
    // Clear selection state.
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
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
    
    // Clear selection state.
    this.selectedObjects = { grid: [], free: [], custom: [] };
    this.selectionStart = null;
    this.selectionEnd = null;
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

    // Draw the grid.
    this.drawGrid();
    // Draw grid cells for all layers.
    this.layers.forEach((layer) => {
      layer.objects.forEach((cell) => {
        this.drawGridCell(cell);
      });
    });
    // Draw freeDraw objects.
    this.freeDrawObjects.forEach((obj) => {
      this.drawFreeDrawObject(obj);
    });
    // Draw custom objects.
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
    const bottomRight = this.screenToWorld(
      this.canvas.width,
      this.canvas.height
    );
    const startX = Math.floor(topLeft.x / this.currentCellSize) - 1;
    const startY = Math.floor(topLeft.y / this.currentCellSize) - 1;
    const endX = Math.ceil(bottomRight.x / this.currentCellSize) + 1;
    const endY = Math.ceil(bottomRight.y / this.currentCellSize) + 1;
    this.ctx.strokeStyle = "#e0e0e0";
    this.ctx.lineWidth = 1 / this.scale;
    for (let i = startX; i < endX; i++) {
      for (let j = startY; j < endY; j++) {
        const cellId = this._cellId(i, j);
        // If the active layer does not contain an object for this cell, then fill with empty style.
        if (!this.layers[this.activeLayerIndex].objects.has(cellId)) {
          // Use empty cell settings if they exist.
          if (this.emptyCellSettings) {
            this.ctx.fillStyle = this.emptyCellSettings.fillColor;
            this.ctx.fillRect(
              i * this.currentCellSize,
              j * this.currentCellSize,
              this.currentCellSize,
              this.currentCellSize
            );
            if (this.emptyCellSettings.pattern) {
              this.ctx.drawImage(
                this.emptyCellSettings.pattern,
                i * this.currentCellSize,
                j * this.currentCellSize,
                this.currentCellSize,
                this.currentCellSize
              );
            }
            // Optionally draw the border also.
            this.ctx.strokeStyle = this.emptyCellSettings.borderColor;
            this.ctx.strokeRect(
              i * this.currentCellSize,
              j * this.currentCellSize,
              this.currentCellSize,
              this.currentCellSize
            );
          }
        }
      }
    }
  }

  drawAll(ctx) {
    // 1. Retrieve the logical bounding box.
    const bbox = this.getLogicalBoundingBox();
    // Define grid range (in logical cell coordinates)
    const startX = Math.floor(bbox.minX);
    const startY = Math.floor(bbox.minY);
    const endX = Math.ceil(bbox.maxX);
    const endY = Math.ceil(bbox.maxY);
  
    // 2. Determine empty cell appearance.
    const emptyFill = (this.emptyCellSettings && this.emptyCellSettings.fillColor) || "#ffffff";
    const emptyBorder = (this.emptyCellSettings && this.emptyCellSettings.borderColor) || "#e0e0e0";
    
    // 3. Pre-fill the entire export area with the empty fill color.
    ctx.fillStyle = emptyFill;
    ctx.fillRect(startX, startY, endX - startX, endY - startY);
    
    // 4. Draw grid lines over the entire area using the empty border color.
    ctx.strokeStyle = emptyBorder;
    ctx.lineWidth = 0.05; // Adjust line width as needed.
    for (let x = startX; x <= endX; x++) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y++) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
    
    // 5. Draw grid-drawn cells (for all layers if desired, or active layer only).
    // Here we draw every grid cell that contains content—overwriting the empty appearance.
    this.layers.forEach((layer) => {
      layer.objects.forEach((cell) => {
        // Use cell.x and cell.y as logical coordinates.
        const x = cell.x;
        const y = cell.y;
        if (cell.type === "color") {
          ctx.fillStyle = cell.fillColor;
          ctx.fillRect(x, y, 1, 1);
        } else if (cell.type === "image" && cell.image) {
          // If the cell contains an image (for instance, an SVG or PNG), draw it scaled to 1x1 cell.
          ctx.drawImage(cell.image, x, y, 1, 1);
        }
        ctx.strokeStyle = cell.borderColor;
        ctx.strokeRect(x, y, 1, 1);
      });
    });
    
    // 6. Draw free-drawn objects.
    this.freeDrawObjects.forEach((obj) => {
      // Convert on-screen pixel coordinates to logical units:
      const lx = obj.x / this.currentCellSize;
      const ly = obj.y / this.currentCellSize;
      const lsize = obj.size / this.currentCellSize;
      if (obj.image) {
        ctx.drawImage(obj.image, lx - lsize / 2, ly - lsize / 2, lsize, lsize);
      } else {
        ctx.beginPath();
        ctx.arc(lx, ly, lsize / 2, 0, 2 * Math.PI);
        ctx.fillStyle = obj.fillColor;
        ctx.fill();
        ctx.strokeStyle = obj.strokeColor;
        ctx.stroke();
      }
    });
    
    // 7. Draw custom objects.
    this.customObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize;
      const ly = obj.y / this.currentCellSize;
      const lwidth = obj.width / this.currentCellSize;
      const lheight = obj.height / this.currentCellSize;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(obj.rotation);
      if (obj.image) {
        ctx.drawImage(obj.image, -lwidth / 2, -lheight / 2, lwidth, lheight);
      } else {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(-lwidth/2, -lheight/2, lwidth, lheight);
      }
      ctx.restore();
    });
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
      // (If the image is an SVG, you could (in future) manipulate its fill/stroke.)
    }
    this.ctx.strokeStyle = cell.borderColor;
    this.ctx.strokeRect(x, y, this.currentCellSize, this.currentCellSize);
  }

  drawFreeDrawObject(obj) {
    if (obj.image) {
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

  // Computes the tightest bounding box containing all drawn content.
  getLogicalBoundingBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
    // Grid cells – they’re already defined in logical units.
    this.layers.forEach((layer) => {
      layer.objects.forEach((cell) => {
        // Assume cell.x and cell.y are grid indices.
        minX = Math.min(minX, cell.x);
        minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x + 1);
        maxY = Math.max(maxY, cell.y + 1);
      });
    });
  
    // FreeDraw objects – convert canvas coordinates to logical units.
    this.freeDrawObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize;
      const ly = obj.y / this.currentCellSize;
      const lw = obj.size / this.currentCellSize;
      minX = Math.min(minX, lx);
      minY = Math.min(minY, ly);
      maxX = Math.max(maxX, lx);
      maxY = Math.max(maxY, ly);
    });
  
    // Custom objects.
    this.customObjects.forEach((obj) => {
      const lx = obj.x / this.currentCellSize;
      const ly = obj.y / this.currentCellSize;
      const lw = obj.width / this.currentCellSize;
      const lh = obj.height / this.currentCellSize;
      minX = Math.min(minX, lx);
      minY = Math.min(minY, ly);
      maxX = Math.max(maxX, lx + lw);
      maxY = Math.max(maxY, ly + lh);
    });
  
    // If nothing was drawn, return a small default area.
    if (minX === Infinity) {
      minX = 0; minY = 0; maxX = 10; maxY = 10;
    }
    return { minX, minY, maxX, maxY };
  }

  getMapData() {
    return {
      layers: this.layers.map((layer) => ({
        name: layer.name,
        objects: Array.from(layer.objects.entries()).map(([key, cell]) => {
          if (cell.type === "image" && cell.image instanceof Image) {
            cell = { ...cell, image: cell.image.src };
          }
          return [key, cell];
        }),
      })),
      freeDrawObjects: Array.from(this.freeDrawObjects.entries()).map(
        ([id, obj]) => {
          if (obj.image instanceof Image) {
            obj = { ...obj, image: obj.image.src };
          }
          return [id, obj];
        }
      ),
      customObjects: Array.from(this.customObjects.entries()).map(([id, obj]) => {
        if (obj.image instanceof Image) {
          obj = { ...obj, image: obj.image.src };
        }
        return [id, obj];
      }),
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
        const newLayer = {
          name: layerData.name,
          objects: new Map(layerData.objects),
        };
        // Recreate Image objects for grid cells.
        newLayer.objects.forEach((cell, key) => {
          if (cell.type === "image" && cell.image && typeof cell.image === "string") {
            let img = new Image();
            img.src = cell.image;
            cell.image = img;
          }
        });
        this.layers.push(newLayer);
      });
    } else {
      this.layers.push({ name: "Layer 1", objects: new Map() });
    }
    this.freeDrawObjects = new Map(data.freeDrawObjects || []);
    this.freeDrawObjects.forEach((obj, key) => {
      if (obj.image && typeof obj.image === "string") {
        let img = new Image();
        img.src = obj.image;
        obj.image = img;
      }
    });
    this.customObjects = new Map(data.customObjects || []);
    this.customObjects.forEach((obj, key) => {
      if (obj.image && typeof obj.image === "string") {
        let img = new Image();
        img.src = obj.image;
        obj.image = img;
      }
    });
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
