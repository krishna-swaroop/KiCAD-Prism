// A simulation mesh over the board (power-integrity spec 11 §3), drawn by the
// WebGPU viewer from a mesh pack (mesh-pack.js).
//
// Per layer of the pack, the copper pieces fill in a neutral tint of the
// layer's net colour, and the elements' edges lie on top, at the height of
// the copper slice they belong to, moved with it when the stackup is
// separated and hidden with its layer. Markers (ports, vias) are small rings.
//
// Like the field relief and the result arrows, the overlay is drawn by
// pipelines of its own after the board, in the frame's pass: no base shader
// changes, so with no mesh shown the frame is the one it always was.
//
// Edges are drawn without line primitives: every element is a triangle whose
// corners carry barycentric coordinates, and the fragment shader measures
// each pixel's distance to the nearest side in screen pixels (fwidth), so a
// line keeps its width in pixels at any zoom. Where an element is only a few
// pixels across its edges fade, so 300,000 elements seen whole do not merge
// into a solid, and one antipad seen close stays crisp.
//
// Geometry is uploaded once per pack as storage buffers (vertex pulling):
// one draw per shown slice for the edges, one per shown layer for the
// pieces, one for the markers. Colouring and the threshold read one float
// per element; changing the threshold or the colour range writes a uniform.

import { DEFAULT_ANALYTIC_STYLE, RAMP_SIZE, colormapStops, sampleColormap } from "./analytic-colormaps.js";
import { EMPHASIS_PALETTE } from "./net-emphasis.js";
import { finiteRange, meshField, meshNets, meshSlices } from "./mesh-pack.js";

/** How far above its copper face (outward, metres) a layer's pieces draw, and its edges and markers. */
export const PIECE_LIFT_M = 2e-6;
export const EDGE_LIFT_M = 3e-6;

/** The value the shaders read as "no value" (NaN in the pack). */
const ABSENT = 3e38;
const NO_ELEMENT = 0xffffffff;
const VIEW_BYTES = 144;
const PLACE_BYTES = 32;

/** How the overlay looks; every field may be overridden (`resolveMeshStyle`). */
export const DEFAULT_MESH_STYLE = Object.freeze({
  edges: true,
  // "layers": each conductor's copper; "domain": the solver's domain, when the pack has one; "none".
  pieces: "layers",
  markers: true,
  // Edge half widths add up across a shared side: this is the drawn width, in CSS-independent device pixels.
  edgeWidth: 1.25,
  // Elements fewer pixels across than this lose their edges.
  edgeFadePx: 3,
  edgeColor: "#14181d",
  edgeOpacity: 0.85,
  highlight: "#ff3b30",
  // An element field to colour by, or null (plain).
  colorBy: null,
  colormap: DEFAULT_ANALYTIC_STYLE.fieldColormap,
  // [min, max] of the colour ramp; null for the field's own range.
  range: null,
  // { field?, value, hide: "below" | "above" } hides elements on one side (and those with no value); null for none.
  threshold: null,
});

function hexColor(hex) {
  const text = String(hex).replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(text)) throw new TypeError(`colour ${hex} is not #rrggbb`);
  return [0, 2, 4].map((at) => Number.parseInt(text.slice(at, at + 2), 16) / 255);
}

/** `style` over `base`, checked against `pack` (fields named must exist). */
export function resolveMeshStyle(style = {}, base = DEFAULT_MESH_STYLE, pack = null) {
  const out = { ...base, ...(style || {}) };
  colormapStops(out.colormap);
  hexColor(out.edgeColor);
  hexColor(out.highlight);
  if (!["layers", "domain", "none"].includes(out.pieces)) throw new TypeError(`pieces must be layers, domain or none, not ${out.pieces}`);
  for (const key of ["edgeWidth", "edgeFadePx"]) {
    if (!(Number(out[key]) >= 0 && Number(out[key]) <= 32)) throw new RangeError(`${key} must be in [0, 32]`);
    out[key] = Number(out[key]);
  }
  out.edgeOpacity = Math.min(1, Math.max(0, Number(out.edgeOpacity)));
  if (out.range != null && !(Array.isArray(out.range) && out.range.length === 2 && out.range.every(Number.isFinite))) throw new TypeError("range is [min, max] or null");
  if (out.threshold != null) {
    const { value, hide = "below", field = null } = out.threshold;
    if (!Number.isFinite(Number(value))) throw new TypeError("threshold.value must be a number");
    if (hide !== "below" && hide !== "above") throw new TypeError("threshold.hide is below or above");
    out.threshold = { value: Number(value), hide, field: field ?? null };
  }
  if (pack) {
    for (const name of [out.colorBy, out.threshold && (out.threshold.field ?? out.colorBy)]) {
      if (name && !meshField(pack, name)) throw new Error(`the mesh pack has no element field ${name}`);
    }
    if (out.threshold && !(out.threshold.field ?? out.colorBy)) throw new Error("a threshold needs a field (threshold.field or colorBy)");
  }
  return out;
}

/** A layer's piece tint: its net's place in the viewer's emphasis palette, mixed toward a neutral grey. */
export function netTint(index) {
  const base = EMPHASIS_PALETTE[index % EMPHASIS_PALETTE.length];
  const grey = [0.86, 0.87, 0.88];
  return base.map((value, k) => value * 0.38 + grey[k] * 0.62);
}

/**
 * Where each slice key draws on the analytic board (`slices`, the attached
 * board's AnalyticRenderer slices): its copper's outward face (the top face,
 * the underside for the bottom layer), lifted past any solder mask, paste
 * or silkscreen on that face, so the mesh lies on what the eye sees.
 * `{ layerId, face, sign, coat }` per key; unmatched keys are left out.
 */
export function meshSlicePlacements(sliceKeys, slices) {
  const out = new Map();
  for (const key of sliceKeys) {
    const faces = (slices || []).filter((slice) => slice.key === key && (slice.role === undefined || slice.role === "copper"));
    if (!faces.length) continue;
    const slab = faces[0];
    const down = Boolean(slab.bottom);
    const sign = down ? -1 : 1;
    const face = down ? slab.zBottom ?? Math.min(...faces.map((f) => f.z)) : slab.zTop ?? Math.max(...faces.map((f) => f.z));
    let coat = 0;
    if (slab.outer) {
      for (const slice of slices) {
        if (slice.role === "mask" || slice.role === "paste" || slice.role === "silk") {
          if (Boolean(slice.faceDown) === down) coat = Math.max(coat, sign * (slice.z - face));
        }
      }
    }
    out.set(key, { layerId: Number(slab.layerId), face, sign, coat });
  }
  return out;
}

const SHADER = /* wgsl */ `
struct View {
  matrix: mat4x4f,
  viewport: vec2f,
  edgeWidth: f32,
  fadePx: f32,
  edgeColor: vec4f,
  highlight: vec4f,
  range: vec2f,
  threshold: f32,
  selected: u32,
  colorMode: u32,
  thresholdMode: u32,
  pad0: u32,
  pad1: u32,
};
// Per slice (edges, markers) and per layer (pieces): heights with the
// stackup offset in, whether it is shown, and the pieces' tint.
struct Place { zPiece: f32, zEdge: f32, shown: f32, pad: f32, tint: vec4f };

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> places: array<Place>;
@group(0) @binding(2) var<storage, read> palette: array<vec4f>;
@group(0) @binding(3) var<storage, read> colorValues: array<f32>;
@group(0) @binding(4) var<storage, read> limitValues: array<f32>;
@group(0) @binding(5) var<storage, read> points: array<vec2i>;
@group(0) @binding(6) var<storage, read> corners: array<u32>;
@group(0) @binding(7) var<storage, read> owners: array<u32>;
@group(0) @binding(8) var<storage, read> markers: array<vec4f>;
// A value per piece vertex (colorMode 2): the slot solved fields will fill
// (spec 11 §4, \`layers[].piece_fields\`); colorMode 1 reads the owning element's.
@group(0) @binding(9) var<storage, read> vertexValues: array<f32>;

const ABSENT = 3e38;
const OFF = vec4f(2.0, 2.0, 2.0, 1.0);

fn present(value: f32) -> bool { return value < 1e38; }

fn kept(element: u32) -> bool {
  if (view.thresholdMode == 0u) { return true; }
  let value = limitValues[element];
  if (!present(value)) { return false; }
  if (view.thresholdMode == 1u) { return value >= view.threshold; }
  return value <= view.threshold;
}

fn ramp(value: f32) -> vec3f {
  let t = clamp((value - view.range.x) / max(view.range.y - view.range.x, 1e-30), 0.0, 1.0) * ${RAMP_SIZE - 1}.0;
  let i = u32(floor(t));
  let j = min(i + 1u, ${RAMP_SIZE - 1}u);
  return mix(palette[i].rgb, palette[j].rgb, t - floor(t));
}

fn place(point: vec2i, z: f32) -> vec4f {
  // Board nanometres (Y down) to world metres (Y up), as the analytic copper.
  return view.matrix * vec4f(f32(point.x) * 1e-9, -f32(point.y) * 1e-9, z, 1.0);
}

struct EdgeOut {
  @builtin(position) position: vec4f,
  @location(0) bary: vec3f,
  @location(1) @interpolate(flat) element: u32,
};

@vertex fn vs_element(@builtin(vertex_index) vertex: u32, @builtin(instance_index) slot: u32) -> EdgeOut {
  let element = vertex / 3u;
  let corner = vertex % 3u;
  var out: EdgeOut;
  out.element = element;
  out.bary = vec3f(f32(corner == 0u), f32(corner == 1u), f32(corner == 2u));
  let at = places[slot];
  if (at.shown < 0.5 || !kept(element)) {
    out.position = OFF;
    return out;
  }
  out.position = place(points[corners[vertex]], at.zEdge);
  return out;
}

@fragment fn fs_element(input: EdgeOut) -> @location(0) vec4f {
  let width = fwidth(input.bary);
  let distance = input.bary / max(width, vec3f(1e-7));
  let nearest = min(distance.x, min(distance.y, distance.z));
  // About the element's smallest height, in pixels.
  let across = 1.0 / max(width.x, max(width.y, width.z));
  let selected = input.element == view.selected;
  let half = select(0.5 * view.edgeWidth, 1.25 * view.edgeWidth + 0.75, selected);
  let line = 1.0 - smoothstep(half - 0.5, half + 0.5, nearest);
  let fade = select(smoothstep(view.fadePx, 2.5 * view.fadePx, across), 1.0, selected);
  let edge = select(view.edgeColor, view.highlight, selected);
  let edgeAlpha = line * fade * edge.a;
  var fill = vec4f(0.0);
  if (view.colorMode == 1u) {
    let value = colorValues[input.element];
    if (present(value)) { fill = vec4f(ramp(value), 0.35); }
  }
  if (selected) { fill = vec4f(view.highlight.rgb, max(fill.a, 0.3)); }
  let alpha = edgeAlpha + fill.a * (1.0 - edgeAlpha);
  if (alpha < 0.004) { discard; }
  return vec4f((edge.rgb * edgeAlpha + fill.rgb * fill.a * (1.0 - edgeAlpha)) / alpha, alpha);
}

struct PieceOut {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) element: u32,
  @location(1) @interpolate(flat) layer: u32,
  @location(2) value: f32,
};

@vertex fn vs_piece(@builtin(vertex_index) vertex: u32, @builtin(instance_index) layer: u32) -> PieceOut {
  let element = owners[vertex / 3u];
  var out: PieceOut;
  out.element = element;
  out.layer = layer;
  let at = places[layer];
  if (at.shown < 0.5 || !kept(element)) {
    out.position = OFF;
    return out;
  }
  let point = corners[vertex];
  out.position = place(points[point], at.zPiece);
  // Interpolated across the piece triangle: one value an element, or one a vertex.
  out.value = select(colorValues[element], vertexValues[point], view.colorMode == 2u);
  return out;
}

@fragment fn fs_piece(input: PieceOut) -> @location(0) vec4f {
  var color = places[input.layer].tint.rgb;
  if (view.colorMode != 0u && present(input.value)) { color = ramp(input.value); }
  if (input.element == view.selected) { color = mix(color, view.highlight.rgb, 0.45); }
  return vec4f(color, 1.0);
}

struct RingOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) radius: f32,
};

// One ring a marker and slice: x, y (world metres), radius (metres), slot.
@vertex fn vs_marker(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> RingOut {
  let marker = markers[index];
  let at = places[u32(marker.w)];
  var out: RingOut;
  if (at.shown < 0.5) {
    out.position = OFF;
    return out;
  }
  var quad = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let corner = quad[vertex];
  let centre = view.matrix * vec4f(marker.x, marker.y, at.zEdge, 1.0);
  let side = view.matrix * vec4f(marker.x + marker.z, marker.y, at.zEdge, 1.0);
  let projected = length((side.xy / side.w - centre.xy / centre.w) * 0.5 * view.viewport);
  let radius = max(projected, 6.0);
  let reach = radius + 2.0;
  out.position = vec4f(centre.xy + corner * reach * 2.0 / view.viewport * centre.w, centre.z, centre.w);
  out.local = corner * reach;
  out.radius = radius;
  return out;
}

@fragment fn fs_marker(input: RingOut) -> @location(0) vec4f {
  let off = abs(length(input.local) - input.radius);
  let alpha = 1.0 - smoothstep(0.75, 1.75, off);
  if (alpha < 0.01) { discard; }
  return vec4f(1.0, 0.55, 0.08, alpha);
}
`;

const BLEND = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
};

export class MeshOverlay {
  constructor(renderer) {
    this.renderer = renderer;
    this.device = renderer.device;
    this.pack = null;
    this.style = resolveMeshStyle();
    this.selected = -1;
    this.viewScratch = new ArrayBuffer(VIEW_BYTES);
    this.view = this.device.createBuffer({ label: "mesh-view", size: VIEW_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.palette = this.device.createBuffer({ label: "mesh-palette", size: RAMP_SIZE * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.empty = this.storage(new Float32Array([ABSENT, 0, 0, 0]), "mesh-empty");
    this.buffers = [];
    this.fieldBuffers = new Map();
    this.writePalette();
  }

  get shown() {
    return Boolean(this.pack);
  }

  storage(data, label) {
    const buffer = this.device.createBuffer({ label, size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    if (data.byteLength) this.device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
    return buffer;
  }

  pipelines() {
    if (this.compiled) return this.compiled;
    const { device, renderer } = this;
    const entries = Array.from({ length: 10 }, (_, binding) => ({
      binding,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: binding === 0 ? "uniform" : "read-only-storage" },
    }));
    this.layout = device.createBindGroupLayout({ label: "mesh", entries });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    const module = device.createShaderModule({ label: "mesh", code: SHADER });
    const make = (name, vertex, fragment, { blend = false, depthWrite = false } = {}) => device.createRenderPipeline({
      label: `mesh-${name}`,
      layout,
      vertex: { module, entryPoint: vertex },
      fragment: { module, entryPoint: fragment, targets: [{ format: renderer.format, ...(blend ? { blend: BLEND } : {}) }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      // Reverse Z: nearer is greater. The mesh lies on its copper, lifted, so it wins against it.
      depthStencil: { format: renderer.depthFormat, depthWriteEnabled: depthWrite, depthCompare: "greater-equal" },
      multisample: { count: renderer.sampleCount || 1 },
    });
    this.compiled = {
      pieces: make("pieces", "vs_piece", "fs_piece", { depthWrite: true }),
      elements: make("elements", "vs_element", "fs_element", { blend: true }),
      markers: make("markers", "vs_marker", "fs_marker", { blend: true }),
    };
    return this.compiled;
  }

  /** Show `pack` (read by mesh-pack.js), or nothing for null. Uploads its geometry once. */
  setPack(pack) {
    if (pack === this.pack) return;
    this.release();
    this.pack = pack || null;
    this.selected = -1;
    if (!pack) {
      this.renderer.invalidate?.();
      return;
    }
    this.slices = meshSlices(pack);
    const nets = meshNets(pack);
    const keep = (buffer) => (this.buffers.push(buffer), buffer);
    this.nodes = keep(this.storage(pack.nodes, "mesh-nodes"));
    this.triangles = keep(this.storage(pack.triangles, "mesh-triangles"));
    // Every piece layer's arrays end to end, their indices made global; the domain last.
    const sources = [...pack.layers.map((layer) => ({ ...layer, tint: netTint(nets.indexOf(layer.netKey)) }))];
    if (pack.domain) for (const key of this.slices) sources.push({ ...pack.domain, sliceKey: key, tint: [0.78, 0.79, 0.8], domain: true });
    const vertexTotal = sources.reduce((sum, layer) => sum + layer.vertices.length, 0);
    const triangleTotal = sources.reduce((sum, layer) => sum + layer.triangles.length, 0);
    const vertices = new Int32Array(vertexTotal);
    const triangles = new Uint32Array(triangleTotal);
    const owners = new Uint32Array(triangleTotal / 3);
    this.layers = [];
    let vertexAt = 0;
    let triangleAt = 0;
    for (const layer of sources) {
      vertices.set(layer.vertices, vertexAt);
      const base = vertexAt / 2;
      for (let k = 0; k < layer.triangles.length; k += 1) triangles[triangleAt + k] = layer.triangles[k] + base;
      owners.set(layer.element, triangleAt / 3);
      this.layers.push({ sliceKey: layer.sliceKey, tint: layer.tint, domain: Boolean(layer.domain), first: triangleAt, count: layer.triangles.length });
      vertexAt += layer.vertices.length;
      triangleAt += layer.triangles.length;
    }
    this.pieceVertices = keep(this.storage(vertices, "mesh-piece-vertices"));
    this.pieceTriangles = keep(this.storage(triangles, "mesh-piece-triangles"));
    this.pieceOwners = keep(this.storage(owners, "mesh-piece-owners"));
    // One ring per marker and slice it names.
    const rings = [];
    for (const marker of pack.markers) {
      for (const key of marker.sliceKeys) {
        rings.push(marker.x * 1e-9, -marker.y * 1e-9, marker.radius * 1e-9, this.slices.indexOf(key));
      }
    }
    this.ringCount = rings.length / 4;
    this.rings = keep(this.storage(Float32Array.from(rings), "mesh-markers"));
    this.placeCount = this.slices.length + this.layers.length;
    this.placeData = new Float32Array(this.placeCount * (PLACE_BYTES / 4));
    this.places = keep(this.device.createBuffer({ label: "mesh-places", size: Math.max(32, this.placeData.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
    this.placements = null;
    this.placementsFor = null;
    this.bindGroups = null;
    this.applyStyle();
  }

  /** Change how the mesh looks (see DEFAULT_MESH_STYLE); returns the style in force. */
  setStyle(style) {
    const next = resolveMeshStyle(style, this.style, this.pack);
    const paletteChanged = next.colormap !== this.style.colormap;
    this.style = next;
    if (paletteChanged) this.writePalette();
    this.applyStyle();
    return this.style;
  }

  /** Highlight one element (its index), or none (-1 or null). */
  setSelection(index) {
    this.selected = Number.isInteger(index) && index >= 0 ? index : -1;
    this.renderer.invalidate?.();
  }

  writePalette() {
    this.device.queue.writeBuffer(this.palette, 0, sampleColormap(this.style.colormap, RAMP_SIZE));
    this.renderer.invalidate?.();
  }

  /** A field's values on the GPU (NaN as absent), uploaded once per field. */
  fieldBuffer(name) {
    if (!name || !this.pack) return this.empty;
    let buffer = this.fieldBuffers.get(name);
    if (!buffer) {
      const values = meshField(this.pack, name).values;
      const upload = new Float32Array(values.length);
      for (let k = 0; k < values.length; k += 1) upload[k] = Number.isFinite(values[k]) ? values[k] : ABSENT;
      buffer = this.storage(upload, `mesh-field-${name}`);
      this.fieldBuffers.set(name, buffer);
    }
    return buffer;
  }

  /** The colour range in force: the style's, else the field's own. */
  colorRange() {
    const { colorBy, range } = this.style;
    if (!colorBy || !this.pack) return [0, 1];
    return range || finiteRange(meshField(this.pack, colorBy).values) || [0, 1];
  }

  thresholdField() {
    const { threshold, colorBy } = this.style;
    return threshold ? threshold.field ?? colorBy : null;
  }

  /** Bind groups for the current pack and the fields the style reads. */
  applyStyle() {
    if (!this.pack) return;
    this.pipelines();
    const color = this.fieldBuffer(this.style.colorBy);
    const limit = this.fieldBuffer(this.thresholdField());
    const group = (points, corners, owners) => this.device.createBindGroup({
      layout: this.layout,
      entries: [this.view, this.places, this.palette, color, limit, points, corners, owners, this.rings, this.empty].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    this.bindGroups = {
      elements: group(this.nodes, this.triangles, this.empty),
      pieces: group(this.pieceVertices, this.pieceTriangles, this.pieceOwners),
    };
    this.renderer.invalidate?.();
  }

  /** Where each slice draws, from the attached analytic board; recomputed when it changes. */
  slicePlacements() {
    const slices = this.renderer.analytic?.slices || null;
    if (this.placementsFor !== slices) {
      this.placements = meshSlicePlacements(this.slices, slices);
      this.placementsFor = slices;
    }
    return this.placements;
  }

  /** The slice keys the pack names that the board has no copper slice for. */
  unmatchedSlices() {
    if (!this.pack) return [];
    const placements = this.slicePlacements();
    return this.slices.filter((key) => !placements.has(key));
  }

  /** A slice's world height (metres) for edges (`edge`) or pieces, with the layers' stackup offsets; null when unmatched. */
  sliceZ(key, layerOffsets, edge = true) {
    const placed = this.slicePlacements().get(key);
    if (!placed) return null;
    const offset = layerOffsets?.[placed.layerId] || 0;
    return placed.face + offset + placed.sign * (placed.coat + (edge ? EDGE_LIFT_M : PIECE_LIFT_M));
  }

  /** Whether a slice draws: matched, and its layer shown. */
  sliceShown(key, visibleLayers) {
    const placed = this.slicePlacements().get(key);
    return Boolean(placed) && (!visibleLayers || visibleLayers.has(placed.layerId));
  }

  /** Draw into the frame's pass, after everything else. Returns `{ draws, triangles }`. */
  encode(pass, matrix, layerOffsets, visibleLayers) {
    if (!this.pack || !this.bindGroups) return { draws: 0, triangles: 0 };
    const pipelines = this.pipelines();
    const { style } = this;
    // Per slice, then per piece layer.
    const data = this.placeData;
    const stride = PLACE_BYTES / 4;
    const shownSlices = [];
    this.slices.forEach((key, slot) => {
      const shown = this.sliceShown(key, visibleLayers);
      data.set([this.sliceZ(key, layerOffsets, false) ?? 0, this.sliceZ(key, layerOffsets, true) ?? 0, shown ? 1 : 0, 0, 0, 0, 0, 0], slot * stride);
      if (shown) shownSlices.push(slot);
    });
    const piecesOn = style.pieces;
    const shownLayers = [];
    this.layers.forEach((layer, index) => {
      const slot = this.slices.length + index;
      const wanted = piecesOn === (layer.domain ? "domain" : "layers");
      const shown = wanted && this.sliceShown(layer.sliceKey, visibleLayers);
      data.set([this.sliceZ(layer.sliceKey, layerOffsets, false) ?? 0, 0, shown ? 1 : 0, 0, ...layer.tint, 1], slot * stride);
      if (shown && layer.count) shownLayers.push({ slot, layer });
    });
    this.device.queue.writeBuffer(this.places, 0, data);
    this.writeView(matrix);
    let draws = 0;
    let triangles = 0;
    if (shownLayers.length) {
      pass.setPipeline(pipelines.pieces);
      pass.setBindGroup(0, this.bindGroups.pieces);
      for (const { slot, layer } of shownLayers) {
        pass.draw(layer.count, 1, layer.first, slot);
        draws += 1;
        triangles += layer.count / 3;
      }
    }
    if (style.edges && shownSlices.length && this.pack.elementCount) {
      pass.setPipeline(pipelines.elements);
      pass.setBindGroup(0, this.bindGroups.elements);
      for (const slot of shownSlices) {
        pass.draw(this.pack.elementCount * 3, 1, 0, slot);
        draws += 1;
        triangles += this.pack.elementCount;
      }
    }
    if (style.markers && this.ringCount && shownSlices.length) {
      pass.setPipeline(pipelines.markers);
      pass.setBindGroup(0, this.bindGroups.elements);
      pass.draw(6, this.ringCount);
      draws += 1;
      triangles += this.ringCount * 2;
    }
    return { draws, triangles };
  }

  writeView(matrix) {
    const floats = new Float32Array(this.viewScratch);
    const words = new Uint32Array(this.viewScratch);
    const { style } = this;
    floats.fill(0);
    floats.set(matrix, 0);
    floats.set([this.renderer.canvas?.width || 1, this.renderer.canvas?.height || 1], 16);
    floats[18] = style.edgeWidth;
    floats[19] = style.edgeFadePx;
    floats.set([...hexColor(style.edgeColor), style.edgeOpacity], 20);
    floats.set([...hexColor(style.highlight), 1], 24);
    floats.set(this.colorRange(), 28);
    floats[30] = style.threshold?.value ?? 0;
    words[31] = this.selected >= 0 ? this.selected : NO_ELEMENT;
    words[32] = style.colorBy ? 1 : 0;
    words[33] = style.threshold ? (style.threshold.hide === "above" ? 2 : 1) : 0;
    this.device.queue.writeBuffer(this.view, 0, this.viewScratch);
  }

  gpuMemoryBytes() {
    if (!this.pack) return 0;
    let bytes = this.view.size + this.palette.size;
    for (const buffer of [...this.buffers, ...this.fieldBuffers.values()]) bytes += buffer.size;
    return bytes;
  }

  release() {
    for (const buffer of [...this.buffers, ...this.fieldBuffers.values()]) buffer.destroy();
    this.buffers = [];
    this.fieldBuffers = new Map();
    this.bindGroups = null;
    this.pack = null;
  }

  destroy() {
    this.release();
    this.view.destroy();
    this.palette.destroy();
    this.empty.destroy();
  }
}
