export const polygonDefaults = {
  fillColor: "#738b70", borderColor: "#40513e", opacity: 1,
  textureOpacity: 1, textureMode: "tile", textureScale: 1, textureAngle: 0,
  blocksLight: true, image: null, imageSrc: null,
};

// Vertices are normalized to the object's box so existing move/resize/group tools apply.
export function polygonPoints(obj) {
  const c = Math.cos(obj.rotation || 0), s = Math.sin(obj.rotation || 0);
  return obj.vertices.map(p => {
    const x = p.x * obj.width * (obj.mirrorX ? -1 : 1);
    const y = p.y * obj.height * (obj.mirrorY ? -1 : 1);
    return { x: obj.x + x * c - y * s, y: obj.y + x * s + y * c };
  });
}

export function drawPolygon(manager, obj) {
  const ctx = manager.ctx;
  if (obj.opacity <= 0) return;
  if (obj.opacity < 1) {
    // Composite the completed material once so fill, texture, and outline share
    // one opacity. Bound the scratch surface to the visible part of the polygon.
    const transform = ctx.getTransform();
    const points = polygonPoints(obj).map(p => transform.transformPoint(p));
    const pad = Math.max(2, Math.hypot(transform.a, transform.b) * manager.currentCellSize / 32);
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))-pad));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))-pad));
    const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...points.map(p => p.x))+pad));
    const bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...points.map(p => p.y))+pad));
    if (right <= x || bottom <= y) return;
    const buffer = document.createElement("canvas");
    buffer.width = right-x; buffer.height = bottom-y;
    const bc = buffer.getContext("2d");
    bc.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e-x, transform.f-y);
    drawPolygon({ctx:bc,currentCellSize:manager.currentCellSize}, {...obj,opacity:1});
    ctx.save(); ctx.resetTransform(); ctx.globalAlpha *= obj.opacity;
    ctx.drawImage(buffer,x,y); ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(obj.rotation || 0);
  ctx.scale(obj.mirrorX ? -1 : 1, obj.mirrorY ? -1 : 1);
  ctx.globalAlpha = obj.opacity ?? 1;
  ctx.beginPath();
  obj.vertices.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x * obj.width, p.y * obj.height));
  ctx.closePath();
  ctx.fillStyle = obj.fillColor;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (obj.image?.complete && obj.image.naturalWidth) {
    ctx.globalAlpha *= obj.textureOpacity ?? 1;
    const angle = (obj.textureAngle || 0) * Math.PI / 180;
    ctx.rotate(angle);
    const w = Math.abs(obj.width * Math.cos(angle)) + Math.abs(obj.height * Math.sin(angle));
    const h = Math.abs(obj.width * Math.sin(angle)) + Math.abs(obj.height * Math.cos(angle));
    if (obj.textureMode === "fit") {
      ctx.drawImage(obj.image, -w / 2, -h / 2, w, h);
    } else {
      const scale = Math.max(.05, obj.textureScale || 1) * manager.currentCellSize / 32;
      const pattern = ctx.createPattern(obj.image, "repeat");
      pattern.setTransform(new DOMMatrix().scale(scale));
      ctx.fillStyle = pattern;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
  }
  ctx.restore();
  ctx.strokeStyle = obj.borderColor;
  ctx.lineWidth = manager.currentCellSize / 32;
  ctx.stroke();
  ctx.restore();
}

export function finishPolygon(manager) {
  const points = manager.polygonDraft;
  if (points.length < 3 || !manager.layers[manager.activeLayerIndex]?.visible) return false;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const width = maxX - minX, height = maxY - minY;
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  if (width < .01 || height < .01 || Math.abs(area) < .01) return false;
  const x = (minX + maxX) / 2, y = (minY + maxY) / 2;
  manager.customObjects.set(crypto.randomUUID(), {
    ...manager.polygonSettings, type: "polygon", layerIndex: manager.activeLayerIndex,
    x, y, width, height, rotation: 0,
    vertices: points.map(p => ({ x: (p.x - x) / width, y: (p.y - y) / height })),
  });
  manager.polygonDraft = [];
  manager.saveHistory();
  manager.render();
  window.hudInstance?.loadInstrumentSettings("polygon");
  return true;
}

export function drawPolygonDraft(manager) {
  const points = manager.polygonDraft;
  if (!points.length || manager.activeInstrument !== "polygon") return;
  const ctx = manager.ctx;
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](p.x, p.y));
  ctx.lineTo(manager.mouseX, manager.mouseY);
  ctx.closePath();
  ctx.fillStyle = "#3976c633";
  ctx.fill();
  ctx.strokeStyle = "#3976c6";
  ctx.lineWidth = 2 / manager.scale;
  ctx.stroke();
  for (const p of points) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5 / manager.scale, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawPolygonShadows(manager, ctx, layerIndex, options) {
  if (!options?.enabled || !options.offset) return;
  const objects = [...manager.customObjects.values()].filter(o => o.type === "polygon" && o.layerIndex === layerIndex);
  if (!objects.length) return;
  const angle = options.angle * Math.PI / 180;
  const dx = Math.cos(angle) * options.offset * manager.currentCellSize;
  const dy = Math.sin(angle) * options.offset * manager.currentCellSize;
  const buffer = document.createElement("canvas");
  buffer.width = ctx.canvas.width; buffer.height = ctx.canvas.height;
  const bc = buffer.getContext("2d");
  bc.setTransform(ctx.getTransform());
  bc.fillStyle = options.color;
  // A single union path prevents darker overlaps at concave edges.
  bc.beginPath();
  const addLoop = points => {
    const area = points.reduce((sum,p,i) => {
      const q = points[(i+1)%points.length]; return sum+p.x*q.y-q.x*p.y;
    },0);
    if (area < 0) points.reverse();
    points.forEach((p,i) => bc[i ? "lineTo" : "moveTo"](p.x,p.y));
    bc.closePath();
  };
  for (const obj of objects.filter(o => o.blocksLight !== false && o.opacity > 0)) {
    const points = polygonPoints(obj);
    points.forEach((a,i) => {
      const b = points[(i+1)%points.length];
      addLoop([a,b,{x:b.x+dx,y:b.y+dy},{x:a.x+dx,y:a.y+dy}]);
    });
    addLoop(points.map(p => ({x:p.x+dx,y:p.y+dy})));
  }
  bc.fill("nonzero");
  bc.globalCompositeOperation = "destination-out";
  bc.fillStyle = "#000000";
  for (const obj of objects) {
    bc.beginPath();
    polygonPoints(obj).forEach((p,i) => bc[i ? "lineTo" : "moveTo"](p.x,p.y));
    bc.closePath(); bc.fill();
  }
  ctx.save(); ctx.resetTransform();
  if (options.softness) {
    const t = bc.getTransform();
    ctx.filter = `blur(${options.softness * manager.currentCellSize * Math.hypot(t.a,t.b)}px)`;
  }
  ctx.drawImage(buffer,0,0); ctx.restore();
}
