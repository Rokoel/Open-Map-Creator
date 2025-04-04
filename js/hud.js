import { constants } from "./constants.js"; // Import constants if needed

export class HUD {
  constructor(canvasManager, storageManager) {
    this.canvasManager = canvasManager;
    this.storageManager = storageManager;
    this.setupToolbar();
    this.setupCanvasSettings();
    this.setupLayerControls();
    this.setupEmptyCellSettings();
    this.setupAppearanceSettings(); // Setup for shadows/borders
    // Make HUD instance globally accessible (simple approach)
    window.hudInstance = this;
    // Initial update after potential autoload in main.js
    this.updateAppearanceControls();
  }

  setupToolbar() {
    const toolbar = document.getElementById("toolbar");
    toolbar.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" && e.target.dataset.instrument) {
        const instrument = e.target.dataset.instrument;
        this.canvasManager.setActiveInstrument(instrument);
        this.loadInstrumentSettings(instrument); // Update settings panel
        // Highlight active button (optional)
        toolbar.querySelectorAll("button").forEach(btn => btn.style.fontWeight = "normal");
        e.target.style.fontWeight = "bold";
      }
    });
    // Set initial active button style
    const initialButton = toolbar.querySelector(`button[data-instrument="${this.canvasManager.activeInstrument}"]`);
    if (initialButton) initialButton.style.fontWeight = "bold";
  }

  setupEmptyCellSettings() {
    const emptyFill = document.getElementById("emptyFillColor");
    const emptyBorder = document.getElementById("emptyBorderColor");
    const emptyPatternInput = document.getElementById("emptyPattern");

    // Initialize from CanvasManager state (already done in loadMapData/constructor)
    emptyFill.value = this.canvasManager.emptyCellSettings.fillColor;
    emptyBorder.value = this.canvasManager.emptyCellSettings.borderColor;

    emptyFill.addEventListener("input", (e) => {
      this.canvasManager.emptyCellSettings.fillColor = e.target.value;
      this.canvasManager.render();
    });
    emptyFill.addEventListener("change", () => this.canvasManager.saveHistory()); // Save on release

    emptyBorder.addEventListener("input", (e) => {
      this.canvasManager.emptyCellSettings.borderColor = e.target.value;
      this.canvasManager.render();
    });
    emptyBorder.addEventListener("change", () => this.canvasManager.saveHistory()); // Save on release

    emptyPatternInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) {
          this.canvasManager.emptyCellSettings.pattern = null;
          this.canvasManager.emptyCellSettings.patternSrc = null;
          this.canvasManager.render();
          this.canvasManager.saveHistory();
          return;
      };
      const reader = new FileReader();
      reader.onload = (event) => {
        let img = new Image();
        img.onload = () => {
          this.canvasManager.emptyCellSettings.pattern = img;
          this.canvasManager.emptyCellSettings.patternSrc = img.src; // Store src
          this.canvasManager.render();
          this.canvasManager.saveHistory();
        };
        img.onerror = () => {
            console.error("Failed to load empty cell pattern image.");
            alert("Failed to load the selected image for the empty cell pattern.");
            this.canvasManager.emptyCellSettings.pattern = null;
            this.canvasManager.emptyCellSettings.patternSrc = null;
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  setupCanvasSettings() {
    const cellSizeInput = document.getElementById("cellSize");
    cellSizeInput.value = this.canvasManager.currentCellSize; // Initialize slider

    cellSizeInput.addEventListener("input", (e) => {
      const newSize = parseInt(e.target.value, 10);
      this.canvasManager.updateCellSize(newSize);
    });
  }

  setupLayerControls() {
    this.layerList = document.getElementById("layerList");
    document.getElementById("addLayer").addEventListener("click", () => {
      this.canvasManager.addLayer();
      this.updateLayerList(); // Update UI (will also trigger appearance update via setActiveLayer)
    });
    document.getElementById("removeLayer").addEventListener("click", () => {
      if (this.canvasManager.layers.length <= 1) {
          alert("Cannot remove the last layer.");
          return;
      }
      // Use optional chaining for safety, though activeLayerIndex should always be valid
      const layerName = this.canvasManager.layers[this.canvasManager.activeLayerIndex]?.name || 'the selected layer';
      if (confirm(`Are you sure you want to remove layer "${layerName}"?`)) {
          this.canvasManager.removeActiveLayer();
          this.updateLayerList(); // Update UI (will also trigger appearance update via setActiveLayer)
      }
    });
    // this.updateLayerList(); // Initial population called from main.js after potential load
  }

  updateLayerList() {
    this.layerList.innerHTML = ""; // Clear existing list
    const currentActiveIndex = this.canvasManager.activeLayerIndex; // Cache before loop potentially changes it

    this.canvasManager.layers.forEach((layer, index) => {
      const li = document.createElement("li");
      // Basic editable layer name (optional)
      const nameSpan = document.createElement("span");
      nameSpan.textContent = layer.name;
      nameSpan.style.cursor = "pointer";
      nameSpan.title = "Click to activate";
      // nameSpan.ondblclick = () => { /* Add rename logic here */ };
      li.appendChild(nameSpan);

      // TODO: Add visibility toggle button using layer.visible
      // const visibilityBtn = document.createElement('button');
      // visibilityBtn.textContent = layer.visible ? '👁️' : '🚫';
      // visibilityBtn.title = layer.visible ? 'Hide Layer' : 'Show Layer';
      // visibilityBtn.style.marginLeft = '10px';
      // visibilityBtn.onclick = () => {
      //     layer.visible = !layer.visible;
      //     this.canvasManager.render();
      //     this.canvasManager.saveHistory();
      //     this.updateLayerList(); // Update button icon
      // };
      // li.appendChild(visibilityBtn);

      if (index === currentActiveIndex) {
        li.classList.add("active"); // Apply active style
      }
      li.addEventListener("click", (e) => {
          // Prevent clicks on buttons inside li from activating layer
          if (e.target === nameSpan) {
              // Check if already active to prevent unnecessary updates
              if (this.canvasManager.activeLayerIndex !== index) {
                  this.canvasManager.setActiveLayer(index); // This now triggers HUD appearance update
                  // We also need to update the list highlighting immediately
                  this.updateLayerList();
              }
          }
      });
      this.layerList.appendChild(li);
    });
  }

  // Setup Appearance Settings Controls (Shadows & Borders)
  setupAppearanceSettings() {
    // Shadow Controls
    const shadowsEnabled = document.getElementById("shadowsEnabled");
    const shadowAngleSlider = document.getElementById("shadowAngle");
    const shadowAngleNumber = document.getElementById("shadowAngleNumber");
    const shadowOffset = document.getElementById("shadowOffset");
    const shadowColorRGB = document.getElementById("shadowColorRGB");
    const shadowAlphaSlider = document.getElementById("shadowAlpha");
    const shadowAlphaValueSpan = document.getElementById("shadowAlphaValue");

    // Border Controls (References needed if logic changes, otherwise just for completeness)
    const bordersEnabled = document.getElementById("bordersEnabled");
    const borderPatternInput = document.getElementById("borderPattern");
    const borderPatternPreview = document.getElementById("borderPatternPreview");

    // Initial population is handled by updateAppearanceControls

    // --- Event Listeners ---

    // Enable/Disable Shadows
    shadowsEnabled.addEventListener("change", (e) => {
      const activeLayer = this.canvasManager.layers[this.canvasManager.activeLayerIndex];
      if (activeLayer && activeLayer.gridShadowOptions) {
        activeLayer.gridShadowOptions.enabled = e.target.checked;
        this.canvasManager.render();
        this.canvasManager.saveHistory();
      }
    });

    // Angle Synchronization & Update
    const updateAngle = (newValue) => {
        const angle = Math.max(0, Math.min(360, parseInt(newValue, 10) || 0)); // Clamp value
        const activeLayer = this.canvasManager.layers[this.canvasManager.activeLayerIndex];
        if (activeLayer && activeLayer.gridShadowOptions) {
            activeLayer.gridShadowOptions.angle = angle;
            // Update the *other* input control
            if (document.activeElement !== shadowAngleSlider) {
                shadowAngleSlider.value = angle;
            }
            if (document.activeElement !== shadowAngleNumber) {
                shadowAngleNumber.value = angle;
            }
            this.canvasManager.render();
        }
    };
    shadowAngleSlider.addEventListener("input", (e) => updateAngle(e.target.value));
    shadowAngleNumber.addEventListener("input", (e) => updateAngle(e.target.value));
    // Save history only on final change ('change' event)
    shadowAngleSlider.addEventListener("change", () => { if (this.canvasManager.layers[this.canvasManager.activeLayerIndex]) this.canvasManager.saveHistory(); });
    shadowAngleNumber.addEventListener("change", () => { if (this.canvasManager.layers[this.canvasManager.activeLayerIndex]) this.canvasManager.saveHistory(); });


    // Offset Update
    shadowOffset.addEventListener("input", (e) => {
       const activeLayer = this.canvasManager.layers[this.canvasManager.activeLayerIndex];
       if (activeLayer && activeLayer.gridShadowOptions) {
        activeLayer.gridShadowOptions.offset = parseFloat(e.target.value);
        this.canvasManager.render();
       }
    });
    shadowOffset.addEventListener("change", () => { if (this.canvasManager.layers[this.canvasManager.activeLayerIndex]) this.canvasManager.saveHistory(); });

    // Color/Alpha Update & Combination
    const updateColor = () => {
        const activeLayer = this.canvasManager.layers[this.canvasManager.activeLayerIndex];
        if (activeLayer && activeLayer.gridShadowOptions) {
            const rgbHex = shadowColorRGB.value; // #rrggbb
            const alpha = parseFloat(shadowAlphaSlider.value); // 0.0 to 1.0

            // Convert alpha (0-1) to 2-digit hex
            const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');

            // Combine and store as #rrggbbaa
            activeLayer.gridShadowOptions.color = rgbHex + alphaHex;

            // Update alpha display span
            if (shadowAlphaValueSpan) {
                shadowAlphaValueSpan.textContent = alpha.toFixed(2);
            }

            this.canvasManager.render();
        }
    };
    shadowColorRGB.addEventListener("input", updateColor);
    shadowAlphaSlider.addEventListener("input", updateColor);
    // Save history only on final change ('change' event)
    shadowColorRGB.addEventListener("change", () => { if (this.canvasManager.layers[this.canvasManager.activeLayerIndex]) this.canvasManager.saveHistory(); });
    shadowAlphaSlider.addEventListener("change", () => { if (this.canvasManager.layers[this.canvasManager.activeLayerIndex]) this.canvasManager.saveHistory(); });


    // Border controls listeners (remain the same, modify global options)
    bordersEnabled.addEventListener("change", (e) => {
      this.canvasManager.gridBorderOptions.enabled = e.target.checked;
      this.canvasManager.render();
      this.canvasManager.saveHistory();
    });
    borderPatternInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) { /* ... clear border options ... */ return; }
      const reader = new FileReader();
      reader.onload = (event) => { /* ... load border image ... */ };
      reader.readAsDataURL(file);
    });
}

  // Helper to update appearance controls from CanvasManager state
  updateAppearanceControls() {
    const cm = this.canvasManager;
    const activeLayer = cm.layers[cm.activeLayerIndex];
    const shadowOptions = activeLayer?.gridShadowOptions || constants.defaultGridShadowOptions;
    const currentShadowColor = shadowOptions.color || constants.defaultGridShadowOptions.color;

    // --- Update Shadow Controls ---
    document.getElementById("shadowsEnabled").checked = shadowOptions.enabled;

    // Angle (update both slider and number input)
    const angle = shadowOptions.angle;
    document.getElementById("shadowAngle").value = angle;
    document.getElementById("shadowAngleNumber").value = angle;

    // Offset
    document.getElementById("shadowOffset").value = shadowOptions.offset;

    // Color and Alpha
    let rgbHex = constants.defaultGridShadowOptions.color.substring(0, 7);
    let alpha = 0.5; // Default alpha value (0-1 range)

    if (typeof currentShadowColor === 'string' && currentShadowColor.startsWith('#')) {
        if (currentShadowColor.length >= 7) {
            rgbHex = currentShadowColor.substring(0, 7); // Extract #rrggbb
        }
        if (currentShadowColor.length === 9) {
            const alphaHex = currentShadowColor.substring(7, 9);
            const alphaInt = parseInt(alphaHex, 16);
            if (!isNaN(alphaInt)) {
                alpha = alphaInt / 255; // Convert hex alpha to 0-1 range
            }
        }
    }

    document.getElementById("shadowColorRGB").value = rgbHex;
    document.getElementById("shadowAlpha").value = alpha;
    const shadowAlphaValueSpan = document.getElementById("shadowAlphaValue");
    if (shadowAlphaValueSpan) {
        shadowAlphaValueSpan.textContent = alpha.toFixed(2); // Display formatted alpha
    }

    // --- Update Border Controls (still global) ---
    document.getElementById("bordersEnabled").checked = cm.gridBorderOptions.enabled;
    const borderPatternPreview = document.getElementById("borderPatternPreview");
    if (cm.gridBorderOptions.imageSrc) {
        borderPatternPreview.src = cm.gridBorderOptions.imageSrc;
        borderPatternPreview.style.display = 'block';
    } else {
        borderPatternPreview.src = "#";
        borderPatternPreview.style.display = 'none';
    }
    document.getElementById("borderPattern").value = '';
}

  // Load settings specific to the selected instrument
  loadInstrumentSettings(instrument) {
    const instrSettings = document.getElementById("instrumentSettings");
    instrSettings.innerHTML = "<h3>Instrument Settings</h3>"; // Clear previous, add title back

    // --- Grid Draw ---
    if (instrument === "gridDraw") {
      const settingsDiv = document.createElement('div');

      // Fill Color
      const fcLabel = document.createElement("label"); fcLabel.textContent = "Fill Color: ";
      const fcInput = document.createElement("input"); fcInput.type = "color";
      fcInput.value = this.canvasManager.gridDrawSettings.fillColor;
      fcInput.addEventListener("input", (e) => {
        this.canvasManager.gridDrawSettings.fillColor = e.target.value;
        this.canvasManager.gridDrawSettings.type = "color"; // Switch to color mode
        this.canvasManager.gridDrawSettings.image = null;
        this.canvasManager.gridDrawSettings.imageSrc = null;
      });
      settingsDiv.appendChild(fcLabel); settingsDiv.appendChild(fcInput); settingsDiv.appendChild(document.createElement("br"));

      // Border Color
      const bcLabel = document.createElement("label"); bcLabel.textContent = "Border Color: ";
      const bcInput = document.createElement("input"); bcInput.type = "color";
      bcInput.value = this.canvasManager.gridDrawSettings.borderColor;
      bcInput.addEventListener("input", (e) => { this.canvasManager.gridDrawSettings.borderColor = e.target.value; });
      settingsDiv.appendChild(bcLabel); settingsDiv.appendChild(bcInput); settingsDiv.appendChild(document.createElement("br"));

      // Image List for Grid Draw Patterns
      const imgListLabel = document.createElement("label"); imgListLabel.textContent = "Select Pattern:";
      settingsDiv.appendChild(imgListLabel); settingsDiv.appendChild(document.createElement("br"));
      const imageListContainer = document.createElement("div");
      imageListContainer.id = "gridImageList";
      imageListContainer.style.display = "flex"; imageListContainer.style.flexWrap = "wrap";
      imageListContainer.style.gap = "5px"; imageListContainer.style.marginBottom = "10px";
      imageListContainer.style.maxHeight = "100px"; imageListContainer.style.overflowY = "auto";
      imageListContainer.style.border = "1px solid #eee"; imageListContainer.style.padding = "3px";

      // Add previously uploaded images as thumbnails
      if (this.canvasManager.gridImageList && this.canvasManager.gridImageList.length) {
        this.canvasManager.gridImageList.forEach((imgSrc) => {
          const thumb = document.createElement("img");
          thumb.src = imgSrc;
          thumb.classList.add("image-thumbnail"); // Use class for styling
          thumb.title = "Click to select this pattern";
          // Highlight if it's the currently selected pattern
          if (imgSrc === this.canvasManager.gridDrawSettings.imageSrc) {
              thumb.style.border = "2px solid blue";
          }
          thumb.addEventListener("click", () => {
            let img = new Image();
            img.onload = () => {
                this.canvasManager.gridDrawSettings.image = img;
                this.canvasManager.gridDrawSettings.imageSrc = imgSrc; // Store src
                this.canvasManager.gridDrawSettings.type = "image";
                this.loadInstrumentSettings("gridDraw"); // Refresh to show selection
            };
            img.onerror = () => console.error("Failed to load image for grid draw selection:", imgSrc);
            img.src = imgSrc;
          });
          imageListContainer.appendChild(thumb);
        });
      } else {
          imageListContainer.textContent = "No patterns added yet.";
      }
      settingsDiv.appendChild(imageListContainer);

      // Image upload for adding new grid cell patterns
      const cellImgLabel = document.createElement("label"); cellImgLabel.textContent = "Add New Pattern: ";
      const cellImgInput = document.createElement("input"); cellImgInput.type = "file"; cellImgInput.accept = "image/*";
      cellImgInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const imgSrc = event.target.result;
          // Add to list if not already present
          if (!this.canvasManager.gridImageList.includes(imgSrc)) {
              this.canvasManager.gridImageList.push(imgSrc);
              this.canvasManager.saveHistory(); // Save state with new image list
          }
          // Set as current image
          let img = new Image();
          img.onload = () => {
              this.canvasManager.gridDrawSettings.image = img;
              this.canvasManager.gridDrawSettings.imageSrc = imgSrc;
              this.canvasManager.gridDrawSettings.type = "image";
              this.loadInstrumentSettings("gridDraw"); // Refresh UI
          };
          img.onerror = () => console.error("Failed to load uploaded grid pattern:", imgSrc);
          img.src = imgSrc;
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Clear file input visually
      });
      settingsDiv.appendChild(cellImgLabel); settingsDiv.appendChild(cellImgInput); settingsDiv.appendChild(document.createElement("br"));

      // Button to switch back to color fill
      const switchBtn = document.createElement("button");
      switchBtn.textContent = "Use Color Fill";
      switchBtn.addEventListener("click", () => {
        this.canvasManager.gridDrawSettings.type = "color";
        this.canvasManager.gridDrawSettings.image = null;
        this.canvasManager.gridDrawSettings.imageSrc = null;
        this.loadInstrumentSettings("gridDraw"); // Refresh UI
      });
      settingsDiv.appendChild(switchBtn);

      instrSettings.appendChild(settingsDiv);

    // --- Free Draw ---
    } else if (instrument === "freeDraw") {
      const settingsDiv = document.createElement('div');
      // Fill Color, Stroke Color, Period, Size, Connect SVG (similar structure as gridDraw)
      const fcLabel = document.createElement("label"); fcLabel.textContent = "Fill Color: ";
      const fcInput = document.createElement("input"); fcInput.type = "color";
      fcInput.value = this.canvasManager.freeDrawSettings.fillColor;
      fcInput.addEventListener("input", (e) => {
          this.canvasManager.freeDrawSettings.fillColor = e.target.value;
          this.canvasManager.freeDrawSettings.image = null; // Clear image if color changes
      });
      settingsDiv.appendChild(fcLabel); settingsDiv.appendChild(fcInput); settingsDiv.appendChild(document.createElement("br"));

      const scLabel = document.createElement("label"); scLabel.textContent = "Stroke Color: ";
      const scInput = document.createElement("input"); scInput.type = "color";
      scInput.value = this.canvasManager.freeDrawSettings.strokeColor;
      scInput.addEventListener("input", (e) => { this.canvasManager.freeDrawSettings.strokeColor = e.target.value; });
      settingsDiv.appendChild(scLabel); settingsDiv.appendChild(scInput); settingsDiv.appendChild(document.createElement("br"));

      const pLabel = document.createElement("label"); pLabel.textContent = "Period (cells): ";
      const pInput = document.createElement("input"); pInput.type = "number"; pInput.min = "0"; pInput.step = "0.1";
      pInput.value = this.canvasManager.freeDrawSettings.period;
      pInput.addEventListener("input", (e) => { this.canvasManager.freeDrawSettings.period = parseFloat(e.target.value) || 0; });
      settingsDiv.appendChild(pLabel); settingsDiv.appendChild(pInput); settingsDiv.appendChild(document.createElement("br"));

      const sLabel = document.createElement("label"); sLabel.textContent = "Size (cells): ";
      const sInput = document.createElement("input"); sInput.type = "number"; sInput.step = "0.1"; sInput.min = "0.1";
      sInput.value = this.canvasManager.freeDrawSettings.size;
      sInput.addEventListener("input", (e) => { this.canvasManager.freeDrawSettings.size = parseFloat(e.target.value) || 1; });
      settingsDiv.appendChild(sLabel); settingsDiv.appendChild(sInput); settingsDiv.appendChild(document.createElement("br"));

      const conLabel = document.createElement("label"); conLabel.textContent = "Connect SVG: ";
      const conInput = document.createElement("input"); conInput.type = "checkbox";
      conInput.checked = this.canvasManager.freeDrawSettings.connectSVG;
      conInput.addEventListener("change", (e) => { this.canvasManager.freeDrawSettings.connectSVG = e.target.checked; });
      settingsDiv.appendChild(conLabel); settingsDiv.appendChild(conInput); settingsDiv.appendChild(document.createElement("br"));

      // FreeDraw optional pattern image upload.
      const fdImgLabel = document.createElement("label"); fdImgLabel.textContent = "Pattern Image: ";
      const fdImgInput = document.createElement("input"); fdImgInput.type = "file"; fdImgInput.accept = "image/*";
      // Add preview
      const fdPreview = document.createElement("img");
      fdPreview.alt = "FreeDraw pattern preview";
      fdPreview.style.maxWidth = "32px"; fdPreview.style.maxHeight = "32px"; fdPreview.style.verticalAlign = "middle";
      fdPreview.style.marginLeft = "5px";
      fdPreview.style.display = this.canvasManager.freeDrawSettings.image ? 'inline-block' : 'none';
      fdPreview.src = this.canvasManager.freeDrawSettings.image?.src || '#';

      fdImgInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) {
            this.canvasManager.freeDrawSettings.image = null;
            fdPreview.style.display = 'none'; fdPreview.src = '#';
            return;
        };
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.canvasManager.freeDrawSettings.image = img;
            fdPreview.src = img.src; fdPreview.style.display = 'inline-block';
          };
          img.onerror = () => { console.error("Failed to load free draw pattern"); fdPreview.style.display = 'none'; fdPreview.src = '#'; };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
      settingsDiv.appendChild(fdImgLabel); settingsDiv.appendChild(fdImgInput); settingsDiv.appendChild(fdPreview);

      instrSettings.appendChild(settingsDiv);

    // --- Add Object ---
    } else if (instrument === "addObject") {
      const settingsDiv = document.createElement('div');
      const fileLabel = document.createElement("label"); fileLabel.textContent = "Object Image: ";
      const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*";
      // Add preview
      const objPreview = document.createElement("img");
      objPreview.alt = "Object preview";
      objPreview.style.maxWidth = "50px"; objPreview.style.maxHeight = "50px";
      objPreview.style.display = this.canvasManager.customObjectImageSrc ? 'block' : 'none';
      objPreview.src = this.canvasManager.customObjectImageSrc || '#';
      objPreview.style.marginTop = '5px';

      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) {
            this.canvasManager.customObjectImage = null;
            this.canvasManager.customObjectImageSrc = null;
            objPreview.style.display = 'none'; objPreview.src = '#';
            return;
        };
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.canvasManager.customObjectImage = img;
            this.canvasManager.customObjectImageSrc = img.src; // Store src
            objPreview.src = img.src;
            objPreview.style.display = 'block';
          };
          img.onerror = () => { console.error("Failed to load object image"); objPreview.style.display = 'none'; objPreview.src = '#'; };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
      settingsDiv.appendChild(fileLabel); settingsDiv.appendChild(fileInput);
      settingsDiv.appendChild(objPreview); // Add preview
      instrSettings.appendChild(settingsDiv);

    // --- Select Tool ---
    } else if (instrument === "select") {
      const settingsDiv = document.createElement('div');
      // Check if anything is selected to enable/disable buttons
      const hasSelection = this.canvasManager.selectedObjects.grid.length > 0 ||
                           this.canvasManager.selectedObjects.free.length > 0 ||
                           this.canvasManager.selectedObjects.custom.length > 0;

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete Selected (Del)";
      deleteBtn.disabled = !hasSelection;
      deleteBtn.addEventListener("click", () => { this.canvasManager.deleteSelection(); this.loadInstrumentSettings('select'); }); // Refresh HUD
      settingsDiv.appendChild(deleteBtn); settingsDiv.appendChild(document.createElement("br"));

      // Rotate Controls
      const rotLabel = document.createElement("label"); rotLabel.textContent = "Rotate (deg): ";
      const rotInput = document.createElement("input"); rotInput.type = "number"; rotInput.value = 0; rotInput.style.width = "60px";
      const rotBtn = document.createElement("button"); rotBtn.textContent = "Apply"; rotBtn.disabled = !hasSelection;
      rotBtn.addEventListener("click", () => {
        const delta = parseFloat(rotInput.value) || 0;
        this.canvasManager.rotateSelection(delta);
        rotInput.value = 0; // Reset input
        // No need to refresh HUD here as selection remains
      });
      settingsDiv.appendChild(rotLabel); settingsDiv.appendChild(rotInput); settingsDiv.appendChild(rotBtn); settingsDiv.appendChild(document.createElement("br"));

      // Resize Controls
      const resLabel = document.createElement("label"); resLabel.textContent = "Resize (factor): ";
      const resInput = document.createElement("input"); resInput.type = "number"; resInput.step = "0.1"; resInput.min = "0.1"; resInput.value = 1; resInput.style.width = "60px";
      const resBtn = document.createElement("button"); resBtn.textContent = "Apply"; resBtn.disabled = !hasSelection;
      resBtn.addEventListener("click", () => {
        const factor = parseFloat(resInput.value) || 1;
        if (factor > 0) {
            this.canvasManager.resizeSelection(factor);
        }
        resInput.value = 1; // Reset input
      });
      settingsDiv.appendChild(resLabel); settingsDiv.appendChild(resInput); settingsDiv.appendChild(resBtn);

      instrSettings.appendChild(settingsDiv);

    // --- Erase Tool or others ---
    } else {
      const settingsDiv = document.createElement('div');
      settingsDiv.textContent = "No specific settings for this tool.";
      instrSettings.appendChild(settingsDiv);
    }
  }
}
