import { pdfLayout } from "./pdf-layout.js";

export function exportPageSize(settings) {
  const layout = pdfLayout(settings);
  return { width: layout.widthCells, height: layout.heightCells };
}

export function drawExportOverlay(manager, view) {
  if (!manager.exportOverlay) return;
  const ctx = manager.ctx, size = manager.currentCellSize;
  const b = manager.getExportBounds();
  let page;
  try { page = exportPageSize(manager.exportSettings); }
  catch (error) {
    // Invalid imported settings must not break map rendering or hide the frame.
    page = { width: Infinity, height: Infinity };
  }
  const x = b.minX * size, y = b.minY * size, w = b.width * size, h = b.height * size;
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.minX, view.minY, view.maxX-view.minX, view.maxY-view.minY);
  ctx.rect(x,y,w,h);
  ctx.fillStyle = "#14203966"; ctx.fill("evenodd");
  ctx.strokeStyle = "#3976c6"; ctx.lineWidth = 2 / manager.scale;
  ctx.strokeRect(x,y,w,h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  ctx.setLineDash([6/manager.scale, 4/manager.scale]);
  ctx.beginPath();
  // Limit guides to the visible view, avoiding work proportional to the whole map.
  for (let col = Math.max(1, Math.ceil((view.minX-x)/(page.width*size))); col*page.width < b.width && x+col*page.width*size < view.maxX; col++) {
    const px = x+col*page.width*size; ctx.moveTo(px,y); ctx.lineTo(px,y+h);
  }
  for (let row = Math.max(1, Math.ceil((view.minY-y)/(page.height*size))); row*page.height < b.height && y+row*page.height*size < view.maxY; row++) {
    const py = y+row*page.height*size; ctx.moveTo(x,py); ctx.lineTo(x+w,py);
  }
  ctx.stroke(); ctx.restore();
  ctx.fillStyle = "#ffffff";
  const r = 7 / manager.scale;
  for (const [px,py] of [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]) {
    ctx.fillRect(px-r,py-r,r*2,r*2); ctx.strokeRect(px-r,py-r,r*2,r*2);
  }
  ctx.font = `${13/manager.scale}px sans-serif`;
  ctx.fillStyle = "#3976c6";
  ctx.fillText(`Export · ${b.width.toFixed(2)} × ${b.height.toFixed(2)} cells · ${Math.ceil(b.width/page.width)} × ${Math.ceil(b.height/page.height)} pages`, x, y-12/manager.scale);
  ctx.restore();
}

export function setupEditorControls(manager) {
  const canvas = manager.canvas;
  const world = e => {
    const r = canvas.getBoundingClientRect();
    return manager.screenToWorld(e.clientX-r.left, e.clientY-r.top);
  };
  let drag;
  canvas.addEventListener("mousedown", e => {
    if (!manager.exportOverlay || e.button !== 0 || manager.activeInstrument === "pan") return;
    e.stopImmediatePropagation(); e.preventDefault();
    const p = world(e), size = manager.currentCellSize, b = manager.getExportBounds();
    const corners = [[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]];
    const corner = corners.findIndex(([x,y]) => Math.hypot(p.x-x*size,p.y-y*size) < 22/manager.scale);
    if (corner < 0 && (p.x < b.minX*size || p.x > b.maxX*size || p.y < b.minY*size || p.y > b.maxY*size)) return;
    drag = { b, p, corner };
  }, true);
  window.addEventListener("mousemove", e => {
    if (!drag) return;
    e.stopImmediatePropagation();
    const p = world(e), size = manager.currentCellSize;
    const dx = (p.x-drag.p.x)/size, dy = (p.y-drag.p.y)/size;
    const b = { ...drag.b };
    if (drag.corner < 0) {
      b.minX += dx; b.maxX += dx; b.minY += dy; b.maxY += dy;
    } else {
      if ([0,3].includes(drag.corner)) b.minX = Math.min(b.maxX-.25,b.minX+dx);
      else b.maxX = Math.max(b.minX+.25,b.maxX+dx);
      if ([0,1].includes(drag.corner)) b.minY = Math.min(b.maxY-.25,b.minY+dy);
      else b.maxY = Math.max(b.minY+.25,b.maxY+dy);
    }
    manager.exportSettings.region = { minX:b.minX, minY:b.minY, maxX:b.maxX, maxY:b.maxY };
    manager.render();
    window.hudInstance?.updateExportFields();
  }, true);
  window.addEventListener("mouseup", e => {
    if (!drag) return;
    drag = null; e.stopImmediatePropagation(); manager.saveHistory();
  }, true);

  // Touch events feed the established mouse tool pipeline. A second finger takes
  // over navigation before an edit is committed; lifting fingers never stamps artwork.
  const touches = new Map();
  let start, last, started = false, navigating = false, snapshot;
  const mouse = (type, p) => (type === "mouseup" ? window : canvas).dispatchEvent(new MouseEvent(type, {
    bubbles:true, cancelable:true, clientX:p.x, clientY:p.y, button:0, buttons:type === "mouseup" ? 0 : 1,
  }));
  const gesture = () => {
    const [a,b] = [...touches.values()];
    return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)) };
  };
  let previous;
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if (touches.size === 1) {
      start = last = {x:e.clientX,y:e.clientY}; started = navigating = false;
      snapshot = null;
    } else {
      if (started) {
        // Roll back only the uncommitted gesture. History/autosave never sees it.
        manager.isDrawing = manager.isSelecting = manager.isMovingSelection = manager.isPanning = false;
        manager.transformDrag = null; drag = null;
        if (snapshot) { manager.loadStateData(snapshot); window.hudInstance?.refresh(); }
        manager.render();
      }
      navigating = true; previous = gesture();
    }
  });
  canvas.addEventListener("pointermove", e => {
    if (!touches.has(e.pointerId)) return;
    e.preventDefault();
    const p = {x:e.clientX,y:e.clientY}; touches.set(e.pointerId,p);
    if (touches.size >= 2) {
      const next = gesture(), rect = canvas.getBoundingClientRect();
      const oldScale = manager.scale;
      const scale = Math.max(.1,Math.min(8,oldScale*next.distance/previous.distance));
      manager.offsetX = next.x-rect.left-(previous.x-rect.left-manager.offsetX)*scale/oldScale;
      manager.offsetY = next.y-rect.top-(previous.y-rect.top-manager.offsetY)*scale/oldScale;
      manager.scale = scale; previous = next; manager.render();
    } else if (!navigating) {
      if (!started && Math.hypot(p.x-start.x,p.y-start.y) > 5 && manager.activeInstrument !== "polygon") {
        snapshot = manager.getMapData(); mouse("mousedown", start); started = true;
      }
      if (started) mouse("mousemove",p);
      last = p;
    }
  });
  const end = e => {
    if (!touches.has(e.pointerId)) return;
    e.preventDefault(); touches.delete(e.pointerId);
    if (e.type === "pointercancel") {
      manager.isDrawing = manager.isSelecting = manager.isMovingSelection = manager.isPanning = false;
      manager.transformDrag = null; drag = null;
      if (started && snapshot && !navigating) { manager.loadStateData(snapshot); window.hudInstance?.refresh(); }
      navigating = true; manager.render();
    } else if (!navigating) {
      if (!started) mouse("mousedown",start);
      mouse("mouseup",last || start);
    }
    if (touches.size >= 2) previous = gesture();
  };
  canvas.addEventListener("pointerup",end);
  canvas.addEventListener("pointercancel",end);
}
