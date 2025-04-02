export class HUD {
  constructor(canvasManager, storageManager) {
    this.canvasManager = canvasManager;
    this.storageManager = storageManager;
    this.setupToolbar();
    this.setupCanvasSettings();
    this.setupLayerControls();
    this.setupEmptyCellSettings();
  }

  setupToolbar() {
    const toolbar = document.getElementById("toolbar");
    toolbar.addEventListener("click", (e) => {
      if (e.target.tagName.toLowerCase() === "button") {
        const instrument = e.target.getAttribute("data-instrument");
        this.canvasManager.setActiveInstrument(instrument);
        this.loadInstrumentSettings(instrument);
      }
    });
  }

  setupEmptyCellSettings() {
    const emptyFill = document.getElementById("emptyFillColor");
    const emptyBorder = document.getElementById("emptyBorderColor");
    const emptyPattern = document.getElementById("emptyPattern");

    this.canvasManager.emptyCellSettings = {
      fillColor: emptyFill.value,
      borderColor: emptyBorder.value,
      pattern: null,
    };

    emptyFill.addEventListener("input", (e) => {
      this.canvasManager.emptyCellSettings.fillColor = e.target.value;
      this.canvasManager.render();
    });
    emptyBorder.addEventListener("input", (e) => {
      this.canvasManager.emptyCellSettings.borderColor = e.target.value;
      this.canvasManager.render();
    });
    emptyPattern.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        let img = new Image();
        img.onload = () => {
          this.canvasManager.emptyCellSettings.pattern = img;
          this.canvasManager.render();
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  setupCanvasSettings() {
    const cellSizeInput = document.getElementById("cellSize");
    cellSizeInput.addEventListener("input", (e) => {
      const newSize = parseInt(e.target.value, 10);
      this.canvasManager.updateCellSize(newSize);
    });
  }

  setupLayerControls() {
    this.layerList = document.getElementById("layerList");
    document.getElementById("addLayer").addEventListener("click", () => {
      this.canvasManager.addLayer();
      this.updateLayerList();
    });
    document.getElementById("removeLayer").addEventListener("click", () => {
      this.canvasManager.removeActiveLayer();
      this.updateLayerList();
    });
    this.updateLayerList();
  }

  updateLayerList() {
    this.layerList.innerHTML = "";
    this.canvasManager.layers.forEach((layer, index) => {
      const li = document.createElement("li");
      li.textContent = layer.name;
      li.style.cursor = "pointer";
      if (index === this.canvasManager.activeLayerIndex) {
        li.classList.add("active");
      }
      li.addEventListener("click", () => {
        this.canvasManager.setActiveLayer(index);
        this.updateLayerList();
      });
      this.layerList.appendChild(li);
    });
  }

  loadInstrumentSettings(instrument) {
    const instrSettings = document.getElementById("instrumentSettings");
    instrSettings.innerHTML = "";
    if (instrument === "gridDraw") {
      const fillColorLabel = document.createElement("label");
      fillColorLabel.textContent = "Fill Color: ";
      const fillColorInput = document.createElement("input");
      fillColorInput.type = "color";
      fillColorInput.value = this.canvasManager.gridDrawSettings.fillColor;
      fillColorInput.addEventListener("input", (e) => {
        this.canvasManager.gridDrawSettings.fillColor = e.target.value;
      });
      instrSettings.appendChild(fillColorLabel);
      instrSettings.appendChild(fillColorInput);
      instrSettings.appendChild(document.createElement("br"));
      const imageListContainer = document.createElement("div");
      imageListContainer.id = "gridImageList";
      // If you have stored images, iterate and create thumbnail buttons
      if (this.canvasManager.gridImageList && this.canvasManager.gridImageList.length) {
        this.canvasManager.gridImageList.forEach((imgSrc, idx) => {
          const thumb = document.createElement("img");
          thumb.src = imgSrc;
          thumb.classList.add("image-thumbnail");
          thumb.addEventListener("click", () => {
            let img = new Image();
            img.src = imgSrc;
            this.canvasManager.gridDrawSettings.image = img;
            this.canvasManager.gridDrawSettings.type = "image";
          });
          imageListContainer.appendChild(thumb);
        });
      }
      instrSettings.appendChild(imageListContainer);


      const borderColorLabel = document.createElement("label");
      borderColorLabel.textContent = "Border Color: ";
      const borderColorInput = document.createElement("input");
      borderColorInput.type = "color";
      borderColorInput.value = this.canvasManager.gridDrawSettings.borderColor;
      borderColorInput.addEventListener("input", (e) => {
        this.canvasManager.gridDrawSettings.borderColor = e.target.value;
      });
      instrSettings.appendChild(borderColorLabel);
      instrSettings.appendChild(borderColorInput);
      instrSettings.appendChild(document.createElement("br"));

      // Image upload for grid cell pattern
      const cellImageLabel = document.createElement("label");
      cellImageLabel.textContent = "Cell Pattern Image: ";
      const cellImageInput = document.createElement("input");
      cellImageInput.type = "file";
      cellImageInput.accept = "image/*";
      cellImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.canvasManager.gridDrawSettings.image = img;
            this.canvasManager.gridDrawSettings.type = "image";
            // Add to image list array
            if (!this.canvasManager.gridImageList) {
              this.canvasManager.gridImageList = [];
            }
            this.canvasManager.gridImageList.push(img.src);
            // Refresh the image list display
            this.loadInstrumentSettings("gridDraw");
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
      instrSettings.appendChild(cellImageLabel);
      instrSettings.appendChild(cellImageInput);
      instrSettings.appendChild(document.createElement("br"));
      // Button to return to non-image (color) grid drawing
      const switchBtn = document.createElement("button");
      switchBtn.textContent = "Switch to Color Mode";
      switchBtn.addEventListener("click", () => {
        this.canvasManager.gridDrawSettings.type = "color";
        this.canvasManager.gridDrawSettings.image = null;
      });
      instrSettings.appendChild(switchBtn);
    } else if (instrument === "freeDraw") {
      const fillColorLabel = document.createElement("label");
      fillColorLabel.textContent = "Fill Color: ";
      const fillColorInput = document.createElement("input");
      fillColorInput.type = "color";
      fillColorInput.value = this.canvasManager.freeDrawSettings.fillColor;
      fillColorInput.addEventListener("input", (e) => {
        this.canvasManager.freeDrawSettings.fillColor = e.target.value;
      });
      instrSettings.appendChild(fillColorLabel);
      instrSettings.appendChild(fillColorInput);
      instrSettings.appendChild(document.createElement("br"));

      const strokeColorLabel = document.createElement("label");
      strokeColorLabel.textContent = "Stroke Color: ";
      const strokeColorInput = document.createElement("input");
      strokeColorInput.type = "color";
      strokeColorInput.value = this.canvasManager.freeDrawSettings.strokeColor;
      strokeColorInput.addEventListener("input", (e) => {
        this.canvasManager.freeDrawSettings.strokeColor = e.target.value;
      });
      instrSettings.appendChild(strokeColorLabel);
      instrSettings.appendChild(strokeColorInput);
      instrSettings.appendChild(document.createElement("br"));

      const periodLabel = document.createElement("label");
      periodLabel.textContent = "Pattern Period (cells, 0 continuous): ";
      const periodInput = document.createElement("input");
      periodInput.type = "number";
      periodInput.value = this.canvasManager.freeDrawSettings.period;
      periodInput.addEventListener("input", (e) => {
        this.canvasManager.freeDrawSettings.period = parseInt(e.target.value, 10);
      });
      instrSettings.appendChild(periodLabel);
      instrSettings.appendChild(periodInput);
      instrSettings.appendChild(document.createElement("br"));

      const sizeLabel = document.createElement("label");
      sizeLabel.textContent = "Pattern Size (cells): ";
      const sizeInput = document.createElement("input");
      sizeInput.type = "number";
      sizeInput.step = "0.1";
      sizeInput.value = this.canvasManager.freeDrawSettings.size;
      sizeInput.addEventListener("input", (e) => {
        this.canvasManager.freeDrawSettings.size = parseFloat(e.target.value);
      });
      instrSettings.appendChild(sizeLabel);
      instrSettings.appendChild(sizeInput);
      instrSettings.appendChild(document.createElement("br"));

      const connectLabel = document.createElement("label");
      connectLabel.textContent = "Connect SVG Patterns: ";
      const connectInput = document.createElement("input");
      connectInput.type = "checkbox";
      connectInput.checked = this.canvasManager.freeDrawSettings.connectSVG;
      connectInput.addEventListener("change", (e) => {
        this.canvasManager.freeDrawSettings.connectSVG = e.target.checked;
      });
      instrSettings.appendChild(connectLabel);
      instrSettings.appendChild(connectInput);
      instrSettings.appendChild(document.createElement("br"));

      // FreeDraw optional pattern image upload.
      const freeDrawImageLabel = document.createElement("label");
      freeDrawImageLabel.textContent = "FreeDraw Pattern Image: ";
      const freeDrawImageInput = document.createElement("input");
      freeDrawImageInput.type = "file";
      freeDrawImageInput.accept = "image/*";
      freeDrawImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.canvasManager.freeDrawSettings.image = img;
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
      instrSettings.appendChild(freeDrawImageLabel);
      instrSettings.appendChild(freeDrawImageInput);
    } else if (instrument === "addObject") {
      const fileLabel = document.createElement("label");
      fileLabel.textContent = "Upload Object Image: ";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.canvasManager.customObjectImage = img;
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
      instrSettings.appendChild(fileLabel);
      instrSettings.appendChild(fileInput);
    } else if (instrument === "select") {
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete Selected";
      deleteBtn.addEventListener("click", () => {
        this.canvasManager.deleteSelection();
      });
      instrSettings.appendChild(deleteBtn);
      instrSettings.appendChild(document.createElement("br"));

      const rotateLabel = document.createElement("label");
      rotateLabel.textContent = "Rotate (deg): ";
      const rotateInput = document.createElement("input");
      rotateInput.type = "number";
      rotateInput.value = 0;
      const rotateBtn = document.createElement("button");
      rotateBtn.textContent = "Apply Rotation";
      rotateBtn.addEventListener("click", () => {
        const delta = parseFloat(rotateInput.value);
        this.canvasManager.rotateSelection(delta);
      });
      instrSettings.appendChild(rotateLabel);
      instrSettings.appendChild(rotateInput);
      instrSettings.appendChild(rotateBtn);
      instrSettings.appendChild(document.createElement("br"));

      const resizeLabel = document.createElement("label");
      resizeLabel.textContent = "Resize (scale factor): ";
      const resizeInput = document.createElement("input");
      resizeInput.type = "number";
      resizeInput.value = 1;
      const resizeBtn = document.createElement("button");
      resizeBtn.textContent = "Apply Resize";
      resizeBtn.addEventListener("click", () => {
        const factor = parseFloat(resizeInput.value);
        this.canvasManager.resizeSelection(factor);
      });
      instrSettings.appendChild(resizeLabel);
      instrSettings.appendChild(resizeInput);
      instrSettings.appendChild(resizeBtn);
    } else {
      instrSettings.innerHTML = "No specific settings for this tool.";
    }
  }
}
