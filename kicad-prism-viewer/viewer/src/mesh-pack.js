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
 *   quads            uint32 a, b, c, d per element, optional (§5); elements
 *                    are numbered over the triangles, then the quads
 *   layers[]         per conductor on a slice: its copper inside each element,
 *                    triangulated (piece vertices, piece triangles, each piece
 *                    triangle's element and connected piece), and optional
 *                    float32 values per element on that conductor (§5)
 *   element_fields[] float32 per element, every one optional
 *   markers          ports and the like, in the JSON header
 *
 * Packs of one `group` (a quadtree mesh is one pack a slice) are shown
 * together: `mergeMeshPacks` joins them into one pack-shaped whole.
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
  // A quadtree pack (§5) may carry quads alone.
  const triangleCount = header.triangles || !header.quads ? count(header.triangles, "triangles") : 0;
  const quadCount = header.quads ? count(header.quads, "quads") : 0;
  const elementCount = triangleCount + quadCount;
  const nodes = view(Int32Array, header.nodes, nodeCount * 2, "nodes");
  const triangles = header.triangles ? view(Uint32Array, header.triangles, triangleCount * 3, "triangles") : new Uint32Array(0);
  checkIndices(triangles, nodeCount, "triangles");
  const quads = quadCount ? view(Uint32Array, header.quads, quadCount * 4, "quads") : new Uint32Array(0);
  checkIndices(quads, nodeCount, "quads");
  const valuesOf = (field, what) => {
    if ((field.dtype || "f32") !== "f32") throw new Error(`${what} ${field.name}: dtype ${field.dtype} is not f32`);
    return { name: String(field.name), unit: field.unit ?? "", values: view(Float32Array, field, elementCount, `${what} ${field.name}`) };
  };
  const pieces = (layer, what) => {
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
    if (Number.isFinite(Number(layer.exact_area_nm2))) out.exactAreaNm2 = Number(layer.exact_area_nm2);
    // §5: values per element on this conductor (NaN where it has no copper), and its element range in a merged group.
    out.fields = (layer.element_fields || []).map((field) => valuesOf(field, `${what} element field`));
    out.elementBase = 0;
    return out;
  };
  const layers = (header.layers || []).map((layer, index) => pieces(layer, `layers[${index}] (${layer.slice_key}, ${layer.net_key})`));
  // Resolution 2: the solver's domain, optional, with the same piece arrays and no slice of its own.
  const domain = header.domain ? pieces({ slice_key: "", net_key: "", ...header.domain }, "domain") : null;
  const fields = (header.element_fields || []).map((field) => valuesOf(field, "element field"));
  // Every element's corners, triangles then quads, as compressed rows.
  const cornerStart = new Uint32Array(elementCount + 1);
  for (let e = 0; e < elementCount; e += 1) cornerStart[e + 1] = cornerStart[e] + (e < triangleCount ? 3 : 4);
  const corners = new Uint32Array(triangles.length + quads.length);
  corners.set(triangles, 0);
  corners.set(quads, triangles.length);
  const layerSlices = [...new Set(layers.map((layer) => layer.sliceKey))];
  return {
    header,
    buffer,
    dataStart,
    nodes,
    triangles,
    quads,
    corners,
    cornerStart,
    nodeCount,
    triangleCount,
    quadCount,
    elementCount,
    group: header.group == null ? null : String(header.group),
    // Which elements draw their edges on which slice: all of them on each of the pack's layer slices.
    edgeRanges: layerSlices.map((sliceKey) => ({ sliceKey, first: 0, count: elementCount })),
    layers,
    domain,
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
    layers: pack.layers.map((layer) => ({ sliceKey: layer.sliceKey, netKey: layer.netKey, pieceTriangles: layer.pieceCount, fields: (layer.fields || []).map((field) => field.name) })),
    group: pack.group ?? null,
    quads: pack.quadCount || 0,
    domain: Boolean(pack.domain),
    fields: colourFields(pack),
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
  const ascending = (order || WORST_ORDER[fieldName] || "descending") === "ascending";
  // A mesh field ranks elements; a per-layer one ranks (element, layer) pairs over every layer that has it.
  const lists = field ? [{ values: field.values, base: 0, layer: null }]
    : layerFields(pack, fieldName).map(({ layer, field: values }) => ({ values: values.values, base: layer.elementBase || 0, layer: pack.layers.indexOf(layer) }));
  if (!lists.length) throw new Error(`the mesh pack has no element field ${fieldName}`);
  const items = [];
  for (const list of lists) {
    for (let k = 0; k < list.values.length; k += 1) if (Number.isFinite(list.values[k])) items.push({ index: list.base + k, value: list.values[k], ...(list.layer == null ? {} : { layer: list.layer }) });
  }
  // A bounded selection would beat a full sort only for tiny counts; 300k sorts in tens of ms.
  items.sort(ascending ? (a, b) => a.value - b.value || a.index - b.index : (a, b) => b.value - a.value || a.index - b.index);
  return items.slice(0, Math.max(0, count));
}

/** Whether a threshold `{ value, hide: "below" | "above" }` keeps `value` (NaN is never kept). */
export function thresholdKeeps(threshold, value) {
  if (!threshold) return true;
  if (!Number.isFinite(value)) return false;
  return threshold.hide === "above" ? value <= threshold.value : value >= threshold.value;
}

/** An element's corner nodes, in order (three or four). */
export function elementNodes(pack, index) {
  return Array.from(pack.corners.subarray(pack.cornerStart[index], pack.cornerStart[index + 1]));
}

/** An element's corners in nanometres: [[x, y]] (three or four). */
export function elementCorners(pack, index) {
  return elementNodes(pack, index).map((node) => [pack.nodes[node * 2], pack.nodes[node * 2 + 1]]);
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
  // Per-layer values, by layer: `{ sliceKey, netKey, fields }` where the layer has one here.
  const layers = [];
  for (const layer of pack.layers) {
    const local = index - (layer.elementBase || 0);
    if (!layer.fields?.length || local < 0 || local >= layer.fields[0].values.length) continue;
    const values = Object.fromEntries(layer.fields.map((field) => [field.name, Number.isFinite(field.values[local]) ? field.values[local] : null]));
    if (Object.values(values).some((value) => value !== null)) layers.push({ sliceKey: layer.sliceKey, netKey: layer.netKey, fields: values });
  }
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length / 1e6;
  const source = pack.sources?.find((item) => index >= item.elementBase && index < item.elementBase + item.elementCount);
  return {
    index,
    ...(source ? { source: source.key, sourceIndex: index - source.elementBase } : {}),
    nodes: elementNodes(pack, index),
    cornersMm: corners.map(([x, y]) => [x / 1e6, y / 1e6]),
    centroidMm: [mean(xs), mean(ys)],
    boundsMm: [Math.min(...xs) / 1e6, Math.min(...ys) / 1e6, Math.max(...xs) / 1e6, Math.max(...ys) / 1e6],
    fields,
    ...(layers.length ? { layers } : {}),
    units: Object.fromEntries(colourFields(pack).map((field) => [field.name, field.unit])),
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
export function buildElementGrid(nodes, corners, cornerStart, elementCount) {
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
    let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
    for (let k = cornerStart[e]; k < cornerStart[e + 1]; k += 1) {
      const x = nodes[corners[k] * 2], y = nodes[corners[k] * 2 + 1];
      if (x < lx) lx = x;
      if (x > hx) hx = x;
      if (y < ly) ly = y;
      if (y > hy) hy = y;
    }
    const i0 = cell(lx, x0, sx, nx);
    const i1 = cell(hx, x0, sx, nx);
    const j0 = cell(ly, y0, sy, ny);
    const j1 = cell(hy, y0, sy, ny);
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
  pack.grid ??= buildElementGrid(pack.nodes, pack.corners, pack.cornerStart, pack.elementCount);
  const { grid, nodes, corners, cornerStart } = pack;
  if (!grid.nx) return -1;
  const fx = (x - grid.x0) / grid.sx;
  const fy = (y - grid.y0) / grid.sy;
  if (!(fx >= 0 && fy >= 0 && fx <= grid.nx && fy <= grid.ny)) return -1;
  // The last row and column own the far edges, as they do when the grid is built.
  const c = Math.min(grid.ny - 1, Math.floor(fy)) * grid.nx + Math.min(grid.nx - 1, Math.floor(fx));
  for (let k = grid.start[c]; k < grid.start[c + 1]; k += 1) {
    const e = grid.cells[k];
    const first = cornerStart[e];
    const a = corners[first] * 2;
    // A triangle, or a quad as its two halves about the first corner.
    for (let c = first + 1; c + 1 < cornerStart[e + 1]; c += 1) {
      const b = corners[c] * 2, d = corners[c + 1] * 2;
      if (inTriangle(nodes[a], nodes[a + 1], nodes[b], nodes[b + 1], nodes[d], nodes[d + 1], x, y) && (!accept || accept(e))) return e;
    }
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

/**
 * Packs of one group (§5) as one pack-shaped whole: nodes, elements and
 * pieces end to end (indices moved), mesh fields joined by name (NaN where
 * a pack lacks one), layers keeping their own per-element values with the
 * element range they index from (`elementBase`). Each pack's elements draw
 * their edges on its own slices only (`edgeRanges`); `sources` maps merged
 * element indices back to each pack's. One pack comes back as it is.
 */
export function mergeMeshPacks(entries) {
  if (entries.length === 1) return entries[0].pack;
  const nodeTotal = entries.reduce((sum, { pack }) => sum + pack.nodeCount, 0);
  const elementTotal = entries.reduce((sum, { pack }) => sum + pack.elementCount, 0);
  const cornerTotal = entries.reduce((sum, { pack }) => sum + pack.corners.length, 0);
  const nodes = new Int32Array(nodeTotal * 2);
  const corners = new Uint32Array(cornerTotal);
  const cornerStart = new Uint32Array(elementTotal + 1);
  const names = [];
  for (const { pack } of entries) for (const field of pack.fields) if (!names.some((item) => item.name === field.name)) names.push({ name: field.name, unit: field.unit });
  const fields = names.map(({ name, unit }) => ({ name, unit, values: new Float32Array(elementTotal).fill(NaN) }));
  const layers = [];
  const markers = [];
  const edgeRanges = [];
  const sources = [];
  let nodeBase = 0;
  let elementBase = 0;
  let cornerBase = 0;
  for (const { key, pack } of entries) {
    nodes.set(pack.nodes, nodeBase * 2);
    for (let k = 0; k < pack.corners.length; k += 1) corners[cornerBase + k] = pack.corners[k] + nodeBase;
    for (let e = 0; e < pack.elementCount; e += 1) cornerStart[elementBase + e + 1] = cornerBase + pack.cornerStart[e + 1];
    for (const field of pack.fields) fields.find((item) => item.name === field.name).values.set(field.values, elementBase);
    for (const layer of pack.layers) {
      const element = new Uint32Array(layer.element.length);
      for (let k = 0; k < element.length; k += 1) element[k] = layer.element[k] + elementBase;
      layers.push({ ...layer, element, elementBase: elementBase + layer.elementBase, byElement: undefined, source: key });
    }
    markers.push(...pack.markers);
    for (const range of pack.edgeRanges) edgeRanges.push({ ...range, first: range.first + elementBase });
    sources.push({ key, elementBase, elementCount: pack.elementCount });
    nodeBase += pack.nodeCount;
    elementBase += pack.elementCount;
    cornerBase += pack.corners.length;
  }
  const first = entries[0].pack;
  return {
    header: { ...first.header, label: first.header.group ? `group ${first.header.group}` : first.header.label },
    nodes,
    corners,
    cornerStart,
    nodeCount: nodeTotal,
    elementCount: elementTotal,
    group: first.group,
    edgeRanges,
    layers,
    domain: null,
    fields,
    markers,
    sources,
  };
}

/** The per-layer value lists named `name` (§5 `layers[].element_fields`), with their layers. */
export function layerFields(pack, name) {
  return pack.layers.map((layer) => ({ layer, field: layer.fields?.find((item) => item.name === name) || null })).filter((item) => item.field);
}

/** Every value list a pack can colour or rank by: mesh fields, then per-layer ones, by name. */
export function colourFields(pack) {
  const out = pack.fields.map((field) => ({ name: field.name, unit: field.unit, scope: "element", range: finiteRange(field.values) }));
  for (const layer of pack.layers) {
    for (const field of layer.fields || []) {
      const known = out.find((item) => item.name === field.name);
      const range = finiteRange(field.values);
      if (!known) out.push({ name: field.name, unit: field.unit, scope: "layer", range });
      else if (known.scope === "layer" && range) known.range = known.range ? [Math.min(known.range[0], range[0]), Math.max(known.range[1], range[1])] : range;
    }
  }
  return out;
}
