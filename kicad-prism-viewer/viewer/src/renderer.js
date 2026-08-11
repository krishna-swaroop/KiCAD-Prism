const VERTEX_STRIDE = 40;
// WebGPU dynamic uniform offsets require 256-byte alignment; each draw buffer is padded to that size.
const DRAW_UNIFORM_SIZE = 256;
const GLOBAL_UNIFORM_SIZE = 112;

const MAIN_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw {
  color: vec4f,
  material: vec4f,
  offset: vec4f,
  flags: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
  @location(4) layerId: u32,
  @location(5) materialId: u32,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
  @location(3) world: vec3f,
};
@vertex fn vs(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.world = input.position + draw.offset.xyz;
  output.position = globals.viewProjection * vec4f(output.world, 1.0);
  output.normal = normalize(input.normal);
  output.netId = input.netId;
  output.objectId = input.objectId;
  return output;
}
fn aces(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0), vec3f(1));
}
@fragment fn fs(input: VertexOutput) -> @location(0) vec4f {
  let kind = u32(draw.flags.x);
  let copper = kind == 1u;
  let component = kind == 2u;
  let selected = globals.activeNet != 0u && input.netId == globals.activeNet;
  let selectedComponent = component && globals.selectedFeature != 0u && input.objectId == globals.selectedFeature;
  var base = draw.color.rgb;
  if (selected && copper) {
    if (draw.flags.z < 0.5) {
      let pulse = 0.88 + 0.12 * sin(globals.time * 3.2);
      base = vec3f(0.08, 1.0, 0.2) * pulse;
    }
  } else if (globals.hasHighlight > 0.5 && copper) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  if (selectedComponent) {
    let pulse = 0.84 + 0.16 * sin(globals.time * 3.6);
    base = mix(base, vec3f(0.15, 0.72, 1.0) * pulse, 0.72);
  }
  if (draw.flags.z > 0.5 && copper && !selected) { discard; }
  let normal = normalize(input.normal);
  let light = normalize(globals.lightDirection.xyz);
  let diffuse = max(dot(normal, light), 0.0);
  let hemi = mix(0.28, 0.62, normal.z * 0.5 + 0.5);
  let roughness = clamp(draw.material.y, 0.05, 1.0);
  let metallic = clamp(draw.material.x, 0.0, 1.0);
  let specular = pow(max(dot(normal, normalize(light + vec3f(0.3, -0.4, 0.85))), 0.0), mix(96.0, 6.0, roughness));
  let shaded = base * (hemi + diffuse * 0.72) + mix(vec3f(0.04), base, metallic) * specular * 0.5;
  var lit = shaded;
  if (draw.flags.w > 0.5) {
    lit = base;
  }
  return vec4f(aces(lit), draw.flags.y);
}
`;

const PICK_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
struct Input {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) netId: u32,
  @location(3) objectId: u32,
  @location(4) layerId: u32,
  @location(5) materialId: u32,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) objectId: u32,
};
@vertex fn vs(input: Input) -> Output {
  var output: Output;
  output.position = globals.viewProjection * vec4f(input.position + draw.offset.xyz, 1.0);
  output.objectId = input.objectId;
  return output;
}
@fragment fn fs(input: Output) -> @location(0) u32 { return input.objectId; }
`;

const BARREL_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) netId: u32,
  @location(2) @interpolate(flat) objectId: u32,
  @location(3) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
  let radius = mix(input.dimensions.z, input.dimensions.w, input.radiusMix);
  let z0 = input.span.x + layerOffsets[input.ids.z];
  let z1 = input.span.y + layerOffsets[input.ids.w];
  let world = vec3f(
    input.dimensions.x + input.unit.x * radius,
    input.dimensions.y + input.unit.y * radius,
    mix(z0, z1, input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.normal = input.normal;
  output.netId = input.ids.x;
  output.objectId = input.ids.y;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
  return output;
}
@fragment fn fs(input: Output) -> @location(0) vec4f {
  if (input.visible == 0u) { discard; }
  let selected = globals.activeNet != 0u && input.netId == globals.activeNet;
  var base = draw.color.rgb;
  if (selected) {
    if (draw.flags.z < 0.5) {
      base = vec3f(0.1, 1.0, 0.22) * (0.88 + 0.12 * sin(globals.time * 3.2));
    }
  } else if (globals.hasHighlight > 0.5) {
    base = mix(base, vec3f(0.12, 0.14, 0.17), 0.58);
  }
  if (draw.flags.z > 0.5 && !selected) { discard; }
  let light = normalize(globals.lightDirection.xyz);
  let lit = base * (0.38 + max(dot(normalize(input.normal), light), 0.0) * 0.72);
  return vec4f(lit, 1.0);
}
`;

const BARREL_PICK_SHADER = `
struct Globals {
  viewProjection: mat4x4f,
  activeNet: u32,
  selectedLayer: u32,
  time: f32,
  hasHighlight: f32,
  selectedFeature: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
  lightDirection: vec4f,
};
struct Draw { color: vec4f, material: vec4f, offset: vec4f, flags: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> draw: Draw;
@group(0) @binding(2) var<storage, read> layerOffsets: array<f32>;
struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
};
struct Output {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) objectId: u32,
  @location(1) @interpolate(flat) visible: u32,
};
@vertex fn vs(input: Input) -> Output {
  let radius = mix(input.dimensions.z, input.dimensions.w, input.radiusMix);
  let world = vec3f(
    input.dimensions.x + input.unit.x * radius,
    input.dimensions.y + input.unit.y * radius,
    mix(input.span.x + layerOffsets[input.ids.z], input.span.y + layerOffsets[input.ids.w], input.unit.z)
  );
  var output: Output;
  output.position = globals.viewProjection * vec4f(world, 1.0);
  output.objectId = input.ids.y;
  output.visible = 0u;
  if (globals.selectedLayer == 0u || (globals.selectedLayer >= input.ids.z && globals.selectedLayer <= input.ids.w)) {
    output.visible = 1u;
  }
  return output;
}
@fragment fn fs(input: Output) -> @location(0) u32 {
  if (input.visible == 0u) { discard; }
  return input.objectId;
}
`;

export class Renderer {
  static async create(canvas) {
    if (!navigator.gpu) throw new Error("WebGPU is unavailable in this browser");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter is available");
    const device = await adapter.requestDevice();
    return new Renderer(canvas, device);
  }

  constructor(canvas, device) {
    this.canvas = canvas;
    this.device = device;
    device.addEventListener("uncapturederror", (event) => {
      console.error(`Uncaptured WebGPU error: ${event.error?.message || event.error}`);
    });
    device.lost.then((info) => {
      console.error(`WebGPU device lost: ${info.reason}`, info.message);
    });
    this.context = canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: "opaque" });
    this.entries = [];
    this.barrels = null;
    this.globalBuffer = device.createBuffer({ size: GLOBAL_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.layerOffsetBuffer = device.createBuffer({ size: 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    const vertexBuffers = [{
      arrayStride: VERTEX_STRIDE,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },
        { shaderLocation: 1, offset: 12, format: "float32x3" },
        { shaderLocation: 2, offset: 24, format: "uint32" },
        { shaderLocation: 3, offset: 28, format: "uint32" },
        { shaderLocation: 4, offset: 32, format: "uint32" },
        { shaderLocation: 5, offset: 36, format: "uint32" },
      ],
    }];
    this.pipeline = this.makePipeline(layout, MAIN_SHADER, this.format, vertexBuffers, "main");
    this.pickPipeline = this.makePipeline(layout, PICK_SHADER, "r32uint", vertexBuffers, "pick");
    this.barrelPipeline = this.makeBarrelPipeline(layout, BARREL_SHADER, this.format, "barrel");
    this.barrelPickPipeline = this.makeBarrelPipeline(layout, BARREL_PICK_SHADER, "r32uint", "barrel-pick");
    this.depth = null;
    this.pickTexture = null;
    this.pickSerial = Promise.resolve();
    this.bundleCache = new Map();
    this.globalScratch = new ArrayBuffer(GLOBAL_UNIFORM_SIZE);
    this.globalScratchF32 = new Float32Array(this.globalScratch);
    this.globalScratchView = new DataView(this.globalScratch);
    this.drawScratch = new Float32Array(DRAW_UNIFORM_SIZE / 4);
    this.barrelDrawScratch = new Float32Array(DRAW_UNIFORM_SIZE / 4);
    this.nextEntryId = 1;
  }

  makePipeline(layout, code, format, buffers, label) {
    const module = this.createShaderModule(code, label);
    return this.device.createRenderPipeline({
      layout,
      vertex: { module, entryPoint: "vs", buffers },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{
          format,
          blend: format === "r32uint" ? undefined : {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
      multisample: { count: 1 },
    });
  }

  makeBarrelPipeline(layout, code, format, label) {
    const module = this.createShaderModule(code, label);
    return this.device.createRenderPipeline({
      layout,
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 28,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32" },
            ],
          },
          {
            arrayStride: 40,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 3, offset: 0, format: "float32x4" },
              { shaderLocation: 4, offset: 16, format: "float32x2" },
              { shaderLocation: 5, offset: 24, format: "uint32x4" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{
          format,
          blend: format === "r32uint" ? undefined : {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });
  }

  createShaderModule(code, label) {
    const module = this.device.createShaderModule({ label: `pcb-${label}`, code });
    if (typeof module.getCompilationInfo === "function") {
      void module.getCompilationInfo().then((info) => {
        const messages = [...info.messages || []];
        if (!messages.length) return;
        console.groupCollapsed(`WebGPU shader compilation info: pcb-${label}`);
        for (const message of messages) {
          console[message.type === "error" ? "error" : "warn"](
            `${message.type} ${message.lineNum}:${message.linePos} ${message.message}`,
          );
        }
        console.groupEnd();
      });
    }
    return module;
  }

  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.depth?.destroy();
    this.pickTexture?.destroy();
    this.depth = this.device.createTexture({ size: [width, height], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.pickTexture = this.device.createTexture({ size: [width, height], format: "r32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  }

  addPrimitive(primitive, metadata) {
    const count = primitive.position.length / 3;
    const vertices = new ArrayBuffer(count * VERTEX_STRIDE);
    const vertexF32 = new Float32Array(vertices);
    const vertexU32 = new Uint32Array(vertices);
    for (let index = 0; index < count; index += 1) {
      const word = index * 10;
      const source = index * 3;
      vertexF32[word] = primitive.position[source];
      vertexF32[word + 1] = primitive.position[source + 1];
      vertexF32[word + 2] = primitive.position[source + 2];
      vertexF32[word + 3] = primitive.normal[source];
      vertexF32[word + 4] = primitive.normal[source + 1];
      vertexF32[word + 5] = primitive.normal[source + 2];
      vertexU32[word + 6] = primitive.netId[index] || 0;
      vertexU32[word + 7] = primitive.objectFeatureId[index] || 0;
      vertexU32[word + 8] = metadata.layerId || 0;
      vertexU32[word + 9] = metadata.materialId || 0;
    }
    const vertexBuffer = this.device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vertexBuffer, 0, vertices);
    const indices = primitive.indices instanceof Uint32Array ? primitive.indices : new Uint32Array(primitive.indices);
    const indexBuffer = this.device.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(indexBuffer, 0, indices);
    const drawBuffer = this.device.createBuffer({ size: DRAW_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globalBuffer } },
        { binding: 1, resource: { buffer: drawBuffer } },
        { binding: 2, resource: { buffer: this.layerOffsetBuffer } },
      ],
    });
    const entry = {
      ...metadata,
      bounds: primitive.bounds || metadata.bounds || null,
      id: this.nextEntryId++,
      vertexBuffer,
      indexBuffer,
      indexCount: indices.length,
      drawBuffer,
      bindGroup,
    };
    this.entries.push(entry);
    this.bundleCache.clear();
    return entry;
  }

  removeEntries(entries) {
    if (!entries?.length) return;
    const removeIds = new Set(entries.map((entry) => entry.id));
    for (const entry of entries) {
      entry.vertexBuffer?.destroy?.();
      entry.indexBuffer?.destroy?.();
      entry.drawBuffer?.destroy?.();
    }
    this.entries = this.entries.filter((entry) => !removeIds.has(entry.id));
    this.bundleCache.clear();
  }

  dispose() {
    this.removeEntries(this.entries);
    if (this.barrels) {
      this.barrels.vertexBuffer?.destroy?.();
      this.barrels.indexBuffer?.destroy?.();
      this.barrels.instanceBuffer?.destroy?.();
      this.barrels.drawBuffer?.destroy?.();
      this.barrels = null;
    }
    this.depth?.destroy();
    this.pickTexture?.destroy();
    this.depth = null;
    this.pickTexture = null;
    this.bundleCache.clear();
  }

  setBarrels(records) {
    if (!records?.length) return;
    const segments = 20;
    const vertices = [];
    const indices = [];
    for (const inner of [0, 1]) {
      const base = vertices.length / 7;
      for (let index = 0; index < segments; index += 1) {
        const angle = (Math.PI * 2 * index) / segments;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        for (const t of [0, 1]) vertices.push(x, y, t, inner ? -x : x, inner ? -y : y, 0, inner);
      }
      for (let index = 0; index < segments; index += 1) {
        const next = (index + 1) % segments;
        const a = base + index * 2;
        const b = base + next * 2;
        indices.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    const vertexArray = new Float32Array(vertices);
    const indexArray = new Uint16Array(indices);
    const instances = new ArrayBuffer(records.length * 40);
    const view = new DataView(instances);
    records.forEach((record, index) => {
      const offset = index * 40;
      view.setFloat32(offset, record.centerMm[0] / 1000, true);
      view.setFloat32(offset + 4, -record.centerMm[1] / 1000, true);
      view.setFloat32(offset + 8, Math.min(record.drillWidthMm, record.drillHeightMm) / 2000, true);
      view.setFloat32(offset + 12, Math.max(record.outerWidthMm, record.outerHeightMm) / 2000, true);
      view.setFloat32(offset + 16, record.startZMm / 1000, true);
      view.setFloat32(offset + 20, record.endZMm / 1000, true);
      view.setUint32(offset + 24, record.netId || 0, true);
      view.setUint32(offset + 28, record.objectFeatureId || 0, true);
      view.setUint32(offset + 32, record.startLayerId || 0, true);
      view.setUint32(offset + 36, record.endLayerId || 0, true);
    });
    const vertexBuffer = this.device.createBuffer({ size: vertexArray.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const indexBuffer = this.device.createBuffer({ size: indexArray.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    const instanceBuffer = this.device.createBuffer({ size: instances.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vertexBuffer, 0, vertexArray);
    this.device.queue.writeBuffer(indexBuffer, 0, indexArray);
    this.device.queue.writeBuffer(instanceBuffer, 0, instances);
    const drawBuffer = this.device.createBuffer({ size: DRAW_UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globalBuffer } },
        { binding: 1, resource: { buffer: drawBuffer } },
        { binding: 2, resource: { buffer: this.layerOffsetBuffer } },
      ],
    });
    this.barrels = { records, vertexBuffer, indexBuffer, instanceBuffer, indexCount: indexArray.length, instanceCount: records.length, drawBuffer, bindGroup };
  }

  render({
    panels,
    activeNetId,
    selectedFeatureId,
    time,
    layerOffsets,
    visibleLayers,
    showBoard,
    showComponents,
    componentOpacity,
    boardOpacity,
    isolateNet,
    compareMode = false,
    compareOffsets = new Map(),
    layerAlphas = null,
    visibleTileIds = null,
  }) {
    this.resize();
    this.device.queue.writeBuffer(this.layerOffsetBuffer, 0, layerOffsets);
    const targetView = this.context.getCurrentTexture().createView();
    panels.forEach((panel, panelIndex) => {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          clearValue: { r: 0.91, g: 0.93, b: 0.94, a: 1 },
          loadOp: panelIndex === 0 ? "clear" : "load",
          storeOp: "store",
        }],
        depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      const viewport = clampViewport(panel.viewport, this.canvas.width, this.canvas.height);
      pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
      pass.setScissorRect(viewport.x, viewport.y, viewport.width, viewport.height);
      this.writeGlobals(panel.matrix, activeNetId, panel.layerId, time, selectedFeatureId);
      const visibleEntries = this.entries.filter((entry) =>
        this.visible(entry, panel.layerId, visibleLayers, showBoard, showComponents, componentOpacity, compareMode, visibleTileIds));
      for (const entry of visibleEntries) {
        this.writeDraw(
          entry,
          activeNetId,
          componentOpacity,
          boardOpacity,
          isolateNet,
          compareMode,
          compareOffsets.get(entry.layerId),
          layerAlphas?.get(entry.layerId) ?? 1,
        );
      }
      if (visibleEntries.length > 64) {
        pass.executeBundles([this.renderBundle(visibleEntries, panel.layerId)]);
      } else {
        pass.setPipeline(this.pipeline);
        for (const entry of visibleEntries) {
        pass.setBindGroup(0, entry.bindGroup);
        pass.setVertexBuffer(0, entry.vertexBuffer);
        pass.setIndexBuffer(entry.indexBuffer, "uint32");
        pass.drawIndexed(entry.indexCount);
        }
      }
      if (!compareMode && this.barrels && (panel.layerId === 0 || visibleLayers.has(panel.layerId))) {
        this.writeBarrelDraw(isolateNet);
        pass.setPipeline(this.barrelPipeline);
        pass.setBindGroup(0, this.barrels.bindGroup);
        pass.setVertexBuffer(0, this.barrels.vertexBuffer);
        pass.setVertexBuffer(1, this.barrels.instanceBuffer);
        pass.setIndexBuffer(this.barrels.indexBuffer, "uint16");
        pass.drawIndexed(this.barrels.indexCount, this.barrels.instanceCount);
      }
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    });
  }

  visible(entry, panelLayer, visibleLayers, showBoard, showComponents, componentOpacity, compareMode = false, visibleTileIds = null) {
    if (entry.kind === "board" && entry.boardRole === "pad") return false;
    if (!compareMode && entry.kind === "copper" && visibleTileIds && !visibleTileIds.has(entry.tileId)) return false;
    if (compareMode) return entry.kind === "copper" && visibleLayers.has(entry.layerId);
    if (entry.kind === "board") return panelLayer === 0 && showBoard;
    if (entry.kind === "component") return panelLayer === 0 && showComponents && componentOpacity > 0.001;
    return panelLayer ? entry.layerId === panelLayer : visibleLayers.has(entry.layerId);
  }

  writeGlobals(matrix, activeNetId, selectedLayer, time, selectedFeatureId = 0) {
    const data = this.globalScratch;
    const floats = this.globalScratchF32;
    floats.fill(0);
    floats.set(matrix, 0);
    const view = this.globalScratchView;
    view.setUint32(64, activeNetId || 0, true);
    view.setUint32(68, selectedLayer || 0, true);
    view.setFloat32(72, time, true);
    view.setFloat32(76, activeNetId ? 1 : 0, true);
    view.setUint32(80, selectedFeatureId || 0, true);
    floats.set([0.35, -0.5, 0.8, 0], 24);
    this.device.queue.writeBuffer(this.globalBuffer, 0, data);
  }

  writeDraw(
    entry,
    activeNetId,
    componentOpacity,
    boardOpacity = 1,
    isolateNet = false,
    compareMode = false,
    compareOffset = null,
    layerAlpha = 1,
  ) {
    const data = this.drawScratch;
    data.fill(0);
    const color = entry.kind === "copper" ? entry.color : entry.material.baseColor;
    data.set(color, 0);
    data.set([entry.material.metallic || 0, entry.material.roughness ?? 0.72, 0, 0], 4);
    const boardOverlayOffset = boardContextOffset(entry);
    data.set([
      compareOffset?.[0] || 0,
      compareOffset?.[1] || 0,
      (compareMode ? -(entry.baseZ || 0) : entry.layerOffset || 0) + boardOverlayOffset,
      0,
    ], 8);
    const materialAlpha = Number.isFinite(color?.[3]) ? color[3] : 1;
    const opacity = entry.kind === "component"
      ? componentOpacity
      : entry.kind === "board"
        ? boardOpacity * boardRoleOpacity(entry, materialAlpha)
        : layerAlpha;
    const kind = entry.kind === "copper" ? 1 : entry.kind === "component" ? 2 : 0;
    data.set([kind, opacity, isolateNet ? 1 : 0, compareMode ? 1 : 0], 12);
    this.device.queue.writeBuffer(entry.drawBuffer, 0, data);
  }

  writeBarrelDraw(isolateNet = false) {
    const data = this.barrelDrawScratch;
    data.fill(0);
    data.set([0.55, 0.35, 0.16, 0.78], 0);
    data.set([0.75, 0.32, 0, 0], 4);
    data.set([1, 1, isolateNet ? 1 : 0, 0], 12);
    this.device.queue.writeBuffer(this.barrels.drawBuffer, 0, data);
  }

  renderBundle(entries, panelLayerId) {
    const key = `${panelLayerId}:${entries.map((entry) => entry.id).join(",")}`;
    const cached = this.bundleCache.get(key);
    if (cached) return cached;
    const encoder = this.device.createRenderBundleEncoder({
      colorFormats: [this.format],
      depthStencilFormat: "depth24plus",
    });
    encoder.setPipeline(this.pipeline);
    for (const entry of entries) {
      encoder.setBindGroup(0, entry.bindGroup);
      encoder.setVertexBuffer(0, entry.vertexBuffer);
      encoder.setIndexBuffer(entry.indexBuffer, "uint32");
      encoder.drawIndexed(entry.indexCount);
    }
    const bundle = encoder.finish();
    this.bundleCache.set(key, bundle);
    if (this.bundleCache.size > 32) this.bundleCache.delete(this.bundleCache.keys().next().value);
    return bundle;
  }

  pick(panel, x, y, options) {
    const operation = this.pickSerial.then(() => this.performPick(panel, x, y, options));
    this.pickSerial = operation.catch(() => 0);
    return operation;
  }

  async performPick(panel, x, y, options) {
    this.resize();
    const pixelX = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(x)));
    const pixelY = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(y)));
    this.writeGlobals(
      panel.matrix,
      options.activeNetId,
      panel.layerId,
      performance.now() / 1000,
      options.selectedFeatureId,
    );
    this.device.queue.writeBuffer(this.layerOffsetBuffer, 0, options.layerOffsets);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.pickTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    const viewport = clampViewport(panel.viewport, this.canvas.width, this.canvas.height);
    pass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
    pass.setScissorRect(viewport.x, viewport.y, viewport.width, viewport.height);
    pass.setPipeline(this.pickPipeline);
    for (const entry of this.entries) {
      if (!this.visible(
        entry,
        panel.layerId,
        options.visibleLayers,
        options.showBoard,
        options.showComponents,
        options.componentOpacity,
        options.compareMode,
        options.visibleTileIds,
      )) continue;
      if (entry.kind === "board") continue;
      this.writeDraw(
        entry,
        options.activeNetId,
        options.componentOpacity,
        options.boardOpacity,
        options.isolateNet,
        options.compareMode,
        options.compareOffsets?.get(entry.layerId),
      );
      pass.setBindGroup(0, entry.bindGroup);
      pass.setVertexBuffer(0, entry.vertexBuffer);
      pass.setIndexBuffer(entry.indexBuffer, "uint32");
      pass.drawIndexed(entry.indexCount);
    }
    if (!options.compareMode && this.barrels) {
      this.writeBarrelDraw(options.isolateNet);
      pass.setPipeline(this.barrelPickPipeline);
      pass.setBindGroup(0, this.barrels.bindGroup);
      pass.setVertexBuffer(0, this.barrels.vertexBuffer);
      pass.setVertexBuffer(1, this.barrels.instanceBuffer);
      pass.setIndexBuffer(this.barrels.indexBuffer, "uint16");
      pass.drawIndexed(this.barrels.indexCount, this.barrels.instanceCount);
    }
    pass.end();
    const readBuffer = this.device.createBuffer({
      label: "pick-readback",
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyTextureToBuffer(
      { texture: this.pickTexture, origin: { x: pixelX, y: pixelY } },
      { buffer: readBuffer, bytesPerRow: 256 },
      { width: 1, height: 1 },
    );
    this.device.queue.submit([encoder.finish()]);
    try {
      await readBuffer.mapAsync(GPUMapMode.READ);
      const value = new DataView(readBuffer.getMappedRange()).getUint32(0, true);
      readBuffer.unmap();
      return value;
    } finally {
      if (readBuffer.mapState === "mapped") readBuffer.unmap();
      readBuffer.destroy();
    }
  }
}

function boardRoleOpacity(entry, materialAlpha) {
  if (entry.kind !== "board") return 1;
  if (entry.boardRole === "substrate") return 1;
  if (entry.boardRole === "soldermask") return Math.min(materialAlpha, 0.72);
  if (entry.boardRole === "silkscreen") return Math.min(materialAlpha, 0.92);
  return materialAlpha;
}

function boardContextOffset(entry) {
  if (entry.kind !== "board") return 0;
  if (entry.boardRole !== "soldermask" && entry.boardRole !== "silkscreen") return 0;
  const bounds = entry.bounds;
  const centerZ = bounds ? (bounds[2] + bounds[5]) * 0.5 : 0;
  const direction = centerZ < 0 ? -1 : 1;
  const roleOffset = entry.boardRole === "silkscreen" ? 0.000035 : 0.000018;
  return direction * roleOffset;
}

function clampViewport(viewport, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.floor(viewport.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(viewport.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.floor(viewport.width))),
    height: Math.max(1, Math.min(height - y, Math.floor(viewport.height))),
  };
}
