/**
 * Simulation meshes as the board viewer draws them: a `prism.sim.mesh-pack`
 * (power-integrity suite, spec 11) holds one mesh of a board. Inflated, it is
 * the 8 bytes `PRSMSH01`, a little-endian uint32 header length, the JSON
 * header, zero padding to a multiple of 8, then the data, as a quantity pack
 * is laid out (quantity-pack.js). The header names each array by its offset
 * in the data; the reader takes typed-array views of them, uncopied:
 *
 *   nodes            int32 x, y per node (nanometres, board frame, Y down)
 *   triangles        uint32 a, b, c per element (corner nodes)
 *   layers[]         per conductor on a slice: its copper inside each element,
 *                    triangulated (piece vertices, piece triangles, each piece
 *                    triangle's element and connected piece)
 *   element_fields[] float32 per element, every one optional
 *   markers          ports and the like, in the JSON header
 *
 * Everything here runs without a GPU: the overlay (mesh-overlay.js) uploads
 * the views as they are, and picking, ranking and framing read them here.
 */

export const MESH_PACK_MAGIC = "PRSMSH01";
export const MESH_PACK_SCHEMA = "prism.sim.mesh-pack";

/** Which end of a field is worst, for the fields the spec names; others rank high values first. */
export const WORST_ORDER = Object.freeze({
  size: "descending",
  min_angle: "ascending",
  cut_fraction: "ascending",
  slaved: "descending",
  pieces: "descending",
  indicator: "descending",
});

/** Whether `bytes` are an inflated pack (else a deflated one, as written). */
export function isInflatedMeshPack(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length < 8) return false;
  for (let k = 0; k < 8; k += 1) if (view[k] !== MESH_PACK_MAGIC.charCodeAt(k)) return false;
  return true;
}

/** The inflated bytes of a pack as written (zlib, RFC 1950); inflated bytes come back as they are. */
export async function inflateMeshPack(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isInflatedMeshPack(view)) return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  const stream = new Blob([view]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).arrayBuffer();
}

/**
 * An inflated pack, read: its header and typed views of every array, checked
 * against each other (indices in range, arrays inside the data), so the
 * overlay can upload them as they are.
 */
export function readMeshPack(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!isInflatedMeshPack(bytes)) throw new Error(`not a mesh pack (${JSON.stringify(new TextDecoder().decode(bytes.subarray(0, 8)))})`);
  const length = new DataView(buffer).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length)));
  if (header.schema !== MESH_PACK_SCHEMA) throw new Error(`unexpected schema ${header.schema}`);
  if (header.version !== "a0") throw new Error(`unsupported mesh pack version ${header.version}`);
  const dataStart = Math.ceil((12 + length) / 8) * 8;
  const view = (Type, block, count, what) => {
    const offset = Number(block?.offset);
    if (!Number.isInteger(offset) || offset < 0 || offset % 8) throw new Error(`${what}: offset ${block?.offset} is not 8-aligned`);
    const end = dataStart + offset + count * Type.BYTES_PER_ELEMENT;
    if (end > buffer.byteLength) throw new Error(`${what}: runs past the data (${end} > ${buffer.byteLength})`);
    return new Type(buffer, dataStart + offset, count);
  };
  const nodeCount = count(header.nodes, "nodes");
  const elementCount = count(header.triangles, "triangles");
  const nodes = view(Int32Array, header.nodes, nodeCount * 2, "nodes");
  const triangles = view(Uint32Array, header.triangles, elementCount * 3, "triangles");
  checkIndices(triangles, nodeCount, "triangles");
  const layers = (header.layers || []).map((layer, index) => {
    const what = `layers[${index}] (${layer.slice_key}, ${layer.net_key})`;
    const vertexCount = count(layer.piece_vertices, `${what} piece_vertices`);
    const pieceCount = count(layer.piece_triangles, `${what} piece_triangles`);
    const out = {
      sliceKey: String(layer.slice_key),
      netKey: layer.net_key == null ? "" : String(layer.net_key),
      vertices: view(Int32Array, layer.piece_vertices, vertexCount * 2, `${what} piece_vertices`),
      triangles: view(Uint32Array, layer.piece_triangles, pieceCount * 3, `${what} piece_triangles`),
      element: view(Uint32Array, layer.piece_element, pieceCount, `${what} piece_element`),
      piece: layer.piece_id ? view(Uint32Array, layer.piece_id, pieceCount, `${what} piece_id`) : null,
      pieceCount,
      vertexCount,
    };
    checkIndices(out.triangles, vertexCount, `${what} piece_triangles`);
    checkIndices(out.element, elementCount, `${what} piece_element`);
    return out;
  });
  const fields = (header.element_fields || []).map((field) => {
    if ((field.dtype || "f32") !== "f32") throw new Error(`element field ${field.name}: dtype ${field.dtype} is not f32`);
    return { name: String(field.name), unit: field.unit ?? "", values: view(Float32Array, field, elementCount, `element field ${field.name}`) };
  });
  return {
    header,
    buffer,
    dataStart,
    nodes,
    triangles,
    nodeCount,
    elementCount,
    layers,
    fields,
    markers: (header.markers || []).map((marker) => ({
      kind: String(marker.kind ?? "marker"),
      id: marker.id,
      x: Number(marker.x) || 0,
      y: Number(marker.y) || 0,
      radius: Number(marker.radius) || 0,
      sliceKeys: (marker.slice_keys || []).map(String),
      netKey: marker.net_key == null ? "" : String(marker.net_key),
    })),
  };
}

function count(block, what) {
  const value = Number(block?.count);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${what}: count ${block?.count} is not a whole number`);
  return value;
}

function checkIndices(indices, limit, what) {
  for (let k = 0; k < indices.length; k += 1) {
    if (indices[k] >= limit) throw new Error(`${what}: index ${indices[k]} at ${k} is out of range (${limit})`);
  }
}

/** Bytes (deflated or not) to a read pack. */
export async function openMeshPack(bytes) {
  return readMeshPack(await inflateMeshPack(bytes));
}

/** [min, max] of the finite values, or null when there are none. */
export function finiteRange(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < values.length; k += 1) {
    const value = values[k];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? [min, max] : null;
}

/** What a host lists for a pack: its identity, sizes, layers and fields. */
export function meshPackSummary(pack, key) {
  const { header } = pack;
  return {
    key,
    label: header.label ?? "",
    run: header.run ?? null,
    pass: header.pass ?? null,
    kind: header.kind ?? null,
    bundleSha256: header.bundle_sha256 ?? null,
    producer: header.producer ?? null,
    nodes: pack.nodeCount,
    elements: pack.elementCount,
    pieceTriangles: pack.layers.reduce((sum, layer) => sum + layer.pieceCount, 0),
    layers: pack.layers.map((layer) => ({ sliceKey: layer.sliceKey, netKey: layer.netKey, pieceTriangles: layer.pieceCount })),
    fields: pack.fields.map((field) => ({ name: field.name, unit: field.unit, range: finiteRange(field.values) })),
    markers: pack.markers.length,
    summary: header.summary ?? null,
  };
}

/** A field by name, or null. */
export function meshField(pack, name) {
  return pack.fields.find((field) => field.name === name) || null;
}

/**
 * The `count` worst elements by `field`: `[{ index, value }]`, worst first,
 * NaN skipped. `order` "ascending" ranks low values first, "descending" high
 * ones; by default the field's own (WORST_ORDER).
 */
export function worstElements(pack, fieldName, { count = 20, order = null } = {}) {
  const field = meshField(pack, fieldName);
  if (!field) throw new Error(`the mesh pack has no element field ${fieldName}`);
  const ascending = (order || WORST_ORDER[fieldName] || "descending") === "ascending";
  const values = field.values;
  const indices = [];
  for (let k = 0; k < values.length; k += 1) if (Number.isFinite(values[k])) indices.push(k);
  // A bounded selection would beat a full sort only for tiny counts; 300k sorts in tens of ms.
  indices.sort(ascending ? (a, b) => values[a] - values[b] || a - b : (a, b) => values[b] - values[a] || a - b);
  return indices.slice(0, Math.max(0, count)).map((index) => ({ index, value: values[index] }));
}

/** Whether a threshold `{ value, hide: "below" | "above" }` keeps `value` (NaN is never kept). */
export function thresholdKeeps(threshold, value) {
  if (!threshold) return true;
  if (!Number.isFinite(value)) return false;
  return threshold.hide === "above" ? value <= threshold.value : value >= threshold.value;
}

/** An element's corners in nanometres: [[x, y] x3]. */
export function elementCorners(pack, index) {
  const { nodes, triangles } = pack;
  return [0, 1, 2].map((corner) => {
    const node = triangles[index * 3 + corner];
    return [nodes[node * 2], nodes[node * 2 + 1]];
  });
}

/** An element's numbers and shape, as a host reads them. */
export function elementInfo(pack, index) {
  if (!(index >= 0 && index < pack.elementCount)) return null;
  const corners = elementCorners(pack, index);
  const fields = {};
  for (const field of pack.fields) {
    const value = field.values[index];
    fields[field.name] = Number.isFinite(value) ? value : null;
  }
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    index,
    nodes: [0, 1, 2].map((corner) => pack.triangles[index * 3 + corner]),
    cornersMm: corners.map(([x, y]) => [x / 1e6, y / 1e6]),
    centroidMm: [(xs[0] + xs[1] + xs[2]) / 3e6, (ys[0] + ys[1] + ys[2]) / 3e6],
    boundsMm: [Math.min(...xs) / 1e6, Math.min(...ys) / 1e6, Math.max(...xs) / 1e6, Math.max(...ys) / 1e6],
    fields,
    units: Object.fromEntries(pack.fields.map((field) => [field.name, field.unit])),
  };
}

/** Twice the signed area of (a, b, p), in float64: sign tells the side. */
function orient(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/** Whether (px, py) lies in triangle a, b, c (either winding; edges included). */
export function inTriangle(ax, ay, bx, by, cx, cy, px, py) {
  const d1 = orient(ax, ay, bx, by, px, py);
  const d2 = orient(bx, by, cx, cy, px, py);
  const d3 = orient(cx, cy, ax, ay, px, py);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/**
 * A uniform grid over the elements' bounding boxes, as compressed rows:
 * `cells[start[c] .. start[c + 1])` are the elements touching cell c. Built
 * once per pack; a point lookup then tests a handful of triangles.
 */
export function buildElementGrid(nodes, triangles, elementCount) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < nodes.length; k += 2) {
    if (nodes[k] < x0) x0 = nodes[k];
    if (nodes[k] > x1) x1 = nodes[k];
    if (nodes[k + 1] < y0) y0 = nodes[k + 1];
    if (nodes[k + 1] > y1) y1 = nodes[k + 1];
  }
  if (!(x0 <= x1) || !elementCount) return { x0: 0, y0: 0, size: 1, nx: 0, ny: 0, start: new Uint32Array(1), cells: new Uint32Array(0) };
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  // About two elements a cell.
  const size = Math.max(1, Math.sqrt((width * height * 2) / elementCount));
  const nx = Math.min(4096, Math.max(1, Math.ceil(width / size)));
  const ny = Math.min(4096, Math.max(1, Math.ceil(height / size)));
  const sx = width / nx;
  const sy = height / ny;
  const span = new Int32Array(elementCount * 4);
  const counts = new Uint32Array(nx * ny + 1);
  const cell = (value, origin, step, limit) => Math.min(limit - 1, Math.max(0, Math.floor((value - origin) / step)));
  for (let e = 0; e < elementCount; e += 1) {
    const a = triangles[e * 3] * 2, b = triangles[e * 3 + 1] * 2, c = triangles[e * 3 + 2] * 2;
    const i0 = cell(Math.min(nodes[a], nodes[b], nodes[c]), x0, sx, nx);
    const i1 = cell(Math.max(nodes[a], nodes[b], nodes[c]), x0, sx, nx);
    const j0 = cell(Math.min(nodes[a + 1], nodes[b + 1], nodes[c + 1]), y0, sy, ny);
    const j1 = cell(Math.max(nodes[a + 1], nodes[b + 1], nodes[c + 1]), y0, sy, ny);
    span.set([i0, i1, j0, j1], e * 4);
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) counts[j * nx + i + 1] += 1;
  }
  for (let k = 1; k < counts.length; k += 1) counts[k] += counts[k - 1];
  const start = counts.slice();
  const fill = counts.slice(0, nx * ny);
  const cells = new Uint32Array(start[nx * ny]);
  for (let e = 0; e < elementCount; e += 1) {
    const [i0, i1, j0, j1] = span.subarray(e * 4, e * 4 + 4);
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) cells[fill[j * nx + i]++] = e;
  }
  return { x0, y0, sx, sy, nx, ny, start, cells };
}

/** The element containing (x, y) nanometres that `accept(index)` allows, or -1. */
export function elementAt(pack, x, y, accept = null) {
  pack.grid ??= buildElementGrid(pack.nodes, pack.triangles, pack.elementCount);
  const { grid, nodes, triangles } = pack;
  if (!grid.nx) return -1;
  const fx = (x - grid.x0) / grid.sx;
  const fy = (y - grid.y0) / grid.sy;
  if (!(fx >= 0 && fy >= 0 && fx <= grid.nx && fy <= grid.ny)) return -1;
  // The last row and column own the far edges, as they do when the grid is built.
  const c = Math.min(grid.ny - 1, Math.floor(fy)) * grid.nx + Math.min(grid.nx - 1, Math.floor(fx));
  for (let k = grid.start[c]; k < grid.start[c + 1]; k += 1) {
    const e = grid.cells[k];
    const a = triangles[e * 3] * 2, b = triangles[e * 3 + 1] * 2, d = triangles[e * 3 + 2] * 2;
    if (inTriangle(nodes[a], nodes[a + 1], nodes[b], nodes[b + 1], nodes[d], nodes[d + 1], x, y) && (!accept || accept(e))) return e;
  }
  return -1;
}

/** Each element's piece triangles on a layer, as compressed rows (built once per layer). */
function piecesByElement(layer, elementCount) {
  if (layer.byElement) return layer.byElement;
  const start = new Uint32Array(elementCount + 1);
  for (let k = 0; k < layer.pieceCount; k += 1) start[layer.element[k] + 1] += 1;
  for (let k = 1; k < start.length; k += 1) start[k] += start[k - 1];
  const fill = start.slice(0, elementCount);
  const items = new Uint32Array(layer.pieceCount);
  for (let k = 0; k < layer.pieceCount; k += 1) items[fill[layer.element[k]]++] = k;
  layer.byElement = { start, items };
  return layer.byElement;
}

/** The piece (`{ triangle, piece }`) of `element` on `layer` containing (x, y) nm, or null when it is not copper there. */
export function pieceAt(pack, layer, element, x, y) {
  const { start, items } = piecesByElement(layer, pack.elementCount);
  const v = layer.vertices;
  for (let k = start[element]; k < start[element + 1]; k += 1) {
    const t = items[k];
    const a = layer.triangles[t * 3] * 2, b = layer.triangles[t * 3 + 1] * 2, c = layer.triangles[t * 3 + 2] * 2;
    if (inTriangle(v[a], v[a + 1], v[b], v[b + 1], v[c], v[c + 1], x, y)) return { triangle: t, piece: layer.piece ? layer.piece[t] : 0 };
  }
  return null;
}

/** The distinct slice keys the pack draws on (its layers', then its markers'), in order. */
export function meshSlices(pack) {
  const keys = [];
  for (const key of [...pack.layers.map((layer) => layer.sliceKey), ...pack.markers.flatMap((marker) => marker.sliceKeys)]) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** The distinct net keys of the pack's layers, in order. */
export function meshNets(pack) {
  return [...new Set(pack.layers.map((layer) => layer.netKey))];
}
