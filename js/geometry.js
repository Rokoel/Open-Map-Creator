import { polygonPoints } from "./polygons.js";
// Shared world-space geometry for hit testing, lighting and export.
export function localPoint(obj, p) {
  const c = Math.cos(obj.rotation || 0),
    s = Math.sin(obj.rotation || 0);
  return {
    x: (p.x - obj.x) * c + (p.y - obj.y) * s,
    y: -(p.x - obj.x) * s + (p.y - obj.y) * c,
  };
}
export function corners(obj) {
  const c = Math.cos(obj.rotation || 0),
    s = Math.sin(obj.rotation || 0);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => ({
    x: obj.x + ((x * obj.width) / 2) * c - ((y * obj.height) / 2) * s,
    y: obj.y + ((x * obj.width) / 2) * s + ((y * obj.height) / 2) * c,
  }));
}
export function contains(obj, p) {
  if (obj.type === "polygon") {
    const points = polygonPoints(obj);
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
      if (Math.abs(cross) < 1e-6 && p.x >= Math.min(a.x,b.x) && p.x <= Math.max(a.x,b.x) && p.y >= Math.min(a.y,b.y) && p.y <= Math.max(a.y,b.y)) return true;
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit = !hit;
    }
    return hit;
  }
  const q = localPoint(obj, p);
  return Math.abs(q.x) <= obj.width / 2 && Math.abs(q.y) <= obj.height / 2;
}
export function edges(points) {
  return points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
}
export function gridEdges(cells, size) {
  const result = [];
  for (const cell of cells.values()) {
    const x = cell.x * size,
      y = cell.y * size;
    for (const [dx, dy, a, b] of [
      [0, -1, { x, y }, { x: x + size, y }],
      [1, 0, { x: x + size, y }, { x: x + size, y: y + size }],
      [0, 1, { x: x + size, y: y + size }, { x, y: y + size }],
      [-1, 0, { x, y: y + size }, { x, y }],
    ])
      if (!cells.has(`${cell.x + dx}_${cell.y + dy}`)) result.push({ a, b });
  }
  return result;
}
export function rayHit(origin, angle, segments, radius) {
  const dx = Math.cos(angle),
    dy = Math.sin(angle);
  let distance = radius,
    segment = null;
  for (const edge of segments) {
    const sx = edge.b.x - edge.a.x,
      sy = edge.b.y - edge.a.y;
    const cross = dx * sy - dy * sx;
    if (Math.abs(cross) < 1e-9) continue;
    const qx = edge.a.x - origin.x,
      qy = edge.a.y - origin.y;
    const t = (qx * sy - qy * sx) / cross;
    const u = (qx * dy - qy * dx) / cross;
    if (t > 0.001 && t < distance && u >= 0 && u <= 1) {
      distance = t;
      segment = edge;
    }
  }
  return {
    x: origin.x + dx * distance,
    y: origin.y + dy * distance,
    distance,
    segment,
  };
}
export function visibility(origin, segments, radius) {
  const angles = Array.from({ length: 128 }, (_, i) => (i * Math.PI * 2) / 128);
  for (const edge of segments)
    for (const p of [edge.a, edge.b]) {
      if (Math.hypot(p.x - origin.x, p.y - origin.y) > radius * 1.5) continue;
      const a = Math.atan2(p.y - origin.y, p.x - origin.x);
      angles.push(a - 0.00001, a, a + 0.00001);
    }
  return angles
    .map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
    .sort((a, b) => a - b)
    .map((a) => rayHit(origin, a, segments, radius));
}

// Trace the union boundary with filled cells to the right. Positive-area loops
// are exterior contours; negative loops enclose holes and are deliberately omitted.
export function outerContours(cells) {
  const segments = gridEdges(cells, 1),
    outgoing = new Map(),
    used = new Set(),
    contours = [];
  const key = (p) => `${p.x}_${p.y}`;
  for (let i = 0; i < segments.length; i++) {
    const k = key(segments[i].a);
    if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push(i);
  }
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    const loop = [];
    let index = start;
    while (!used.has(index)) {
      used.add(index);
      const edge = segments[index];
      loop.push(edge.a);
      if (key(edge.b) === key(segments[start].a)) break;
      const candidates = (outgoing.get(key(edge.b)) || []).filter(
        (i) => !used.has(i),
      );
      if (!candidates.length) break;
      const dx = edge.b.x - edge.a.x,
        dy = edge.b.y - edge.a.y;
      const rank = (i) => {
        const next = segments[i],
          ex = next.b.x - next.a.x,
          ey = next.b.y - next.a.y;
        const cross = dx * ey - dy * ex,
          dot = dx * ex + dy * ey;
        return cross > 0 ? 0 : dot > 0 ? 1 : cross < 0 ? 2 : 3;
      };
      index = candidates.sort((a, b) => rank(a) - rank(b))[0];
    }
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i],
        b = loop[(i + 1) % loop.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area > 0) contours.push(loop);
  }
  const inside = (p, loop) => {
    let hit = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i],
        b = loop[j];
      if (
        a.y > p.y !== b.y > p.y &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      )
        hit = !hit;
    }
    return hit;
  };
  return contours.filter(
    (loop, index) =>
      !contours.some(
        (other, j) =>
          j !== index &&
          inside(
            {
              x: (loop[0].x + loop[1].x) / 2 - (loop[1].y - loop[0].y) * 0.0001,
              y: (loop[0].y + loop[1].y) / 2 + (loop[1].x - loop[0].x) * 0.0001,
            },
            other,
          ),
      ),
  );
}
