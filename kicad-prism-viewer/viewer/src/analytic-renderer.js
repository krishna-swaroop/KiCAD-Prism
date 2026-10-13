import {
  ABSENT_VALUE,
  ANALYTIC_BARREL_SHADER,
  ANALYTIC_SHADER,
  ANALYTIC_WALL_SHADER,
  BARREL_INSTANCE_BYTES,
  BARREL_VIEW_BYTES,
  WALL_INSTANCE_BYTES,
  BATCH_WORDS,
  COVER_WORDS,
  OVERLAY_FIELD,
  OVERLAY_NONE,
  OVERLAY_VALUES,
  SHAPE_WORDS,
  SLICE_UNIFORM_BYTES,
  STENCIL_STEPS,
} from "./analytic-shaders.js";

const BLEND = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
};

/** `values` with every non-finite entry replaced by the absent sentinel. */
export function withSentinels(values) {
  const out = Float32Array.from(values);
  for (let index = 0; index < out.length; index += 1) if (!Number.isFinite(out[index])) out[index] = ABSENT_VALUE;
  return out;
}

/**
 * The analytic pipeline family: draws stack slices of a kicad_monkey
 * materialization pack, lowered by `analytic-pack.js`, into the renderer's
 * pass after its opaque geometry, and colours them from simulation results.
 *
 * A slice is `{ key, layerId, z, color, outer, bottom, lowered, bounds }`: `z` in
 * world metres before the layer's exploded offset, `color` linear RGBA, and
 * `bounds` the slice's board-millimetre extent. Without the stencil feature
 * only add shapes draw (no subtracts, no regions); `stats().degraded` says so.
 */
export class AnalyticRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.device = renderer.device;
    this.stencil = renderer.stencil;
    this.slices = [];
    this.overlay = { mode: OVERLAY_NONE, range: [0, 1] };
    this.layout = this.device.createBindGroupLayout({
      label: "analytic",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
      ],
    });
    this.module = this.device.createShaderModule({ label: "analytic", code: ANALYTIC_SHADER });
    this.pipelines = {
      color: this.makePipelines(renderer.format, false),
      pick: this.makePipelines("rg32uint", true),
    };
    this.emptyValues = this.buffer(new Float32Array([ABSENT_VALUE]), GPUBufferUsage.STORAGE, "analytic-values-empty");
    this.valuesBuffer = this.emptyValues;
    this.emptyField = this.fieldTexture(1, 1, new Float32Array([ABSENT_VALUE]));
    this.uniformScratch = new ArrayBuffer(SLICE_UNIFORM_BYTES);
    this.makeBarrelPipelines();
  }

  makeBarrelPipelines() {
    const all = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.barrelLayout = this.device.createBindGroupLayout({
      label: "analytic-barrels",
      entries: [
        { binding: 0, visibility: all, buffer: { type: "uniform" } },
        { binding: 1, visibility: all, buffer: { type: "uniform" } },
        { binding: 2, visibility: all, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: all, buffer: { type: "read-only-storage" } },
      ],
    });
    const module = this.device.createShaderModule({ label: "analytic-barrels", code: ANALYTIC_BARREL_SHADER });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.barrelLayout] });
    const make = (format, pick) => this.device.createRenderPipeline({
      label: `analytic-barrel${pick ? "-pick" : ""}`,
      layout,
      vertex: { module, entryPoint: "vs_barrel" },
      fragment: { module, entryPoint: pick ? "fs_barrel_pick" : "fs_barrel", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: this.renderer.depthFormat, depthWriteEnabled: true, depthCompare: "greater" },
      multisample: { count: 1 },
    });
    this.barrelPipelines = { color: make(this.renderer.format, false), pick: make("rg32uint", true) };
    this.barrelView = this.device.createBuffer({ label: "analytic-barrel-view", size: BARREL_VIEW_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.layerOffsets = this.device.createBuffer({ label: "analytic-layer-offsets", size: 256 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.viewScratch = new ArrayBuffer(BARREL_VIEW_BYTES);
    this.barrels = null;
    const wallModule = this.device.createShaderModule({ label: "analytic-walls", code: ANALYTIC_WALL_SHADER });
    const wall = (blended) => this.device.createRenderPipeline({
      label: `analytic-wall${blended ? "-blend" : ""}`,
      layout,
      vertex: { module: wallModule, entryPoint: "vs_wall" },
      fragment: { module: wallModule, entryPoint: "fs_wall", targets: [{ format: this.renderer.format, ...(blended ? { blend: BLEND } : {}) }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: this.renderer.depthFormat, depthWriteEnabled: true, depthCompare: "greater" },
      multisample: { count: 1 },
    });
    this.wallPipelines = { opaque: wall(false), blend: wall(true) };
    this.walls = null;
  }

  /** Side walls of the dielectric slabs, `{ data, count }` (see `planWalls`). */
  setWalls({ data, count }) {
    this.walls?.buffer.destroy();
    this.walls = count ? { buffer: this.buffer(new Uint8Array(data), GPUBufferUsage.STORAGE, "analytic-walls"), count, bindGroup: null } : null;
    if (this.walls) this.walls.bindGroup = this.wallBindGroup();
    this.renderer.invalidate?.();
  }

  wallBindGroup() {
    return this.device.createBindGroup({
      layout: this.barrelLayout,
      entries: [
        { binding: 0, resource: { buffer: this.renderer.globalBuffer } },
        { binding: 1, resource: { buffer: this.barrelView } },
        { binding: 2, resource: { buffer: this.walls.buffer } },
        { binding: 3, resource: { buffer: this.valuesBuffer } },
        { binding: 4, resource: { buffer: this.layerOffsets } },
      ],
    });
  }

  encodeWalls(pass, blended) {
    if (!this.walls) return 0;
    pass.setPipeline(blended ? this.wallPipelines.blend : this.wallPipelines.opaque);
    pass.setBindGroup(0, this.walls.bindGroup);
    pass.draw(6, this.walls.count);
    return 1;
  }

  /**
   * The frame's shared view: camera, barrel and wall colours, and the
   * layers' exploded offsets, for the barrel and wall pipelines.
   */
  writeView(matrix, layerOffsets, context = {}) {
    const offsets = new Float32Array(256);
    if (layerOffsets) offsets.set(layerOffsets.subarray ? layerOffsets.subarray(0, 256) : layerOffsets.slice(0, 256));
    this.device.queue.writeBuffer(this.layerOffsets, 0, offsets);
    const floats = new Float32Array(this.viewScratch);
    const words = new Uint32Array(this.viewScratch);
    floats.fill(0);
    floats.set(viewEye(matrix), 0);
    floats.set(this.renderer.barrelColor || [0.55, 0.35, 0.16, 1], 4);
    const substrate = this.boardLooks().substrate;
    const wallOpacity = (context.boardOpacity ?? 1) * (0.15 + 0.85 * (context.assemblyOpacity ?? 1));
    floats.set([...(substrate?.color || [0.3, 0.32, 0.25, 1]).slice(0, 3), wallOpacity], 8);
    words[12] = this.overlay.mode === OVERLAY_VALUES ? 1 : 0;
    floats.set(this.overlay.range, 16);
    this.device.queue.writeBuffer(this.barrelView, 0, this.viewScratch);
  }

  /**
   * Draw barrels from `{ data, count }` (see `planBarrels`): while set, they
   * replace the renderer's mesh barrels.
   */
  setBarrels({ data, count, skipped = 0 }) {
    this.barrels?.buffer.destroy();
    this.barrels = count
      ? { buffer: this.buffer(new Uint8Array(data), GPUBufferUsage.STORAGE, "analytic-barrels"), count, skipped, bindGroup: null }
      : null;
    if (this.barrels) this.barrels.bindGroup = this.barrelBindGroup();
    this.renderer.invalidate?.();
  }

  hasBarrels() {
    return Boolean(this.barrels);
  }

  barrelBindGroup() {
    return this.device.createBindGroup({
      layout: this.barrelLayout,
      entries: [
        { binding: 0, resource: { buffer: this.renderer.globalBuffer } },
        { binding: 1, resource: { buffer: this.barrelView } },
        { binding: 2, resource: { buffer: this.barrels.buffer } },
        { binding: 3, resource: { buffer: this.valuesBuffer } },
        { binding: 4, resource: { buffer: this.layerOffsets } },
      ],
    });
  }

  /**
   * Draw the barrels into an open pass, for the view `matrix` (the frame's
   * view-projection) and the layers' exploded `layerOffsets`.
   */
  encodeBarrels(pass, layerOffsets, matrix, pick = false) {
    if (!this.barrels) return 0;
    if (matrix) this.writeView(matrix, layerOffsets, this.context);
    pass.setPipeline(pick ? this.barrelPipelines.pick : this.barrelPipelines.color);
    pass.setBindGroup(0, this.barrels.bindGroup);
    pass.draw(36, this.barrels.count);
    return 1;
  }

  buffer(data, usage, label) {
    const size = Math.max(16, Math.ceil(data.byteLength / 4) * 4);
    const buffer = this.device.createBuffer({ label, size, usage: usage | GPUBufferUsage.COPY_DST });
    if (data.byteLength) this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  fieldTexture(width, height, values) {
    const texture = this.device.createTexture({
      label: "analytic-field",
      size: [width, height],
      format: "r32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture }, values, { bytesPerRow: width * 4 }, [width, height]);
    return texture;
  }

  makePipelines(format, pick) {
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    const make = (name, vertex, fragment, step, buffers = [], blended = false) => {
      const plan = STENCIL_STEPS[step];
      const depthStencil = {
        format: this.renderer.depthFormat,
        depthWriteEnabled: plan.depth,
        depthCompare: plan.depth || plan.depthTest ? "greater" : "always",
      };
      if (this.stencil) {
        Object.assign(depthStencil, {
          stencilFront: plan.face,
          stencilBack: plan.face,
          stencilReadMask: plan.read,
          stencilWriteMask: plan.write,
        });
      }
      return this.device.createRenderPipeline({
        label: `analytic-${name}${pick ? "-pick" : ""}`,
        layout,
        vertex: { module: this.module, entryPoint: vertex, buffers },
        fragment: {
          module: this.module,
          entryPoint: pick ? `${fragment}_pick` : fragment,
          targets: [{ format, writeMask: plan.color ? GPUColorWrite.ALL : 0, ...(blended && !pick ? { blend: BLEND } : {}) }],
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil,
        multisample: { count: 1 },
      });
    };
    const fanBuffers = [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }];
    return {
      shapeMask: make("shape-mask", "vs_shape", "fs_shape_mask", "shapeMask"),
      shapeAdd: make("shape", "vs_shape", "fs_shape", "shapeAdd"),
      fan: make("fan", "vs_fan", "fs_plain_mask", "fan", fanBuffers),
      coverSubtract: make("cover-subtract", "vs_cover", "fs_plain_mask", "coverSubtract"),
      coverMark: make("cover-mark", "vs_cover", "fs_plain_mask", "coverMark"),
      coverAdd: make("cover", "vs_cover", "fs_cover", "coverAdd"),
      coverClear: make("cover-clear", "vs_cover", "fs_plain_mask", "coverClear"),
      clear: make("clear", "vs_clear", "fs_plain_mask", "clear"),
      // Board layers other than copper are never picked.
      ...(pick ? {} : {
        shapeLay: make("shape-lay", "vs_shape", "fs_shape_mask", "shapeLay"),
        coverLay: make("cover-lay", "vs_cover", "fs_plain_mask", "coverLay"),
        shapeBlend: make("shape-blend", "vs_shape", "fs_shape", "shapeBlend", [], true),
        coverBlend: make("cover-blend", "vs_cover", "fs_cover", "coverBlend", [], true),
        tintCovered: make("tint-covered", "vs_clear", "fs_tint_covered", "tintCovered", [], true),
        tintPlain: make("tint-plain", "vs_clear", "fs_tint_plain", "tintPlain", [], true),
      }),
    };
  }

  /** Replace the drawn slices. */
  setSlices(slices) {
    this.releaseSlices();
    const shared = new Map();
    this.slices = slices.map((slice) => this.uploadSlice(slice, shared));
    this.renderer.invalidate?.();
  }

  uploadSlice(slice, shared = new Map()) {
    const { lowered } = slice;
    const usage = GPUBufferUsage.STORAGE;
    // Slices lowered once (a dielectric's two faces) share their buffers.
    if (!shared.has(lowered)) {
      shared.set(lowered, {
        shapes: this.buffer(lowered.shapes, usage, `analytic-shapes-${slice.key}`),
        covers: this.buffer(lowered.covers, usage, `analytic-covers-${slice.key}`),
        fans: lowered.fanVertices.length ? this.buffer(lowered.fanVertices, GPUBufferUsage.VERTEX, `analytic-fans-${slice.key}`) : null,
      });
    }
    const gpu = {
      ...slice,
      ...shared.get(lowered),
      uniform: this.device.createBuffer({ label: `analytic-slice-${slice.key}`, size: SLICE_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      shapeCount: lowered.shapes.length / SHAPE_WORDS,
      subtractShapes: lowered.subtractShapes,
      batches: [],
      field: null,
    };
    for (let offset = 0; offset < lowered.batches.length; offset += BATCH_WORDS) {
      const [subtract, firstVertex, vertexCount, firstCover, coverCount] = lowered.batches.subarray(offset, offset + BATCH_WORDS);
      gpu.batches.push({ subtract: subtract === 1, firstVertex, vertexCount, firstCover, coverCount });
    }
    gpu.bindGroup = this.bindGroup(gpu);
    return gpu;
  }

  bindGroup(slice) {
    return this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.renderer.globalBuffer } },
        { binding: 1, resource: { buffer: slice.uniform } },
        { binding: 2, resource: { buffer: slice.shapes } },
        { binding: 3, resource: { buffer: slice.covers } },
        { binding: 4, resource: { buffer: this.valuesBuffer } },
        { binding: 5, resource: (slice.field?.texture || this.emptyField).createView() },
      ],
    });
  }

  /** Whether analytic copper replaces the mesh copper of `layerId`. */
  coversLayer(layerId) {
    return this.slices.some((slice) => slice.role !== undefined ? slice.role === "copper" && slice.layerId === Number(layerId) : slice.layerId === Number(layerId));
  }

  /** Whether analytic slices replace the mesh board layers of `boardRole`. */
  coversRole(boardRole) {
    const role = { substrate: "dielectric", soldermask: "mask", silkscreen: "silk", paste: "paste" }[boardRole];
    return Boolean(role) && this.slices.some((slice) => slice.role === role);
  }

  /**
   * Colour every drawn operation from `values` (one per operation index,
   * NaN where a value is absent) through the colormap over `range`.
   */
  setOperationValues(values, range) {
    this.clearOverlay();
    this.valuesBuffer = this.buffer(withSentinels(values), GPUBufferUsage.STORAGE, "analytic-values");
    this.overlay = { mode: OVERLAY_VALUES, range };
    this.rebind();
  }

  /**
   * Colour slices from field rasters: `rasters` maps a slice key to
   * `{ originMm: [x, y], pitchMm, width, height, values }` (row-major from
   * the origin, +x then +y in KiCad's frame, NaN where absent).
   */
  setFieldRasters(rasters, range) {
    this.clearOverlay();
    for (const slice of this.slices) {
      const raster = rasters.get(slice.key);
      if (!raster) continue;
      slice.field = { ...raster, texture: this.fieldTexture(raster.width, raster.height, withSentinels(raster.values)) };
    }
    this.overlay = { mode: OVERLAY_FIELD, range };
    this.rebind();
  }

  clearOverlay() {
    if (this.valuesBuffer !== this.emptyValues) this.valuesBuffer.destroy();
    this.valuesBuffer = this.emptyValues;
    for (const slice of this.slices) {
      slice.field?.texture.destroy();
      slice.field = null;
    }
    this.overlay = { mode: OVERLAY_NONE, range: [0, 1] };
    this.rebind();
  }

  rebind() {
    for (const slice of this.slices) slice.bindGroup = this.bindGroup(slice);
    if (this.barrels) this.barrels.bindGroup = this.barrelBindGroup();
    this.renderer.invalidate?.();
  }

  writeSlice(slice, layerOffsets, look = null) {
    const floats = new Float32Array(this.uniformScratch);
    const words = new Uint32Array(this.uniformScratch);
    floats.fill(0);
    floats.set(look?.color || slice.color, 0);
    const [a, b] = slice.offsetLayers || [slice.layerId, slice.layerId];
    floats[4] = slice.z + 0.5 * ((layerOffsets?.[a] || 0) + (layerOffsets?.[b] || 0));
    const copper = slice.role === undefined || slice.role === "copper";
    words[5] = copper ? this.overlay.mode : 0;
    const field = copper ? slice.field : null;
    words[6] = field ? 1 : 0;
    if (field) {
      floats.set(field.originMm, 8);
      floats[10] = field.pitchMm;
      words[12] = field.width;
      words[13] = field.height;
    }
    floats.set(this.overlay.range, 16);
    floats.set(slice.bounds, 20);
    floats.set([look?.metallic ?? 0, look?.roughness ?? 0.72, slice.faceDown ?? slice.bottom ? -1 : 1, copper ? 1 : 0], 24);
    this.device.queue.writeBuffer(slice.uniform, 0, this.uniformScratch);
  }

  /**
   * Each layer's current mesh copper colour and material, so the analytic
   * copper follows the viewer's copper colouring as the mesh would.
   */
  copperLooks() {
    const looks = new Map();
    for (const entry of this.renderer.entries || []) {
      const layerId = Number(entry.layerId);
      if (entry.kind !== "copper" || looks.has(layerId)) continue;
      const color = entry.color || entry.material?.baseColor;
      looks.set(layerId, {
        color: color && color.length < 4 ? [...color, 1] : color,
        metallic: entry.material?.metallic || 0,
        roughness: entry.material?.roughness ?? 0.72,
      });
    }
    return looks;
  }

  /**
   * The mesh board layers' colour and material by role (substrate, solder
   * mask, silkscreen, paste), so analytic layers follow the viewer's colours.
   */
  boardLooks() {
    const looks = {};
    for (const entry of this.renderer.entries || []) {
      if (entry.kind !== "board" || looks[entry.boardRole]) continue;
      const color = entry.color || entry.material?.baseColor;
      looks[entry.boardRole] = {
        color: color && color.length < 4 ? [...color, 1] : color,
        metallic: entry.material?.metallic || 0,
        roughness: entry.material?.roughness ?? 0.72,
      };
    }
    return looks;
  }

  /** A slice's look for this frame: the copper's, or its board layer's with the opacity rules of the mesh. */
  lookFor(slice, copper, board, context) {
    if (slice.role === undefined || slice.role === "copper") return copper.get(slice.layerId);
    const opacity = context.boardOpacity ?? 1;
    const of = (role, alpha) => {
      const look = board[role];
      if (!look) return null;
      const color = look.color || [1, 1, 1, 1];
      return { ...look, color: [color[0], color[1], color[2], alpha(Number.isFinite(color[3]) ? color[3] : 1)] };
    };
    // An opened stackup keeps its dielectrics as faint slabs, so the spread copper reads clearly.
    if (slice.role === "dielectric") return of("substrate", () => opacity * (0.15 + 0.85 * (context.assemblyOpacity ?? 1)));
    // Mask and silkscreen belong to the assembled board: they fade out as the
    // stackup opens (`assemblyOpacity`), so they never cover the spread copper.
    const assembled = context.assemblyOpacity ?? 1;
    if (slice.role === "mask") return of("soldermask", (a) => Math.min(a, 0.72) * opacity * assembled);
    if (slice.role === "silk") return of("silkscreen", (a) => Math.min(a, 0.92) * opacity * assembled);
    return of("paste", (a) => a);
  }

  /** Draw every slice into an open pass; `pick` selects the pick variants. */
  encodeInto(pass, layerOffsets, visibleLayers, pick = false, context = {}) {
    this.context = context;
    if (context.matrix) this.writeView(context.matrix, layerOffsets, context);
    const pipelines = pick ? this.pipelines.pick : this.pipelines.color;
    const copper = this.copperLooks();
    const board = this.boardLooks();
    const boardShown = this.boardShown(context);
    const solid = boardShown && (context.boardOpacity ?? 1) >= 0.999;
    let drawn = 0;
    for (const slice of this.slices) {
      const isCopper = slice.role === undefined || slice.role === "copper";
      if (isCopper ? visibleLayers && !visibleLayers.has(slice.layerId) : pick || slice.role !== "dielectric" || !solid) continue;
      this.encodeSlice(pass, pipelines, slice, "opaque", layerOffsets, this.lookFor(slice, copper, board, context));
      drawn += 1;
    }
    if (solid && !pick) drawn += this.encodeWalls(pass, false);
    // The base pipelines compare against reference 1.
    if (this.stencil) pass.setStencilReference(1);
    return drawn;
  }

  boardShown(context) {
    return (context.showBoard ?? true) && !context.panelLayer;
  }

  /**
   * Draw the blended board layers, after the opaque geometry and before the
   * mesh's own blended entries: a fading board's dielectrics and walls, the
   * solder mask (tinted over outer copper), paste and silkscreen.
   */
  encodeBlended(pass, layerOffsets, visibleLayers, context = {}) {
    if (!this.stencil) return 0;
    const copper = this.copperLooks();
    const board = this.boardLooks();
    const boardShown = this.boardShown(context);
    const fading = boardShown && (context.boardOpacity ?? 1) < 0.999;
    let drawn = 0;
    const draw = (slice, mode) => {
      this.encodeSlice(pass, this.pipelines.color, slice, mode, layerOffsets, this.lookFor(slice, copper, board, context));
      drawn += 1;
    };
    for (const slice of this.slices) if (fading && slice.role === "dielectric") draw(slice, "blend");
    if (fading) drawn += this.encodeWalls(pass, true);
    const assembled = boardShown && (context.assemblyOpacity ?? 1) > 0.01;
    for (const slice of this.slices) {
      if (slice.role === "mask" && assembled) draw(slice, "mask");
      else if (slice.role === "paste" && !context.hidePaste && !context.panelLayer && (!visibleLayers || visibleLayers.has(slice.offsetLayers?.[0]))) draw(slice, "blend");
    }
    for (const slice of this.slices) if (slice.role === "silk" && assembled) draw(slice, "blend");
    pass.setStencilReference(1);
    return drawn;
  }

  encodeSlice(pass, pipelines, slice, mode, layerOffsets, look) {
    this.writeSlice(slice, layerOffsets, look);
    pass.setBindGroup(0, slice.bindGroup);
    if (this.stencil) this.encodeStencilled(pass, pipelines, slice, mode);
    else this.encodeAddsOnly(pass, pipelines, slice);
  }

  encodeAddsOnly(pass, pipelines, slice) {
    const adds = slice.shapeCount - slice.subtractShapes;
    if (!adds) return;
    pass.setPipeline(pipelines.shapeAdd);
    pass.draw(6, adds, 0, slice.subtractShapes);
  }

  /**
   * One slice through the stencil plan. `mode` "opaque" colours and marks
   * (outer copper sets bit 0, dielectric clears it); "blend" colours blended
   * and leaves bit 0; "mask" lays the mask down uncoloured, then tints it.
   */
  encodeStencilled(pass, pipelines, slice, mode = "opaque") {
    const step = (name, reference = STENCIL_STEPS[name].reference) => {
      pass.setPipeline(pipelines[name]);
      pass.setStencilReference(reference);
    };
    if (slice.subtractShapes) {
      step("shapeMask");
      pass.draw(6, slice.subtractShapes, 0, 0);
    }
    this.encodeBatches(pass, slice, true, step, mode);
    const adds = slice.shapeCount - slice.subtractShapes;
    if (adds) {
      // Outer copper marks bit 0, as the mesh copper does for the mask.
      if (mode === "opaque") step("shapeAdd", slice.outer ? 0x21 : 0x20);
      else step(mode === "mask" ? "shapeLay" : "shapeBlend");
      pass.draw(6, adds, 0, slice.subtractShapes);
    }
    this.encodeBatches(pass, slice, false, step, mode);
    if (mode === "mask") {
      step("tintCovered");
      pass.draw(6);
      step("tintPlain");
      pass.draw(6);
    }
    step("clear");
    pass.draw(6);
  }

  encodeBatches(pass, slice, subtract, step, mode = "opaque") {
    for (const batch of slice.batches) {
      if (batch.subtract !== subtract || !slice.fans) continue;
      step("fan");
      pass.setVertexBuffer(0, slice.fans);
      pass.draw(batch.vertexCount, 1, batch.firstVertex, 0);
      if (!subtract && mode === "opaque" && (slice.outer || slice.role === "dielectric")) {
        // Outer copper marks bit 0 for the mask; a dielectric face nearer than any copper clears it.
        step("coverMark", slice.outer ? 0x41 : 0x40);
        pass.draw(6, batch.coverCount, 0, batch.firstCover);
      }
      const cover = { opaque: "coverAdd", blend: "coverBlend", mask: "coverLay" }[mode];
      step(subtract ? "coverSubtract" : cover);
      pass.draw(6, batch.coverCount, 0, batch.firstCover);
      if (!subtract) {
        step("coverClear");
        pass.draw(6, batch.coverCount, 0, batch.firstCover);
      }
    }
  }

  gpuMemoryBytes() {
    let bytes = this.valuesBuffer === this.emptyValues ? 0 : this.valuesBuffer.size;
    if (this.barrels) bytes += this.barrels.count * BARREL_INSTANCE_BYTES;
    if (this.walls) bytes += this.walls.count * WALL_INSTANCE_BYTES;
    for (const slice of this.slices) {
      bytes += slice.shapes.size + slice.covers.size + (slice.fans?.size || 0) + slice.uniform.size;
      if (slice.field) bytes += slice.field.width * slice.field.height * 4;
    }
    return bytes;
  }

  stats() {
    return {
      slices: this.slices.map((slice) => ({
        key: slice.key,
        role: slice.role || "copper",
        face: slice.face,
        layerId: slice.layerId,
        z: slice.z,
        shapes: slice.shapeCount,
        subtractShapes: slice.subtractShapes,
        regionBatches: slice.batches.length,
        fanVertices: slice.lowered.fanVertices.length / 2,
        covers: slice.lowered.covers.length / COVER_WORDS,
        approximations: slice.lowered.stats,
      })),
      overlay: this.overlay.mode,
      barrels: this.barrels ? { count: this.barrels.count, skipped: this.barrels.skipped } : null,
      walls: this.walls?.count || 0,
      gpuMemoryBytes: this.gpuMemoryBytes(),
      degraded: !this.stencil,
    };
  }

  releaseSlices() {
    const buffers = new Set();
    for (const slice of this.slices) {
      for (const buffer of [slice.shapes, slice.covers, slice.fans, slice.uniform]) if (buffer) buffers.add(buffer);
      slice.field?.texture.destroy();
    }
    for (const buffer of buffers) buffer.destroy();
    this.slices = [];
  }

  destroy() {
    this.releaseSlices();
    this.barrels?.buffer.destroy();
    this.walls?.buffer.destroy();
    this.barrelView.destroy();
    this.layerOffsets.destroy();
    if (this.valuesBuffer !== this.emptyValues) this.valuesBuffer.destroy();
    this.emptyValues.destroy();
    this.emptyField.destroy();
  }
}

/**
 * The camera of view-projection `matrix` (column-major) in homogeneous world
 * coordinates: the eye point with w = 1 for a perspective view; for an
 * orthographic one, the view direction (into the scene) with w = 0.
 */
export function viewEye(matrix) {
  const inverse = invert4(Array.from(matrix, Number));
  if (!inverse) return [0, 0, -1, 0];
  const apply = (v) => [0, 1, 2, 3].map((row) => inverse[row] * v[0] + inverse[4 + row] * v[1] + inverse[8 + row] * v[2] + inverse[12 + row] * v[3]);
  const eye = apply([0, 0, 1, 0]);
  const length = Math.hypot(eye[0], eye[1], eye[2]);
  if (Math.abs(eye[3]) > 1e-9 * Math.max(length, 1e-30)) return [eye[0] / eye[3], eye[1] / eye[3], eye[2] / eye[3], 1];
  // Orthographic: from the near plane (depth 1, reversed) to the far one (0).
  const near = apply([0, 0, 1, 1]);
  const far = apply([0, 0, 0, 1]);
  const direction = [0, 1, 2].map((axis) => far[axis] / far[3] - near[axis] / near[3]);
  const norm = Math.hypot(...direction) || 1;
  return [...direction.map((value) => value / norm), 0];
}

function invert4(m) {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!det) return null;
  return inv.map((value) => value / det);
}
