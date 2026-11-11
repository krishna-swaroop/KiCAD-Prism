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
import { colourFields, meshField, meshNets, meshSlices } from "./mesh-pack.js";

/** How far above its copper face (outward, metres) a layer's pieces draw, and its edges and markers. */
export const PIECE_LIFT_M = 2e-6;
export const EDGE_LIFT_M = 3e-6;

/** The value the shaders read as "no value" (NaN in the pack). */
const ABSENT = 3e38;
const NO_ELEMENT = 0xffffffff;
const VIEW_BYTES = 192;
/** The palette's entries, then the places, in one storage table (a stage may bind only 8 storage buffers). */
const PALETTE_ENTRIES = RAMP_SIZE;
const PLACE_BYTES = 48;

/** How the overlay looks; every field may be overridden (`resolveMeshStyle`). */
export const DEFAULT_MESH_STYLE = Object.freeze({
  // "copper": element edges only where the layer has copper of its conductor (a gap
  // in the copper is a gap in the mesh drawn), with the copper's own boundary
  // outlined; "all": every element's edges, the background mesh; "off".
  edges: "copper",
  // "layers": each conductor's copper; "domain": the solver's domain, when the pack has one; "none".
  pieces: "layers",
  markers: true,
  // Edge half widths add up across a shared side: this is the drawn width, in CSS-independent device pixels.
  edgeWidth: 1.25,
  // Elements fewer pixels across than this lose their edges.
  edgeFadePx: 3,
  edgeColor: "#14181d",
  edgeOpacity: 0.85,
  // The copper boundary where it cuts an element (edges "copper" and "all").
  copperEdgeColor: "#7a3e0c",
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
  hexColor(out.copperEdgeColor);
  // Booleans as the checkbox had them.
  if (out.edges === true) out.edges = "copper";
  if (out.edges === false) out.edges = "off";
  if (!["off", "copper", "all"].includes(out.edges)) throw new TypeError(`edges must be off, copper or all, not ${out.edges}`);
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
      if (name && !colourFields(pack).some((field) => field.name === name)) throw new Error(`the mesh pack has no element field ${name}`);
    }
    if (out.threshold && !(out.threshold.field ?? out.colorBy)) throw new Error("a threshold needs a field (threshold.field or colorBy)");
  }
  return out;
}

/** A layer's piece tint: its net's place in the viewer's emphasis palette, mixed toward a neutral grey. */
export function netTint(index) {
  const base = EMPHASIS_PALETTE[index % EMPHASIS_PALETTE.length];
  const grey = [0.86, 0.87, 0.88];
  return base.map((value, k) => value * 0.3 + grey[k] * 0.7);
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
  // Where each mesh value list starts in \`values\`: the colour field, the threshold's, the piece vertices'.
  colorBase: u32,
  limitBase: u32,
  vertexBase: u32,
  // 1 when the threshold reads a per-layer field (each place's limitBase), not a mesh one.
  limitLayer: u32,
  // 0 no edges, 1 on copper (drawn in the piece pass, inside the pieces), 2 the whole mesh.
  edgeMode: u32,
  // Where the elements' corners and the nodes start in \`elementData\` (corner rows first).
  cornersBase: u32,
  copperEdge: vec4f,
  nodesBase: u32,
  pad1: u32,
  pad2: u32,
  pad3: u32,
};
// Per slice (edges, markers) and per layer (pieces): heights with the
// stackup offset in, whether it is shown, the pieces' tint, and for a layer
// where its own per-element values start (NONE: none) and the first element
// they index from (a merged group's layer covers its pack's elements only).
struct Place { zPiece: f32, zEdge: f32, shown: f32, tint: vec4f, colorBase: u32, limitBase: u32, elementBase: u32, fill: u32 };

@group(0) @binding(0) var<uniform> view: View;
// The colour ramp (PALETTE entries), then two entries a place.
@group(0) @binding(1) var<storage, read> table: array<vec4f>;
// Value lists end to end (see the bases in View): one float an element for
// colouring and for the threshold, and one a piece vertex (colorMode 2), the
// slot solved fields will fill (spec 11 §4, \`layers[].piece_fields\`).
@group(0) @binding(2) var<storage, read> values: array<f32>;
@group(0) @binding(3) var<storage, read> points: array<vec2i>;
@group(0) @binding(4) var<storage, read> corners: array<u32>;
@group(0) @binding(5) var<storage, read> owners: array<u32>;
@group(0) @binding(6) var<storage, read> markers: array<vec4f>;
// Each element's corner rows (E + 1 starts), its corner nodes, then the nodes (x, y as i32 bits).
@group(0) @binding(7) var<storage, read> elementData: array<u32>;

const PALETTE = ${PALETTE_ENTRIES}u;

const NONE = 0xffffffffu;

fn placeAt(index: u32) -> Place {
  let low = table[PALETTE + index * 3u];
  let bases = bitcast<vec4u>(table[PALETTE + index * 3u + 2u]);
  return Place(low.x, low.y, low.z, table[PALETTE + index * 3u + 1u], bases.x, bases.y, bases.z, bases.w);
}

/** A layer's own value for an element (§5 \`layers[].element_fields\`), or absent. */
fn layerValue(base: u32, at: Place, element: u32) -> f32 {
  if (base == NONE) { return ABSENT; }
  return values[base + element - at.elementBase];
}

fn colorValue(element: u32) -> f32 { return values[view.colorBase + element]; }
fn limitValue(element: u32) -> f32 { return values[view.limitBase + element]; }
fn vertexValue(vertex: u32) -> f32 { return values[view.vertexBase + vertex]; }

const ABSENT = 3e38;
const OFF = vec4f(2.0, 2.0, 2.0, 1.0);

fn present(value: f32) -> bool { return value < 1e38; }

fn passes(value: f32) -> bool {
  if (!present(value)) { return false; }
  if (view.thresholdMode == 1u) { return value >= view.threshold; }
  return value <= view.threshold;
}

/** Whether an element shows: a threshold on a mesh field hides it everywhere. */
fn kept(element: u32) -> bool {
  if (view.thresholdMode == 0u || view.limitLayer == 1u) { return true; }
  return passes(limitValue(element));
}

/** Whether a piece shows: its element is kept, and a threshold on a per-layer field keeps it on its layer. */
fn keptOn(element: u32, at: Place) -> bool {
  if (view.thresholdMode == 0u) { return true; }
  if (view.limitLayer == 1u) { return passes(layerValue(at.limitBase, at, element)); }
  return kept(element);
}

fn ramp(value: f32) -> vec3f {
  let t = clamp((value - view.range.x) / max(view.range.y - view.range.x, 1e-30), 0.0, 1.0) * ${RAMP_SIZE - 1}.0;
  let i = u32(floor(t));
  let j = min(i + 1u, ${RAMP_SIZE - 1}u);
  return mix(table[i].rgb, table[j].rgb, t - floor(t));
}

fn place(point: vec2i, z: f32) -> vec4f {
  // Board nanometres (Y down) to world metres (Y up), as the analytic copper.
  return view.matrix * vec4f(f32(point.x) * 1e-9, -f32(point.y) * 1e-9, z, 1.0);
}

struct EdgeOut {
  @builtin(position) position: vec4f,
  @location(0) bary: vec3f,
  @location(1) @interpolate(flat) element: u32,
  @location(2) @interpolate(flat) outline: u32,
};

// Elements are drawn as outline triangles: a triangle as itself, a quad as
// two halves. Each carries its element (low 29 bits) and which of its sides
// are the element's outline (bit k: the side opposite corner k), so a quad's
// diagonal is never drawn.
@vertex fn vs_element(@builtin(vertex_index) vertex: u32, @builtin(instance_index) slot: u32) -> EdgeOut {
  let owner = owners[vertex / 3u];
  let element = owner & 0x1fffffffu;
  let corner = vertex % 3u;
  var out: EdgeOut;
  out.element = element;
  out.outline = owner >> 29u;
  out.bary = vec3f(f32(corner == 0u), f32(corner == 1u), f32(corner == 2u));
  let at = placeAt(slot);
  if (at.shown < 0.5 || !kept(element)) {
    out.position = OFF;
    return out;
  }
  out.position = place(points[corners[vertex]], at.zEdge);
  return out;
}

@fragment fn fs_element(input: EdgeOut) -> @location(0) vec4f {
  let width = fwidth(input.bary);
  let inner = vec3f(f32((input.outline & 1u) == 0u), f32((input.outline & 2u) == 0u), f32((input.outline & 4u) == 0u));
  let distance = input.bary / max(width, vec3f(1e-7)) + inner * 1e9;
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
    let value = colorValue(input.element);
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
  // The piece triangle's barycentrics, for its copper-boundary sides.
  @location(3) bary: vec3f,
  // Signed distances (nm) to the owning element's sides (a triangle's fourth repeats its first):
  // affine across the piece, so interpolation keeps them exact.
  @location(4) sides: vec4f,
  @location(5) @interpolate(flat) outline: u32,
  @location(6) @interpolate(flat) heightNm: f32,
};

fn nodeAt(node: u32) -> vec2i {
  let at = view.nodesBase + node * 2u;
  return vec2i(bitcast<i32>(elementData[at]), bitcast<i32>(elementData[at + 1u]));
}

// Distance (nm) from p to the line through a and b, from differences, so it
// stays exact to a nanometre for points near the element.
fn sideDistance(p: vec2i, a: vec2i, b: vec2i) -> f32 {
  let d = vec2f(p - a);
  let e = vec2f(b - a);
  return (d.x * e.y - d.y * e.x) / max(length(e), 1.0);
}

@vertex fn vs_piece(@builtin(vertex_index) vertex: u32, @builtin(instance_index) layer: u32) -> PieceOut {
  let owner = owners[vertex / 3u];
  let element = owner & 0x1fffffffu;
  let corner = vertex % 3u;
  var out: PieceOut;
  out.element = element;
  out.layer = layer;
  out.outline = owner >> 29u;
  out.bary = vec3f(f32(corner == 0u), f32(corner == 1u), f32(corner == 2u));
  let at = placeAt(layer);
  if (at.shown < 0.5 || !keptOn(element, at)) {
    out.position = OFF;
    return out;
  }
  let point = corners[vertex];
  let p = points[point];
  out.position = place(p, at.zPiece);
  // Interpolated across the piece triangle: one value an element (the mesh's,
  // or this layer's own), or one a piece vertex.
  var value = colorValue(element);
  if (view.colorMode == 2u) { value = vertexValue(point); }
  if (view.colorMode == 3u) { value = layerValue(at.colorBase, at, element); }
  out.value = value;
  // The element's sides, for its edges drawn on this copper only.
  let first = elementData[element];
  let count = elementData[element + 1u] - first;
  let c0 = nodeAt(elementData[view.cornersBase + first]);
  let c1 = nodeAt(elementData[view.cornersBase + first + 1u]);
  let c2 = nodeAt(elementData[view.cornersBase + first + 2u]);
  var c3 = c0;
  if (count > 3u) { c3 = nodeAt(elementData[view.cornersBase + first + 3u]); }
  let last = select(c2, c3, count > 3u);
  out.sides = vec4f(sideDistance(p, c0, c1), sideDistance(p, c1, c2), sideDistance(p, c2, select(c0, c3, count > 3u)), sideDistance(p, last, c0));
  // About the element's smallest height: twice its area over its longest side.
  let span = max(max(length(vec2f(c1 - c0)), length(vec2f(c2 - c1))), max(length(vec2f(last - c2)), length(vec2f(c0 - last))));
  let area = abs(sideDistance(c2, c0, c1)) * length(vec2f(c1 - c0)) * select(0.5, 1.0, count > 3u);
  out.heightNm = 2.0 * area / max(span, 1.0);
  return out;
}

@fragment fn fs_piece(input: PieceOut) -> @location(0) vec4f {
  // Derivatives first, in uniform control flow.
  let sideWidth = fwidth(input.sides);
  let baryWidth = fwidth(input.bary);
  let at = placeAt(input.layer);
  let selected = input.element == view.selected;
  var color = at.tint.rgb;
  if (view.colorMode != 0u && present(input.value)) { color = ramp(input.value); }
  if (selected) { color = mix(color, view.highlight.rgb, 0.45); }
  var alpha = select(0.0, 1.0, at.fill == 1u);
  if (view.edgeMode != 0u) {
    // The copper's own boundary, where it cuts the element: heavier, in its own tone.
    let open = vec3f(f32((input.outline & 1u) == 0u), f32((input.outline & 2u) == 0u), f32((input.outline & 4u) == 0u));
    let toCopper = min(min(input.bary.x / max(baryWidth.x, 1e-7) + open.x * 1e9, input.bary.y / max(baryWidth.y, 1e-7) + open.y * 1e9), input.bary.z / max(baryWidth.z, 1e-7) + open.z * 1e9);
    let copperLine = (1.0 - smoothstep(0.75 * view.edgeWidth - 0.5, 0.75 * view.edgeWidth + 0.5, toCopper)) * view.copperEdge.a;
    color = mix(color, view.copperEdge.rgb, copperLine);
    alpha = max(alpha, copperLine);
  }
  if (view.edgeMode == 1u) {
    // The element's sides, only where this layer has copper (this fragment is in a piece).
    let px = abs(input.sides) / max(sideWidth, vec4f(1e-6));
    let nearest = min(min(px.x, px.y), min(px.z, px.w));
    let across = input.heightNm / max(max(sideWidth.x, sideWidth.y), 1e-6);
    let half = select(0.5 * view.edgeWidth, 1.25 * view.edgeWidth + 0.75, selected);
    let fade = select(smoothstep(view.fadePx, 2.5 * view.fadePx, across), 1.0, selected);
    let edge = select(view.edgeColor, view.highlight, selected);
    let line = (1.0 - smoothstep(half - 0.5, half + 0.5, nearest)) * fade * edge.a;
    color = mix(color, edge.rgb, line);
    alpha = max(alpha, line);
  }
  if (alpha < 0.004) { discard; }
  return vec4f(color, alpha);
}

struct RingOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) radius: f32,
};

// One ring a marker and slice: x, y (world metres), radius (metres), slot.
@vertex fn vs_marker(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> RingOut {
  let marker = markers[index];
  let at = placeAt(u32(marker.w));
  var out: RingOut;
  if (at.shown < 0.5) {
    out.position = OFF;
    return out;
  }
  var quad = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let corner = quad[vertex];
  // Pixels a metre on the board's plane here, so the ring is at least a few
  // pixels across; drawn in the plane, so it meets the copper's depth as it does.
  let centre = view.matrix * vec4f(marker.x, marker.y, at.zEdge, 1.0);
  let side = view.matrix * vec4f(marker.x + 1e-4, marker.y, at.zEdge, 1.0);
  let perMetre = max(length((side.xy / side.w - centre.xy / centre.w) * 0.5 * view.viewport) / 1e-4, 1e-3);
  let radius = max(marker.z * perMetre, 6.0);
  let reach = radius + 2.0;
  out.position = view.matrix * vec4f(marker.x + corner.x * reach / perMetre, marker.y + corner.y * reach / perMetre, at.zEdge, 1.0);
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
    this.empty = this.storage(new Float32Array([ABSENT, 0, 0, 0]), "mesh-empty");
    this.buffers = [];
    this.values = null;
    this.paletteData = sampleColormap(this.style.colormap, RAMP_SIZE);
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
    const entries = Array.from({ length: 8 }, (_, binding) => ({
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
      // Blended: with pieces off, the piece pass still draws the edges on copper.
      pieces: make("pieces", "vs_piece", "fs_piece", { blend: true, depthWrite: true }),
      elements: make("elements", "vs_element", "fs_element", { blend: true }),
      markers: make("markers", "vs_marker", "fs_marker", { blend: true }),
    };
    return this.compiled;
  }

  /**
   * Show `pack` (read by mesh-pack.js, or a merged group), or nothing for
   * null. Uploads its geometry once.
   */
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
    // Corner rows, corners and nodes in one list (a stage binds 8 storage buffers at most).
    const elementData = new Uint32Array(pack.cornerStart.length + pack.corners.length + pack.nodes.length);
    elementData.set(pack.cornerStart, 0);
    elementData.set(pack.corners, pack.cornerStart.length);
    elementData.set(new Uint32Array(pack.nodes.buffer, pack.nodes.byteOffset, pack.nodes.length), pack.cornerStart.length + pack.corners.length);
    this.elementBases = { corners: pack.cornerStart.length, nodes: pack.cornerStart.length + pack.corners.length };
    this.elementData = keep(this.storage(elementData, "mesh-element-data"));
    const outline = outlineTriangles(pack);
    this.outlineStart = outline.start;
    this.outlineCorners = keep(this.storage(outline.corners, "mesh-outline-corners"));
    this.outlineOwners = keep(this.storage(outline.owners, "mesh-outline-owners"));
    this.edgeRanges = pack.edgeRanges.map((range) => ({
      slot: this.slices.indexOf(range.sliceKey),
      first: outline.start[range.first] * 3,
      count: (outline.start[range.first + range.count] - outline.start[range.first]) * 3,
    }));
    // Every piece layer's arrays end to end, their indices made global; the domain last.
    const sources = pack.layers.map((layer) => ({ ...layer, tint: netTint(nets.indexOf(layer.netKey)) }));
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
      // Each piece triangle's element, and above it which of its sides are copper boundary.
      const masks = copperBoundaryMasks(layer, pack);
      for (let k = 0; k < layer.element.length; k += 1) owners[triangleAt / 3 + k] = (layer.element[k] | (masks[k] << 29)) >>> 0;
      this.layers.push({
        sliceKey: layer.sliceKey,
        tint: layer.tint,
        domain: Boolean(layer.domain),
        fields: layer.domain ? [] : layer.fields || [],
        elementBase: layer.elementBase || 0,
        first: triangleAt,
        count: layer.triangles.length,
      });
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
    this.placeWords = new Uint32Array(this.placeData.buffer);
    this.table = keep(this.device.createBuffer({ label: "mesh-table", size: PALETTE_ENTRIES * 16 + Math.max(PLACE_BYTES, this.placeData.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
    this.writePalette();
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
    this.paletteData = sampleColormap(this.style.colormap, RAMP_SIZE);
    if (this.table) this.device.queue.writeBuffer(this.table, 0, this.paletteData);
    this.renderer.invalidate?.();
  }

  /**
   * Every value list end to end (NaN as absent): the mesh's element fields,
   * then each layer's own, then one absent value where the piece vertices'
   * list will go. Uploaded the first time the style colours or thresholds;
   * after that only the bases change.
   */
  valuesBuffer() {
    const { pack } = this;
    if (!this.style.colorBy && !this.style.threshold) return this.values?.buffer || this.empty;
    if (this.values) return this.values.buffer;
    const lists = [...pack.fields.map((field) => ({ field, layer: null })), ...this.layers.flatMap((layer) => layer.fields.map((field) => ({ field, layer })))];
    const total = lists.reduce((sum, { field }) => sum + field.values.length, 0);
    const upload = new Float32Array(total + 4).fill(ABSENT);
    const bases = new Map();
    let at = 0;
    for (const { field, layer } of lists) {
      for (let k = 0; k < field.values.length; k += 1) if (Number.isFinite(field.values[k])) upload[at + k] = field.values[k];
      bases.set(layer ? `${this.layers.indexOf(layer)}:${field.name}` : field.name, at);
      at += field.values.length;
    }
    this.values = { buffer: this.storage(upload, "mesh-values"), bases, vertexBase: total };
    return this.values.buffer;
  }

  /** Where a mesh field's values start in the values buffer (the absent slot for none). */
  fieldBase(name) {
    return (name && this.values?.bases.get(name)) ?? this.values?.vertexBase ?? 0;
  }

  /** Where a layer's own values of `name` start, or NONE. */
  layerBase(index, name) {
    const base = name ? this.values?.bases.get(`${index}:${name}`) : undefined;
    return base ?? NO_ELEMENT;
  }

  /** "element" for a mesh field, "layer" for a per-layer one, null for none. */
  scopeOf(name) {
    if (!name || !this.pack) return null;
    return meshField(this.pack, name) ? "element" : "layer";
  }

  /** The colour range in force: the style's, else the field's own (over every layer for a per-layer one). */
  colorRange() {
    const { colorBy, range } = this.style;
    if (!colorBy || !this.pack) return [0, 1];
    return range || colourFields(this.pack).find((field) => field.name === colorBy)?.range || [0, 1];
  }

  thresholdField() {
    const { threshold, colorBy } = this.style;
    return threshold ? threshold.field ?? colorBy : null;
  }

  /** Bind groups for the current pack and the values the style reads. */
  applyStyle() {
    if (!this.pack) return;
    this.pipelines();
    const values = this.valuesBuffer();
    if (this.bindGroups?.values === values) {
      this.renderer.invalidate?.();
      return;
    }
    const group = (points, corners, owners) => this.device.createBindGroup({
      layout: this.layout,
      entries: [this.view, this.table, values, points, corners, owners, this.rings, this.elementData].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    this.bindGroups = {
      elements: group(this.nodes, this.outlineCorners, this.outlineOwners),
      pieces: group(this.pieceVertices, this.pieceTriangles, this.pieceOwners),
      values,
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
    const floats = this.placeData;
    const words = this.placeWords;
    const stride = PLACE_BYTES / 4;
    const shown = new Set();
    const write = (slot, zPiece, zEdge, visible, tint, bases) => {
      const at = slot * stride;
      floats.set([zPiece ?? 0, zEdge ?? 0, visible ? 1 : 0, 0], at);
      floats.set(tint, at + 4);
      words.set(bases, at + 8);
    };
    // Per slice, then per piece layer.
    this.slices.forEach((key, slot) => {
      const visible = this.sliceShown(key, visibleLayers);
      write(slot, this.sliceZ(key, layerOffsets, false), this.sliceZ(key, layerOffsets, true), visible, [0, 0, 0, 0], [NO_ELEMENT, NO_ELEMENT, 0, 0]);
      if (visible) shown.add(slot);
    });
    const colorLayer = this.scopeOf(style.colorBy) === "layer" ? style.colorBy : null;
    const limitLayer = this.scopeOf(this.thresholdField()) === "layer" ? this.thresholdField() : null;
    const shownLayers = [];
    // The piece pass draws the pieces, and the edges on copper: with pieces off it
    // still runs over the conductors' copper, unfilled. The domain, when chosen, is the copper they clip to.
    const clipTo = style.pieces === "none" ? "layers" : style.pieces;
    const fill = style.pieces !== "none";
    const run = fill || style.edges !== "off";
    this.layers.forEach((layer, index) => {
      const slot = this.slices.length + index;
      const visible = run && clipTo === (layer.domain ? "domain" : "layers") && this.sliceShown(layer.sliceKey, visibleLayers);
      write(slot, this.sliceZ(layer.sliceKey, layerOffsets, false), 0, visible, [...layer.tint, 1],
        [this.layerBase(index, colorLayer), this.layerBase(index, limitLayer), layer.elementBase, fill ? 1 : 0]);
      if (visible && layer.count) shownLayers.push({ slot, layer });
    });
    this.device.queue.writeBuffer(this.table, PALETTE_ENTRIES * 16, floats);
    this.writeView(matrix, { colorLayer, limitLayer });
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
    let edges = style.edges === "all" ? this.edgeRanges.filter((range) => shown.has(range.slot) && range.count) : [];
    // Otherwise the selected element alone, whole, so a selection shows where it has no copper.
    const sel = this.selected;
    if (style.edges !== "all" && sel >= 0 && sel < this.pack.elementCount) {
      const first = this.outlineStart[sel] * 3;
      const count = (this.outlineStart[sel + 1] - this.outlineStart[sel]) * 3;
      const own = this.pack.edgeRanges.filter((range) => sel >= range.first && sel < range.first + range.count);
      edges = own.map((range) => ({ slot: this.slices.indexOf(range.sliceKey), first, count })).filter((range) => shown.has(range.slot));
    }
    if (edges.length) {
      pass.setPipeline(pipelines.elements);
      pass.setBindGroup(0, this.bindGroups.elements);
      for (const range of edges) {
        pass.draw(range.count, 1, range.first, range.slot);
        draws += 1;
        triangles += range.count / 3;
      }
    }
    if (style.markers && this.ringCount && shown.size) {
      pass.setPipeline(pipelines.markers);
      pass.setBindGroup(0, this.bindGroups.elements);
      pass.draw(6, this.ringCount);
      draws += 1;
      triangles += this.ringCount * 2;
    }
    return { draws, triangles };
  }

  writeView(matrix, { colorLayer = null, limitLayer = null } = {}) {
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
    // 0 plain, 1 a mesh field, 3 a per-layer field; 2 (per piece vertex) awaits solved fields.
    words[32] = style.colorBy ? (colorLayer ? 3 : 1) : 0;
    words[33] = style.threshold ? (style.threshold.hide === "above" ? 2 : 1) : 0;
    words[34] = this.fieldBase(colorLayer ? null : style.colorBy);
    words[35] = this.fieldBase(limitLayer ? null : this.thresholdField());
    words[36] = this.values?.vertexBase ?? 0;
    words[37] = limitLayer ? 1 : 0;
    words[38] = { off: 0, copper: 1, all: 2 }[style.edges];
    words[39] = this.elementBases?.corners ?? 0;
    floats.set([...hexColor(style.copperEdgeColor), 0.95], 40);
    words[44] = this.elementBases?.nodes ?? 0;
    this.device.queue.writeBuffer(this.view, 0, this.viewScratch);
  }

  gpuMemoryBytes() {
    if (!this.pack) return 0;
    let bytes = this.view.size + (this.values?.buffer.size || 0);
    for (const buffer of this.buffers) bytes += buffer.size;
    return bytes;
  }

  release() {
    for (const buffer of this.buffers) buffer.destroy();
    this.values?.buffer.destroy();
    this.values = null;
    this.buffers = [];
    this.table = null;
    this.bindGroups = null;
    this.pack = null;
  }

  destroy() {
    this.release();
    this.view.destroy();
    this.empty.destroy();
  }
}

/**
 * The triangles that draw the elements' outlines: a triangle as itself, a
 * quad (a, b, c, d) as (a, b, c) and (a, c, d). Each carries its element in
 * the low 29 bits of `owners` and, above them, which sides are outline (bit
 * k: the side opposite corner k), so the diagonal stays undrawn. `start[e]`
 * is element e's first outline triangle. A quadtree's hanging nodes need
 * nothing: each cell outlines its own four corners.
 */
export function outlineTriangles(pack) {
  const { corners, cornerStart, elementCount } = pack;
  const start = new Uint32Array(elementCount + 1);
  for (let e = 0; e < elementCount; e += 1) start[e + 1] = start[e] + (cornerStart[e + 1] - cornerStart[e] - 2);
  const total = start[elementCount];
  const out = new Uint32Array(total * 3);
  const owners = new Uint32Array(total);
  for (let e = 0; e < elementCount; e += 1) {
    const first = cornerStart[e];
    const sides = cornerStart[e + 1] - first;
    let t = start[e];
    if (sides === 3) {
      out.set(corners.subarray(first, first + 3), t * 3);
      owners[t] = (e | (7 << 29)) >>> 0;
      continue;
    }
    const [a, b, c, d] = corners.subarray(first, first + 4);
    out.set([a, b, c], t * 3);
    owners[t] = (e | (5 << 29)) >>> 0;
    t += 1;
    out.set([a, c, d], t * 3);
    owners[t] = (e | (3 << 29)) >>> 0;
  }
  return { start, corners: out, owners };
}

/**
 * Which sides of a layer's piece triangles are copper boundary, as bit masks
 * (bit k: the side opposite corner k), for drawing the copper's outline:
 * a side no other piece triangle of the layer shares (by its end points'
 * positions), unless it lies on a side of its own element, where the
 * element's edge is drawn already (the neighbour element's pieces may split
 * that side elsewhere). `layer` = { vertices, triangles, element }.
 */
export function copperBoundaryMasks(layer, pack) {
  const { vertices: v, triangles: t, element } = layer;
  const count = t.length / 3;
  // Vertices by position (a writer may repeat a point per triangle), then sides by those ids.
  const ids = new Int32Array(v.length / 2);
  const seen = new Map();
  for (let k = 0; k < ids.length; k += 1) {
    const at = `${v[k * 2]},${v[k * 2 + 1]}`;
    let id = seen.get(at);
    if (id === undefined) seen.set(at, (id = seen.size));
    ids[k] = id;
  }
  const span = seen.size + 1;
  const key = (a, b) => (ids[a] < ids[b] ? ids[a] * span + ids[b] : ids[b] * span + ids[a]);
  const uses = new Map();
  for (let k = 0; k < count; k += 1) {
    for (let c = 0; c < 3; c += 1) {
      const side = key(t[k * 3 + (c + 1) % 3], t[k * 3 + (c + 2) % 3]);
      uses.set(side, (uses.get(side) || 0) + 1);
    }
  }
  const masks = new Uint8Array(count);
  for (let k = 0; k < count; k += 1) {
    const e = element[k];
    for (let c = 0; c < 3; c += 1) {
      const a = t[k * 3 + (c + 1) % 3];
      const b = t[k * 3 + (c + 2) % 3];
      if (uses.get(key(a, b)) !== 1) continue;
      if (onElementSide(pack, e, v[a * 2], v[a * 2 + 1], v[b * 2], v[b * 2 + 1])) continue;
      masks[k] |= 1 << c;
    }
  }
  return masks;
}

/** Whether the segment (ax, ay)-(bx, by) lies along a side of element `e`, within 2 nm. */
function onElementSide(pack, e, ax, ay, bx, by) {
  const first = pack.cornerStart[e];
  const sides = pack.cornerStart[e + 1] - first;
  for (let k = 0; k < sides; k += 1) {
    const p = pack.corners[first + k] * 2;
    const q = pack.corners[first + (k + 1) % sides] * 2;
    const [px, py, qx, qy] = [pack.nodes[p], pack.nodes[p + 1], pack.nodes[q], pack.nodes[q + 1]];
    const length = Math.hypot(qx - px, qy - py) || 1;
    const off = (x, y) => Math.abs((qx - px) * (y - py) - (qy - py) * (x - px)) / length;
    if (off(ax, ay) <= 2 && off(bx, by) <= 2) return true;
  }
  return false;
}
