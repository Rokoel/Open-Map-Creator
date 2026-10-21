import { showAlert, askConfirm } from "./dialogs.js";
import { defaultExportSettings, sheetMarginDefaults } from "./pdf-layout.js";
import { icon } from "./icons.js";
import { constants } from "./constants.js";
import { borderDefaults, lightDefaults, ambientDefaults } from "./scene.js";
const $ = (id) => document.getElementById(id);
const names = {
  polygon: "Polygon",
  pan: "Pan",
  gridDraw: "Grid brush",
  freeDraw: "Freehand brush",
  addObject: "Image object",
  select: "Selection",
  light: "Light source",
  layers: "Layers",
};

export class HUD {
  constructor(canvasManager, storageManager) {
    this.canvasManager = canvasManager;
    this.storageManager = storageManager;
    window.hudInstance = this;
    this.setupToolbar();
    this.setupExportArea();
    $("finishPolygon").onclick = () => canvasManager.finishPolygon();
    $("cancelPolygon").onclick = () => { canvasManager.polygonDraft = []; canvasManager.render(); this.refresh(); };
    $("finishExportArea").onclick = () => $("editExportArea").click();
    $("toolToggle").onclick = () => {
      const hidden = !$("toolContents").hidden;
      $("toolContents").hidden = hidden;
      $("toolToggle").setAttribute("aria-expanded", String(!hidden));
      $("toolHud").classList.toggle("is-collapsed", hidden);
    };
    if (matchMedia("(max-width: 700px)").matches) $("toolToggle").click();
    this.setupLayerControls();
    this.setupAppearanceSettings();
    this.setupLightingSettings();
    this.setupEmptyCellSettings();
    $("mapToggle").onclick = () =>
      this.setMapCollapsed(!$("hud").classList.contains("is-collapsed"));
    this.setMapCollapsed(true);
    let storedTheme;
    try {
      storedTheme = localStorage.getItem("omc-theme");
    } catch {}
    const theme =
      storedTheme ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    $("themeToggle").setAttribute("aria-pressed", String(theme === "dark"));
    $("themeToggle").addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme !== "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      try {
        localStorage.setItem("omc-theme", dark ? "dark" : "light");
      } catch {}
      $("themeToggle").setAttribute("aria-pressed", String(dark));
    });
    $("undo").onclick = () => {
      canvasManager.undo();
      this.refresh();
    };
    $("redo").onclick = () => {
      canvasManager.redo();
      this.refresh();
    };
    $("resetView").onclick = () => {
      canvasManager.scale = 1;
      canvasManager.offsetX = 100;
      canvasManager.offsetY = 100;
      canvasManager.render();
    };
    $("exportPNG").onclick = () => storageManager.exportPNG();
    for (const [id, key] of [
      ["exportColorMode", "colorMode"],
      ["exportPadding", "padding"],
    ]) {
      $(id).onchange = () => {
        canvasManager.exportSettings[key] =
          key === "padding"
            ? Math.max(0, Math.min(10, Number($(id).value) || 0))
            : $(id).value;
        this.updateExportControls();
        this.commit();
      };
    }
    document.addEventListener("keydown", (e) => {
      if (
        $("appDialog").open || canvasManager.isErasing ||
        e.target.closest("input,textarea,select") ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const tool = {
        p: "polygon",
        h: "pan",
        v: "select",
        g: "gridDraw",
        b: "freeDraw",
        o: "addObject",
        l: "light",
        k: "layers",
      }[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        this.chooseTool(tool);
      }
      if (e.key === "Enter" && canvasManager.activeInstrument === "polygon") canvasManager.finishPolygon();
      if (e.key === "Escape") {
        canvasManager.polygonDraft = [];
        canvasManager.exportOverlay = false;
        $("editExportArea").textContent = "Edit export area";
        $("editExportArea").setAttribute("aria-pressed", "false");
        canvasManager.selectedObjects = { grid: [], free: [], custom: [] };
        canvasManager.render();
        this.loadInstrumentSettings(canvasManager.activeInstrument);
      }
    });
    this.updateAppearanceControls();
  }
  polygonFields(parent, obj) {
    this.field(parent, "Fill", "color", obj.fillColor, v => obj.fillColor = v);
    this.field(parent, "Outline", "color", obj.borderColor, v => obj.borderColor = v);
    this.field(parent, "Opacity", "range", obj.opacity, v => obj.opacity = v, { min:0, max:1, step:.01 });
    this.upload(parent, "Polygon texture", obj.imageSrc, image => { obj.image = image; obj.imageSrc = image.src; });
    this.field(parent, "Texture mode", "select", obj.textureMode, v => obj.textureMode = v, {
      choices:[["tile","Tile"],["fit","Fit entire polygon"]],
    });
    this.field(parent, "Texture scale", "number", obj.textureScale, v => obj.textureScale = v, { min:.05, max:100, step:.05 });
    this.field(parent, "Texture rotation (°)", "number", obj.textureAngle, v => obj.textureAngle = v, { min:-3600, max:3600, step:1 });
    this.field(parent, "Texture opacity", "range", obj.textureOpacity, v => obj.textureOpacity = v, { min:0, max:1, step:.01 });
    if (obj.imageSrc) this.button(parent, "Remove polygon texture", () => { obj.image = obj.imageSrc = null; this.commit(); this.refresh(); });
  }
  setupExportArea() {
    const cm = this.canvasManager;
    $("editExportArea").onclick = () => {
      cm.exportOverlay = !cm.exportOverlay;
      cm.isDrawing = cm.isSelecting = cm.isMovingSelection = false;
      cm.polygonDraft = [];
      $("editExportArea").textContent = cm.exportOverlay ? "Finish editing area" : "Edit export area";
      $("editExportArea").setAttribute("aria-pressed", String(cm.exportOverlay));
      if (cm.exportOverlay && matchMedia("(max-width: 700px)").matches) this.setMapCollapsed(true);
      cm.render();
    };
    $("resetExportArea").onclick = () => {
      delete cm.exportSettings.region;
      this.updateExportControls(); this.commit();
    };
    this.updateExportFields();
    $("exportAreaFields").addEventListener("change", () => this.updateExportControls());
    const p = $("exportPageFields");
    p.addEventListener("change", () => this.updateExportControls());
    for (const [key, label, type, fallback, options] of [
      ["orientation","Orientation","select","landscape",{choices:[["landscape","Landscape"],["portrait","Portrait"]]}],
      ["paper","Paper","select","A4",{choices:[["A4","A4"],["A3","A3"]]}],
      ["cellSize","Cell size (cm)","number",2.5,{min:.1,max:10,step:.1}],
      ["dpi","Resolution (DPI)","number",300,{min:36,max:600,step:1}],
    ]) {
      const input = this.field(p,label,type,cm.exportSettings[key] ?? fallback,v => {
        cm.exportSettings[key] = v;
        this.updateExportControls(true);
      },options);
      input.dataset.exportSetting = key;
    }
    this.hint(p, "These margins reserve blank paper on every sheet and recalculate the PDF page breaks. Larger margins can add pages without shrinking cells. Print-app margins act on the finished pages; print this PDF at Actual size / 100%.");
    for (const [side, fallback] of Object.entries(sheetMarginDefaults)) {
      const input = this.field(p, `Sheet ${side} margin (mm)`, "number", cm.exportSettings.sheetMargins?.[side] ?? fallback,
        value => {
          cm.exportSettings.sheetMargins = { ...sheetMarginDefaults, ...cm.exportSettings.sheetMargins, [side]:value };
          this.updateExportControls(true);
        },
        { min:0, max:100, step:.5 });
      input.dataset.sheetMargin = side;
    }
  }
  updateExportControls(preserveFocus = false) {
    const settings = { ...defaultExportSettings(), ...this.canvasManager.exportSettings };
    const setValue = (input, value) => {
      if (input && !(preserveFocus && input === document.activeElement)) input.value = value;
    };
    for (const input of $("exportPageFields").querySelectorAll("[data-export-setting]"))
      setValue(input, settings[input.dataset.exportSetting]);
    for (const [key, id] of Object.entries({ orientation:"pdfOrientation", paper:"pdfPaper", dpi:"pdfDpi",
      cellSize:"pdfCellSize", colorMode:"pdfColorMode", padding:"pdfPadding" }))
      setValue($(id), settings[key]);
    for (const [side, fallback] of Object.entries(sheetMarginDefaults)) {
      const value = settings.sheetMargins?.[side] ?? fallback;
      setValue($("exportPageFields").querySelector(`[data-sheet-margin="${side}"]`), value);
      setValue($(`pdfMargin${side[0].toUpperCase()}${side.slice(1)}`), value);
    }
    setValue($("exportPadding"), settings.padding);
    setValue($("exportColorMode"), settings.colorMode);
    this.updateExportFields(preserveFocus);
    $("pdfForm").dispatchEvent(new Event("input", { bubbles:true }));
  }
  updateExportFields(preserveFocus = false) {
    const cm = this.canvasManager, p = $("exportAreaFields");
    const b = cm.getExportBounds();
    // Preserve in-progress text during live edits; state refreshes replace it.
    if (p.children.length) {
      const values = [b.minX,b.minY,b.width,b.height];
      p.querySelectorAll("input").forEach((input,i) => {
        if (!preserveFocus || document.activeElement !== input) input.value = Number(values[i].toFixed(4));
      });
      return;
    }
    for (const [key,label,value] of [["x","Left (cells)",b.minX],["y","Top (cells)",b.minY],["width","Area width (cells)",b.width],["height","Area height (cells)",b.height]]) {
      this.field(p,label,"number",value,v => {
        const b = cm.getExportBounds();
        if (key === "x") { b.maxX += v-b.minX; b.minX = v; }
        if (key === "y") { b.maxY += v-b.minY; b.minY = v; }
        if (key === "width") b.maxX = b.minX+v;
        if (key === "height") b.maxY = b.minY+v;
        cm.exportSettings.region = {minX:b.minX,minY:b.minY,maxX:b.maxX,maxY:b.maxY};
        this.updateExportControls(true);
      },{min:["width","height"].includes(key) ? .25 : -100000,max:100000,step:.25});
    }
  }
  refresh() {
    this.updateLayerList();
    this.updateAppearanceControls();
    this.updateExportFields();
    this.loadInstrumentSettings(this.canvasManager.activeInstrument);
  }
  setMapCollapsed(collapsed) {
    if (!collapsed) this.updateExportControls();
    $("hud").classList.toggle("is-collapsed", collapsed);
    $("mapContents").hidden = collapsed;
    $("mapToggle").setAttribute("aria-expanded", String(!collapsed));
    $("mapToggle").title = collapsed
      ? "Expand Map settings"
      : "Minimize Map settings";
    $("mapToggle")
      .querySelector("use")
      .setAttribute(
        "href",
        `assets/iconoir/sprite.svg#${collapsed ? "plus" : "minus"}`,
      );
  }
  showPanel(id) {
    if (id === "mapPanel") {
      this.setMapCollapsed(false);
      return;
    }
    if (id === "appearancePanel") {
      this.chooseTool("layers");
      return;
    }
    this.showingLayers = false;
    this.loadInstrumentSettings(this.canvasManager.activeInstrument);
  }
  chooseTool(tool) {
    if (tool === "layers") this.showingLayers = true;
    else {
      this.showingLayers = false;
      this.canvasManager.setActiveInstrument(tool);
    }
    this.loadInstrumentSettings(this.canvasManager.activeInstrument);
    this.syncToolbar();
  }
  syncToolbar() {
    const tool = this.canvasManager.activeInstrument;
    document
      .querySelectorAll("[data-instrument]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.instrument === "layers" ? !!this.showingLayers : b.dataset.instrument === tool)),
      );
    $("toolStatus").textContent = names[tool];
  }
  setupToolbar() {
    $("toolbar").onclick = (e) => {
      const button = e.target.closest("[data-instrument]");
      if (button) this.chooseTool(button.dataset.instrument);
    };
    this.syncToolbar();
  }
  commit() {
    this.canvasManager.saveHistory();
    this.canvasManager.render();
  }
  field(parent, label, type, value, change, options = {}) {
    const row = document.createElement("label");
    row.className = "field";
    row.append(document.createTextNode(label));
    const input = document.createElement(
      type === "select" ? "select" : "input",
    );
    input.setAttribute("aria-label", label);
    if (type === "select")
      for (const [value, text] of options.choices) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        input.append(option);
      }
    else input.type = type;
    for (const key of ["min", "max", "step"])
      if (options[key] !== undefined) input[key] = options[key];
    if (type === "checkbox") input.checked = value;
    else input.value = value;
    const apply = () => {
      let v =
        type === "checkbox"
          ? input.checked
          : type === "number" || type === "range"
            ? Number(input.value)
            : input.value;
      if (typeof v === "number") {
        if (!input.value || !Number.isFinite(v)) return;
        v = Math.max(
          Number(options.min ?? -Infinity),
          Math.min(Number(options.max ?? Infinity), v),
        );
      }
      change(v);
      this.canvasManager.render();
    };
    input.addEventListener("input", apply);
    input.addEventListener("change", () => {
      apply();
      this.canvasManager.saveHistory();
    });
    row.append(input);
    parent.append(row);
    return input;
  }
  hint(parent, text) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = text;
    parent.append(p);
  }
  button(parent, text, action, iconName = null) {
    const b = document.createElement("button");
    if (iconName) b.append(icon(iconName));
    b.append(document.createTextNode(text));
    b.onclick = action;
    parent.append(b);
    return b;
  }
  upload(parent, label, current, onload) {
    const row = document.createElement("label");
    row.className = "upload";
    row.textContent = label;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    row.append(input);
    parent.append(row);
    if (current) {
      const preview = document.createElement("img");
      preview.src = current;
      preview.className = "preview";
      preview.alt = label;
      parent.append(preview);
    }
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = async () => {
          await onload(image, file);
          this.commit();
          this.loadInstrumentSettings(this.canvasManager.activeInstrument);
        };
        image.onerror = () =>
          showAlert("This image could not be opened. Try PNG, JPEG, or SVG.");
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
  }
  setupEmptyCellSettings() {
    const cm = this.canvasManager;
    for (const [id, key] of [
      ["emptyFillColor", "fillColor"],
      ["emptyBorderColor", "borderColor"],
    ]) {
      $(id).oninput = (e) => {
        cm.emptyCellSettings[key] = e.target.value;
        cm.render();
      };
      $(id).onchange = (e) => {
        $(id).oninput(e);
        this.commit();
      };
    }
    $("emptyPattern").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          cm.emptyCellSettings.pattern = image;
          cm.emptyCellSettings.patternSrc = image.src;
          this.commit();
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
  }
  setupLayerControls() {
    this.layerList = $("layerList");
    const cm = this.canvasManager;
    $("addLayer").onclick = () => {
      cm.addLayer();
      this.refresh();
    };
    $("removeLayer").onclick = async () => {
      if (cm.layers.length === 1) return;
      if (
        await askConfirm(
          `Delete “${cm.layers[cm.activeLayerIndex].name}” and its artwork?`,
          { title:"Delete layer", acceptLabel:"Delete layer", danger:true },
        )
      ) {
        cm.removeActiveLayer();
        this.refresh();
      }
    };
    const reorder = (delta) => {
      const from = cm.activeLayerIndex,
        to = from + delta;
      if (to < 0 || to >= cm.layers.length) return;
      [cm.layers[from], cm.layers[to]] = [cm.layers[to], cm.layers[from]];
      for (const objects of [cm.freeDrawObjects, cm.customObjects])
        for (const obj of objects.values()) {
          if (obj.layerIndex === from) obj.layerIndex = to;
          else if (obj.layerIndex === to) obj.layerIndex = from;
        }
      cm.activeLayerIndex = to;
      this.commit();
      this.refresh();
    };
    $("layerUp").onclick = () => reorder(1);
    $("layerDown").onclick = () => reorder(-1);
  }
  updateLayerList() {
    const cm = this.canvasManager;
    if (this.layerList.querySelector(".layer-rename")) return;
    this.layerList.replaceChildren();
    [...cm.layers.entries()].reverse().forEach(([index, layer]) => {
      const li = document.createElement("li");
      li.classList.toggle("active", index === cm.activeLayerIndex);
      const eye = this.button(
        li,
        "",
        () => {
          layer.visible = !layer.visible;
          cm.selectedObjects = { grid: [], free: [], custom: [] };
          this.commit();
          this.refresh();
        },
        layer.visible ? "eye" : "eye-closed",
      );
      eye.title = layer.visible ? "Hide layer" : "Show layer";
      eye.setAttribute("aria-label", `${eye.title}: ${layer.name}`);
      const name = this.button(li, layer.name, () => {
        cm.setActiveLayer(index);
        // Keep the click target alive so the browser can deliver a double-click.
        [...this.layerList.children].forEach((row) =>
          row.classList.toggle("active", row === li),
        );
        $("layerUp").disabled = index === cm.layers.length - 1;
        $("layerDown").disabled = index === 0;
        this.updateAppearanceControls();
        this.loadInstrumentSettings(cm.activeInstrument);
      });
      name.className = "layer-name";
      name.title = "Click to activate; double-click to rename";
      const beginRename = () => {
        if (li.querySelector(".layer-rename")) return;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "layer-rename";
        input.value = layer.name;
        input.maxLength = 160;
        input.setAttribute("aria-label", "Layer name");
        let cancelled = false,
          finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          const value = input.value.trim();
          if (!cancelled && value && value !== layer.name) {
            layer.name = value;
            this.commit();
          }
          name.textContent = layer.name;
          input.replaceWith(name);
          rename.setAttribute("aria-label", `Rename ${layer.name}`);
          eye.setAttribute(
            "aria-label",
            `${layer.visible ? "Hide layer" : "Show layer"}: ${layer.name}`,
          );
        };
        input.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
            name.focus();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancelled = true;
            input.blur();
            name.focus();
          }
        };
        input.onblur = finish;
        name.replaceWith(input);
        input.focus();
        input.select();
      };
      name.ondblclick = beginRename;
      const rename = this.button(li, "", beginRename, "edit-pencil");
      rename.title = "Rename layer";
      rename.setAttribute("aria-label", `Rename ${layer.name}`);
      const count = document.createElement("small");
      count.textContent =
        layer.objects.size +
        [...cm.freeDrawObjects.values(), ...cm.customObjects.values()].filter(
          (o) => o.layerIndex === index,
        ).length;
      li.append(count);
      this.layerList.append(li);
    });
    $("layerUp").disabled = cm.activeLayerIndex === cm.layers.length - 1;
    $("layerDown").disabled = cm.activeLayerIndex === 0;
    $("removeLayer").disabled = cm.layers.length === 1;
  }
  setupAppearanceSettings() {
    const cm = this.canvasManager;
    for (const [id, key, type] of [
      ["bordersEnabled", "enabled", "check"],
      ["borderStyle", "style", "text"],
      ["borderColor", "color", "text"],
      ["borderWidth", "width", "number"],
      ["hatchStrokes", "hatchStrokes", "number"],
      ["hatchStacks", "hatchStacks", "number"],
      ["hatchBlockDensity", "hatchBlockDensity", "number"],
      ["hatchRandomness", "hatchRandomness", "number"],
      ["hatchAngle", "hatchAngle", "number"],
    ]) {
      $(id).oninput = (e) => {
        const limits = {
          width: [0.1, 1],
          hatchStrokes: [2, 12],
          hatchStacks: [1, 6],
          hatchBlockDensity: [0.3, 3],
          hatchRandomness: [0, 1],
          hatchAngle: [0, 180],
          density: [8, 100],
        }[key] || [0, Infinity];
        cm.gridBorderOptions[key] =
          type === "check"
            ? e.target.checked
            : type === "number"
              ? Math.max(
                  limits[0],
                  Math.min(limits[1], Number(e.target.value) || limits[0]),
                )
              : e.target.value;
        $("hatchSettings").hidden = cm.gridBorderOptions.style !== "hatch";
        if (id === "borderStyle" && e.target.value === "image")
          $("customBorderSettings").open = true;
        cm.render();
      };
      $(id).onchange = (e) => {
        $(id).oninput(e);
        this.commit();
      };
    }
    $("borderRegenerate").onclick = () => {
      cm.gridBorderOptions.seed = (cm.gridBorderOptions.seed || 7) + 1;
      this.commit();
    };
    for (const [id, imageKey, srcKey] of [
      ["borderPattern", "image", "imageSrc"],
      ["borderCornerPattern", "cornerImage", "cornerImageSrc"],
    ]) {
      $(id).onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onerror = () => {
          $("borderUploadStatus").textContent =
            "Could not read this file. Please try another image.";
        };
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => {
            $("borderUploadStatus").textContent =
              "This image could not be opened. Use PNG, JPEG, or SVG.";
          };
          image.onload = () => {
            Object.assign(cm.gridBorderOptions, {
              [imageKey]: image,
              [srcKey]: image.src,
              style: "image",
              enabled: true,
            });
            this.commit();
            this.updateAppearanceControls();
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      };
    }
    const shadow = () => {
      const layer = cm.layers[cm.activeLayerIndex];
      if (!layer) return;
      layer.gridShadowOptions = {
        enabled: $("shadowsEnabled").checked,
        angle: Number($("shadowAngle").value),
        offset: Math.max(0, Math.min(5, Number($("shadowOffset").value))),
        color:
          $("shadowColorRGB").value +
          Math.round(Number($("shadowAlpha").value) * 255)
            .toString(16)
            .padStart(2, "0"),
      };
      $("shadowAlphaValue").textContent = Number(
        $("shadowAlpha").value,
      ).toFixed(2);
      cm.render();
    };
    for (const id of [
      "shadowsEnabled",
      "shadowAngle",
      "shadowAngleNumber",
      "shadowOffset",
      "shadowColorRGB",
      "shadowAlpha",
    ]) {
      $(id).oninput = () => {
        if (id === "shadowAngle") $("shadowAngleNumber").value = $(id).value;
        if (id === "shadowAngleNumber") $("shadowAngle").value = $(id).value;
        shadow();
      };
      $(id).onchange = (e) => {
        $(id).oninput(e);
        this.commit();
      };
    }
  }
  setupLightingSettings() {
    const cm = this.canvasManager;
    for (const [id, key] of [
      ["preserveGlobalLight", "preserveGlobal"],
      ["ambientBrightness", "brightness"],
      ["ambientColor", "color"],
      ["globalLightEnabled", "globalEnabled"],
      ["globalLightColor", "lightColor"],
      ["globalLightIntensity", "intensity"],
      ["globalLightTint", "tintStrength"],
      ["globalLightAngle", "angle"],
      ["globalShadowLength", "shadowLength"],
      ["globalShadowOpacity", "shadowOpacity"],
      ["globalShadowColor", "shadowColor"],
      ["globalShadowSoftness", "shadowSoftness"],
    ]) {
      $(id).oninput = (e) => {
        const input = e.target;
        if (input.type === "number" && input.value === "") return;
        let value =
          input.type === "checkbox"
            ? input.checked
            : input.type === "color"
              ? input.value
              : Number(input.value);
        if (typeof value === "number") {
          if (!Number.isFinite(value)) return;
          value = Math.max(
            input.min === "" ? -Infinity : Number(input.min),
            Math.min(input.max === "" ? Infinity : Number(input.max), value),
          );
        }
        const target = id.startsWith("global")
          ? cm.globalLight
          : cm.ambientLight;
        target[key] = value;
        cm.render();
        this.updateLightingStatus();
      };
      $(id).onchange = (e) => {
        $(id).oninput(e);
        this.commit();
      };
    }
    $("bakeLighting").onclick = () => cm.bakeLighting();
    $("liveLighting").onclick = () => {
      cm.bakedLighting = null;
      cm.bakeStatus = "Live lighting";
      cm.render();
      this.updateLightingStatus();
    };
  }
  updateLightingStatus() {
    const cm = this.canvasManager;
    $("preserveGlobalLight").checked = cm.ambientLight.preserveGlobal;
    $("ambientBrightness").value = cm.ambientLight.brightness;
    $("ambientBrightness").disabled = cm.ambientLight.preserveGlobal;
    $("ambientColor").value = cm.ambientLight.color;
    const global = { ...ambientDefaults, ...cm.globalLight };
    $("globalLightEnabled").checked = !!global.globalEnabled;
    for (const [id, key] of [
      ["globalLightColor", "lightColor"],
      ["globalLightIntensity", "intensity"],
      ["globalLightTint", "tintStrength"],
      ["globalLightAngle", "angle"],
      ["globalShadowLength", "shadowLength"],
      ["globalShadowOpacity", "shadowOpacity"],
      ["globalShadowColor", "shadowColor"],
      ["globalShadowSoftness", "shadowSoftness"],
    ]) {
      $(id).value = global[key];
      $(id).disabled = !global.globalEnabled;
    }

    document
      .querySelectorAll(".lighting-status")
      .forEach((p) => (p.textContent = cm.bakeStatus || "Live lighting"));
    $("liveLighting").disabled = !cm.bakedLighting;
  }
  updateAppearanceControls() {
    this.updateExportControls();
    this.updateLightingStatus();
    const cm = this.canvasManager,
      b = { ...borderDefaults, ...cm.gridBorderOptions },
      s = {
        ...constants.defaultGridShadowOptions,
        ...cm.layers[cm.activeLayerIndex]?.gridShadowOptions,
      };
    for (const [id, key] of [
      ["borderStyle", "style"],
      ["borderColor", "color"],
      ["borderWidth", "width"],
      ["hatchStrokes", "hatchStrokes"],
      ["hatchStacks", "hatchStacks"],
      ["hatchBlockDensity", "hatchBlockDensity"],
      ["hatchRandomness", "hatchRandomness"],
      ["hatchAngle", "hatchAngle"],
    ])
      $(id).value = b[key];
    $("bordersEnabled").checked = b.enabled;
    $("hatchSettings").hidden = b.style !== "hatch";
    $("borderPatternPreview").hidden = !b.imageSrc;
    if (b.imageSrc) $("borderPatternPreview").src = b.imageSrc;
    $("borderCornerPatternPreview").hidden = !b.cornerImageSrc;
    if (b.cornerImageSrc)
      $("borderCornerPatternPreview").src = b.cornerImageSrc;
    $("borderUploadStatus").textContent =
      b.imageSrc && b.cornerImageSrc
        ? "Edge and corner ready. Rotation, mirroring, and joins are automatic."
        : b.imageSrc
          ? "Edge ready — upload a corner image to complete the pattern."
          : b.cornerImageSrc
            ? "Corner ready — upload an edge image to complete the pattern."
            : "Custom borders need both an edge image and a corner image.";
    $("shadowsEnabled").checked = s.enabled;
    $("shadowAngle").value = s.angle;
    $("shadowAngleNumber").value = s.angle;
    $("shadowOffset").value = s.offset;
    $("shadowColorRGB").value = s.color.slice(0, 7);
    $("shadowAlpha").value = parseInt(s.color.slice(7, 9) || "80", 16) / 255;
    $("shadowAlphaValue").textContent = Number($("shadowAlpha").value).toFixed(
      2,
    );
    $("exportColorMode").value = cm.exportSettings.colorMode;
    $("exportPadding").value = cm.exportSettings.padding;
    $("emptyFillColor").value = cm.emptyCellSettings.fillColor;
    $("emptyBorderColor").value = cm.emptyCellSettings.borderColor;
    this.syncToolbar();
  }
  lightFields(parent, obj) {
    this.field(parent, "Color", "color", obj.color, (v) => (obj.color = v));
    this.field(
      parent,
      "Brightness",
      "range",
      obj.intensity,
      (v) => (obj.intensity = v),
      { min: 0, max: 2, step: 0.05 },
    );
    this.field(
      parent,
      "Range (cells)",
      "number",
      obj.radius,
      (v) => (obj.radius = v),
      { min: 0.5, max: 40, step: 0.5 },
    );
    this.field(
      parent,
      "Rebounds",
      "number",
      obj.bounces,
      (v) => (obj.bounces = Math.round(v)),
      { min: 0, max: 3, step: 1 },
    );
    this.button(
      parent,
      "Bake lighting",
      () => this.canvasManager.bakeLighting(),
      "floppy-disk",
    );
    const status = document.createElement("p");
    status.className = "hint lighting-status";
    status.textContent = this.canvasManager.bakeStatus || "Live lighting";
    parent.append(status);
    this.hint(
      parent,
      "Light illuminates this layer and visible layers below it. Solid grid cells and objects cast shadows. Rebounds use sampled, fading reflections.",
    );
  }
  tilesetFields(parent, settings) {
    const cm = this.canvasManager,
      row = document.createElement("label"),
      input = document.createElement("input");
    row.className = "upload";
    row.append(document.createTextNode("Add tileset textures"));
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    row.append(input);
    parent.append(row);
    input.onchange = async () => {
      try {
        const images = await Promise.all(
          [...input.files].map(
            (file) =>
              new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = reject;
                reader.onload = async () => {
                  try {
                    const image = cm.getTileImage(reader.result);
                    await image.decode();
                    resolve(reader.result);
                  } catch (error) {
                    reject(error);
                  }
                };
                reader.readAsDataURL(file);
              }),
          ),
        );
        if (!images.length || settings !== cm.gridDrawSettings) return;
        cm.gridImageList = [...new Set([...cm.gridImageList, ...images])];
        settings.tileset = [
          ...new Set([...(settings.tileset || []), ...images]),
        ];
        settings.imageSrc = settings.tileset[0];
        settings.image = cm.getTileImage(settings.imageSrc);
        settings.type = "image";
        settings.imageOutlineEnabled ??= false;
        this.commit();
        this.loadInstrumentSettings("gridDraw");
      } catch {
        showAlert("A texture could not be opened. Use PNG, JPEG, or SVG images.");
      }
    };
    if (!cm.gridImageList.length) return;
    const selected = settings.tileset?.length
      ? settings.tileset
      : settings.imageSrc
        ? [settings.imageSrc]
        : [];
    const gallery = document.createElement("div");
    gallery.className = "tileset-gallery";
    cm.gridImageList.forEach((src, index) => {
      const label = document.createElement("label"),
        check = document.createElement("input"),
        image = document.createElement("img");
      label.className = "tile-choice";
      check.type = "checkbox";
      check.checked = selected.includes(src);
      check.setAttribute("aria-label", `Use tile ${index + 1}`);
      image.src = src;
      image.alt = `Tile ${index + 1}`;
      check.onchange = () => {
        const active = new Set(
          settings.tileset?.length ? settings.tileset : selected,
        );
        check.checked ? active.add(src) : active.delete(src);
        settings.tileset = [...active];
        settings.imageSrc = settings.tileset[0] || null;
        settings.image = cm.getTileImage(settings.imageSrc);
        settings.type = settings.tileset.length ? "image" : "color";
        this.commit();
        this.loadInstrumentSettings("gridDraw");
      };
      label.append(image, check);
      gallery.append(label);
    });
    parent.append(gallery);
    if (settings.type !== "image") return;
    this.hint(
      parent,
      "Checked tiles are chosen randomly once per painted cell. Uncheck all but one to paint a specific tile. Rotation uses quarter turns so tiles fill their cells.",
    );
    for (const [label, key] of [
      ["Random horizontal mirroring", "mirrorHorizontal"],
      ["Random vertical mirroring", "mirrorVertical"],
      ["Random quarter-turn rotation", "randomRotation"],
    ])
      this.field(
        parent,
        label,
        "checkbox",
        !!settings[key],
        (v) => (settings[key] = v),
      );
    for (const [label, key, max, step] of [
      ["Hue variation (±°)", "hueRandomness", 180, 1],
      ["Saturation variation", "saturationRandomness", 1, 0.05],
      ["Brightness variation", "brightnessRandomness", 1, 0.05],
      ["Contrast variation", "contrastRandomness", 1, 0.05],
    ])
      this.field(
        parent,
        label,
        "range",
        settings[key] || 0,
        (v) => (settings[key] = v),
        { min: 0, max, step },
      );
  }
  loadInstrumentSettings(instrument) {
    const cm = this.canvasManager,
      p = $("instrumentSettings");
    $("toolPanel").hidden = !!this.showingLayers;
    $("appearancePanel").hidden = !this.showingLayers;
    $("inspectorToolTitle").textContent = this.showingLayers ? "Layers" : names[instrument] || "Instrument";
    p.replaceChildren();
    const h = document.createElement("h3");
    h.textContent = names[instrument];
    p.append(h);
    this.syncToolbar();
    if (instrument === "polygon") {
      this.hint(p, "Tap or click to place vertices. Tap the first vertex or Finish polygon to close. Enter finishes; Escape cancels.");
      this.hint(p, `${cm.polygonDraft.length} vertices placed`);
      this.button(p, "Finish polygon", () => cm.finishPolygon()).disabled = cm.polygonDraft.length < 3;
      this.button(p, "Remove last vertex", () => { cm.polygonDraft.pop(); cm.render(); this.loadInstrumentSettings("polygon"); }).disabled = !cm.polygonDraft.length;
      this.button(p, "Cancel polygon", () => { cm.polygonDraft = []; cm.render(); this.loadInstrumentSettings("polygon"); });
      this.polygonFields(p, cm.polygonSettings);
    } else if (instrument === "pan") {
      this.hint(p, "Drag to move the map. Pinch with two fingers to zoom. Choose a drawing tool to edit.");
    } else if (instrument === "gridDraw") {
      const s = cm.gridDrawSettings;
      this.hint(
        p,
        "Paint cells on the active layer. Use Layers for outer-edge textures and layer lighting.",
      );
      this.field(p, "Fill", "color", s.fillColor, (v) => {
        s.fillColor = v;
        s.type = "color";
        s.image = null;
        s.imageSrc = null;
      });
      const outlineKey =
        s.type === "image" ? "imageOutlineEnabled" : "outlineEnabled";
      const enabled =
        s.type === "image" ? s[outlineKey] === true : s[outlineKey] !== false;
      let outlineColor;
      this.field(p, "Show cell outline", "checkbox", enabled, (v) => {
        s[outlineKey] = v;
        outlineColor.closest("label").hidden = !v;
      });
      outlineColor = this.field(
        p,
        "Cell outline",
        "color",
        s.borderColor,
        (v) => (s.borderColor = v),
      );
      outlineColor.closest("label").hidden = !enabled;
      this.field(
        p,
        "Blocks light",
        "checkbox",
        s.blocksLight !== false,
        (v) => (s.blocksLight = v),
      );
      this.field(
        p,
        "Cast shadows",
        "checkbox",
        s.castsShadow !== false,
        (v) => (s.castsShadow = v),
      );
      this.field(
        p,
        "Receive global shadows",
        "checkbox",
        (s.receivesGlobalShadow ?? s.receivesShadow) === true,
        (v) => (s.receivesGlobalShadow = v),
      );
      this.field(
        p,
        "Receive light-source shadows",
        "checkbox",
        s.receivesLightShadow !== false,
        (v) => (s.receivesLightShadow = v),
      );
      this.field(
        p,
        "Opacity",
        "range",
        s.opacity ?? 1,
        (v) => (s.opacity = v),
        { min: 0, max: 1, step: 0.01 },
      );
      this.tilesetFields(p, s);
      this.button(p, "Use solid fill", () => {
        s.type = "color";
        s.image = null;
        s.imageSrc = null;
        this.commit();
        this.loadInstrumentSettings(instrument);
      });
    } else if (instrument === "freeDraw") {
      const s = cm.freeDrawSettings;
      this.hint(p, "Draw or stamp texture on the active layer.");
      this.field(p, "Fill", "color", s.fillColor, (v) => {
        s.fillColor = v;
        if (s.svgSource) cm.updateBrushImage();
      });
      this.field(
        p,
        "Outline",
        "color",
        s.strokeColor,
        (v) => (s.strokeColor = v),
      );
      this.field(
        p,
        "Size baseline (cells)",
        "range",
        s.size,
        (v) => cm.setBrushSize(v),
        { min: 0.1, max: 30, step: 0.1 },
      );
      this.hint(
        p,
        "Hold Alt and scroll over the map to change baseline size. [ and ] also resize; the circle shows the diameter before size variation.",
      );
      this.field(
        p,
        "Spacing (cells)",
        "number",
        s.period,
        (v) => (s.period = v),
        { min: 0, max: 30, step: 0.1 },
      );
      this.upload(
        p,
        "Brush texture",
        s.sourceImageSrc || s.image?.src,
        async (img) => {
          await cm.updateBrushImage(img.src);
        },
      );
      if (s.image || s.sourceImageSrc) {
        this.field(
          p,
          "Spread (cells)",
          "number",
          s.spread || 0,
          (v) => (s.spread = v),
          { min: 0, max: 10, step: 0.1 },
        );
        this.field(
          p,
          "Rotation randomness (±°)",
          "number",
          s.rotationRandomness || 0,
          (v) => (s.rotationRandomness = v),
          { min: 0, max: 180, step: 1 },
        );
        this.field(
          p,
          "Size randomness",
          "range",
          s.sizeRandomness || 0,
          (v) => (s.sizeRandomness = v),
          { min: 0, max: 0.95, step: 0.05 },
        );
        this.field(
          p,
          "Random mirroring",
          "select",
          s.mirroring || "none",
          (v) => (s.mirroring = v),
          {
            choices: [
              ["none", "None"],
              ["horizontal", "Horizontal"],
              ["vertical", "Vertical"],
              ["both", "Both axes"],
            ],
          },
        );
        if (s.svgSource) {
          this.field(
            p,
            "Keep original SVG colors",
            "checkbox",
            !!s.preserveSvgColors,
            (v) => {
              s.preserveSvgColors = v;
              cm.updateBrushImage();
            },
          );
          this.field(
            p,
            "SVG background",
            "checkbox",
            !!s.backgroundEnabled,
            (v) => {
              s.backgroundEnabled = v;
              cm.updateBrushImage();
            },
          );
          this.field(
            p,
            "SVG background color",
            "color",
            s.backgroundColor || "#ffffff",
            (v) => {
              s.backgroundColor = v;
              cm.updateBrushImage();
            },
          );
          this.hint(
            p,
            "Fill tints SVG artwork unless original colors are kept. SVG background replaces full-canvas background rectangles; leave it off for transparency.",
          );
        }
        this.button(p, "Remove brush texture", () => {
          cm.brushImageRequest = (cm.brushImageRequest || 0) + 1;
          s.image = null;
          s.svgSource = null;
          s.sourceImageSrc = null;
          this.commit();
          this.loadInstrumentSettings("freeDraw");
        });
      }
    } else if (instrument === "addObject") {
      this.hint(
        p,
        "Upload an image, then click the map to place it on the active layer. Switch to Select to move, resize, and rotate.",
      );
      this.upload(p, "Object image", null, (img, file) => cm.addObjectImage(img, file.name));
      const library = document.createElement("div");
      library.className = "object-library";
      library.setAttribute("role", "group");
      library.setAttribute("aria-label", "Uploaded objects");
      for (const asset of cm.objectImageList) {
        const button = this.button(library, "", () => {
          cm.selectObjectImage(asset.src);
          this.commit();
          this.loadInstrumentSettings("addObject");
        });
        button.className = "object-asset";
        button.title = asset.name;
        button.setAttribute("aria-label", asset.name);
        button.setAttribute("aria-pressed", String(asset.src === cm.customObjectImageSrc));
        const image = document.createElement("img");
        image.src = asset.src;
        image.alt = "";
        const label = document.createElement("span");
        label.textContent = asset.name;
        button.append(image, label);
      }
      p.append(library);
    } else if (instrument === "light") {
      this.field(
        p,
        "Placement layer",
        "select",
        String(cm.activeLayerIndex),
        (v) => {
          cm.setActiveLayer(Number(v));
          this.updateLayerList();
        },
        {
          choices: cm.layers.map((layer, index) => [String(index), layer.name]),
        },
      );
      this.hint(
        p,
        "Click the map to place a light. Select it to move it or change its settings.",
      );
      this.lightFields(p, cm.lightSettings);
    } else if (instrument === "select") {
      const ids = cm.selectedObjects.custom,
        objs = ids.map((id) => cm.customObjects.get(id)).filter(Boolean),
        count = Object.values(cm.selectedObjects).reduce(
          (n, a) => n + a.length,
          0,
        );
      this.hint(
        p,
        objs.length === 1 && objs[0].type === "light"
          ? "Drag the light marker to move it. Adjust its color, brightness, range, or rebounds below."
          : cm.selectionGroup()
            ? `${count} grouped objects. Drag to move, use square handles to resize, or the round handle to rotate. Ctrl/Cmd+Shift+G ungroups.`
            : count
              ? `${count} selected. Drag to move. Use square handles to resize and the round handle to rotate. Shift constrains proportions or snaps rotation. Double-click a side to edit its length in cells.`
              : "Click an object or drag a selection box. Selection and editing apply to the active visible layer.",
      );
      if (count) this.hint(p, "Arrow keys move one cell; Shift+Arrow moves ten cells.");
      if (cm.selectedObjects.grid.length) {
        const cells = cm.selectedObjects.grid
            .map((id) => cm.layers[cm.activeLayerIndex].objects.get(id))
            .filter(Boolean),
          count = cells.filter((c) => c.castsShadow !== false).length;
        this.field(p, "Fill", "color", cells[0].fillColor || "#ffffff", (v) => {
          for (const cell of cells) {
            cell.fillColor = v;
            cell.type = "color";
            delete cell.image;
            delete cell.imageSrc;
          }
        });
        const outlineCount = cells.filter(
          (cell) => cell.outlineEnabled ?? cell.type !== "image",
        ).length;
        let outlineColor;
        const outlineToggle = this.field(
          p,
          "Show cell outline",
          "checkbox",
          outlineCount === cells.length,
          (v) => {
            for (const cell of cells) cell.outlineEnabled = v;
            outlineColor.closest("label").hidden = !v;
          },
        );
        outlineToggle.indeterminate =
          outlineCount > 0 && outlineCount < cells.length;
        outlineColor = this.field(
          p,
          "Cell outline",
          "color",
          cells[0].borderColor || "#000000",
          (v) => {
            for (const cell of cells) cell.borderColor = v;
          },
        );
        outlineColor.closest("label").hidden = outlineCount === 0;
        const receiveCount = cells.filter(
          (c) => (c.receivesGlobalShadow ?? c.receivesShadow) === true,
        ).length;
        const receive = this.field(
          p,
          "Receive global shadows",
          "checkbox",
          receiveCount === cells.length,
          (v) => {
            for (const cell of cells) cell.receivesGlobalShadow = v;
          },
        );
        receive.indeterminate = receiveCount > 0 && receiveCount < cells.length;
        const lightCount = cells.filter(
          (c) => c.receivesLightShadow !== false,
        ).length;
        const lightToggle = this.field(
          p,
          "Receive light-source shadows",
          "checkbox",
          lightCount === cells.length,
          (v) => {
            for (const cell of cells) cell.receivesLightShadow = v;
          },
        );
        lightToggle.indeterminate = lightCount > 0 && lightCount < cells.length;
        this.field(
          p,
          "Opacity",
          "range",
          cells[0].opacity ?? 1,
          (v) => {
            for (const cell of cells) cell.opacity = v;
          },
          { min: 0, max: 1, step: 0.01 },
        );
        const toggle = this.field(
          p,
          "Cast shadows",
          "checkbox",
          count === cells.length,
          (v) => {
            for (const cell of cells) cell.castsShadow = v;
          },
        );
        toggle.indeterminate = count > 0 && count < cells.length;
        this.hint(
          p,
          "Applies to selected grid cells. Casting and receiving are independent. Global shadows are opt-in; light-source shadows have their own switch.",
        );
      }
      const group = cm.selectionGroup(),
        members = cm.selectedMembers();
      if (group) {
        let widthInput, heightInput;
        const resize = (dimension, value) => {
          cm.setGroupDimension(dimension, value * cm.currentCellSize);
          const frame = cm.selectionGroup();
          if (dimension !== "width") widthInput.value = Number((frame.width/cm.currentCellSize).toFixed(4));
          if (dimension !== "height") heightInput.value = Number((frame.height/cm.currentCellSize).toFixed(4));
        };
        widthInput = this.field(p, "Group width (cells)", "number", Number((group.width/cm.currentCellSize).toFixed(4)),
          v => resize("width",v), { min:.05, max:10000, step:.1 });
        heightInput = this.field(p, "Group height (cells)", "number", Number((group.height/cm.currentCellSize).toFixed(4)),
          v => resize("height",v), { min:.05, max:10000, step:.1 });
        this.field(
          p,
          "Group rotation (°)",
          "number",
          Number(((group.rotation * 180) / Math.PI).toFixed(2)),
          (v) => cm.setGroupRotation(v),
          { min: -3600, max: 3600, step: 1 },
        );
        this.hint(
          p,
          "Drag a square handle to resize the group or the round handle to rotate. Resizing keeps the members' proportions and scales their spacing together.",
        );
      }
      const groupButton = this.button(
        p,
        "Group objects",
        () => cm.groupSelection(),
        "link",
      );
      groupButton.disabled =
        cm.selectedObjects.grid.length > 0 || members.length < 2 || !!group;
      this.button(
        p,
        "Ungroup objects",
        () => cm.ungroupSelection(),
        "link-slash",
      ).disabled = !members.some((m) => m.obj.groupId);
      if (cm.selectedObjects.grid.length)
        this.hint(
          p,
          "Grouping applies to image objects, brush stamps, and lights. Grid cells keep their grid positions.",
        );
      if (members.length === 1 && members[0].obj.type !== "light") {
        const object = members[0].obj;
        this.field(
          p,
          "Mirror horizontally",
          "checkbox",
          !!object.mirrorX,
          (v) => (object.mirrorX = v),
        );
        this.field(
          p,
          "Mirror vertically",
          "checkbox",
          !!object.mirrorY,
          (v) => (object.mirrorY = v),
        );
      }
      if (objs.length === 1 && members.length === 1) {
        const obj = objs[0];
        if (obj.type === "polygon") this.polygonFields(p, obj);
        if (obj.type === "light") this.lightFields(p, obj);
        else {
          const lock = this.button(p, "", () => {
            obj.lockAspectRatio = !obj.lockAspectRatio;
            updateLock();
            this.commit();
          });
          const updateLock = () => {
            lock.replaceChildren(
              icon(obj.lockAspectRatio ? "lock" : "lock-slash"),
              document.createTextNode(
                obj.lockAspectRatio ? "Proportions locked" : "Lock proportions",
              ),
            );
            lock.setAttribute("aria-pressed", String(!!obj.lockAspectRatio));
            lock.setAttribute("aria-label", "Lock width/height ratio");
          };
          updateLock();
          let widthInput, heightInput;
          widthInput = this.field(
            p,
            "Width (cells)",
            "number",
            obj.width / cm.currentCellSize,
            (v) => {
              cm.setObjectDimension(obj, "width", v * cm.currentCellSize);
              heightInput.value = Number(
                (obj.height / cm.currentCellSize).toFixed(4),
              );
            },
            { min: 0.05, max: 1000, step: 0.1 },
          );
          heightInput = this.field(
            p,
            "Height (cells)",
            "number",
            obj.height / cm.currentCellSize,
            (v) => {
              cm.setObjectDimension(obj, "height", v * cm.currentCellSize);
              widthInput.value = Number(
                (obj.width / cm.currentCellSize).toFixed(4),
              );
            },
            { min: 0.05, max: 1000, step: 0.1 },
          );
          this.field(
            p,
            "Rotation (°)",
            "number",
            Math.round(((obj.rotation || 0) * 180) / Math.PI),
            (v) => (obj.rotation = (v * Math.PI) / 180),
            { min: -3600, max: 3600, step: 1 },
          );
          this.field(
            p,
            "Blocks light",
            "checkbox",
            obj.blocksLight !== false,
            (v) => (obj.blocksLight = v),
          );
        }
      }
      if (count) {
        const row = document.createElement("label");
        row.className = "field";
        row.textContent = "Move to layer";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Move to layer");
        cm.layers.forEach((l, i) => {
          const o = document.createElement("option");
          o.value = i;
          o.textContent = l.name;
          select.append(o);
        });
        select.value = cm.activeLayerIndex;
        select.onchange = () => {
          const target = Number(select.value);
          for (const kind of ["free", "custom"])
            for (const id of cm.selectedObjects[kind]) {
              const obj = (
                kind === "free" ? cm.freeDrawObjects : cm.customObjects
              ).get(id);
              if (obj) obj.layerIndex = target;
            }
          for (const id of cm.selectedObjects.grid) {
            const from = cm.layers[cm.activeLayerIndex].objects;
            cm.layers[target].objects.set(id, from.get(id));
            from.delete(id);
          }
          cm.setActiveLayer(target);
          this.commit();
          this.refresh();
        };
        row.append(select);
        p.append(row);
      }
      this.button(
        p,
        "Delete selection",
        () => {
          cm.deleteSelection();
          this.refresh();
        },
        "trash",
      ).disabled = !count;
    }
  }
}
