import { clamp } from "./math.js";

const PAGE_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
struct Page {
  originSize: vec4f,
  flags: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> page: Page;
@group(0) @binding(2) var pageSampler: sampler;
@group(0) @binding(3) var pageTexture: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let uv = positions[index];
  let world = page.originSize.xy + uv * page.originSize.zw;
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: VertexOut;
  out.position = vec4f(clip, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@fragment fn fs(input: VertexOut) -> @location(0) vec4f {
  let sampled = textureSample(pageTexture, pageSampler, input.uv);
  let edge = min(min(input.uv.x, 1.0 - input.uv.x), min(input.uv.y, 1.0 - input.uv.y));
  let selected = page.flags.x > 0.5;
  let containsNet = page.flags.y > 0.5;
  let hasActiveNet = page.flags.z > 0.5;
  let nativeDetail = page.flags.w > 0.5;
  if (edge < 0.006) {
    if (containsNet) { return vec4f(0.12, 0.92, 0.35, 1.0); }
    if (selected) { return vec4f(0.12, 0.45, 0.95, 1.0); }
    return vec4f(0.28, 0.32, 0.39, 1.0);
  }
  if (nativeDetail) {
    return vec4f(0.925, 0.918, 0.865, 1.0);
  }
  var dim = 1.0;
  if (hasActiveNet) {
    dim = 0.42;
    if (containsNet) {
      dim = 1.0;
    }
  }
  return vec4f(sampled.rgb * dim, 1.0);
}`;

const EDGE_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out { @builtin(position) position: vec4f };
@vertex fn vs(@location(0) world: vec2f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.4, 1.0);
  return out;
}
@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.22, 0.48, 0.82, 0.82);
}`;

const HIGHLIGHT_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out { @builtin(position) position: vec4f };
@vertex fn vs(@location(0) world: vec2f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.2, 1.0);
  return out;
}
@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.08, 1.0, 0.27, 0.96);
}`;

const NET_FLOW_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) distance: f32,
  @location(1) kind: f32,
};
@vertex fn vs(@location(0) world: vec2f, @location(1) flow: vec2f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.05, 1.0);
  out.distance = flow.x;
  out.kind = flow.y;
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  let selected = input.kind > 1.5;
  let intersheet = input.kind > 0.5 && !selected;
  var speed = 0.62;
  var period = 18.0;
  if (intersheet || selected) {
    speed = 0.88;
    period = 28.0;
  }
  let phase = fract(input.distance / period - globals.camera.w * speed);
  let dash = smoothstep(0.04, 0.13, phase) * (1.0 - smoothstep(0.38, 0.52, phase));
  let intraBase = vec3f(0.94, 0.48, 0.12);
  let intraDash = vec3f(1.0, 0.86, 0.24);
  let interBase = vec3f(0.10, 0.46, 0.92);
  let interDash = vec3f(0.42, 0.82, 1.0);
  let selectedBase = vec3f(0.08, 1.0, 0.34);
  let selectedDash = vec3f(0.86, 1.0, 0.72);
  var base = intraBase;
  var bright = intraDash;
  if (intersheet) {
    base = interBase;
    bright = interDash;
  }
  if (selected) {
    base = selectedBase;
    bright = selectedDash;
  }
  let color = base + (bright - base) * dash;
  var alpha = 0.24 + dash * 0.54;
  if (intersheet) {
    alpha = 0.30 + dash * 0.54;
  }
  if (selected) {
    alpha = 0.44 + dash * 0.50;
  }
  return vec4f(color, alpha);
}`;

const VECTOR_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};
@vertex fn vs(@location(0) world: vec2f, @location(1) color: vec4f) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.1, 1.0);
  out.color = color;
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  return input.color;
}`;

const IMAGE_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
struct ImageQuad {
  originSize: vec4f,
  flags: vec4f,
};
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<uniform> imageQuad: ImageQuad;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var imageTexture: texture_2d<f32>;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) index: u32) -> Out {
  var positions = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let uv = positions[index];
  let world = imageQuad.originSize.xy + uv * imageQuad.originSize.zw;
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.08, 1.0);
  out.uv = uv;
  return out;
}

@fragment fn fs(input: Out) -> @location(0) vec4f {
  return textureSample(imageTexture, imageSampler, input.uv);
}`;

const PICK_SHADER = `
struct Globals {
  camera: vec4f,
  viewport: vec2f,
  activeNet: u32,
  _pad: u32,
};
@group(0) @binding(0) var<uniform> globals: Globals;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) featureId: u32,
};
@vertex fn vs(@location(0) world: vec2f, @location(1) featureId: u32) -> Out {
  let halfViewport = globals.viewport * globals.camera.z * 0.5;
  let clip = vec2f(
    (world.x - globals.camera.x) / halfViewport.x,
    -(world.y - globals.camera.y) / halfViewport.y
  );
  var out: Out;
  out.position = vec4f(clip, 0.0, 1.0);
  out.featureId = featureId;
  return out;
}
@fragment fn fs(input: Out) -> @location(0) u32 {
  return input.featureId;
}`;

const NATIVE_DETAIL_BASE_ENTER_PX_PER_MM = 6.2;
const NATIVE_DETAIL_BASE_EXIT_PX_PER_MM = 4.6;
const NATIVE_DETAIL_BASE_PREFETCH_PX_PER_MM = 3.8;
const MAX_VECTOR_FLOATS = 4 * 1024 * 1024;
const MAX_VECTOR_VERTICES = Math.floor(MAX_VECTOR_FLOATS / 6);
const MAX_VECTOR_DRAW_FLOATS = MAX_VECTOR_VERTICES * 6;
const MAX_PICK_VERTICES = 512 * 1024;
const MAX_NET_FLOW_FLOATS = 512 * 1024;
const MAX_NET_TRACKING_ANCHORS_PER_PAGE = 96;
const MAX_NET_TRACKING_PAGES = 96;
const VECTOR_TILE_SIZE_MM = 18;
const MAX_RESIDENT_VECTOR_BYTES = 96 * 1024 * 1024;
const MAX_CONCURRENT_VECTOR_LOADS = 2;

export class SchematicWorldRenderer {
  static async create(canvas, manifestUrl) {
    if (!navigator.gpu) throw new Error("WebGPU is unavailable in this browser");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter is available");
    const device = await adapter.requestDevice();
    const response = await fetch(manifestUrl, { cache: "default" });
    if (!response.ok) throw new Error(`Failed to load schematic manifest: ${response.status}`);
    const manifest = await response.json();
    if (!["prism.schematic_world_a0", "prism.schematic_vector_a0"].includes(manifest.schema)) {
      throw new Error(`Unsupported schematic scene schema: ${manifest.schema}`);
    }
    const featurePath = manifest.featureTable || manifest.features;
    const featureResponse = await fetch(new URL(featurePath, manifestUrl), { cache: "default" });
    if (!featureResponse.ok) throw new Error(`Failed to load schematic features: ${featureResponse.status}`);
    const features = normalizeFeatureTable(await featureResponse.json());
    return new SchematicWorldRenderer(canvas, device, manifestUrl, manifest, features);
  }

  constructor(canvas, device, manifestUrl, manifest, featuresByPage) {
    this.canvas = canvas;
    this.device = device;
    this.manifestUrl = manifestUrl;
    this.manifest = manifest;
    this.isNativeScene = manifest.schema === "prism.schematic_vector_a0";
    this.pages = manifest.pages || [];
    this.featuresByPage = featuresByPage;
    this.featuresById = new Map();
    for (const items of Object.values(featuresByPage)) {
      for (const feature of items) this.featuresById.set(Number(feature.id), feature);
    }
    this.context = canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: "opaque" });
    this.flowCanvas = null;
    this.flowContext = null;
    this.globalBuffer = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    const pageModule = device.createShaderModule({ code: PAGE_SHADER });
    this.pagePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module: pageModule, entryPoint: "vs" },
      fragment: { module: pageModule, entryPoint: "fs", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });
    this.edgeLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });
    const edgeModule = device.createShaderModule({ code: EDGE_SHADER });
    this.edgePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: "vs",
        buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }],
      },
      fragment: {
        module: edgeModule,
        entryPoint: "fs",
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "line-list" },
    });
    this.edgeBindGroup = device.createBindGroup({
      layout: this.edgeLayout,
      entries: [{ binding: 0, resource: { buffer: this.globalBuffer } }],
    });
    const highlightModule = device.createShaderModule({ code: HIGHLIGHT_SHADER });
    this.highlightPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeLayout] }),
      vertex: {
        module: highlightModule,
        entryPoint: "vs",
        buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }],
      },
      fragment: {
        module: highlightModule,
        entryPoint: "fs",
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "line-list" },
    });
    this.highlightBufferSize = 4 * 1024 * 1024;
    this.highlightBuffer = device.createBuffer({
      size: this.highlightBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const netFlowModule = device.createShaderModule({ code: NET_FLOW_SHADER });
    this.netFlowPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeLayout] }),
      vertex: {
        module: netFlowModule,
        entryPoint: "vs",
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
          ],
        }],
      },
      fragment: {
        module: netFlowModule,
        entryPoint: "fs",
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.netFlowBuffer = device.createBuffer({
      size: MAX_NET_FLOW_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.globalUniformScratch = new Float32Array(12);
    this.pageUniformScratch = new Float32Array(8);
    this.imageUniformScratch = new Float32Array(8);
    this.vectorScratch = new Float32Array(MAX_VECTOR_FLOATS);
    this.highlightScratch = new Float32Array(this.highlightBufferSize / 4);
    this.netFlowScratch = new Float32Array(MAX_NET_FLOW_FLOATS);
    this.netTrackingCache = null;
    this.selectedIntrasheetLinkIndex = -1;
    this.truncatedHighlightCount = 0;
    this.truncatedVectorCount = 0;
    this.frameSerial = 0;
    this.querySerial = 0;
    const vectorModule = device.createShaderModule({ code: VECTOR_SHADER });
    this.vectorPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeLayout] }),
      vertex: {
        module: vectorModule,
        entryPoint: "vs",
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x4" },
          ],
        }],
      },
      fragment: {
        module: vectorModule,
        entryPoint: "fs",
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.vectorBuffer = device.createBuffer({
      size: MAX_VECTOR_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.vectorBuffers = [this.vectorBuffer];
    const imageModule = device.createShaderModule({ code: IMAGE_SHADER });
    this.imagePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module: imageModule, entryPoint: "vs" },
      fragment: {
        module: imageModule,
        entryPoint: "fs",
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    const pickModule = device.createShaderModule({ code: PICK_SHADER });
    this.pickPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeLayout] }),
      vertex: {
        module: pickModule,
        entryPoint: "vs",
        buffers: [{
          arrayStride: 12,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "uint32" },
          ],
        }],
      },
      fragment: { module: pickModule, entryPoint: "fs", targets: [{ format: "r32uint" }] },
      primitive: { topology: "triangle-list" },
    });
    this.pickVertexBuffer = device.createBuffer({
      size: MAX_PICK_VERTICES * 12,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.pickReadBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.pickTexture = null;
    this.pickTextureSize = [0, 0];
    this.pickPending = false;
    this.vectorChunks = new Map();
    this.failedVectorChunks = new Map();
    this.nativeDetailState = new Map();
    this.domDetailPageIds = new Set();
    this.nativeDetailThresholds = new Map();
    this.residentVectorBytes = 0;
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" });
    this.placeholder = this.createSolidTexture([245, 247, 249, 255]);
    this.pageResources = new Map();
    this.imageResources = new Map();
    this.loading = new Map();
    this.selectedPageId = "";
    this.selectedFeatureId = 0;
    this.activeNetUid = "";
    this.showHierarchy = true;
    this.downloadedBytes = 0;
    this.world = manifest.worldBoundsMm;
    this.center = [
      (this.world.minX + this.world.maxX) / 2,
      (this.world.minY + this.world.maxY) / 2,
    ];
    this.scale = Math.max(
      (this.world.maxX - this.world.minX) / 900,
      (this.world.maxY - this.world.minY) / 650,
      0.1,
    ) * 1.16;
    this.edgeBuffer = this.createEdgeBuffer();
    for (const page of this.pages) this.createPageResource(page);
  }

  createSolidTexture(rgba) {
    const texture = this.device.createTexture({
      size: [1, 1],
      format: "rgba8unorm-srgb",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture },
      new Uint8Array(rgba),
      { bytesPerRow: 4 },
      [1, 1],
    );
    return texture;
  }

  createPageResource(page) {
    const uniform = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const resource = {
      page,
      uniform,
      texture: this.placeholder,
      textureWidth: 0,
      svgBlob: null,
      bindGroup: null,
    };
    this.pageResources.set(page.id, resource);
    this.updateBindGroup(resource);
  }

  createImageResource(path) {
    const uniform = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const resource = {
      path,
      uniform,
      texture: this.placeholder,
      loaded: false,
      bindGroup: null,
    };
    this.imageResources.set(path, resource);
    this.updateBindGroup(resource);
    return resource;
  }

  updateBindGroup(resource) {
    resource.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.globalBuffer } },
        { binding: 1, resource: { buffer: resource.uniform } },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: resource.texture.createView() },
      ],
    });
  }

  async loadImageTexture(path) {
    const resource = this.imageResources.get(path) || this.createImageResource(path);
    if (resource.loaded) return resource;
    const key = `image:${path}`;
    if (this.loading.has(key)) return this.loading.get(key);
    const promise = (async () => {
      try {
        const response = await fetch(new URL(path, this.manifestUrl), { cache: "default" });
        if (!response.ok) throw new Error(`Failed to load schematic image ${path}: ${response.status}`);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const texture = this.device.createTexture({
          size: [bitmap.width, bitmap.height],
          format: "rgba8unorm-srgb",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
        bitmap.close();
        if (resource.texture !== this.placeholder) resource.texture.destroy();
        resource.texture = texture;
        resource.loaded = true;
        this.updateBindGroup(resource);
      } finally {
        this.loading.delete(key);
      }
      return resource;
    })();
    this.loading.set(key, promise);
    return promise;
  }

  createEdgeBuffer() {
    const byId = new Map(this.pages.map((page) => [page.id, page]));
    const vertices = [];
    for (const edge of this.manifest.edges || []) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      vertices.push(
        source.worldX + source.widthMm / 2,
        source.worldY + source.heightMm,
        target.worldX + target.widthMm / 2,
        target.worldY,
      );
    }
    const data = new Float32Array(vertices);
    if (!data.length) return null;
    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    return { buffer, count: data.length / 2 };
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.flowCanvas && (this.flowCanvas.width !== width || this.flowCanvas.height !== height)) {
      this.flowCanvas.width = width;
      this.flowCanvas.height = height;
    }
  }

  setFlowOverlayCanvas(canvas) {
    if (!canvas) return;
    this.flowCanvas = canvas;
    this.flowContext = canvas.getContext("webgpu");
    this.flowContext.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });
  }

  writeGlobals() {
    const floats = this.globalUniformScratch;
    floats[0] = this.center[0];
    floats[1] = this.center[1];
    floats[2] = this.scale;
    floats[3] = performance.now() * 0.001;
    floats[4] = this.canvas.width;
    floats[5] = this.canvas.height;
    this.device.queue.writeBuffer(this.globalBuffer, 0, floats);
  }

  pagePixelWidth(page) {
    return page.widthMm / this.scale;
  }

  pageSourcePixelsPerMm(page) {
    const x = this.pagePixelWidth(page) / Math.max(1, page.sourceWidthMm || page.widthMm);
    const y = (page.heightMm / this.scale) / Math.max(1, page.sourceHeightMm || page.heightMm);
    return Math.min(x, y);
  }

  pageNativeDetailThresholds(page) {
    const cached = this.nativeDetailThresholds.get(page.id);
    if (cached) return cached;
    const sourceWidth = Math.max(1, page.sourceWidthMm || page.widthMm);
    const sourceHeight = Math.max(1, page.sourceHeightMm || page.heightMm);
    const sourceArea = sourceWidth * sourceHeight;
    const featureDensity = Math.max(0, page.featureCount || page.featureIds?.length || 0) / Math.max(1, sourceArea);
    const densityBias = clamp(1 - featureDensity * 72, 0.84, 1.08);
    const aspectBias = clamp(Math.sqrt(Math.max(sourceWidth, sourceHeight) / Math.max(1, Math.min(sourceWidth, sourceHeight))) / 1.18, 0.92, 1.14);
    const enter = clamp(NATIVE_DETAIL_BASE_ENTER_PX_PER_MM * densityBias * aspectBias, 5.0, 7.4);
    const thresholds = {
      enter,
      exit: clamp(Math.min(enter - 1.2, NATIVE_DETAIL_BASE_EXIT_PX_PER_MM * densityBias), 3.8, enter - 0.7),
      prefetch: clamp(Math.min(enter - 2.0, NATIVE_DETAIL_BASE_PREFETCH_PX_PER_MM * densityBias), 3.0, enter - 1.0),
    };
    this.nativeDetailThresholds.set(page.id, thresholds);
    return thresholds;
  }

  pageWantsNativeDetail(page) {
    if (!this.pageHasNativeDetail(page)) return false;
    const density = this.pageSourcePixelsPerMm(page);
    const active = this.nativeDetailState.get(page.id) === true;
    const thresholds = this.pageNativeDetailThresholds(page);
    const threshold = active ? thresholds.exit : thresholds.enter;
    const next = density >= threshold;
    if (next !== active) this.nativeDetailState.set(page.id, next);
    return next;
  }

  pageNativeDetailReady(page) {
    if (this.domDetailPageIds.has(page.id)) return false;
    if (!this.pageWantsNativeDetail(page)) return false;
    const chunk = this.vectorChunks.get(page.id);
    if (!chunk?.loaded || (!chunk.segments?.length && !chunk.fills?.length)) return false;
    return this.visibleNativeImagesReady(page, chunk);
  }

  visibleNativeImagesReady(page, chunk) {
    if (!chunk?.images?.length) return true;
    const sourceBounds = this.sourceViewportBounds(page, 4);
    let ready = true;
    for (const image of chunk.images) {
      if (!intersectsBounds(image.bounds, sourceBounds)) continue;
      const resource = this.imageResources.get(image.path) || this.createImageResource(image.path);
      if (!resource.loaded) {
        ready = false;
        void this.loadImageTexture(image.path).catch(() => {});
      }
    }
    return ready;
  }

  visiblePages() {
    const halfW = this.canvas.width * this.scale / 2;
    const halfH = this.canvas.height * this.scale / 2;
    const left = this.center[0] - halfW;
    const right = this.center[0] + halfW;
    const top = this.center[1] - halfH;
    const bottom = this.center[1] + halfH;
    return this.pages.filter((page) =>
      page.worldX + page.widthMm >= left
      && page.worldX <= right
      && page.worldY + page.heightMm >= top
      && page.worldY <= bottom);
  }

  worldViewportBounds(padMm = 0) {
    const halfW = this.canvas.width * this.scale / 2;
    const halfH = this.canvas.height * this.scale / 2;
    return [
      this.center[0] - halfW - padMm,
      this.center[1] - halfH - padMm,
      this.center[0] + halfW + padMm,
      this.center[1] + halfH + padMm,
    ];
  }

  sourceViewportBounds(page, padMm = 2.5) {
    const bounds = this.worldViewportBounds(this.scale * 8);
    const left = (bounds[0] - page.worldX) / page.widthMm * page.sourceWidthMm - padMm;
    const top = (bounds[1] - page.worldY) / page.heightMm * page.sourceHeightMm - padMm;
    const right = (bounds[2] - page.worldX) / page.widthMm * page.sourceWidthMm + padMm;
    const bottom = (bounds[3] - page.worldY) / page.heightMm * page.sourceHeightMm + padMm;
    return [
      Math.max(-padMm, Math.min(left, right)),
      Math.max(-padMm, Math.min(top, bottom)),
      Math.min(page.sourceWidthMm + padMm, Math.max(left, right)),
      Math.min(page.sourceHeightMm + padMm, Math.max(top, bottom)),
    ];
  }

  render() {
    this.frameSerial += 1;
    this.resize();
    this.writeGlobals();
    const visible = this.visiblePages();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.045, g: 0.055, b: 0.073, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    if (this.showHierarchy && this.edgeBuffer) {
      pass.setPipeline(this.edgePipeline);
      pass.setBindGroup(0, this.edgeBindGroup);
      pass.setVertexBuffer(0, this.edgeBuffer.buffer);
      pass.draw(this.edgeBuffer.count);
    }
    pass.setPipeline(this.pagePipeline);
    for (const page of visible) {
      const resource = this.pageResources.get(page.id);
      const containsNet = this.activeNetUid && page.netUids.includes(this.activeNetUid);
      const showDomDetail = this.domDetailPageIds.has(page.id);
      const showNativeDetail = !showDomDetail && this.pageNativeDetailReady(page);
      const values = this.pageUniformScratch;
      values[0] = page.worldX;
      values[1] = page.worldY;
      values[2] = page.widthMm;
      values[3] = page.heightMm;
      values[4] = page.id === this.selectedPageId ? 1 : 0;
      values[5] = containsNet ? 1 : 0;
      values[6] = this.activeNetUid ? 1 : 0;
      values[7] = showNativeDetail || showDomDetail ? 1 : 0;
      this.device.queue.writeBuffer(resource.uniform, 0, values);
      pass.setBindGroup(0, resource.bindGroup);
      pass.draw(6);
      const wantedWidth = clamp(
        Math.ceil(this.pagePixelWidth(page) * 1.3 / 512) * 512,
        512,
        6144,
      );
      if (resource.textureWidth < wantedWidth * 0.82) void this.loadPageTexture(page, wantedWidth).catch(() => {});
    }
    this.scheduleVisibleVectorLoads(visible);
    this.drawVisibleImages(pass, visible);
    this.drawVisibleVectors(pass, visible);
    const flowCount = this.writeNetTrackingOverlay();
    if (flowCount && !this.flowContext) {
      pass.setPipeline(this.netFlowPipeline);
      pass.setBindGroup(0, this.edgeBindGroup);
      pass.setVertexBuffer(0, this.netFlowBuffer);
      pass.draw(flowCount);
    }
    const highlightCount = this.writeNetHighlights(visible);
    if (highlightCount) {
      pass.setPipeline(this.highlightPipeline);
      pass.setBindGroup(0, this.edgeBindGroup);
      pass.setVertexBuffer(0, this.highlightBuffer);
      pass.draw(highlightCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.renderFlowOverlay(flowCount);
    this.evictVectorChunks(visible);
    return visible;
  }

  renderFlowOverlay(flowCount) {
    if (!this.flowContext) return;
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.flowContext.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    if (flowCount) {
      pass.setPipeline(this.netFlowPipeline);
      pass.setBindGroup(0, this.edgeBindGroup);
      pass.setVertexBuffer(0, this.netFlowBuffer);
      pass.draw(flowCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  drawVisibleImages(pass, visiblePages) {
    if (!this.isNativeScene) return;
    let pipelineSet = false;
    for (const page of visiblePages) {
      if (this.domDetailPageIds.has(page.id)) continue;
      if (!this.pageNativeDetailReady(page)) continue;
      const chunk = this.vectorChunks.get(page.id);
      if (!chunk?.images?.length) continue;
      const sourceBounds = this.sourceViewportBounds(page, 4);
      for (const image of chunk.images) {
        if (!intersectsBounds(image.bounds, sourceBounds)) continue;
        const resource = this.imageResources.get(image.path) || this.createImageResource(image.path);
        if (!resource.loaded) void this.loadImageTexture(image.path).catch(() => {});
        const origin = image.worldOrigin || this.sourceToWorld(page, [image.xMm, image.yMm]);
        const size = image.worldSize || this.sourceSizeToWorld(page, image.widthMm, image.heightMm);
        const values = this.imageUniformScratch;
        values[0] = origin[0];
        values[1] = origin[1];
        values[2] = size[0];
        values[3] = size[1];
        values[4] = 0;
        values[5] = 0;
        values[6] = 0;
        values[7] = 0;
        this.device.queue.writeBuffer(resource.uniform, 0, values);
        if (!pipelineSet) {
          pass.setPipeline(this.imagePipeline);
          pipelineSet = true;
        }
        pass.setBindGroup(0, resource.bindGroup);
        pass.draw(6);
      }
    }
  }

  drawVisibleVectors(pass, visiblePages) {
    if (!this.isNativeScene) return 0;
    const values = this.vectorScratch;
    let offset = 0;
    let truncated = 0;
    let submittedVertices = 0;
    let submittedChunks = 0;
    let pipelineSet = false;
    const flush = () => {
      if (!offset) return;
      let buffer = this.vectorBuffers[submittedChunks];
      if (!buffer) {
        buffer = this.device.createBuffer({
          size: MAX_VECTOR_FLOATS * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.vectorBuffers.push(buffer);
      }
      this.device.queue.writeBuffer(buffer, 0, values, 0, offset);
      if (!pipelineSet) {
        pass.setPipeline(this.vectorPipeline);
        pass.setBindGroup(0, this.edgeBindGroup);
        pipelineSet = true;
      }
      const vertices = Math.floor(offset / 6);
      pass.setVertexBuffer(0, buffer);
      pass.draw(vertices);
      submittedVertices += vertices;
      submittedChunks += 1;
      offset = 0;
    };
    const ensure = (floatCount) => {
      if (floatCount > MAX_VECTOR_DRAW_FLOATS || floatCount > values.length) {
        truncated += 1;
        return false;
      }
      if (offset + floatCount > MAX_VECTOR_DRAW_FLOATS || offset + floatCount > values.length) flush();
      return true;
    };
    for (const page of visiblePages) {
      if (this.domDetailPageIds.has(page.id)) continue;
      if (!this.pageHasNativeDetail(page)) continue;
      const chunk = this.vectorChunks.get(page.id);
      if (!chunk?.segments?.length && !chunk?.fills?.length) continue;
      if (!this.pageNativeDetailReady(page)) continue;
      chunk.lastUsedFrame = this.frameSerial;
      const sourceBounds = this.sourceViewportBounds(page);
      const candidates = querySpatialIndex(chunk.spatial, sourceBounds);
      for (const fill of candidates.fills) {
        if (!intersectsBounds(fill.bounds, sourceBounds)) continue;
        if (!ensure(18)) continue;
        const feature = this.featuresById.get(fill.featureId);
        const isSelectedNet = this.activeNetUid && feature?.netUid === this.activeNetUid;
        const isSelectedFeature = this.selectedFeatureId === fill.featureId;
        const color = isSelectedFeature
          ? [0.24, 0.58, 1.0, 1.0]
          : isSelectedNet
          ? [0.06, 1.0, 0.24, 1.0]
          : this.activeNetUid && isElectricalFeature(feature)
          ? mutedVectorColor(feature, fill.kind, fill.color)
          : vectorColor(feature, fill.kind, fill.color);
        const points = fill.worldPoints || fill.points.map((point) => this.sourceToWorld(page, point));
        offset = writeFilledTriangle(values, offset, points[0], points[1], points[2], color);
      }
      for (const segment of candidates.segments) {
        if (!intersectsBounds(segment.bounds, sourceBounds)) continue;
        const feature = this.featuresById.get(segment.featureId);
        const isSelectedNet = this.activeNetUid && feature?.netUid === this.activeNetUid;
        const isSelectedFeature = this.selectedFeatureId === segment.featureId;
        const color = isSelectedFeature
          ? [0.24, 0.58, 1.0, 1.0]
          : isSelectedNet
          ? [0.06, 1.0, 0.24, 1.0]
          : this.activeNetUid && isElectricalFeature(feature)
          ? mutedVectorColor(feature, segment.kind, segment.color)
          : vectorColor(feature, segment.kind, segment.color);
        const width = this.segmentWorldWidth(page, segment, feature, isSelectedNet || isSelectedFeature);
        for (const visibleSegment of this.visibleSegmentParts(page, segment, feature)) {
          if (!ensure(36)) continue;
          const a = visibleSegment.worldA || this.sourceToWorld(page, visibleSegment.a);
          const b = visibleSegment.worldB || this.sourceToWorld(page, visibleSegment.b);
          offset = writeStrokeQuad(values, offset, a, b, width, color);
        }
      }
    }
    flush();
    this.truncatedVectorCount = truncated;
    this.vectorTruncated = truncated > 0;
    this.lastVectorVertices = submittedVertices;
    this.lastVectorChunks = submittedChunks;
    return submittedVertices;
  }

  pageHasNativeDetail(page) {
    if (!this.isNativeScene) return false;
    return page?.nativeDetail?.enabled !== false;
  }

  scheduleVisibleVectorLoads(visiblePages) {
    if (!this.isNativeScene) return;
    const inFlight = [...this.vectorChunks.values()].filter((chunk) => chunk?.promise && !chunk.loaded).length;
    let slots = Math.max(0, MAX_CONCURRENT_VECTOR_LOADS - inFlight);
    if (!slots) return;
    const candidates = visiblePages
      .filter((page) => !this.domDetailPageIds.has(page.id))
      .filter((page) => this.pageHasNativeDetail(page) && this.pageSourcePixelsPerMm(page) >= this.pageNativeDetailThresholds(page).prefetch)
      .filter((page) => !this.vectorChunks.get(page.id)?.loaded && !this.vectorChunks.get(page.id)?.promise)
      .sort((a, b) => {
        const aDistance = Math.hypot((a.worldX + a.widthMm / 2) - this.center[0], (a.worldY + a.heightMm / 2) - this.center[1]);
        const bDistance = Math.hypot((b.worldX + b.widthMm / 2) - this.center[0], (b.worldY + b.heightMm / 2) - this.center[1]);
        return aDistance - bDistance;
      });
    for (const page of candidates) {
      void this.loadPageVectors(page).catch(() => {});
      slots -= 1;
      if (!slots) break;
    }
  }

  featurePrimitiveBounds(page, featureId) {
    const chunk = this.vectorChunks.get(page.id);
    if (!chunk?.segments?.length && !chunk?.fills?.length) return null;
    const xs = [];
    const ys = [];
    for (const segment of chunk.segments || []) {
      if (segment.featureId !== featureId) continue;
      xs.push(segment.a[0], segment.b[0]);
      ys.push(segment.a[1], segment.b[1]);
    }
    for (const fill of chunk.fills || []) {
      if (fill.featureId !== featureId) continue;
      for (const point of fill.points || []) {
        xs.push(point[0]);
        ys.push(point[1]);
      }
    }
    if (!xs.length) return null;
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  symbolClipBounds(page) {
    if (!this._symbolClipBounds) this._symbolClipBounds = new Map();
    if (this._symbolClipBounds.has(page.id)) return this._symbolClipBounds.get(page.id);
    const bounds = (this.featuresByPage[page.id] || [])
      .filter((feature) =>
        feature?.kind === "symbol_body"
        && feature.boundsMm
        && !String(feature.sourceId || "").includes(":overplot"))
      .map((feature) => {
        const tight = this.featurePrimitiveBounds(page, feature.id) || feature.boundsMm;
        return [tight[0] - 0.02, tight[1] - 0.02, tight[2] + 0.02, tight[3] + 0.02];
      })
      .filter((bounds) => {
        const width = bounds[2] - bounds[0];
        const height = bounds[3] - bounds[1];
        return Math.max(width, height) <= 12 && width * height <= 80;
      });
    this._symbolClipBounds.set(page.id, bounds);
    return bounds;
  }

  visibleSegmentParts(page, segment, feature) {
    if (segment._visibleParts) return segment._visibleParts;
    const kind = String(feature?.kind || "");
    const role = String(feature?.semanticRole || "");
    if (kind !== "wire" && role !== "wire") {
      segment._visibleParts = [segment];
      return segment._visibleParts;
    }
    let parts = [segment];
    for (const bounds of this.symbolClipBounds(page)) {
      const next = [];
      for (const part of parts) next.push(...clipSegmentOutsideBounds(part, bounds));
      parts = next;
      if (!parts.length) break;
    }
    for (const part of parts) {
      part.worldA = sourceToWorldPoint(page, part.a);
      part.worldB = sourceToWorldPoint(page, part.b);
    }
    segment._visibleParts = parts;
    return segment._visibleParts;
  }

  netTrackingSegments() {
    if (!this.activeNetUid) return { netUid: "", anchorsByPage: new Map(), segments: [], intrasheetSegments: [] };
    const selectedFeatureId = Number(this.selectedFeatureId || 0);
    const selectedFeatureKey = String(this.selectedFeatureKey || "");
    const selectedSourceId = String(this.selectedSourceId || "");
    if (
      this.netTrackingCache?.netUid === this.activeNetUid
      && this.netTrackingCache?.selectedFeatureId === selectedFeatureId
      && this.netTrackingCache?.selectedFeatureKey === selectedFeatureKey
      && this.netTrackingCache?.selectedSourceId === selectedSourceId
    ) {
      return this.netTrackingCache;
    }
    this.selectedIntrasheetLinkIndex = -1;
    const pageById = new Map(this.pages.map((page) => [page.id, page]));
    const pageIds = this.manifest.netToPages?.[this.activeNetUid] || [];
    const candidatePages = pageIds.length
      ? pageIds.map((id) => pageById.get(id)).filter(Boolean)
      : this.pages.filter((page) => page.netUids?.includes(this.activeNetUid));
    const anchorsByPage = new Map();
    for (const page of candidatePages.slice(0, MAX_NET_TRACKING_PAGES)) {
      const anchors = this.netTrackingAnchorsForPage(page);
      if (anchors.length) anchorsByPage.set(page.id, anchors);
    }
    const segments = [];
    const intrasheetSegments = [];
    for (const [pageId, anchors] of anchorsByPage) {
      const pageSegments = nearestNeighborAnchorSegments(limitAnchorsForTracking(anchors), "intrasheet", pageId);
      segments.push(...pageSegments);
      intrasheetSegments.push(...pageSegments);
    }
    const pageAnchors = [...anchorsByPage.entries()]
      .map(([pageId, anchors]) => representativeNetAnchor(pageById.get(pageId), anchors, {
        featureId: selectedFeatureId,
        stableKey: selectedFeatureKey,
        sourceId: selectedSourceId,
      }))
      .filter(Boolean);
    segments.push(...nearestNeighborAnchorSegments(pageAnchors, "intersheet", ""));
    const indexedIntrasheetSegments = intrasheetSegments.map((segment, index) => ({ ...segment, intrasheetIndex: index }));
    let intrasheetCursor = 0;
    const indexedSegments = segments.map((segment, index) => {
      if (segment.type !== "intrasheet") return { ...segment, id: index };
      const intrasheetIndex = intrasheetCursor;
      intrasheetCursor += 1;
      return { ...segment, id: index, intrasheetIndex };
    });
    this.netTrackingCache = {
      netUid: this.activeNetUid,
      selectedFeatureId,
      selectedFeatureKey,
      selectedSourceId,
      anchorsByPage,
      segments: indexedSegments,
      intrasheetSegments: indexedIntrasheetSegments,
    };
    if (this.selectedIntrasheetLinkIndex >= this.netTrackingCache.intrasheetSegments.length) {
      this.selectedIntrasheetLinkIndex = -1;
    }
    return this.netTrackingCache;
  }

  netTrackingAnchorsForPage(page) {
    const items = this.featuresByPage[page.id] || [];
    const anchors = [];
    for (const feature of items) {
      if (feature.netUid !== this.activeNetUid || !feature.boundsMm) continue;
      if (!isNetTrackingAnchor(feature)) continue;
      const bounds = feature.boundsMm;
      const centerSource = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
      const center = this.sourceToWorld(page, centerSource);
      anchors.push({
        pageId: page.id,
        featureId: Number(feature.id || 0),
        stableKey: String(feature.stableKey || ""),
        sourceId: String(feature.sourceId || feature.sourceUid || feature.objectId || ""),
        kind: feature.kind || feature.semanticRole || "",
        source: centerSource,
        world: center,
        bounds,
        priority: netTrackingAnchorPriority(feature),
      });
    }
    anchors.sort((a, b) => b.priority - a.priority || a.source[1] - b.source[1] || a.source[0] - b.source[0]);
    return anchors;
  }

  writeNetTrackingOverlay() {
    const tracking = this.netTrackingSegments();
    this.lastNetFlowSegments = tracking.segments.length;
    this.lastNetFlowIntrasheetSegments = tracking.intrasheetSegments.length;
    if (!tracking.segments.length) {
      this.lastNetFlowVertices = 0;
      return 0;
    }
    const viewport = this.worldViewportBounds(this.scale * 96);
    const values = this.netFlowScratch;
    let offset = 0;
    let distanceSeed = 0;
    for (const segment of tracking.segments) {
      if (!intersectsBounds(segmentWorldBounds(segment), viewport)) continue;
      const isSelectedIntrasheet = segment.type === "intrasheet"
        && segment.intrasheetIndex === this.selectedIntrasheetLinkIndex;
      const widthPx = isSelectedIntrasheet ? 9.5 : segment.type === "intersheet" ? 8.0 : 4.8;
      const kind = isSelectedIntrasheet ? 2 : segment.type === "intersheet" ? 1 : 0;
      const written = writeFlowQuad(
        values,
        offset,
        segment.a,
        segment.b,
        widthPx * this.scale,
        kind,
        distanceSeed,
        this.scale,
      );
      if (written === offset) continue;
      offset = written;
      distanceSeed += Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]) / Math.max(this.scale, 1e-6);
      if (offset + 24 > values.length) break;
    }
    if (!offset) {
      this.lastNetFlowVertices = 0;
      return 0;
    }
    this.device.queue.writeBuffer(this.netFlowBuffer, 0, values, 0, offset);
    this.lastNetFlowVertices = offset / 4;
    return offset / 4;
  }

  cycleNetIntrasheetLink(direction = 1) {
    const tracking = this.netTrackingSegments();
    if (!tracking.intrasheetSegments.length) return null;
    const count = tracking.intrasheetSegments.length;
    this.selectedIntrasheetLinkIndex = (this.selectedIntrasheetLinkIndex + direction + count) % count;
    const segment = tracking.intrasheetSegments[this.selectedIntrasheetLinkIndex];
    if (!segment) return null;
    const bounds = segmentWorldBounds(segment, 14 * this.scale);
    this.center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    this.scale = Math.max(
      (bounds[2] - bounds[0]) / Math.max(1, this.canvas.width * 0.36),
      (bounds[3] - bounds[1]) / Math.max(1, this.canvas.height * 0.30),
      this.scale * 0.35,
      0.025,
    );
    return { pageId: segment.pageId, segment };
  }

  writeNetHighlights(visiblePages) {
    if (!this.activeNetUid) return 0;
    const values = this.highlightScratch;
    let offset = 0;
    let truncated = 0;
    for (const page of visiblePages) {
      const sourceBounds = this.sourceViewportBounds(page, 5);
      for (const feature of this.featuresByPage[page.id] || []) {
        if (feature.netUid !== this.activeNetUid || !feature.boundsMm) continue;
        if (!intersectsBounds(feature.boundsMm, sourceBounds)) continue;
        const bounds = this.featureWorldBounds(page, feature.boundsMm);
        if (offset + 16 > values.length) {
          truncated += 1;
          continue;
        }
        values[offset++] = bounds[0];
        values[offset++] = bounds[1];
        values[offset++] = bounds[2];
        values[offset++] = bounds[1];
        values[offset++] = bounds[2];
        values[offset++] = bounds[1];
        values[offset++] = bounds[2];
        values[offset++] = bounds[3];
        values[offset++] = bounds[2];
        values[offset++] = bounds[3];
        values[offset++] = bounds[0];
        values[offset++] = bounds[3];
        values[offset++] = bounds[0];
        values[offset++] = bounds[3];
        values[offset++] = bounds[0];
        values[offset++] = bounds[1];
      }
    }
    this.truncatedHighlightCount = truncated;
    if (!offset) return 0;
    this.device.queue.writeBuffer(this.highlightBuffer, 0, values, 0, offset);
    return offset / 2;
  }

  featureWorldBounds(page, bounds) {
    return [
      page.worldX + bounds[0] / page.sourceWidthMm * page.widthMm,
      page.worldY + bounds[1] / page.sourceHeightMm * page.heightMm,
      page.worldX + bounds[2] / page.sourceWidthMm * page.widthMm,
      page.worldY + bounds[3] / page.sourceHeightMm * page.heightMm,
    ];
  }

  sourceToWorld(page, point) {
    return [
      page.worldX + point[0] / page.sourceWidthMm * page.widthMm,
      page.worldY + point[1] / page.sourceHeightMm * page.heightMm,
    ];
  }

  sourceSizeToWorld(page, widthMm, heightMm) {
    return [
      widthMm / page.sourceWidthMm * page.widthMm,
      heightMm / page.sourceHeightMm * page.heightMm,
    ];
  }

  async loadPageVectors(page) {
    if (!this.pageHasNativeDetail(page) || !page.chunks?.lod2) return null;
    const existing = this.vectorChunks.get(page.id);
    if (existing?.loaded) return existing;
    if (existing?.promise) return existing.promise;
    const promise = (async () => {
      try {
        const response = await fetch(new URL(page.chunks.lod2, this.manifestUrl));
        if (!response.ok) throw new Error(`Failed to load schematic vector chunk ${page.id}: ${response.status}`);
        const payload = await response.json();
        const geometry = primitiveGeometry(payload.primitives || []);
        prepareWorldGeometry(page, geometry);
        const jsonBytes = JSON.stringify(payload).length;
        const bytes = jsonBytes;
        const chunk = {
          loaded: true,
          segments: geometry.segments,
          fills: geometry.fills,
          images: geometry.images,
          spatial: buildSpatialIndex(geometry),
          unsupported: payload.unsupported || [],
          bytes,
          lastUsedFrame: this.frameSerial,
        };
        this.vectorChunks.set(page.id, chunk);
        this.failedVectorChunks.delete(page.id);
        this.residentVectorBytes += bytes;
        return chunk;
      } catch (error) {
        const current = this.failedVectorChunks.get(page.id) || { count: 0, message: "" };
        this.failedVectorChunks.set(page.id, {
          count: current.count + 1,
          message: error?.message || String(error),
        });
        this.vectorChunks.delete(page.id);
        throw error;
      }
    })();
    this.vectorChunks.set(page.id, { loaded: false, promise, segments: [] });
    return promise;
  }

  evictVectorChunks(visiblePages) {
    if (this.residentVectorBytes <= MAX_RESIDENT_VECTOR_BYTES) return;
    const visibleIds = new Set(visiblePages.map((page) => page.id));
    const candidates = [...this.vectorChunks.entries()]
      .filter(([, chunk]) => chunk?.loaded)
      .filter(([pageId]) => !visibleIds.has(pageId) && pageId !== this.selectedPageId)
      .sort((a, b) => (a[1].lastUsedFrame || 0) - (b[1].lastUsedFrame || 0));
    for (const [pageId, chunk] of candidates) {
      this.vectorChunks.delete(pageId);
      this.residentVectorBytes = Math.max(0, this.residentVectorBytes - (chunk.bytes || 0));
      if (this.residentVectorBytes <= MAX_RESIDENT_VECTOR_BYTES * 0.82) break;
    }
  }

  stats() {
    const visible = this.visiblePages();
    const visibleDensities = visible.map((page) => this.pageSourcePixelsPerMm(page));
    const visibleThresholds = visible.map((page) => this.pageNativeDetailThresholds(page).enter);
    return {
      residentVectorBytes: this.residentVectorBytes,
      vectorChunks: [...this.vectorChunks.values()].filter((chunk) => chunk?.loaded).length,
      vectorLoads: [...this.vectorChunks.values()].filter((chunk) => chunk?.promise && !chunk.loaded).length,
      failedVectorChunks: this.failedVectorChunks.size,
      vectorVertices: this.lastVectorVertices || 0,
      vectorDrawChunks: this.lastVectorChunks || 0,
      truncatedVectors: this.truncatedVectorCount || 0,
      nativeDetailPages: [...this.nativeDetailState.values()].filter(Boolean).length,
      nativePxPerMm: Number((Math.max(0, ...visibleDensities) || 0).toFixed(2)),
      nativeThresholdPxPerMm: Number((visibleThresholds.length ? Math.min(...visibleThresholds) : 0).toFixed(2)),
      domDetailPages: this.domDetailPageIds.size,
      netFlowSegments: this.lastNetFlowSegments || 0,
      netFlowIntrasheetSegments: this.lastNetFlowIntrasheetSegments || 0,
      netFlowVertices: this.lastNetFlowVertices || 0,
    };
  }

  setDomDetailPageIds(ids) {
    this.domDetailPageIds = new Set(ids || []);
  }

  async loadPageTexture(page, width) {
    const key = `${page.id}:${width}`;
    if (this.loading.has(key)) return this.loading.get(key);
    const resource = this.pageResources.get(page.id);
    if (!resource || resource.textureWidth >= width) return;
    const promise = (async () => {
      if (!resource.svgBlob) {
        const response = await fetch(new URL(thumbnailPath(page), this.manifestUrl));
        if (!response.ok) throw new Error(`Failed to load schematic page ${page.name}: ${response.status}`);
        resource.svgBlob = await response.blob();
        this.downloadedBytes += resource.svgBlob.size;
      }
      const blob = resource.svgBlob;
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.decoding = "async";
        image.src = objectUrl;
        await image.decode();
        if (resource.textureWidth >= width) return;
        const height = Math.max(64, Math.round(width * page.heightMm / page.widthMm));
        const bitmapCanvas = new OffscreenCanvas(width, height);
        const context = bitmapCanvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const bitmap = await createImageBitmap(bitmapCanvas);
        const texture = this.device.createTexture({
          size: [width, height],
          format: "rgba8unorm-srgb",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [width, height]);
        bitmap.close();
        if (resource.texture !== this.placeholder) resource.texture.destroy();
        resource.texture = texture;
        resource.textureWidth = width;
        this.updateBindGroup(resource);
      } finally {
        URL.revokeObjectURL(objectUrl);
        this.loading.delete(key);
      }
    })();
    this.loading.set(key, promise);
    return promise;
  }

  preloadOverview() {
    const queue = [...this.pages];
    const worker = async () => {
      while (queue.length) {
        const page = queue.shift();
        await this.loadPageTexture(page, 512).catch(() => {});
      }
    };
    return Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * this.canvas.width / rect.width;
    const y = (clientY - rect.top) * this.canvas.height / rect.height;
    return [
      this.center[0] + (x - this.canvas.width / 2) * this.scale,
      this.center[1] + (y - this.canvas.height / 2) * this.scale,
    ];
  }

  worldToScreen(x, y) {
    const ratioX = this.canvas.clientWidth / this.canvas.width;
    const ratioY = this.canvas.clientHeight / this.canvas.height;
    return [
      ((x - this.center[0]) / this.scale + this.canvas.width / 2) * ratioX,
      ((y - this.center[1]) / this.scale + this.canvas.height / 2) * ratioY,
    ];
  }

  hitPage(clientX, clientY) {
    const [x, y] = this.screenToWorld(clientX, clientY);
    return [...this.pages].reverse().find((page) =>
      x >= page.worldX && x <= page.worldX + page.widthMm
      && y >= page.worldY && y <= page.worldY + page.heightMm) || null;
  }

  async pickFeature(clientX, clientY) {
    if (!this.isNativeScene) return this.hitFeature(clientX, clientY);
    const page = this.hitPage(clientX, clientY);
    if (!page) return null;
    if (!this.pageHasNativeDetail(page)) return this.hitFeature(clientX, clientY);
    await this.loadPageVectors(page);
    const feature = await this.gpuPickFeature(page, clientX, clientY);
    if (feature && !isBackgroundOrPageFeature(feature)) {
      return { page, feature, source: this.clientToSource(page, clientX, clientY), native: true, gpu: true };
    }
    return this.hitFeature(clientX, clientY);
  }

  hitFeature(clientX, clientY) {
    const page = this.hitPage(clientX, clientY);
    if (!page) return null;
    const [sourceX, sourceY] = this.clientToSource(page, clientX, clientY);
    const tolerance = Math.max(
      0.45,
      5 * this.scale * this.canvas.width / Math.max(1, this.canvas.clientWidth)
        * page.sourceWidthMm / page.widthMm,
    );
    const vectorHit = this.hitResidentVectorFeature(page, sourceX, sourceY, tolerance);
    if (vectorHit) return { page, feature: vectorHit, source: [sourceX, sourceY], native: true };
    const symbolInterior = this.hitSymbolInterior(page, sourceX, sourceY);
    if (symbolInterior) return { page, feature: symbolInterior, source: [sourceX, sourceY], native: true, interior: true };
    const candidates = (this.featuresByPage[page.id] || [])
      .filter((feature) => {
        if (isBackgroundOrPageFeature(feature)) return false;
        const bounds = feature.boundsMm;
        return bounds
          && sourceX >= bounds[0] - tolerance
          && sourceX <= bounds[2] + tolerance
          && sourceY >= bounds[1] - tolerance
          && sourceY <= bounds[3] + tolerance;
      })
      .map((feature) => ({
        feature,
        priority: featurePickPriority(feature),
        area: Math.max(0.0001, (feature.boundsMm[2] - feature.boundsMm[0]) * (feature.boundsMm[3] - feature.boundsMm[1])),
      }))
      .sort((a, b) => b.priority - a.priority || a.area - b.area);
    return { page, feature: candidates[0]?.feature || null, source: [sourceX, sourceY] };
  }

  hitSymbolInterior(page, sourceX, sourceY) {
    let best = null;
    for (const feature of this.featuresByPage[page.id] || []) {
      const kind = String(feature?.kind || "");
      if (kind !== "symbol_body" && kind !== "symbol_instance") continue;
      if (String(feature?.sourceId || "").includes(":overplot")) continue;
      const bounds = feature.boundsMm;
      if (!bounds) continue;
      if (sourceX < bounds[0] || sourceX > bounds[2] || sourceY < bounds[1] || sourceY > bounds[3]) continue;
      const area = Math.max(0.0001, (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]));
      const score = (kind === "symbol_body" ? 0 : 1000000) + area;
      if (!best || score < best.score) best = { feature, score };
    }
    return best?.feature || null;
  }

  clientToSource(page, clientX, clientY) {
    const [worldX, worldY] = this.screenToWorld(clientX, clientY);
    return [
      (worldX - page.worldX) / page.widthMm * page.sourceWidthMm,
      (worldY - page.worldY) / page.heightMm * page.sourceHeightMm,
    ];
  }

  ensurePickTexture() {
    if (
      this.pickTexture
      && this.pickTextureSize[0] === this.canvas.width
      && this.pickTextureSize[1] === this.canvas.height
    ) return;
    if (this.pickTexture) this.pickTexture.destroy();
    this.pickTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: "r32uint",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.pickTextureSize = [this.canvas.width, this.canvas.height];
  }

  writePickVectors(pages) {
    const buffer = new ArrayBuffer(MAX_PICK_VERTICES * 12);
    const view = new DataView(buffer);
    let count = 0;
    const pickSegments = [];
    for (const page of pages) {
      const chunk = this.vectorChunks.get(page.id);
      if (!chunk?.segments?.length && !chunk?.fills?.length && !chunk?.images?.length) continue;
      const sourcePoint = this._pickSourcePointByPage?.get(page.id);
      const sourceBounds = sourcePoint
        ? [sourcePoint[0] - 2.5, sourcePoint[1] - 2.5, sourcePoint[0] + 2.5, sourcePoint[1] + 2.5]
        : [0, 0, page.sourceWidthMm, page.sourceHeightMm];
      const candidates = querySpatialIndex(chunk.spatial, sourceBounds);
      for (const image of candidates.images) {
        if (!intersectsBounds(image.bounds, sourceBounds)) continue;
        const feature = this.featuresById.get(image.featureId);
        if (!feature || isBackgroundOrPageFeature(feature)) continue;
        pickSegments.push({ page, image, feature, priority: featurePickPriority(feature) - 5 });
      }
      for (const fill of candidates.fills) {
        if (!intersectsBounds(fill.bounds, sourceBounds)) continue;
        const feature = this.featuresById.get(fill.featureId);
        if (!feature || isBackgroundOrPageFeature(feature)) continue;
        pickSegments.push({ page, fill, feature, priority: featurePickPriority(feature) - 2 });
      }
      for (const segment of candidates.segments) {
        if (!intersectsBounds(segment.bounds, sourceBounds)) continue;
        const feature = this.featuresById.get(segment.featureId);
        if (!feature || isBackgroundOrPageFeature(feature)) continue;
        pickSegments.push({ page, segment, feature, priority: featurePickPriority(feature) });
      }
    }
    pickSegments.sort((a, b) => a.priority - b.priority);
    for (const { page, segment, fill, image, feature } of pickSegments) {
      if (count + 6 > MAX_PICK_VERTICES) break;
      if (image) {
        const p0 = this.sourceToWorld(page, [image.xMm, image.yMm]);
        const p1 = this.sourceToWorld(page, [image.xMm + image.widthMm, image.yMm]);
        const p2 = this.sourceToWorld(page, [image.xMm, image.yMm + image.heightMm]);
        const p3 = this.sourceToWorld(page, [image.xMm + image.widthMm, image.yMm + image.heightMm]);
        count = writePickTriangle(view, count, p0, p1, p2, image.featureId);
        count = writePickTriangle(view, count, p2, p1, p3, image.featureId);
      } else if (fill) {
        const points = fill.worldPoints || fill.points.map((point) => this.sourceToWorld(page, point));
        count = writePickTriangle(view, count, points[0], points[1], points[2], fill.featureId);
      } else {
        const width = Math.max(this.segmentWorldWidth(page, segment, feature, false), this.scale * 7);
        for (const visibleSegment of this.visibleSegmentParts(page, segment, feature)) {
          if (count + 6 > MAX_PICK_VERTICES) break;
          const a = visibleSegment.worldA || this.sourceToWorld(page, visibleSegment.a);
          const b = visibleSegment.worldB || this.sourceToWorld(page, visibleSegment.b);
          count = writePickStrokeQuad(view, count, a, b, width, segment.featureId);
        }
      }
    }
    if (!count) return 0;
    this.device.queue.writeBuffer(this.pickVertexBuffer, 0, buffer, 0, count * 12);
    return count;
  }

  async gpuPickFeature(page, clientX, clientY) {
    if (this.pickPending) return null;
    const sourcePoint = this.clientToSource(page, clientX, clientY);
    this._pickSourcePointByPage = new Map([[page.id, sourcePoint]]);
    const count = this.writePickVectors([page]);
    this._pickSourcePointByPage = null;
    if (!count) return null;
    this.resize();
    this.writeGlobals();
    this.ensurePickTexture();
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(this.canvas.width - 1, Math.floor((clientX - rect.left) * this.canvas.width / rect.width)));
    const y = Math.max(0, Math.min(this.canvas.height - 1, Math.floor((clientY - rect.top) * this.canvas.height / rect.height)));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.pickTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(this.pickPipeline);
    pass.setBindGroup(0, this.edgeBindGroup);
    pass.setVertexBuffer(0, this.pickVertexBuffer);
    pass.draw(count);
    pass.end();
    encoder.copyTextureToBuffer(
      { texture: this.pickTexture, origin: { x, y } },
      { buffer: this.pickReadBuffer, bytesPerRow: 256, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
    this.pickPending = true;
    this.device.queue.submit([encoder.finish()]);
    try {
      await this.pickReadBuffer.mapAsync(GPUMapMode.READ);
      const id = new DataView(this.pickReadBuffer.getMappedRange()).getUint32(0, true);
      this.pickReadBuffer.unmap();
      return id ? this.featuresById.get(id) || null : null;
    } finally {
      if (this.pickReadBuffer.mapState === "mapped") this.pickReadBuffer.unmap();
      this.pickPending = false;
    }
  }

  hitResidentVectorFeature(page, sourceX, sourceY, tolerance) {
    if (!this.isNativeScene) return null;
    const chunk = this.vectorChunks.get(page.id);
    if (!chunk?.loaded) return null;
    let best = null;
    for (const segment of chunk.segments) {
      const feature = this.featuresById.get(segment.featureId);
      const widthTolerance = Math.max(tolerance, (segment.widthMm || 0) * 0.5 + tolerance * 0.45);
      if (!feature) continue;
      for (const visibleSegment of this.visibleSegmentParts(page, segment, feature)) {
        const distance = pointSegmentDistance([sourceX, sourceY], visibleSegment.a, visibleSegment.b);
        if (distance > widthTolerance) continue;
        const score = distance - featurePickPriority(feature) * 0.025 + (isElectricalFeature(feature) ? 0 : 8);
        if (!best || score < best.score) best = { feature, score };
      }
    }
    return best?.feature || null;
  }

  segmentWorldWidth(page, segment, feature, selected) {
    const sourceWidth = (segment.widthMm || 0.15) / Math.max(1, page.sourceWidthMm) * page.widthMm;
    return Math.max(sourceWidth, this.scale * nativeStrokePixelWidth(feature, segment.kind, selected));
  }

  pan(dx, dy) {
    const ratio = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    this.center[0] -= dx * this.scale * ratio;
    this.center[1] -= dy * this.scale * ratio;
  }

  zoom(delta, clientX, clientY) {
    const before = this.screenToWorld(clientX, clientY);
    this.scale = clamp(this.scale * Math.exp(delta * 0.0015), 0.015, 16);
    const after = this.screenToWorld(clientX, clientY);
    this.center[0] += before[0] - after[0];
    this.center[1] += before[1] - after[1];
  }

  framePage(page) {
    if (!page) return;
    this.resize();
    this.center = [page.worldX + page.widthMm / 2, page.worldY + page.heightMm / 2];
    this.scale = Math.max(
      page.widthMm / Math.max(1, this.canvas.width * 0.88),
      page.heightMm / Math.max(1, this.canvas.height * 0.84),
    );
  }

  frameWorld() {
    this.resize();
    this.center = [
      (this.world.minX + this.world.maxX) / 2,
      (this.world.minY + this.world.maxY) / 2,
    ];
    this.scale = Math.max(
      (this.world.maxX - this.world.minX) / Math.max(1, this.canvas.width * 0.9),
      (this.world.maxY - this.world.minY) / Math.max(1, this.canvas.height * 0.88),
      0.05,
    );
  }
}

function thumbnailPath(page) {
  return page.thumbnail?.path || page.svg;
}

function normalizeFeatureTable(payload) {
  if (payload.schema === "prism.schematic_vector_a0.features") {
    const byId = new Map((payload.features || []).map((feature) => [Number(feature.id), feature]));
    const pages = {};
    for (const [pageId, ids] of Object.entries(payload.pages || {})) {
      pages[pageId] = ids.map((id) => byId.get(Number(id))).filter(Boolean);
    }
    return pages;
  }
  return payload.pages || {};
}

function primitiveGeometry(primitives) {
  const segments = [];
  const fills = [];
  const images = [];
  for (const primitive of primitives) {
    const featureId = Number(primitive.featureId || 0);
    if (!featureId) continue;
    if (primitive.kind === "plotimage" && primitive.image?.path) {
      const xMm = primitive.xMm || 0;
      const yMm = primitive.yMm || 0;
      const widthMm = primitive.widthMm || 0;
      const heightMm = primitive.heightMm || 0;
      images.push({
        featureId,
        kind: primitive.kind,
        xMm,
        yMm,
        widthMm,
        heightMm,
        bounds: [xMm, yMm, xMm + widthMm, yMm + heightMm],
        path: primitive.image.path,
      });
      continue;
    }
    const semanticRole = String(primitive.semanticRole || "");
    const radiusMm = primitive.radiusMm || primitive.diameterMm / 2 || 0;
    const filled = String(primitive.fill || "").toUpperCase() === "FILLED_SHAPE";
    const widthMm = primitive.widthMm || primitive.pen_widthMm || (semanticRole === "junction" ? 0.08 : 0.15);
    const lineStyle = String(primitive.lineStyle || primitive.line_style || "DEFAULT").toUpperCase();
    const color = primitive.color || primitive.strokeColor || primitive.style?.color || "";
    const fillColor = primitive.fillColor || primitive.color || primitive.style?.color || "";
    const add = (a, b) => appendStyledSegment(segments, { featureId, kind: primitive.kind, widthMm, lineStyle, color }, a, b);
    const x1 = primitive.x1Mm;
    const y1 = primitive.y1Mm;
    const x2 = primitive.x2Mm;
    const y2 = primitive.y2Mm;
    if (primitive.trianglesMm?.length) {
      for (const triangle of primitive.trianglesMm) {
        if (Array.isArray(triangle) && triangle.length === 3) {
          fills.push({ featureId, kind: primitive.kind, color: fillColor, points: triangle, bounds: pointsBounds(triangle) });
        }
      }
      if (primitive.pointsMm?.length >= 2) {
        for (let index = 1; index < primitive.pointsMm.length; index += 1) {
          add(primitive.pointsMm[index - 1], primitive.pointsMm[index]);
        }
        if (shouldClosePolyline(primitive)) {
          add(primitive.pointsMm[primitive.pointsMm.length - 1], primitive.pointsMm[0]);
        }
      }
    } else if (primitive.pointsMm?.length >= 2) {
      if (filled && primitive.pointsMm.length >= 3) appendPolygonFan(fills, featureId, primitive.kind, primitive.pointsMm, fillColor);
      for (let index = 1; index < primitive.pointsMm.length; index += 1) {
        add(primitive.pointsMm[index - 1], primitive.pointsMm[index]);
      }
      if (shouldClosePolyline(primitive)) {
        add(primitive.pointsMm[primitive.pointsMm.length - 1], primitive.pointsMm[0]);
      }
    } else if (primitive.polylinesMm?.length) {
      for (const polyline of primitive.polylinesMm) {
        if (!Array.isArray(polyline) || polyline.length < 2) continue;
        for (let index = 1; index < polyline.length; index += 1) add(polyline[index - 1], polyline[index]);
      }
    } else if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
      if (primitive.kind === "rect") {
        if (filled) appendRectFill(fills, featureId, primitive.kind, [x1, y1, x2, y2], fillColor);
        add([x1, y1], [x2, y1]);
        add([x2, y1], [x2, y2]);
        add([x2, y2], [x1, y2]);
        add([x1, y2], [x1, y1]);
      } else {
        add([x1, y1], [x2, y2]);
      }
    } else if (Number.isFinite(primitive.cxMm) && Number.isFinite(primitive.cyMm)) {
      const radius = primitive.radiusMm || primitive.diameterMm / 2 || 0.4;
      if (filled) appendCircleFill(fills, featureId, primitive.kind, [primitive.cxMm, primitive.cyMm], radius, fillColor);
      appendCircle(segments, { featureId, kind: primitive.kind, widthMm, lineStyle, color }, [primitive.cxMm, primitive.cyMm], radius);
    } else if (primitive.contoursMm?.length) {
      for (const contour of primitive.contoursMm) {
        if (!Array.isArray(contour) || contour.length < 2) continue;
        for (let index = 1; index < contour.length; index += 1) add(contour[index - 1], contour[index]);
        add(contour[contour.length - 1], contour[0]);
      }
    } else if (
      Number.isFinite(primitive.start_xMm)
      && Number.isFinite(primitive.start_yMm)
      && Number.isFinite(primitive.end_xMm)
      && Number.isFinite(primitive.end_yMm)
    ) {
      if (Number.isFinite(primitive.mid_xMm) && Number.isFinite(primitive.mid_yMm)) {
        add([primitive.start_xMm, primitive.start_yMm], [primitive.mid_xMm, primitive.mid_yMm]);
        add([primitive.mid_xMm, primitive.mid_yMm], [primitive.end_xMm, primitive.end_yMm]);
      } else {
        add([primitive.start_xMm, primitive.start_yMm], [primitive.end_xMm, primitive.end_yMm]);
      }
    } else if (
      Number.isFinite(primitive.start_xMm)
      && Number.isFinite(primitive.start_yMm)
      && Number.isFinite(primitive.mid_xMm)
      && Number.isFinite(primitive.mid_yMm)
      && Number.isFinite(primitive.end_xMm)
      && Number.isFinite(primitive.end_yMm)
    ) {
      add([primitive.start_xMm, primitive.start_yMm], [primitive.mid_xMm, primitive.mid_yMm]);
      add([primitive.mid_xMm, primitive.mid_yMm], [primitive.end_xMm, primitive.end_yMm]);
    } else if (primitive.boundsMm && primitive.kind !== "text") {
      const [left, top, right, bottom] = primitive.boundsMm;
      add([left, top], [right, top]);
      add([right, top], [right, bottom]);
      add([right, bottom], [left, bottom]);
      add([left, bottom], [left, top]);
    }
  }
  return { segments, fills, images };
}

function prepareWorldGeometry(page, geometry) {
  for (const segment of geometry.segments || []) {
    segment.worldA = sourceToWorldPoint(page, segment.a);
    segment.worldB = sourceToWorldPoint(page, segment.b);
  }
  for (const fill of geometry.fills || []) {
    fill.worldPoints = fill.points.map((point) => sourceToWorldPoint(page, point));
  }
  for (const image of geometry.images || []) {
    image.worldOrigin = sourceToWorldPoint(page, [image.xMm, image.yMm]);
    image.worldSize = sourceSizeToWorld(page, image.widthMm, image.heightMm);
  }
}

function sourceToWorldPoint(page, point) {
  return [
    page.worldX + point[0] / page.sourceWidthMm * page.widthMm,
    page.worldY + point[1] / page.sourceHeightMm * page.heightMm,
  ];
}

function sourceSizeToWorld(page, widthMm, heightMm) {
  return [
    widthMm / page.sourceWidthMm * page.widthMm,
    heightMm / page.sourceHeightMm * page.heightMm,
  ];
}

function appendRectFill(fills, featureId, kind, bounds, color) {
  const [left, top, right, bottom] = bounds;
  fills.push(
    { featureId, kind, color, points: [[left, top], [right, top], [left, bottom]], bounds: [left, top, right, bottom] },
    { featureId, kind, color, points: [[left, bottom], [right, top], [right, bottom]], bounds: [left, top, right, bottom] },
  );
}

function appendCircleFill(fills, featureId, kind, center, radius, color) {
  const steps = 36;
  for (let index = 0; index < steps; index += 1) {
    const a = index / steps * Math.PI * 2;
    const b = (index + 1) / steps * Math.PI * 2;
    fills.push({
      featureId,
      kind,
      color,
      points: [
        center,
        [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius],
        [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius],
      ],
      bounds: [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
    });
  }
}

function appendPolygonFan(fills, featureId, kind, points, color) {
  const anchor = points[0];
  const bounds = pointsBounds(points);
  for (let index = 2; index < points.length; index += 1) {
    fills.push({ featureId, kind, color, points: [anchor, points[index - 1], points[index]], bounds });
  }
}

function appendStyledSegment(segments, segment, a, b) {
  const bounds = segmentBounds(a, b, segment.widthMm || 0.15);
  const style = segment.lineStyle || "DEFAULT";
  if (!["DASH", "DASHED", "DOT", "DOTTED", "DASHDOT", "DASH_DOT"].includes(style)) {
    segments.push({ ...segment, a, b, bounds });
    return;
  }
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const ux = dx / length;
  const uy = dy / length;
  const unit = Math.max(segment.widthMm * 4, 0.45);
  const pattern = style.includes("DOT")
    ? [unit * 0.8, unit * 0.75, unit * 3.0, unit * 0.75]
    : [unit * 3.0, unit * 1.5];
  let offset = 0;
  let patternIndex = 0;
  while (offset < length) {
    const span = Math.min(pattern[patternIndex % pattern.length], length - offset);
    if (patternIndex % 2 === 0) {
      const start = [a[0] + ux * offset, a[1] + uy * offset];
      const end = [a[0] + ux * (offset + span), a[1] + uy * (offset + span)];
      segments.push({ ...segment, a: start, b: end, bounds: segmentBounds(start, end, segment.widthMm || 0.15) });
    }
    offset += span;
    patternIndex += 1;
  }
}

function appendCircle(segments, segment, center, radius) {
  const steps = 32;
  for (let index = 0; index < steps; index += 1) {
    const a = index / steps * Math.PI * 2;
    const b = (index + 1) / steps * Math.PI * 2;
    segments.push({
      ...segment,
      a: [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius],
      b: [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius],
      bounds: [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
    });
  }
}

function pointsBounds(points, pad = 0) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points || []) {
    left = Math.min(left, point[0]);
    top = Math.min(top, point[1]);
    right = Math.max(right, point[0]);
    bottom = Math.max(bottom, point[1]);
  }
  if (!Number.isFinite(left)) return [0, 0, 0, 0];
  return [left - pad, top - pad, right + pad, bottom + pad];
}

function segmentBounds(a, b, widthMm = 0) {
  const pad = Math.max(0.05, widthMm * 0.5);
  return [
    Math.min(a[0], b[0]) - pad,
    Math.min(a[1], b[1]) - pad,
    Math.max(a[0], b[0]) + pad,
    Math.max(a[1], b[1]) + pad,
  ];
}

function intersectsBounds(a, b) {
  if (!a || !b) return true;
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function buildSpatialIndex(geometry) {
  const index = {
    cellSize: VECTOR_TILE_SIZE_MM,
    cells: new Map(),
    segments: geometry.segments || [],
    fills: geometry.fills || [],
    images: geometry.images || [],
    queryId: 0,
  };
  for (const item of index.segments) addSpatialItem(index, "segments", item);
  for (const item of index.fills) addSpatialItem(index, "fills", item);
  for (const item of index.images) addSpatialItem(index, "images", item);
  return index;
}

function addSpatialItem(index, bucketName, item) {
  const bounds = item.bounds;
  if (!bounds) return;
  const minX = Math.floor(bounds[0] / index.cellSize);
  const maxX = Math.floor(bounds[2] / index.cellSize);
  const minY = Math.floor(bounds[1] / index.cellSize);
  const maxY = Math.floor(bounds[3] / index.cellSize);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const key = `${x}:${y}`;
      let cell = index.cells.get(key);
      if (!cell) {
        cell = { segments: [], fills: [], images: [] };
        index.cells.set(key, cell);
      }
      cell[bucketName].push(item);
    }
  }
}

function querySpatialIndex(index, bounds) {
  if (!index) return { segments: [], fills: [], images: [] };
  index.queryId = (index.queryId || 0) + 1;
  const queryId = index.queryId;
  const result = { segments: [], fills: [], images: [] };
  const minX = Math.floor(bounds[0] / index.cellSize);
  const maxX = Math.floor(bounds[2] / index.cellSize);
  const minY = Math.floor(bounds[1] / index.cellSize);
  const maxY = Math.floor(bounds[3] / index.cellSize);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cell = index.cells.get(`${x}:${y}`);
      if (!cell) continue;
      collectSpatialItems(cell.segments, result.segments, queryId, "segments");
      collectSpatialItems(cell.fills, result.fills, queryId, "fills");
      collectSpatialItems(cell.images, result.images, queryId, "images");
    }
  }
  return result;
}

function collectSpatialItems(items, output, queryId, bucketName) {
  const marker = `_${bucketName}QueryId`;
  for (const item of items) {
    if (item[marker] === queryId) continue;
    item[marker] = queryId;
    output.push(item);
  }
}

function shouldClosePolyline(primitive) {
  const kind = String(primitive.kind || "");
  const filled = String(primitive.fill || "").toUpperCase() === "FILLED_SHAPE";
  if (filled || primitive.closed === true) return true;
  if (["polygon", "fill"].includes(kind)) return true;
  const points = primitive.pointsMm || [];
  if (points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    return Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6;
  }
  return false;
}

function isElectricalFeature(feature) {
  return Boolean(feature?.netUid);
}

function isNetTrackingAnchor(feature) {
  const kind = String(feature?.kind || "");
  const role = String(feature?.semanticRole || "");
  if (kind === "pin" || kind === "pin_body") return true;
  if (kind === "label" || kind === "global_label" || kind === "hierarchical_label") return true;
  if (kind === "netclass_flag" || kind === "power_symbol" || kind === "power_port") return true;
  if (role === "label" || role === "global_label" || role === "hierarchical_label") return true;
  return false;
}

function netTrackingAnchorPriority(feature) {
  const kind = String(feature?.kind || "");
  const role = String(feature?.semanticRole || "");
  if (kind === "global_label" || role === "global_label") return 130;
  if (kind === "hierarchical_label" || role === "hierarchical_label") return 125;
  if (kind === "label" || role === "label") return 118;
  if (kind === "pin" || kind === "pin_body") return 106;
  if (kind === "power_symbol" || kind === "power_port" || kind === "netclass_flag") return 98;
  return 50;
}

function limitAnchorsForTracking(anchors) {
  if (anchors.length <= MAX_NET_TRACKING_ANCHORS_PER_PAGE) return anchors;
  const limited = anchors.slice(0, MAX_NET_TRACKING_ANCHORS_PER_PAGE);
  limited.sort((a, b) => a.source[1] - b.source[1] || a.source[0] - b.source[0]);
  return limited;
}

function representativeNetAnchor(page, anchors, selected = {}) {
  if (!page || !anchors?.length) return null;
  const selectedAnchor = selected.featureId || selected.stableKey || selected.sourceId
    ? anchors.find((anchor) =>
      (selected.featureId && Number(anchor.featureId || 0) === Number(selected.featureId))
      || (selected.stableKey && anchor.stableKey === selected.stableKey)
      || (selected.sourceId && anchor.sourceId === selected.sourceId))
    : null;
  if (selectedAnchor) {
    return {
      ...selectedAnchor,
      kind: "selected-net-occurrence",
      priority: 200,
    };
  }
  const preferred = anchors
    .filter((anchor) => anchor.priority >= 118)
    .slice(0, 16);
  const candidates = preferred.length ? preferred : anchors.slice(0, 16);
  let x = 0;
  let y = 0;
  for (const anchor of candidates) {
    x += anchor.world[0];
    y += anchor.world[1];
  }
  const point = [x / candidates.length, y / candidates.length];
  return {
    pageId: page.id,
    featureId: candidates[0]?.featureId || 0,
    kind: "page-net-occurrence",
    source: [0, 0],
    world: point,
    bounds: [point[0], point[1], point[0], point[1]],
    priority: 1,
  };
}

function nearestNeighborAnchorSegments(anchors, type, pageId) {
  if (!anchors || anchors.length < 2) return [];
  const remaining = anchors
    .map((anchor) => ({ ...anchor }))
    .sort((a, b) => a.world[1] - b.world[1] || a.world[0] - b.world[0]);
  const segments = [];
  let current = remaining.shift();
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = Math.hypot(candidate.world[0] - current.world[0], candidate.world[1] - current.world[1]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    const next = remaining.splice(bestIndex, 1)[0];
    segments.push({
      type,
      pageId: pageId || current.pageId || next.pageId || "",
      a: current.world,
      b: next.world,
      sourceFeatureIds: [current.featureId, next.featureId].filter(Boolean),
    });
    current = next;
  }
  return segments;
}

function segmentWorldBounds(segment, pad = 0) {
  return [
    Math.min(segment.a[0], segment.b[0]) - pad,
    Math.min(segment.a[1], segment.b[1]) - pad,
    Math.max(segment.a[0], segment.b[0]) + pad,
    Math.max(segment.a[1], segment.b[1]) + pad,
  ];
}

function featurePickPriority(feature) {
  const kind = String(feature?.kind || "");
  const semantic = String(feature?.semanticRole || "");
  const role = semantic || kind;
  if (role === "pin_number" || role === "pin_name") return 120;
  if (role === "pin_body" || kind === "pin") return 110;
  if (role === "symbol_reference" || role === "symbol_value") return 92;
  if (kind === "junction" || kind === "no_connect") return 88;
  if (kind === "wire" || kind === "bus" || kind === "bus_entry") return 78;
  if (role === "symbol_body" || kind === "symbol_body") return 45;
  if (kind === "symbol_instance" || kind === "symbol_overplot") return 30;
  if (kind === "text" || String(role).includes("text")) return 24;
  return 10;
}

function isBackgroundOrPageFeature(feature) {
  const kind = String(feature?.kind || "");
  const semantic = String(feature?.semanticRole || "");
  if (kind === "page" || kind === "sheet_header") return true;
  if (kind === "graphic_rect" && semantic === "graphic_rect" && !feature?.netUid && !feature?.componentUid) {
    const bounds = feature.boundsMm || [];
    return (bounds[2] - bounds[0]) > 150 && (bounds[3] - bounds[1]) > 120;
  }
  return false;
}

function parseColor(color) {
  if (!color || typeof color !== "string") return null;
  const value = color.trim();
  const match = value.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!match) return null;
  const hex = match[1];
  const alpha = match[2] ?? "ff";
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
    parseInt(alpha, 16) / 255,
  ];
}

function vectorColor(feature, primitiveKind, sourceColor = "") {
  const parsed = parseColor(sourceColor || feature?.color || "");
  if (feature?.kind === "dnp_marker") return parsed || [0.86, 0.04, 0.05, 0.85];
  if (feature?.dnp && ["symbol_reference", "symbol_value", "symbol_text"].includes(String(feature?.kind || ""))) {
    return [0.50, 0.52, 0.54, 0.56];
  }
  if (parsed) return parsed;
  if (feature?.dnp) return [0.50, 0.52, 0.54, 0.56];
  if (isElectricalFeature(feature)) return [0.12, 0.56, 0.2, 0.96];
  if (feature?.kind === "pin_name") return [0.0, 0.28, 0.31, 0.96];
  if (feature?.kind === "pin_number") return [0.45, 0.17, 0.16, 0.96];
  if (feature?.kind === "pin_body") return [0.28, 0.18, 0.18, 0.88];
  if (feature?.kind === "symbol_body" || feature?.kind === "symbol_instance") return [0.42, 0.18, 0.18, 0.72];
  if (feature?.kind === "symbol_reference" || feature?.kind === "symbol_value") return [0.05, 0.13, 0.16, 0.94];
  if (feature?.kind === "text" || String(primitiveKind || "").startsWith("text")) return [0.05, 0.13, 0.16, 0.94];
  return [0.16, 0.17, 0.19, 0.7];
}

function mutedVectorColor(feature, primitiveKind, sourceColor = "") {
  const color = vectorColor(feature, primitiveKind, sourceColor);
  return [color[0] * 0.72, color[1] * 0.72, color[2] * 0.72, Math.min(color[3], 0.38)];
}

function nativeStrokePixelWidth(feature, primitiveKind, selected) {
  if (selected) return 5.5;
  if (feature?.kind === "dnp_marker") return 3.0;
  if (["pin_name", "pin_number"].includes(String(feature?.kind || ""))) return 1.5;
  if (feature?.kind === "pin_body") return 1.7;
  if (String(primitiveKind || "").startsWith("text")) return 1.35;
  if (primitiveKind === "bus" || feature?.kind === "bus") return 4.2;
  if (isElectricalFeature(feature)) return 2.6;
  if (feature?.kind === "symbol_body" || feature?.kind === "symbol_instance" || feature?.kind === "sheet") return 1.5;
  return 1.25;
}

function appendStrokeQuad(values, a, b, width, color) {
  const quad = strokeQuadPoints(a, b, width);
  if (!quad) return;
  for (const point of quad) values.push(point[0], point[1], ...color);
}

function appendFilledTriangle(values, a, b, c, color) {
  values.push(a[0], a[1], ...color);
  values.push(b[0], b[1], ...color);
  values.push(c[0], c[1], ...color);
}

function writeVectorVertex(values, offset, point, color) {
  values[offset++] = point[0];
  values[offset++] = point[1];
  values[offset++] = color[0];
  values[offset++] = color[1];
  values[offset++] = color[2];
  values[offset++] = color[3];
  return offset;
}

function writeStrokeQuad(values, offset, a, b, width, color) {
  const quad = strokeQuadPoints(a, b, width);
  if (!quad) return offset;
  for (const point of quad) offset = writeVectorVertex(values, offset, point, color);
  return offset;
}

function writeFilledTriangle(values, offset, a, b, c, color) {
  offset = writeVectorVertex(values, offset, a, color);
  offset = writeVectorVertex(values, offset, b, color);
  offset = writeVectorVertex(values, offset, c, color);
  return offset;
}

function writeFlowVertex(values, offset, point, distancePx, kind) {
  values[offset++] = point[0];
  values[offset++] = point[1];
  values[offset++] = distancePx;
  values[offset++] = kind;
  return offset;
}

function writeFlowQuad(values, offset, a, b, width, kind, distanceStartPx, scale) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6 || offset + 24 > values.length) return offset;
  const half = width * 0.5;
  const tx = dx / length;
  const ty = dy / length;
  const nx = -ty * half;
  const ny = tx * half;
  const p0 = [a[0] + nx, a[1] + ny];
  const p1 = [a[0] - nx, a[1] - ny];
  const p2 = [b[0] + nx, b[1] + ny];
  const p3 = [b[0] - nx, b[1] - ny];
  const distanceEndPx = distanceStartPx + length / Math.max(scale, 1e-6);
  offset = writeFlowVertex(values, offset, p0, distanceStartPx, kind);
  offset = writeFlowVertex(values, offset, p1, distanceStartPx, kind);
  offset = writeFlowVertex(values, offset, p2, distanceEndPx, kind);
  offset = writeFlowVertex(values, offset, p2, distanceEndPx, kind);
  offset = writeFlowVertex(values, offset, p1, distanceStartPx, kind);
  offset = writeFlowVertex(values, offset, p3, distanceEndPx, kind);
  return offset;
}

function strokeQuadPoints(a, b, width) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const half = width * 0.5;
  const tx = dx / length * half;
  const ty = dy / length * half;
  const nx = -dy / length * half;
  const ny = dx / length * half;
  const start = [a[0] - tx, a[1] - ty];
  const end = [b[0] + tx, b[1] + ty];
  const p0 = [start[0] + nx, start[1] + ny];
  const p1 = [start[0] - nx, start[1] - ny];
  const p2 = [end[0] + nx, end[1] + ny];
  const p3 = [end[0] - nx, end[1] - ny];
  return [p0, p1, p2, p2, p1, p3];
}

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared, 0, 1);
  const x = a[0] + dx * t;
  const y = a[1] + dy * t;
  return Math.hypot(point[0] - x, point[1] - y);
}

function clipSegmentOutsideBounds(segment, bounds) {
  const [left, top, right, bottom] = bounds;
  const [ax, ay] = segment.a;
  const [bx, by] = segment.b;
  const eps = 1e-6;
  const make = (a, b) => ({ ...segment, a, b });

  if (Math.abs(ay - by) <= eps) {
    const y = ay;
    if (y < top - eps || y > bottom + eps) return [segment];
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const overlapStart = Math.max(minX, left);
    const overlapEnd = Math.min(maxX, right);
    if (overlapEnd <= overlapStart + eps) return [segment];
    const parts = [];
    const ascending = ax <= bx;
    if (minX < overlapStart - eps) {
      const a = ascending ? [minX, y] : [overlapStart, y];
      const b = ascending ? [overlapStart, y] : [minX, y];
      parts.push(make(a, b));
    }
    if (overlapEnd < maxX - eps) {
      const a = ascending ? [overlapEnd, y] : [maxX, y];
      const b = ascending ? [maxX, y] : [overlapEnd, y];
      parts.push(make(a, b));
    }
    return parts;
  }

  if (Math.abs(ax - bx) <= eps) {
    const x = ax;
    if (x < left - eps || x > right + eps) return [segment];
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    const overlapStart = Math.max(minY, top);
    const overlapEnd = Math.min(maxY, bottom);
    if (overlapEnd <= overlapStart + eps) return [segment];
    const parts = [];
    const ascending = ay <= by;
    if (minY < overlapStart - eps) {
      const a = ascending ? [x, minY] : [x, overlapStart];
      const b = ascending ? [x, overlapStart] : [x, minY];
      parts.push(make(a, b));
    }
    if (overlapEnd < maxY - eps) {
      const a = ascending ? [x, overlapEnd] : [x, maxY];
      const b = ascending ? [x, maxY] : [x, overlapEnd];
      parts.push(make(a, b));
    }
    return parts;
  }

  return [segment];
}

function writePickVertex(view, index, point, featureId) {
  const offset = index * 12;
  view.setFloat32(offset, point[0], true);
  view.setFloat32(offset + 4, point[1], true);
  view.setUint32(offset + 8, featureId, true);
}

function writePickStrokeQuad(view, index, a, b, width, featureId) {
  const quad = strokeQuadPoints(a, b, width);
  if (!quad) return index;
  for (const point of quad) {
    writePickVertex(view, index, point, featureId);
    index += 1;
  }
  return index;
}

function writePickTriangle(view, index, a, b, c, featureId) {
  writePickVertex(view, index, a, featureId);
  writePickVertex(view, index + 1, b, featureId);
  writePickVertex(view, index + 2, c, featureId);
  return index + 3;
}
