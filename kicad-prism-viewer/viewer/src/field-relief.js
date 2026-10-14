// A result field as a relief ("mountain" view) over one copper layer, drawn
// by the WebGPU viewer. Heights and colours come from the field raster; the
// outline comes from the analytic copper itself: the layer is rendered once,
// top-down, through the analytic pick pipelines into an offscreen texture,
// and only pixels on the field's net are kept. The relief is a dense grid
// raised by the raster in the vertex shader and cut to that mask per pixel,
// so board edges, anti-pads and plane cut-outs are exact rather than the
// raster's staircase.

import { ANALYTIC_PICK_TAG, ABSENT_VALUE } from "./analytic-shaders.js";

/** The mask's longer side in pixels: about 0.02 mm a pixel on a 40 mm board. */
export const RELIEF_MASK_PIXELS = 2048;
/** The relief's tallest point, as a share of the board's longer side. */
export const RELIEF_HEIGHT_SHARE = 0.22;
/** Grid vertices per raster cell, a side; capped at RELIEF_GRID_MAX. */
const GRID_PER_CELL = 2;
const RELIEF_GRID_MAX = 1024;
const RELIEF_UNIFORM_BYTES = 160;

/**
 * A raster with every empty cell given the value of its nearest copper cell
 * (by steps across the grid), in one breadth-first pass. The mask is exact and
 * finer than the raster, so a copper pixel can fall in a cell the raster left
 * empty, and the grid's triangles at the mask's edge reach past the copper:
 * with every cell filled the surface stays continuous under the edge instead
 * of dropping to the base. All empty (no copper) stays empty.
 */
export function fillRaster(values, width, height) {
  const out = Float32Array.from(values, (value) => (Number.isFinite(value) ? value : NaN));
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < out.length; index += 1) if (Number.isFinite(out[index])) queue[tail++] = index;
  while (head < tail) {
    const index = queue[head++];
    const i = index % width;
    const j = (index - i) / width;
    for (const [x, y] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const next = y * width + x;
      if (Number.isFinite(out[next])) continue;
      out[next] = out[index];
      queue[tail++] = next;
    }
  }
  return out;
}

/**
 * Column-major orthographic matrix looking straight down on `boundsMm`
 * ([x0, y0, x1, y1] in board millimetres) over world heights [zLow, zHigh]:
 * world x = mm / 1000, world y = -mm / 1000, the viewer's frame. Higher z is
 * nearer (greater depth), as the viewer's depth test expects.
 */
export function topDownMatrix(boundsMm, zLow, zHigh) {
  const [x0, y0, x1, y1] = boundsMm;
  const wx = (x1 - x0) / 1000;
  const wy = (y1 - y0) / 1000;
  const cx = (x0 + x1) / 2000;
  const cy = -(y0 + y1) / 2000;
  const dz = zHigh - zLow || 1;
  return new Float32Array([
    2 / wx, 0, 0, 0,
    0, 2 / wy, 0, 0,
    0, 0, 1 / dz, 0,
    -2 * cx / wx, -2 * cy / wy, -zLow / dz, 1,
  ]);
}

/** Mask size for bounds: the longer side gets `pixels`, the other in proportion. */
export function maskSize(boundsMm, pixels = RELIEF_MASK_PIXELS) {
  const w = boundsMm[2] - boundsMm[0];
  const h = boundsMm[3] - boundsMm[1];
  const scale = pixels / Math.max(w, h, 1e-9);
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

const NET_MASK_SHADER = /* wgsl */ `
const PICK_TAG = ${ANALYTIC_PICK_TAG}u;
struct Chosen { net: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var picked: texture_2d<u32>;
@group(0) @binding(1) var<storage, read> nets: array<u32>;
@group(0) @binding(2) var<uniform> chosen: Chosen;

@vertex fn vs_full(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vertex << 1u) & 2u), f32(vertex & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment fn fs_net(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let hit = textureLoad(picked, vec2u(position.xy), 0);
  if ((hit.x & PICK_TAG) == 0u || hit.y == 0u) { return vec4f(0.0); }
  let operation = hit.y - 1u;
  if (chosen.net != 0u) {
    let net = select(0u, nets[operation], operation < arrayLength(&nets));
    if (net != chosen.net) { return vec4f(0.0); }
  }
  return vec4f(1.0);
}
`;

const RELIEF_SHADER = /* wgsl */ `
struct Relief {
  viewProjection: mat4x4f,
  // Board millimetres the grid and the mask span: x0, y0, x1, y1.
  bounds: vec4f,
  // The raster: origin (mm), pitch (mm).
  fieldOrigin: vec2f,
  fieldPitch: vec2f,
  fieldSize: vec2u,
  grid: vec2u,
  // Value range, base height (m), full height (m).
  range: vec2f,
  base: f32,
  height: f32,
  light: vec4f,
};
@group(0) @binding(0) var<uniform> relief: Relief;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var maskSampler: sampler;

const ABSENT = 3e38;
fn present(value: f32) -> bool { return value < 1e38; }

PALETTE

fn cell(i: i32, j: i32) -> f32 {
  let size = vec2i(relief.fieldSize);
  if (i < 0 || j < 0 || i >= size.x || j >= size.y) { return ABSENT; }
  return textureLoad(field, vec2i(i, j), 0).r;
}

// The raster at a board point (mm): bilinear where all four cells hold a
// value, else the nearest that does, else absent.
fn sampleField(board: vec2f) -> f32 {
  let uv = (board - relief.fieldOrigin) / relief.fieldPitch - vec2f(0.5);
  let base = vec2i(floor(uv));
  let f = uv - floor(uv);
  let s00 = cell(base.x, base.y);
  let s10 = cell(base.x + 1, base.y);
  let s01 = cell(base.x, base.y + 1);
  let s11 = cell(base.x + 1, base.y + 1);
  if (present(s00) && present(s10) && present(s01) && present(s11)) {
    return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  }
  let nearest = vec2i(floor(uv + vec2f(0.5)));
  return cell(nearest.x, nearest.y);
}

fn share(value: f32) -> f32 {
  return clamp((value - relief.range.x) / max(relief.range.y - relief.range.x, 1e-30), 0.0, 1.0);
}

fn lift(board: vec2f) -> f32 {
  let value = sampleField(board);
  return relief.base + select(0.0, share(value) * relief.height, present(value));
}

struct ReliefOut {
  @builtin(position) position: vec4f,
  @location(0) board: vec2f,
  @location(1) normal: vec3f,
};

@vertex fn vs_relief(@builtin(vertex_index) vertex: u32) -> ReliefOut {
  var corners = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
  let quad = vertex / 6u;
  let cells = relief.grid - vec2u(1u);
  let at = vec2u(quad % cells.x, quad / cells.x) + corners[vertex % 6u];
  let t = vec2f(at) / vec2f(cells);
  let board = mix(relief.bounds.xy, relief.bounds.zw, t);
  let z = lift(board);
  // The slope from neighbouring grid points (world metres; board y runs down).
  let step = (relief.bounds.zw - relief.bounds.xy) / vec2f(cells);
  let dx = (lift(board + vec2f(step.x, 0.0)) - lift(board - vec2f(step.x, 0.0))) / (0.002 * step.x);
  let dy = (lift(board + vec2f(0.0, step.y)) - lift(board - vec2f(0.0, step.y))) / (0.002 * step.y);
  var out: ReliefOut;
  out.position = relief.viewProjection * vec4f(board.x * 0.001, -board.y * 0.001, z, 1.0);
  out.board = board;
  out.normal = normalize(vec3f(-dx, dy, 1.0));
  return out;
}

@fragment fn fs_relief(input: ReliefOut) -> @location(0) vec4f {
  let uv = (input.board - relief.bounds.xy) / (relief.bounds.zw - relief.bounds.xy);
  if (textureSampleLevel(mask, maskSampler, uv, 0.0).r < 0.5) { discard; }
  let value = sampleField(input.board);
  if (!present(value)) { discard; }
  let normal = normalize(input.normal);
  let diffuse = max(dot(normal, normalize(relief.light.xyz)), 0.0);
  let color = fieldColor(share(value)) * (0.72 + 0.38 * diffuse);
  return vec4f(min(color, vec3f(1.0)), 1.0);
}
`;

const PALETTE_WGSL = `
struct Palette {
  ramps: array<vec4f, 512>,
  outline: vec4f,
};
@group(0) @binding(4) var<uniform> palette: Palette;
fn ramp(t: f32, which: u32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 255.0;
  let i = u32(floor(x));
  let j = min(i + 1u, 255u);
  return mix(palette.ramps[which * 256u + i].rgb, palette.ramps[which * 256u + j].rgb, x - floor(x));
}
fn fieldColor(t: f32) -> vec3f {
  return ramp(t, 0u);
}
`;

export class FieldRelief {
  /** `analytic`: the board's AnalyticRenderer, whose pick pipelines draw the mask. */
  constructor(analytic) {
    this.analytic = analytic;
    this.renderer = analytic.renderer;
    this.device = analytic.device;
    this.uniform = this.device.createBuffer({ label: "relief", size: RELIEF_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.scratch = new ArrayBuffer(RELIEF_UNIFORM_BYTES);
    this.sampler = this.device.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.layer = null;
    this.vertexCount = 0;
  }

  get ready() {
    return this.vertexCount > 0;
  }

  pipeline() {
    if (this.reliefPipeline) return this.reliefPipeline;
    const module = this.device.createShaderModule({ label: "relief", code: RELIEF_SHADER.replace("PALETTE", PALETTE_WGSL) });
    this.reliefPipeline = this.device.createRenderPipeline({
      label: "relief",
      layout: "auto",
      vertex: { module, entryPoint: "vs_relief" },
      fragment: { module, entryPoint: "fs_relief", targets: [{ format: this.renderer.format }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: this.renderer.depthFormat, depthWriteEnabled: true, depthCompare: "greater" },
      multisample: { count: this.renderer.sampleCount || 1 },
    });
    return this.reliefPipeline;
  }

  netPipeline() {
    if (this.netMaskPipeline) return this.netMaskPipeline;
    const module = this.device.createShaderModule({ label: "relief-net-mask", code: NET_MASK_SHADER });
    this.netMaskPipeline = this.device.createRenderPipeline({
      label: "relief-net-mask",
      layout: "auto",
      vertex: { module, entryPoint: "vs_full" },
      fragment: { module, entryPoint: "fs_net", targets: [{ format: "r8unorm" }] },
      primitive: { topology: "triangle-list" },
    });
    return this.netMaskPipeline;
  }

  /**
   * Raise `slice` (an uploaded analytic slice with a field raster) over its
   * copper on net `netId` (0: any net). `range` is the overlay's value range.
   */
  build(slice, { range, netId = 0, heightShare = RELIEF_HEIGHT_SHARE } = {}) {
    this.release();
    const field = slice?.field;
    if (!field) return false;
    const boundsMm = this.boundsOf(slice);
    const [width, height] = maskSize(boundsMm);
    const picked = this.renderMask(slice.layerId, boundsMm, width, height);
    this.mask = this.filterMask(picked, width, height, netId);
    picked.destroy();
    const filled = fillRaster(field.values, field.width, field.height);
    const upload = Float32Array.from(filled, (value) => (Number.isFinite(value) ? value : ABSENT_VALUE));
    this.field = this.device.createTexture({ label: "relief-field", size: [field.width, field.height], format: "r32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: this.field }, upload, { bytesPerRow: field.width * 4 }, [field.width, field.height]);
    const [pitchX, pitchY] = Array.isArray(field.pitchMm) ? field.pitchMm : [field.pitchMm, field.pitchMm];
    const span = Math.max(boundsMm[2] - boundsMm[0], boundsMm[3] - boundsMm[1]) / 1000;
    const grid = [
      Math.min(RELIEF_GRID_MAX, Math.max(2, Math.ceil(((boundsMm[2] - boundsMm[0]) / pitchX) * GRID_PER_CELL) + 1)),
      Math.min(RELIEF_GRID_MAX, Math.max(2, Math.ceil(((boundsMm[3] - boundsMm[1]) / pitchY) * GRID_PER_CELL) + 1)),
    ];
    this.layer = slice.layerId;
    this.sliceKey = slice.key;
    this.boundsMm = boundsMm;
    this.base = slice.z;
    this.height = span * heightShare;
    this.grid = grid;
    this.vertexCount = (grid[0] - 1) * (grid[1] - 1) * 6;
    this.params = { field, pitch: [pitchX, pitchY], range: range || [0, 1] };
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline().getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: this.field.createView() },
        { binding: 2, resource: this.mask.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: { buffer: this.analytic.palette } },
      ],
    });
    this.renderer.invalidate?.();
    return true;
  }

  /** The copper slices on the layer, together: the mask covers them all. */
  boundsOf(slice) {
    const same = this.analytic.slices.filter((item) => item.layerId === slice.layerId && (item.role === undefined || item.role === "copper"));
    const bounds = (same.length ? same : [slice]).map((item) => item.bounds);
    const pad = 0.05;
    return [
      Math.min(...bounds.map((b) => b[0])) - pad, Math.min(...bounds.map((b) => b[1])) - pad,
      Math.max(...bounds.map((b) => b[2])) + pad, Math.max(...bounds.map((b) => b[3])) + pad,
    ];
  }

  /** The layer's copper, top-down, through the analytic pick pipelines: operation ids per pixel. */
  renderMask(layerId, boundsMm, width, height) {
    const { analytic, renderer, device } = this;
    const extent = analytic.extent;
    const zLow = (extent?.[0][2] ?? -0.01) - 0.001;
    const zHigh = (extent?.[1][2] ?? 0.01) + 0.001;
    const matrix = topDownMatrix(boundsMm, zLow, zHigh);
    const target = device.createTexture({ label: "relief-pick", size: [width, height], format: "rg32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const depth = device.createTexture({ label: "relief-pick-depth", size: [width, height], format: renderer.depthFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const depthAttachment = { view: depth.createView(), depthClearValue: 0, depthLoadOp: "clear", depthStoreOp: "discard" };
    if (renderer.stencil) Object.assign(depthAttachment, { stencilClearValue: 0, stencilLoadOp: "clear", stencilStoreOp: "discard" });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: depthAttachment,
    });
    // Every copper layer and every net is drawn; the net is chosen after.
    const innerMode = renderer.innerCopperMode;
    renderer.innerCopperMode = "all";
    try {
      renderer.writeGlobals(matrix, 0, 0, 0, 0);
      if (renderer.stencil) pass.setStencilReference(1);
      analytic.encodeInto(pass, null, new Set([layerId]), true, { matrix, showBoard: false });
    } finally {
      renderer.innerCopperMode = innerMode;
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
    depth.destroy();
    return target;
  }

  /** 1 where the picked operation is on net `netId` (any net for 0), else 0. */
  filterMask(picked, width, height, netId) {
    const { device } = this;
    const mask = device.createTexture({ label: "relief-mask", size: [width, height], format: "r8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const filter = device.createBuffer({ label: "relief-net", size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(filter, 0, new Uint32Array([netId >>> 0, 0, 0, 0]));
    const pipeline = this.netPipeline();
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: picked.createView() },
        { binding: 1, resource: { buffer: this.analytic.netsBuffer } },
        { binding: 2, resource: { buffer: filter } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: mask.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }] });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    filter.destroy();
    return mask;
  }

  /** Draw into the frame's pass; returns the draw count. */
  encode(pass, matrix) {
    if (!this.ready) return 0;
    const floats = new Float32Array(this.scratch);
    const words = new Uint32Array(this.scratch);
    floats.set(matrix, 0);
    floats.set(this.boundsMm, 16);
    floats.set(this.params.field.originMm, 20);
    floats.set(this.params.pitch, 22);
    words[24] = this.params.field.width;
    words[25] = this.params.field.height;
    words[26] = this.grid[0];
    words[27] = this.grid[1];
    floats.set(this.params.range, 28);
    floats[30] = this.base;
    floats[31] = this.height;
    floats.set([0.35, 0.45, 0.82, 0], 32);
    this.device.queue.writeBuffer(this.uniform, 0, this.scratch);
    pass.setPipeline(this.pipeline());
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(this.vertexCount);
    return 1;
  }

  /** World bounds of the relief, for framing: [x0, y0, z0, x1, y1, z1] in metres. */
  worldBounds() {
    if (!this.ready) return null;
    const [x0, y0, x1, y1] = this.boundsMm;
    return [x0 / 1000, -y1 / 1000, this.base, x1 / 1000, -y0 / 1000, this.base + this.height];
  }

  release() {
    this.mask?.destroy();
    this.field?.destroy();
    this.mask = null;
    this.field = null;
    this.bindGroup = null;
    this.vertexCount = 0;
    this.layer = null;
  }

  destroy() {
    this.release();
    this.uniform.destroy();
  }
}

