import { outerContours } from "./geometry.js";
export const borderDefaults = {
  enabled: false,
  style: "hatch",
  width: 0.75,
  density: 40,
  hatchStrokes: 9,
  hatchStacks: 2,
  hatchBlockDensity: 0.3,
  hatchRandomness: 0.5,
  hatchAngle: 25,
  color: "#40516a",
  seed: 7,
  image: null,
  imageSrc: null,
  cornerImage: null,
  cornerImageSrc: null,
};

export function buildBorderTopology(layers) {
  const cells = new Map();
  for (const layer of layers)
    if (layer.visible)
      for (const [key, cell] of layer.objects) cells.set(key, cell);
  return { contours: outerContours(cells), artwork: null };
}
function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function contourPath(contours) {
  const path = new Path2D();
  for (const loop of contours) {
    loop.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
  }
  return path;
}

function pencilStroke(ink, detail, start, end, random) {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy);
  if (length < 0.003) return;
  const bend = (random() - 0.5) * 0.02;
  ink.moveTo(start.x, start.y);
  ink.quadraticCurveTo(
    (start.x + end.x) / 2 - (dy / length) * bend,
    (start.y + end.y) / 2 + (dx / length) * bend,
    end.x,
    end.y,
  );
  // Broken parallel graphite passes; no branching connections between strokes.
  for (let i = 0; i < 2; i++) {
    const from = random() * 0.55,
      to = Math.min(1, from + 0.15 + random() * 0.35),
      offset = (random() - 0.5) * 0.018;
    detail.moveTo(
      start.x + dx * from - (dy / length) * offset,
      start.y + dy * from + (dx / length) * offset,
    );
    detail.lineTo(
      start.x + dx * to - (dy / length) * offset,
      start.y + dy * to + (dx / length) * offset,
    );
  }
}
// One nearest-boundary domain for the whole contour. Corners and edges share
// the same area density and each point has exactly one owner, including notches.
function borderDomain(topology, width) {
  const buckets = new Map(),
    segments = [],
    vertices = new Map();
  topology.contours.forEach((loop, loopIndex) =>
    loop.forEach((a, i) => {
      const b = loop[(i + 1) % loop.length],
        previous = loop[(i + loop.length - 1) % loop.length];
      const edge = { a, b, id: segments.length, tx: b.x - a.x, ty: b.y - a.y };
      segments.push(edge);
      const cross =
        (a.x - previous.x) * (b.y - a.y) - (a.y - previous.y) * (b.x - a.x);
      if (cross > 0)
        vertices.set(`${a.x}_${a.y}`, { p: a, previous, next: b, loopIndex });
      for (
        let x = Math.floor(Math.min(a.x, b.x) - width);
        x < Math.ceil(Math.max(a.x, b.x) + width);
        x++
      )
        for (
          let y = Math.floor(Math.min(a.y, b.y) - width);
          y < Math.ceil(Math.max(a.y, b.y) + width);
          y++
        ) {
          const key = `${x}_${y}`;
          if (!buckets.has(key)) buckets.set(key, { x, y, edges: [] });
          buckets.get(key).edges.push(edge);
        }
    }),
  );
  // Classify whole grid buckets by cached scanline crossings rather than
  // running polygon containment for every mark or every boundary bucket.
  const crossings = new Map();
  for (const edge of segments)
    if (edge.tx === 0) {
      const y = Math.min(edge.a.y, edge.b.y);
      if (!crossings.has(y)) crossings.set(y, []);
      crossings.get(y).push(edge.a.x);
    }
  for (const xs of crossings.values()) xs.sort((a, b) => a - b);
  for (const [key, bucket] of buckets) {
    const xs = crossings.get(bucket.y) || [],
      x = bucket.x + 0.5;
    let low = 0,
      high = xs.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (xs[mid] < x) low = mid + 1;
      else high = mid;
    }
    if (low % 2) buckets.delete(key);
  }
  const sample = (p) => {
    const bucket = buckets.get(`${Math.floor(p.x)}_${Math.floor(p.y)}`);
    if (!bucket) return null;
    let result = null,
      distance = Infinity;
    for (const edge of bucket.edges) {
      const t = Math.max(
        0,
        Math.min(1, (p.x - edge.a.x) * edge.tx + (p.y - edge.a.y) * edge.ty),
      );
      const q = { x: edge.a.x + edge.tx * t, y: edge.a.y + edge.ty * t },
        d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < distance - 1e-8) {
        distance = d;
        result = {
          edge,
          distance: d,
          vertex:
            t < 1e-7
              ? `${edge.a.x}_${edge.a.y}`
              : t > 1 - 1e-7
                ? `${edge.b.x}_${edge.b.y}`
                : null,
        };
      }
    }
    return distance <= width + 1e-6 ? result : null;
  };
  return { buckets, segments, vertices, sample };
}
function roughStone(ink, detail, p, random) {
  const radius = 0.018 + Math.pow(random(), 1.7) * 0.09,
    aspect = 0.45 + random() * 1.4,
    angle = random() * Math.PI * 2,
    count = 5 + Math.floor(random() * 5),
    points = [];
  const c = Math.cos(angle),
    s = Math.sin(angle),
    soft = random() > 0.3;
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count,
      r = radius * (0.65 + random() * 0.55),
      x = Math.cos(a) * r * aspect,
      y = Math.sin(a) * r;
    points.push({ x: p.x + x * c - y * s, y: p.y + x * s + y * c });
  }
  if (soft) {
    const last = points[count - 1],
      first = points[0];
    ink.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    points.forEach((q, i) => {
      const next = points[(i + 1) % count];
      ink.quadraticCurveTo(q.x, q.y, (q.x + next.x) / 2, (q.y + next.y) / 2);
    });
  } else
    points.forEach((q, i) => (i ? ink.lineTo(q.x, q.y) : ink.moveTo(q.x, q.y)));
  ink.closePath();
  // Light, incomplete second contours and a few shaded facets, rather than perfect rings.
  for (let i = 1; i < points.length; i += 2) {
    const a = points[i - 1],
      b = points[i];
    detail.moveTo(
      a.x + (random() - 0.5) * 0.012,
      a.y + (random() - 0.5) * 0.012,
    );
    detail.lineTo(
      b.x + (random() - 0.5) * 0.012,
      b.y + (random() - 0.5) * 0.012,
    );
  }
  if (random() < 0.5) {
    const a = points[0],
      b = points[1];
    pencilStroke(
      ink,
      detail,
      { x: a.x * 0.4 + p.x * 0.6, y: a.y * 0.4 + p.y * 0.6 },
      { x: b.x * 0.55 + p.x * 0.45, y: b.y * 0.55 + p.y * 0.45 },
      random,
    );
  }
  return radius;
}
// Shared, jittered mesh vertices keep neighboring patches connected without
// imposing rows on the texture. A patch contains only straight parallel strokes.
function hatchMesh(
  domain,
  options,
  width,
  strokes,
  stacks,
  ink,
  detail,
  stats,
) {
  const size =
      width /
      stacks /
      Math.sqrt(options.hatchBlockDensity ?? borderDefaults.hatchBlockDensity),
    randomness = options.hatchRandomness ?? borderDefaults.hatchRandomness,
    angle = ((options.hatchAngle ?? 25) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    rotate = (x, y) => ({ x: x * cos - y * sin, y: x * sin + y * cos }),
    randomAt = (x, y) =>
      randomGenerator((x * 73856093) ^ (y * 19349663) ^ options.seed),
    nodes = new Map(),
    blocks = new Map(),
    candidates = new Set();
  const node = (x, y) => {
    const key = `${x}_${y}`;
    if (!nodes.has(key)) {
      const random = randomAt(x, y),
        offset = 0;
      nodes.set(
        key,
        rotate(
          (x + offset + (random() - 0.5) * 0.36 * randomness) * size,
          (y + (random() - 0.5) * 0.36 * randomness) * size,
        ),
      );
    }
    return nodes.get(key);
  };
  // Only visit tiles near the border, including neighbors used for endpoint joins.
  for (const bucket of domain.buckets.values()) {
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([x, y]) => ({
      x: ((bucket.x + x) * cos + (bucket.y + y) * sin) / size,
      y: (-(bucket.x + x) * sin + (bucket.y + y) * cos) / size,
    }));
    const minX = Math.floor(Math.min(...corners.map((p) => p.x))) - 2,
      maxX = Math.ceil(Math.max(...corners.map((p) => p.x))) + 2,
      minY = Math.floor(Math.min(...corners.map((p) => p.y))) - 2,
      maxY = Math.ceil(Math.max(...corners.map((p) => p.y))) + 2;
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++) candidates.add(`${x}_${y}`);
  }
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  for (const key of candidates) {
    const [x, y] = key.split("_").map(Number),
      quad = [node(x, y), node(x + 1, y), node(x + 1, y + 1), node(x, y + 1)],
      random = randomAt(x + 317, y - 127),
      direction =
        angle +
        (((x + y) & 1) * Math.PI) / 2 +
        (random() - 0.5) * 0.3 * randomness,
      d = { x: Math.cos(direction), y: Math.sin(direction) },
      n = { x: -d.y, y: d.x },
      projections = quad.map((p) => p.x * n.x + p.y * n.y),
      low = Math.min(...projections),
      high = Math.max(...projections),
      lines = [];
    for (let i = 0; i < strokes; i++) {
      const offset = low + ((high - low) * (i + 0.5)) / strokes,
        hits = [];
      for (let j = 0; j < 4; j++) {
        const a = quad[j],
          b = quad[(j + 1) % 4],
          pa = projections[j],
          pb = projections[(j + 1) % 4];
        if (Math.abs(pb - pa) < 1e-10) continue;
        const t = (offset - pa) / (pb - pa);
        if (t >= 0 && t <= 1)
          hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      if (hits.length >= 2) {
        hits.sort((a, b) => (a.x - b.x) * d.x + (a.y - b.y) * d.y);
        lines.push({ a: hits[0], b: hits[hits.length - 1] });
      }
    }
    blocks.set(key, { x, y, lines, d });
  }
  stats.connections = 0;
  stats.blocks = [];
  // Extend each endpoint along the same line to a neighboring patch's stroke.
  // Never trim a stroke: all joins established against the base mesh remain valid.
  for (const block of blocks.values()) {
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const other = blocks.get(`${block.x + dx}_${block.y + dy}`);
        if (other) neighbors.push(...other.lines);
      }
    let visible = false;
    const rendered = [];
    for (const line of block.lines) {
      const endpoints = [];
      for (const [p, sign] of [
        [line.a, -1],
        [line.b, 1],
      ]) {
        const ray = { x: block.d.x * sign, y: block.d.y * sign };
        let nearest = size * 0.65,
          hit = null;
        for (const other of neighbors) {
          const v = { x: other.b.x - other.a.x, y: other.b.y - other.a.y },
            q = { x: other.a.x - p.x, y: other.a.y - p.y },
            denominator = cross(ray, v);
          if (Math.abs(denominator) < 1e-9) continue;
          const t = cross(q, v) / denominator,
            u = cross(q, ray) / denominator;
          if (t >= -1e-8 && t < nearest && u >= 0 && u <= 1) {
            nearest = Math.max(0, t);
            hit = { x: p.x + ray.x * nearest, y: p.y + ray.y * nearest };
          }
        }
        endpoints.push(hit || p);
        if (hit) stats.connections++;
      }
      const [a, b] = endpoints;
      // Visibility is sampled only for accounting; final clipping is continuous
      // against the entire exterior band, never at individual mesh boundaries.
      for (let t = 0; t <= 1; t += 0.25)
        if (
          domain.sample({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
        )
          visible = true;
      rendered.push({ a, b });
    }
    if (!visible) continue;
    stats.chunks++;
    stats.strokes += rendered.length;
    if (stats.blocks.length < 300) stats.blocks.push(rendered);
    for (const { a, b } of rendered) {
      ink.moveTo(a.x, a.y);
      ink.lineTo(b.x, b.y);
      const random = randomAt(block.x + 19, block.y + 41),
        from = random() * 0.2,
        to = 0.8 + random() * 0.2;
      detail.moveTo(
        a.x + (b.x - a.x) * from + block.d.y * 0.004,
        a.y + (b.y - a.y) * from - block.d.x * 0.004,
      );
      detail.lineTo(
        a.x + (b.x - a.x) * to + block.d.y * 0.004,
        a.y + (b.y - a.y) * to - block.d.x * 0.004,
      );
    }
  }
}

export function borderArtwork(topology, options) {
  const strokes = Math.max(
      2,
      Math.min(
        12,
        Math.round(options.hatchStrokes || borderDefaults.hatchStrokes),
      ),
    ),
    stacks = Math.max(
      1,
      Math.min(
        6,
        Math.round(options.hatchStacks || borderDefaults.hatchStacks),
      ),
    );
  const signature = JSON.stringify([
    options.style,
    options.width,
    options.density,
    options.seed,
    strokes,
    stacks,
    options.hatchBlockDensity,
    options.hatchRandomness,
    options.hatchAngle,
  ]);
  if (topology.artwork?.signature === signature) return topology.artwork;
  const ink = new Path2D(),
    detail = new Path2D(),
    dots = new Path2D(),
    outline = contourPath(topology.contours),
    width = options.width,
    density = options.density / 40,
    domain = borderDomain(topology, width),
    stats = {
      chunks: 0,
      strokes: 0,
      marks: [],
      stacks,
      strokesPerChunk: strokes,
    };
  if (options.style === "hatch") {
    hatchMesh(domain, options, width, strokes, stacks, ink, detail, stats);
  } else if (options.style === "dots" || options.style === "rocks") {
    // Uniform world-space scatter with distance-based acceptance. No rows and no bonus corner marks.
    const rockIndex = new Map();
    for (const bucket of domain.buckets.values()) {
      const random = randomGenerator(
        (bucket.x * 73856093) ^ (bucket.y * 19349663) ^ options.seed,
      );
      const count = Math.round((options.style === "dots" ? 650 : 90) * density);
      for (let i = 0; i < count; i++) {
        const p = { x: bucket.x + random(), y: bucket.y + random() },
          sample = domain.sample(p);
        if (!sample) continue;
        if (
          random() >
          Math.pow(
            1 - sample.distance / width,
            options.style === "dots" ? 2.5 : 1.9,
          )
        )
          continue;
        if (options.style === "rocks") {
          const gx = Math.floor(p.x / 0.12),
            gy = Math.floor(p.y / 0.12);
          let tooClose = false;
          for (let x = gx - 1; x <= gx + 1; x++)
            for (let y = gy - 1; y <= gy + 1; y++)
              for (const q of rockIndex.get(`${x}_${y}`) || [])
                if (Math.hypot(p.x - q.x, p.y - q.y) < q.radius * 0.7 + 0.02)
                  tooClose = true;
          if (tooClose) continue;
          const radius = roughStone(ink, detail, p, random),
            key = `${gx}_${gy}`;
          if (!rockIndex.has(key)) rockIndex.set(key, []);
          rockIndex.get(key).push({ ...p, radius });
        } else {
          const r = 0.004 + Math.pow(random(), 1.5) * 0.011,
            n = 4 + Math.floor(random() * 4);
          for (let j = 0; j < n; j++) {
            const a = (j * Math.PI * 2) / n,
              rr = r * (0.6 + random() * 0.6),
              x = p.x + Math.cos(a) * rr,
              y = p.y + Math.sin(a) * rr;
            if (j) dots.lineTo(x, y);
            else dots.moveTo(x, y);
          }
          dots.closePath();
          if (random() < 0.35)
            pencilStroke(
              ink,
              detail,
              p,
              {
                x: p.x + (random() - 0.5) * 0.017,
                y: p.y + (random() - 0.5) * 0.017,
              },
              random,
            );
        }
        if (stats.marks.length < 65536)
          stats.marks.push({
            x: p.x,
            y: p.y,
            distance: sample.distance,
            corner: !!sample.vertex,
          });
      }
    }
  }
  topology.artwork = { signature, ink, detail, dots, outline, stats };
  return topology.artwork;
}

// Merge collinear unit edges, retaining every convex and concave turn.
export function contourRuns(loop) {
  const direction = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
  let start = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = direction(loop[(i + loop.length - 1) % loop.length], loop[i]),
      b = direction(loop[i], loop[(i + 1) % loop.length]);
    if (a.x !== b.x || a.y !== b.y) {
      start = i;
      break;
    }
  }
  const runs = [];
  let a = loop[start],
    last = direction(a, loop[(start + 1) % loop.length]);
  for (let step = 1; step <= loop.length; step++) {
    const b = loop[(start + step) % loop.length],
      next = direction(b, loop[(start + step + 1) % loop.length]);
    if (step === loop.length || next.x !== last.x || next.y !== last.y) {
      runs.push({
        a,
        b,
        tx: last.x,
        ty: last.y,
        length: Math.hypot(b.x - a.x, b.y - a.y),
      });
      a = b;
      last = next;
    }
  }
  return runs;
}

function drawUploadedBorder(ctx, topology, options) {
  const edge = options.image,
    corner = options.cornerImage,
    width = options.width;
  if (
    !edge?.complete ||
    !edge.naturalWidth ||
    !corner?.complete ||
    !corner.naturalWidth
  )
    return;
  // Assemble on a separate transparent canvas. Replacing corner regions clears
  // underlying strips so semitransparent uploads never darken at overlapping joins.
  const buffer = document.createElement("canvas");
  buffer.width = ctx.canvas.width;
  buffer.height = ctx.canvas.height;
  const tiles = buffer.getContext("2d");
  tiles.setTransform(ctx.getTransform());
  const tileLength = Math.max(
    width / 4,
    (width * edge.naturalWidth) / edge.naturalHeight,
  );
  for (const loop of topology.contours) {
    const runs = contourRuns(loop);
    for (const run of runs) {
      tiles.save();
      tiles.translate(run.a.x, run.a.y);
      tiles.rotate(Math.atan2(run.ty, run.tx));
      tiles.beginPath();
      tiles.rect(0, -width, run.length, width);
      tiles.clip();
      for (let t = 0; t < run.length; t += tileLength)
        tiles.drawImage(edge, t, -width, tileLength, width);
      tiles.restore();
    }
    for (let i = 0; i < runs.length; i++) {
      const previous = runs[(i + runs.length - 1) % runs.length],
        next = runs[i],
        p = next.a;
      const n1 = { x: previous.ty, y: -previous.tx },
        n2 = { x: next.ty, y: -next.tx };
      tiles.save();
      // Canonical corner: dungeon vertex at bottom-right, artwork above/left.
      // A negative determinant naturally mirrors the tile for concave corners.
      tiles.transform(
        -n1.x,
        -n1.y,
        -n2.x,
        -n2.y,
        p.x + width * (n1.x + n2.x),
        p.y + width * (n1.y + n2.y),
      );
      tiles.clearRect(0, 0, width, width);
      tiles.drawImage(corner, 0, 0, width, width);
      tiles.restore();
    }
  }
  // Give uploaded corners the same radial extent as an edge, rather than
  // allowing the corner square to extend sqrt(2) times farther from the wall.
  const band = document.createElement("canvas");
  band.width = buffer.width;
  band.height = buffer.height;
  const mask = band.getContext("2d");
  mask.setTransform(ctx.getTransform());
  mask.strokeStyle = "#fff";
  mask.lineWidth = width * 2;
  mask.lineJoin = "round";
  mask.stroke(topology.artwork.outline);
  tiles.save();
  tiles.resetTransform();
  tiles.globalCompositeOperation = "destination-in";
  tiles.drawImage(band, 0, 0);
  tiles.restore();
  ctx.save();
  ctx.resetTransform();
  ctx.drawImage(buffer, 0, 0);
  ctx.restore();
}

export function drawBorderTopology(
  manager,
  ctx,
  topology,
  size,
  bounds,
  layerOptions = manager.gridBorderOptions,
) {
  const options = { ...borderDefaults, ...layerOptions };
  if (!options.enabled || !topology?.contours.length) return;
  const art = borderArtwork(topology, options),
    width = options.width;
  ctx.save();
  ctx.scale(size, size);
  const mask = new Path2D();
  mask.rect(
    bounds.minX / size - width * 2,
    bounds.minY / size - width * 2,
    (bounds.maxX - bounds.minX) / size + width * 4,
    (bounds.maxY - bounds.minY) / size + width * 4,
  );
  mask.addPath(art.outline);
  ctx.clip(mask, "evenodd");
  if (options.style === "image") {
    drawUploadedBorder(ctx, topology, options);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.66;
  ctx.lineWidth = options.style === "hatch" ? 0.022 : 0.018;
  ctx.stroke(art.ink);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 0.01;
  ctx.stroke(art.detail);
  ctx.globalAlpha = 1;
  ctx.globalAlpha = 0.82;
  ctx.fill(art.dots);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.035;
  ctx.stroke(art.outline);
  ctx.restore();
}
export function drawBorders(manager, ctx, cells, size, bounds) {
  drawBorderTopology(
    manager,
    ctx,
    buildBorderTopology([{ visible: true, objects: cells }]),
    size,
    bounds,
  );
}
