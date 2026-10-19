import { polygonPoints, drawPolygonShadows } from "./polygons.js";
import { corners, edges, gridEdges, visibility, rayHit } from "./geometry.js";

import { drawBorderTopology } from "./borders.js";
export { borderDefaults, drawBorders } from "./borders.js";
export const ambientDefaults = {
  preserveGlobal: false,
  brightness: 0.22,
  color: "#091226",
  globalEnabled: false,
  lightColor: "#fff4db",
  intensity: 1,
  tintStrength: 0.2,
  angle: 45,
  shadowLength: 0.5,
  shadowOpacity: 0.35,
  shadowColor: "#142039",
  shadowSoftness: 0.04,
};
export const globalLightDefaults = Object.fromEntries(
  Object.entries(ambientDefaults).filter(
    ([key]) => !["preserveGlobal", "brightness", "color"].includes(key),
  ),
);
export const lightDefaults = {
  color: "#ffce88",
  intensity: 1,
  radius: 8,
  bounces: 0,
};

function occluders(manager, layerIndex) {
  const segments = [],
    size = manager.currentCellSize;
  // A light affects its layer and the visible layers beneath it; higher layers cover it.
  manager.layers.slice(0, layerIndex + 1).forEach((layer, index) => {
    if (!layer.visible) return;
    const cells = new Map(
      [...layer.objects].filter(
        ([, c]) => c.blocksLight !== false && c.castsShadow !== false,
      ),
    );
    segments.push(...gridEdges(cells, size));
    for (const obj of manager.customObjects.values())
      if (
        obj.layerIndex === index &&
        obj.type !== "light" &&
        obj.blocksLight !== false
      )
        segments.push(...edges(obj.type === "polygon" ? polygonPoints(obj) : corners(obj)));
  });
  return segments;
}

function paintLight(ctx, source, segments, radius, intensity) {
  const polygon = visibility(source, segments, radius);
  ctx.save();
  ctx.beginPath();
  polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  const gradient = ctx.createRadialGradient(
    source.x,
    source.y,
    0,
    source.x,
    source.y,
    radius,
  );
  gradient.addColorStop(0, source.color + "ff");
  gradient.addColorStop(
    0.3,
    source.color +
      Math.round(Math.min(1, 0.69 * intensity) * 255)
        .toString(16)
        .padStart(2, "0"),
  );
  gradient.addColorStop(1, source.color + "00");
  ctx.globalAlpha = Math.min(1, intensity);
  ctx.fillStyle = gradient;
  ctx.fillRect(source.x - radius, source.y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function buildLightingOverlay(
  manager,
  ctx,
  layerIndex,
  bounds,
  unoccluded = false,
  baseOnly = false,
) {
  const lights = [...manager.customObjects.values()].filter(
    (o) =>
      o.type === "light" &&
      o.layerIndex >= layerIndex &&
      manager.layers[o.layerIndex]?.visible,
  );
  const ambient = {
    ...ambientDefaults,
    ...manager.ambientLight,
    ...manager.layers[layerIndex].globalLight,
  };
  if (!lights.length && !ambient.globalEnabled) return null;
  if (!baseOnly)
    manager.lightingRenderCount = (manager.lightingRenderCount || 0) + 1;
  const size = manager.currentCellSize;
  // Render darkness and illumination in an isolated buffer so compositing never erases map pixels.
  const transform = ctx.getTransform(),
    buffer = document.createElement("canvas");
  buffer.width = ctx.canvas.width;
  buffer.height = ctx.canvas.height;
  const bc = buffer.getContext("2d");
  bc.setTransform(transform);
  const fill = (color, alpha) => {
    bc.fillStyle =
      color +
      Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, "0");
    bc.fillRect(
      bounds.minX,
      bounds.minY,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
    );
  };
  if (ambient.globalEnabled) {
    if (ambient.intensity < 1) fill("#000000", 1 - ambient.intensity);
    if (ambient.intensity > 1) fill("#ffffff", (ambient.intensity - 1) * 0.5);
    fill(
      ambient.lightColor,
      ambient.tintStrength * Math.min(1, ambient.intensity),
    );
  }
  const opacity =
    !lights.length || ambient.preserveGlobal ? 0 : 1 - ambient.brightness;
  bc.fillStyle =
    ambient.color +
    Math.round(opacity * 255)
      .toString(16)
      .padStart(2, "0");
  bc.fillRect(
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
  );
  for (const light of baseOnly ? [] : lights) {
    const segments = unoccluded ? [] : occluders(manager, light.layerIndex);
    const radius = light.radius * size;
    // Remove darkness only in visible regions, then add a restrained color tint.
    bc.globalCompositeOperation = "destination-out";
    paintLight(
      bc,
      { ...light, color: "#ffffff" },
      segments,
      radius,
      light.intensity,
    );
    bc.globalCompositeOperation = "source-over";
    paintLight(bc, light, segments, radius, light.intensity * 0.22);
    // Sample reflected rays. Each hit creates a weaker, occlusion-tested secondary source.
    for (let i = 0; i < 16; i++) {
      let origin = { x: light.x, y: light.y },
        angle = (i * Math.PI * 2) / 16,
        remaining = radius,
        energy = light.intensity * 0.13;
      for (let bounce = 0; bounce < Math.min(3, light.bounces); bounce++) {
        const hit = rayHit(origin, angle, segments, remaining);
        if (!hit.segment) break;
        remaining = (remaining - hit.distance) * 0.65;
        if (remaining < size * 0.15) break;
        const edge = hit.segment,
          ex = edge.b.x - edge.a.x,
          ey = edge.b.y - edge.a.y,
          len = Math.hypot(ex, ey);
        const nx = -ey / len,
          ny = ex / len,
          dx = Math.cos(angle),
          dy = Math.sin(angle),
          dot = dx * nx + dy * ny;
        const rx = dx - 2 * dot * nx,
          ry = dy - 2 * dot * ny;
        origin = { x: hit.x + rx * 0.05, y: hit.y + ry * 0.05 };
        angle = Math.atan2(ry, rx);
        bc.globalCompositeOperation = "destination-out";
        paintLight(
          bc,
          { ...origin, color: "#ffffff" },
          segments,
          remaining,
          energy,
        );
        bc.globalCompositeOperation = "source-over";
        paintLight(
          bc,
          { ...origin, color: light.color },
          segments,
          remaining,
          energy * 0.3,
        );
        energy *= 0.45;
      }
    }
  }
  const protectedCells = [
    ...manager.layers[layerIndex].objects.values(),
  ].filter((c) => c.receivesLightShadow === false);
  if (!baseOnly && !unoccluded && lights.length && protectedCells.length) {
    const clearLight = buildLightingOverlay(
      manager,
      ctx,
      layerIndex,
      bounds,
      true,
    );
    bc.save();
    bc.beginPath();
    for (const cell of protectedCells)
      bc.rect(cell.x * size, cell.y * size, size, size);
    bc.clip();
    bc.resetTransform();
    bc.clearRect(0, 0, buffer.width, buffer.height);
    bc.drawImage(clearLight, 0, 0);
    bc.restore();
  }
  return buffer;
}

export function lightingSignature(manager) {
  return JSON.stringify([
    manager.currentCellSize,
    manager.ambientLight,
    manager.layers.map((layer) => [
      layer.visible,
      { ...globalLightDefaults, ...layer.globalLight },
      [...layer.objects.values()]
        .filter((c) => c.receivesLightShadow === false)
        .map((c) => [c.x, c.y]),
      [...layer.objects.values()]
        .filter((c) => c.blocksLight !== false && c.castsShadow !== false)
        .map((c) => [c.x, c.y]),
    ]),
    [...manager.customObjects.values()].filter(o => o.type === "polygon")
      .map(o => [o.layerIndex, o.blocksLight, polygonPoints(o)]),
    [...manager.customObjects.values()]
      .filter((o) => o.type === "light")
      .map((o) => [
        o.layerIndex,
        o.x,
        o.y,
        o.color,
        o.radius,
        o.intensity,
        o.bounces,
      ]),
  ]);
}

export function invalidateLightingBake(manager) {
  if (
    manager.bakedLighting &&
    manager.bakedLighting.signature !== lightingSignature(manager)
  ) {
    manager.bakedLighting = null;
    manager.bakeStatus = "Changed · bake again";
    window.hudInstance?.updateLightingStatus();
  }
}

export function bakeLighting(manager) {
  const logical = manager.getLogicalBoundingBox({
      includeLights: true,
      includeObjects: false,
      padding: 1,
    }),
    size = manager.currentCellSize;
  const bounds = {
    minX: logical.minX * size,
    minY: logical.minY * size,
    maxX: logical.maxX * size,
    maxY: logical.maxY * size,
  };
  const w = bounds.maxX - bounds.minX,
    h = bounds.maxY - bounds.minY;
  // A world-space lightmap survives panning and zooming. Bound memory per map.
  const count = Math.max(1, manager.layers.filter((l) => l.visible).length);
  const scale = Math.min(
    64 / size,
    4096 / Math.max(w, h),
    Math.sqrt(16000000 / (w * h * count)),
  );
  const reference = document.createElement("canvas");
  reference.width = Math.max(1, Math.ceil(w * scale));
  reference.height = Math.max(1, Math.ceil(h * scale));
  const ctx = reference.getContext("2d");
  ctx.scale(scale, scale);
  ctx.translate(-bounds.minX, -bounds.minY);
  const maps = new Map();
  manager.layers.forEach((layer, index) => {
    if (layer.visible) {
      const map = buildLightingOverlay(manager, ctx, index, bounds);
      if (map) maps.set(index, map);
    }
  });
  manager.bakedLighting = {
    maps,
    bounds,
    signature: lightingSignature(manager),
  };
  manager.bakeStatus = maps.size
    ? "Baked · pan and zoom freely"
    : "No lights to bake";
  window.hudInstance?.updateLightingStatus();
  manager.render();
  return maps.size;
}

export function drawLighting(manager, ctx, layerIndex, bounds) {
  const bake = manager.bakedLighting;
  const overlay = bake
    ? bake.maps.get(layerIndex)
    : buildLightingOverlay(manager, ctx, layerIndex, bounds);
  if (!overlay) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  if (bake) {
    const b = bake.bounds;
    // New decorative objects can extend beyond the bake. Outside the cached
    // light region, apply only ambient/global illumination without ray casting.
    if (
      bounds.minX < b.minX ||
      bounds.minY < b.minY ||
      bounds.maxX > b.maxX ||
      bounds.maxY > b.maxY
    ) {
      const base = buildLightingOverlay(
        manager,
        ctx,
        layerIndex,
        bounds,
        false,
        true,
      );
      if (base) {
        ctx.save();
        const clip = new Path2D();
        clip.rect(
          bounds.minX,
          bounds.minY,
          bounds.maxX - bounds.minX,
          bounds.maxY - bounds.minY,
        );
        clip.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        ctx.clip(clip, "evenodd");
        ctx.resetTransform();
        ctx.drawImage(base, 0, 0);
        ctx.restore();
      }
    }
    ctx.drawImage(overlay, b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  } else {
    ctx.resetTransform();
    ctx.drawImage(overlay, 0, 0);
  }
  ctx.restore();
}

export function drawScene(
  manager,
  ctx,
  bounds,
  { editor = false, whiteBackground = false } = {},
) {
  invalidateLightingBake(manager);
  const size = manager.currentCellSize,
    old = manager.ctx;
  const buffer = document.createElement("canvas");
  buffer.width = ctx.canvas.width;
  buffer.height = ctx.canvas.height;
  const layerContext = buffer.getContext("2d");
  let backgroundDrawn = false;
  if (whiteBackground) {
    manager.drawGrid(ctx, size, bounds, {
      ...manager.emptyCellSettings,
      fillColor: "#ffffff",
      pattern: null,
    });
    backgroundDrawn = true;
  }
  try {
    manager.layers.forEach((layer, index) => {
      if (!layer.visible) return;
      layerContext.resetTransform();
      layerContext.clearRect(0, 0, buffer.width, buffer.height);
      layerContext.setTransform(ctx.getTransform());
      manager.ctx = layerContext;
      if (!backgroundDrawn) {
        manager.drawGrid(layerContext, size, bounds);
        backgroundDrawn = true;
      }
      for (const cell of layer.objects.values()) manager.drawGridCell(cell);
      const global = { ...ambientDefaults, ...layer.globalLight };
      if (
        global.globalEnabled &&
        global.shadowLength > 0 &&
        global.shadowOpacity > 0
      )
        manager.drawGridShadows(layerContext, size, bounds, layer.objects, {
          enabled: true,
          angle: global.angle,
          offset: global.shadowLength,
          color:
            global.shadowColor +
            Math.round(global.shadowOpacity * 255)
              .toString(16)
              .padStart(2, "0"),
          softness: global.shadowSoftness,
        });
      if (layer.gridShadowOptions?.enabled)
        manager.drawGridShadows(
          layerContext,
          size,
          bounds,
          layer.objects,
          layer.gridShadowOptions,
        );

      if (global.globalEnabled) drawPolygonShadows(manager, layerContext, index, {
        enabled:true, angle:global.angle, offset:global.shadowLength,
        color:global.shadowColor + Math.round(global.shadowOpacity*255).toString(16).padStart(2,"0"),
        softness:global.shadowSoftness,
      });
      drawPolygonShadows(manager, layerContext, index, layer.gridShadowOptions);
      for (const obj of manager.freeDrawObjects.values())
        if (obj.layerIndex === index) manager.drawFreeDrawObject(obj);
      for (const obj of manager.customObjects.values())
        if (obj.layerIndex === index && obj.type !== "light")
          manager.drawCustomObject(obj);
      // Light each surface once using all lights that can reach its layer. Keeping
      // layer transparency avoids multiplying darkness onto lower layers.
      drawLighting(manager, layerContext, index, bounds);
      drawBorderTopology(
        manager,
        layerContext,
        layer.borderTopology,
        size,
        bounds,
        layer.gridBorderOptions || {},
      );
      if (editor)
        for (const obj of manager.customObjects.values())
          if (obj.layerIndex === index && obj.type === "light")
            manager.drawLightMarker(obj);
      ctx.save();
      ctx.resetTransform();
      ctx.drawImage(buffer, 0, 0);
      ctx.restore();
    });
    if (!backgroundDrawn) manager.drawGrid(ctx, size, bounds);
  } finally {
    manager.ctx = old;
  }
}
