import { corners, edges, gridEdges } from "./geometry.js";
import { polygonPoints } from "./polygons.js";

export const vttDefaults = {
  target: "roll20", format: "uvtt", pixelsPerCell: 70, quality: 0.9,
  showGrid: false, lighting: false, alignGrid: true, walls: true, lights: true,
  maxFileMB: 10,
};

export function vttPlan(manager, options = {}) {
  const settings = { ...vttDefaults, ...manager.exportSettings.vtt, ...options };
  if (!["roll20", "dndbeyond", "universal"].includes(settings.target)) throw Error("Choose a VTT target.");
  if (!["uvtt", "png", "jpg", "webp"].includes(settings.format)) throw Error("Choose a supported export format.");
  if (settings.target === "dndbeyond" && settings.format === "uvtt") throw Error("Use JPG, PNG, or WebP for D&D Beyond Maps.");
  if (settings.format === "uvtt") settings.alignGrid = true;
  const pixelsPerCell = Number(settings.pixelsPerCell);
  if (!Number.isInteger(pixelsPerCell) || pixelsPerCell < 16 || pixelsPerCell > 300) throw Error("Pixels per cell must be a whole number from 16 to 300.");
  const bounds = { ...manager.getExportBounds() };
  if (settings.alignGrid) {
    bounds.minX = Math.floor(bounds.minX); bounds.minY = Math.floor(bounds.minY);
    bounds.maxX = Math.ceil(bounds.maxX); bounds.maxY = Math.ceil(bounds.maxY);
  }
  bounds.width = bounds.maxX - bounds.minX; bounds.height = bounds.maxY - bounds.minY;
  if (![bounds.minX, bounds.minY, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) throw Error("The export area must have positive dimensions.");
  const width = Math.ceil(bounds.width * pixelsPerCell), height = Math.ceil(bounds.height * pixelsPerCell);
  if (width > 16384 || height > 16384 || width * height > 64000000) throw Error("This VTT image is too large. Reduce pixels per cell or the export area.");
  const maxFileMB = Number(settings.maxFileMB);
  if (!Number.isFinite(maxFileMB) || maxFileMB < 0 || maxFileMB > 100) throw Error("File budget must be between 0 and 100 MB (0 means unlimited).");
  return { settings: { ...settings, pixelsPerCell, maxFileMB }, bounds, width, height };
}

// Liang–Barsky clipping keeps cropped walls inside the image without inventing
// blocking walls along the crop boundary or joining separated wall fragments.
export function clipWall(a, b, bounds) {
  const dx = b.x-a.x, dy = b.y-a.y;
  let start = 0, end = 1;
  for (const [p,q] of [[-dx,a.x-bounds.minX],[dx,bounds.maxX-a.x],[-dy,a.y-bounds.minY],[dy,bounds.maxY-a.y]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const t = q/p;
    if (p < 0) start = Math.max(start,t); else end = Math.min(end,t);
    if (start > end) return null;
  }
  if (Math.hypot(dx*(end-start),dy*(end-start)) < 1e-7) return null;
  return [{x:a.x+start*dx,y:a.y+start*dy},{x:a.x+end*dx,y:a.y+end*dy}];
}

export function uvttData(manager, plan, image) {
  const { bounds, settings, width, height } = plan, size = manager.currentCellSize;
  const walls = [], lights = [], seen = new Set();
  const local = p => ({ x:p.x/size-bounds.minX, y:p.y/size-bounds.minY });
  const addWall = ({a,b}) => {
    const segment = clipWall({x:a.x/size,y:a.y/size},{x:b.x/size,y:b.y/size},bounds);
    if (!segment) return;
    const points = segment.map(p => ({x:p.x-bounds.minX,y:p.y-bounds.minY}));
    const key = points.map(p=>`${p.x.toFixed(6)},${p.y.toFixed(6)}`).sort().join(";");
    if (!seen.has(key)) { seen.add(key); walls.push(points); }
  };
  if (settings.walls) {
    // Union visible solid cells first: no internal seams between adjacent cells,
    // including cells from different layers. Floors with Blocks light off stay open.
    const cells = new Map();
    for (const layer of manager.layers) if (layer.visible)
      for (const [id,cell] of layer.objects)
        if (cell.blocksLight !== false && cell.castsShadow !== false) cells.set(id,cell);
    gridEdges(cells,size).forEach(addWall);
    for (const obj of manager.customObjects.values())
      if (manager.layers[obj.layerIndex]?.visible && obj.type !== "light" && obj.blocksLight !== false)
        edges(obj.type === "polygon" ? polygonPoints(obj) : corners(obj)).forEach(addWall);
  }
  if (settings.lights && !settings.lighting) for (const obj of manager.customObjects.values()) {
    if (obj.type !== "light" || !manager.layers[obj.layerIndex]?.visible || obj.intensity <= 0 || obj.radius <= 0) continue;
    const position = local(obj);
    if (position.x < 0 || position.y < 0 || position.x > bounds.width || position.y > bounds.height) continue;
    lights.push({position,range:obj.radius,intensity:obj.intensity,color:"ff"+obj.color.replace("#",""),shadows:true});
  }
  return {
    format: 1.0,
    resolution: { map_origin:{x:0,y:0}, map_size:{x:width/settings.pixelsPerCell,y:height/settings.pixelsPerCell}, pixels_per_grid:settings.pixelsPerCell },
    line_of_sight:walls, objects_line_of_sight:[], portals:[], lights,
    environment:{baked_lighting:!!settings.lighting,ambient_light:"ffffffff"},
    image,
  };
}

async function waitForImages(manager) {
  const images = new Set([manager.emptyCellSettings.pattern]);
  for (const layer of manager.layers) if (layer.visible) {
    for (const cell of layer.objects.values()) images.add(cell.image);
    images.add(layer.gridBorderOptions?.image); images.add(layer.gridBorderOptions?.cornerImage);
  }
  for (const obj of [...manager.customObjects.values(), ...manager.freeDrawObjects.values()])
    if (manager.layers[obj.layerIndex]?.visible) images.add(obj.image);
  await Promise.all([...images].filter(image=>image instanceof HTMLImageElement).map(async image => {
    try { await image.decode(); } catch { throw Error("A map texture could not load. Re-upload it before exporting."); }
  }));
}

export async function renderVTT(storage, options = {}) {
  const manager = storage.canvasManager, plan = vttPlan(manager, options);
  await waitForImages(manager);
  const { settings, bounds, width, height } = plan;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Could not create the VTT image. Try a smaller export.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,width,height);
  ctx.scale(settings.pixelsPerCell,settings.pixelsPerCell);
  ctx.translate(-bounds.minX,-bounds.minY);
  manager.drawAll(ctx,settings.pixelsPerCell,{
    bounds,colorMode:manager.exportSettings.colorMode,showGrid:settings.showGrid,lighting:settings.lighting,
  });
  storage.applyExportColor(canvas,manager.exportSettings.colorMode);
  return {canvas,plan};
}

function encode(canvas,type,quality) {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=> {
    if (!blob) reject(Error("The browser could not encode this image."));
    else if (blob.type !== type) reject(Error("This browser cannot export that image format. Choose PNG or JPG."));
    else resolve(blob);
  },type,quality));
}

export async function buildVTTExport(storage, options = {}) {
  const {canvas,plan} = await renderVTT(storage,options), {settings} = plan;
  let blob, data = null;
  if (settings.format === "uvtt") {
    data = uvttData(storage.canvasManager,plan,canvas.toDataURL("image/png").split(",")[1]);
    blob = new Blob([JSON.stringify(data)],{type:"application/json"});
  } else {
    const type = {png:"image/png",jpg:"image/jpeg",webp:"image/webp"}[settings.format];
    let quality = Math.max(.1,Math.min(1,Number(settings.quality) || .9));
    blob = await encode(canvas,type,quality);
    // Respect the requested byte budget without silently changing grid scale.
    while (settings.maxFileMB && blob.size > settings.maxFileMB*1000000 && settings.format !== "png" && quality > .35) {
      quality = Math.max(.35,quality-.1); blob = await encode(canvas,type,quality);
    }
  }
  if (settings.maxFileMB && blob.size > settings.maxFileMB*1000000) throw Error(`Export exceeds your ${settings.maxFileMB} MB file budget. Lower pixels per cell, choose JPG/WebP, shrink the area, or increase the budget.`);
  const dimension = n => Number(n.toFixed(4));
  const filename = `open-map-${settings.target}-${dimension(plan.width/settings.pixelsPerCell)}x${dimension(plan.height/settings.pixelsPerCell)}-${settings.pixelsPerCell}px.${settings.format}`;
  return {blob,filename,plan,data};
}

export function downloadVTT(result) {
  const url = URL.createObjectURL(result.blob), a = document.createElement("a");
  a.href = url; a.download = result.filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
