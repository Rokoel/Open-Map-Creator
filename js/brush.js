export const brushDefaults = {
  period: 0,
  size: 1,
  fillColor: "#40516a",
  strokeColor: "#40516a",
  image: null,
  spread: 0,
  rotationRandomness: 0,
  sizeRandomness: 0,
  mirroring: "none",
  preserveSvgColors: false,
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
  svgSource: null,
  sourceImageSrc: null,
};

export function svgFromDataUrl(src) {
  if (!/^data:image\/svg\+xml[;,]/i.test(src || "")) return null;
  const comma = src.indexOf(",");
  try {
    return src.slice(0, comma).includes(";base64")
      ? new TextDecoder().decode(
          Uint8Array.from(atob(src.slice(comma + 1)), (c) => c.charCodeAt(0)),
        )
      : decodeURIComponent(src.slice(comma + 1));
  } catch {
    return null;
  }
}

export function brushSvg(settings) {
  const doc = new DOMParser().parseFromString(
    settings.svgSource,
    "image/svg+xml",
  );
  if (doc.querySelector("parsererror")) throw Error("Invalid SVG");
  const root = doc.documentElement,
    ns = "http://www.w3.org/2000/svg";
  const view = (root.getAttribute("viewBox") || "")
    .trim()
    .split(/[ ,]+/)
    .map(Number);
  const [x, y, w, h] =
    view.length === 4 && view.every(Number.isFinite)
      ? view
      : [
          0,
          0,
          parseFloat(root.getAttribute("width")) || 100,
          parseFloat(root.getAttribute("height")) || 100,
        ];
  root.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  root.style.setProperty("background", "transparent", "important");
  const length = (value, reference, fallback) =>
    value?.endsWith("%")
      ? (parseFloat(value) * reference) / 100
      : parseFloat(value ?? fallback);
  // Full-canvas rectangles are the conventional SVG background. Keep enclosed
  // shapes intact; replace only rectangles that cover the complete viewBox.
  for (const rect of root.querySelectorAll("rect")) {
    if (rect.closest("defs, clipPath, mask, pattern, symbol")) continue;
    const rx = length(rect.getAttribute("x"), w, 0),
      ry = length(rect.getAttribute("y"), h, 0),
      rw = length(rect.getAttribute("width"), w, 0),
      rh = length(rect.getAttribute("height"), h, 0);
    if (
      !rect.closest("[transform]") &&
      rx <= x &&
      ry <= y &&
      rx + rw >= x + w &&
      ry + rh >= y + h
    )
      rect.remove();
  }
  const group = doc.createElementNS(ns, "g");
  for (const child of [...root.childNodes]) {
    if (
      child.nodeType === 1 &&
      ["defs", "style", "title", "desc"].includes(child.localName)
    )
      continue;
    group.append(child);
  }
  if (!settings.preserveSvgColors) {
    const defs = doc.createElementNS(ns, "defs"),
      filter = doc.createElementNS(ns, "filter"),
      flood = doc.createElementNS(ns, "feFlood"),
      composite = doc.createElementNS(ns, "feComposite");
    filter.id = "omc-brush-tint";
    filter.setAttribute("color-interpolation-filters", "sRGB");
    flood.setAttribute("flood-color", settings.fillColor);
    composite.setAttribute("in2", "SourceGraphic");
    composite.setAttribute("operator", "in");
    filter.append(flood, composite);
    defs.append(filter);
    root.append(defs);
    group.setAttribute("filter", "url(#omc-brush-tint)");
  }
  if (settings.backgroundEnabled) {
    const rect = doc.createElementNS(ns, "rect");
    for (const [key, value] of Object.entries({
      x,
      y,
      width: w,
      height: h,
      fill: settings.backgroundColor || "#ffffff",
    }))
      rect.setAttribute(key, value);
    rect.style.setProperty(
      "fill",
      settings.backgroundColor || "#ffffff",
      "important",
    );
    root.append(rect);
  }
  root.append(group);
  return new XMLSerializer().serializeToString(root);
}

export function loadBrushImage(settings, created = () => {}) {
  const src = settings.svgSource
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brushSvg(settings))}`
    : settings.sourceImageSrc;
  if (!src) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const image = new Image();
    created(image);
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error("Could not prepare brush image"));
    image.src = src;
  });
}
