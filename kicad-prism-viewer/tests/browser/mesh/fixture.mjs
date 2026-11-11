// Mesh packs (spec 11, `prism.sim.mesh-pack` a0) made here, for the unit
// tests and the browser check: an encoder, and a synthetic mesh over the
// analytic fixture board (tests/fixtures/analytic/demo.kmpack, 40 x 30 mm).
import { deflateSync } from "node:zlib";

const MAGIC = "PRSMSH01";

/**
 * An inflated pack from typed arrays: blocks at 8-aligned offsets of the
 * data, the header naming them, as the writer lays one out.
 * `parts` = { header (everything but the array blocks), nodes, triangles,
 * layers: [{ slice_key, net_key, vertices, triangles, element, piece }],
 * fields: [{ name, unit, values }], markers }.
 */
export function encodeMeshPack(parts) {
  const blocks = [];
  let length = 0;
  const place = (array) => {
    length += (8 - (length % 8)) % 8;
    const offset = length;
    blocks.push({ offset, bytes: new Uint8Array(array.buffer, array.byteOffset, array.byteLength) });
    length += array.byteLength;
    return offset;
  };
  const header = {
    schema: "prism.sim.mesh-pack",
    version: "a0",
    ...parts.header,
    nodes: { count: parts.nodes.length / 2, offset: place(parts.nodes) },
    triangles: { count: parts.triangles.length / 3, offset: place(parts.triangles) },
    ...(parts.quads ? { quads: { count: parts.quads.length / 4, offset: place(parts.quads) } } : {}),
    layers: parts.layers.map((layer) => ({
      slice_key: layer.slice_key,
      net_key: layer.net_key,
      piece_vertices: { count: layer.vertices.length / 2, offset: place(layer.vertices) },
      piece_triangles: { count: layer.triangles.length / 3, offset: place(layer.triangles) },
      piece_element: { offset: place(layer.element) },
      piece_id: { offset: place(layer.piece) },
      ...(layer.fields ? { element_fields: layer.fields.map((field) => ({ name: field.name, unit: field.unit, dtype: "f32", offset: place(field.values) })) } : {}),
    })),
    element_fields: (parts.fields || []).map((field) => ({ name: field.name, unit: field.unit, dtype: "f32", offset: place(field.values) })),
    markers: parts.markers || [],
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const head = Math.ceil((12 + json.length) / 8) * 8;
  const out = new Uint8Array(head + Math.ceil(length / 8) * 8);
  out.set(new TextEncoder().encode(MAGIC));
  new DataView(out.buffer).setUint32(8, json.length, true);
  out.set(json, 12);
  for (const block of blocks) out.set(block.bytes, head + block.offset);
  return out;
}

/** A pack as written: deflated (zlib). */
export function deflateMeshPack(inflated) {
  return new Uint8Array(deflateSync(inflated));
}

const MM = 1e6;

/** Sutherland–Hodgman: `polygon` ([[x, y]]) clipped to the rectangle [x0, y0, x1, y1]. */
function clipToRect(polygon, [x0, y0, x1, y1]) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const cross = [
    (a, b) => lerpAt(a, b, 0, x0), (a, b) => lerpAt(a, b, 0, x1), (a, b) => lerpAt(a, b, 1, y0), (a, b) => lerpAt(a, b, 1, y1),
  ];
  let out = polygon;
  for (let k = 0; k < 4 && out.length; k += 1) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i += 1) {
      const a = input[(i + input.length - 1) % input.length];
      const b = input[i];
      if (edges[k](b)) {
        if (!edges[k](a)) out.push(cross[k](a, b));
        out.push(b);
      } else if (edges[k](a)) out.push(cross[k](a, b));
    }
  }
  return out;
}

function lerpAt(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return [Math.round(a[0] + t * (b[0] - a[0])), Math.round(a[1] + t * (b[1] - a[1]))];
}

function area(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
}

function minAngle(corners) {
  let smallest = 180;
  for (let i = 0; i < 3; i += 1) {
    const [p, q, r] = [corners[i], corners[(i + 1) % 3], corners[(i + 2) % 3]];
    const u = [q[0] - p[0], q[1] - p[1]];
    const v = [r[0] - p[0], r[1] - p[1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
    smallest = Math.min(smallest, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
  }
  return smallest;
}

/**
 * A background mesh over the fixture board, `pitchMm` apart (interior nodes
 * nudged so the angles vary), with GND copper as rectangles on both copper
 * slices whose sides cut elements, every field the spec names, and one port.
 * At the default pitch it has 600 elements; at 0.08 mm, 375,000.
 */
export function demoMeshPack({ pitchMm = 2, width = 40, height = 30, label = "demo background", pass = 1 } = {}) {
  const nx = Math.round(width / pitchMm);
  const ny = Math.round(height / pitchMm);
  const pitch = Math.round(pitchMm * MM);
  const nodes = new Int32Array((nx + 1) * (ny + 1) * 2);
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const inside = i > 0 && j > 0 && i < nx && j < ny;
      // A fixed nudge per node, up to a fifth of the pitch.
      const nudge = inside ? Math.round(pitch * 0.2 * Math.sin(i * 12.9898 + j * 78.233)) : 0;
      nodes[(j * (nx + 1) + i) * 2] = i * pitch + nudge;
      nodes[(j * (nx + 1) + i) * 2 + 1] = j * pitch - nudge;
    }
  }
  const triangles = new Uint32Array(nx * ny * 6);
  let at = 0;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      triangles.set([a, b, d, a, d, c], at);
      at += 6;
    }
  }
  const elementCount = nx * ny * 2;
  const corners = (e) => [0, 1, 2].map((k) => [nodes[triangles[e * 3 + k] * 2], nodes[triangles[e * 3 + k] * 2 + 1]]);
  const copper = [
    { slice_key: "copper.front", net_key: "GND", rect: [3 * MM, 3 * MM, 37 * MM, 27 * MM] },
    { slice_key: "copper.back", net_key: "GND", rect: [10.5 * MM, 8.5 * MM, 29.5 * MM, 21.5 * MM] },
  ];
  const cut = new Float32Array(elementCount).fill(NaN);
  const pieces = new Float32Array(elementCount);
  const layers = copper.map(({ slice_key, net_key, rect }) => {
    const vertices = [];
    const tris = [];
    const element = [];
    for (let e = 0; e < elementCount; e += 1) {
      const shape = corners(e);
      const clipped = clipToRect(shape, rect);
      if (clipped.length < 3) continue;
      const fraction = area(clipped) / area(shape);
      if (fraction < 1 - 1e-9) cut[e] = Math.min(Number.isNaN(cut[e]) ? 1 : cut[e], fraction);
      pieces[e] = Math.max(pieces[e], 1);
      const base = vertices.length / 2;
      for (const [x, y] of clipped) vertices.push(x, y);
      for (let k = 1; k + 1 < clipped.length; k += 1) {
        tris.push(base, base + k, base + k + 1);
        element.push(e);
      }
    }
    return {
      slice_key,
      net_key,
      vertices: Int32Array.from(vertices),
      triangles: Uint32Array.from(tris),
      element: Uint32Array.from(element),
      piece: new Uint32Array(element.length),
    };
  });
  const size = new Float32Array(elementCount);
  const angle = new Float32Array(elementCount);
  const slaved = new Float32Array(elementCount);
  for (let e = 0; e < elementCount; e += 1) {
    const shape = corners(e);
    size[e] = Math.max(...[0, 1, 2].map((k) => Math.hypot(shape[(k + 1) % 3][0] - shape[k][0], shape[(k + 1) % 3][1] - shape[k][1])));
    angle[e] = minAngle(shape);
    slaved[e] = cut[e] < 0.2 ? 1 : 0;
  }
  const centre = [Math.round(width * MM / 2), Math.round(height * MM / 2)];
  let cutCount = 0;
  let minCut = Infinity;
  for (const value of cut) if (Number.isFinite(value)) [cutCount, minCut] = [cutCount + 1, Math.min(minCut, value)];
  return encodeMeshPack({
    header: {
      bundle_sha256: "0".repeat(64),
      producer: { engine: "fixture", revision: "0" },
      label,
      run: "demo",
      pass,
      kind: "background",
      summary: { unknowns: 0, elements: elementCount, cut_elements: cutCount, slaved: slaved.reduce((sum, value) => sum + value, 0), min_cut_fraction: minCut },
    },
    nodes,
    triangles,
    layers,
    fields: [
      { name: "size", unit: "nm", values: size },
      { name: "min_angle", unit: "deg", values: angle },
      { name: "cut_fraction", unit: "1", values: cut },
      { name: "slaved", unit: "1", values: slaved },
      { name: "pieces", unit: "1", values: pieces },
    ],
    markers: [{ kind: "port", id: 17, x: centre[0], y: centre[1], radius: 500_000, slice_keys: ["copper.front", "copper.back"], net_key: "GND" }],
  });
}

/**
 * A DC-style quadtree mesh (spec 11 §5) over the fixture board, one pack a
 * copper slice, both in group "dc": 4 mm cells, those within `refineMm` of
 * the board's centre split in four (hanging nodes where they meet a coarse
 * cell), copper in every cell of the slice's rectangle, and a per-layer
 * `potential_v` falling with distance from the centre (NaN off copper).
 */
export function demoQuadtreePacks({ cellMm = 4, refineMm = 6 } = {}) {
  const slices = [
    { slice_key: "copper.front", net_key: "GND", rect: [4, 4, 36, 26], top: 0.02 },
    { slice_key: "copper.back", net_key: "GND", rect: [8, 8, 32, 22], top: 0.01 },
  ];
  return slices.map(({ slice_key, net_key, rect, top }) => {
    const nodes = [];
    const index = new Map();
    const node = (x, y) => {
      const key = `${x},${y}`;
      if (!index.has(key)) {
        index.set(key, nodes.length / 2);
        nodes.push(Math.round(x * MM), Math.round(y * MM));
      }
      return index.get(key);
    };
    const cells = [];
    for (let y = 0; y < 30; y += cellMm) {
      for (let x = 0; x < 40; x += cellMm) {
        const size = Math.min(cellMm, 30 - y);
        const near = Math.hypot(x + cellMm / 2 - 20, y + size / 2 - 15) < refineMm;
        if (near && size === cellMm) {
          const half = cellMm / 2;
          for (const [dx, dy] of [[0, 0], [half, 0], [0, half], [half, half]]) cells.push([x + dx, y + dy, half, half]);
        } else cells.push([x, y, cellMm, size]);
      }
    }
    const quads = new Uint32Array(cells.length * 4);
    cells.forEach(([x, y, w, h], k) => quads.set([node(x, y), node(x + w, y), node(x + w, y + h), node(x, y + h)], k * 4));
    const potential = new Float32Array(cells.length).fill(NaN);
    const vertices = [];
    const triangles = [];
    const element = [];
    cells.forEach(([x, y, w, h], k) => {
      if (x < rect[0] || y < rect[1] || x + w > rect[2] || y + h > rect[3]) return;
      potential[k] = top * (1 - Math.hypot(x + w / 2 - 20, y + h / 2 - 15) / 25);
      const base = vertices.length / 2;
      for (const [px, py] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) vertices.push(Math.round(px * MM), Math.round(py * MM));
      triangles.push(base, base + 1, base + 2, base, base + 2, base + 3);
      element.push(k, k);
    });
    return encodeMeshPack({
      header: { bundle_sha256: "", producer: { engine: "fixture", revision: "0" }, label: `dc ${slice_key}`, kind: "quadtree", group: "dc" },
      nodes: Int32Array.from(nodes),
      triangles: new Uint32Array(0),
      quads,
      layers: [{
        slice_key,
        net_key,
        vertices: Int32Array.from(vertices),
        triangles: Uint32Array.from(triangles),
        element: Uint32Array.from(element),
        piece: new Uint32Array(element.length),
        fields: [{ name: "potential_v", unit: "V", values: potential }],
      }],
      fields: [],
      markers: [],
    });
  });
}
