// Harness tubes on the GPU (System Builder SB2-44, CONTRACTS_P2 §20.15).
//
// `setTubes` uploads the samples and the index buffer (tube-mesh.js packs
// them); the next frame's compute pass rebuilds the mesh: `frames` walks each
// segment's samples once for its rotation-minimising normals (double
// reflection), then `rings` writes every vertex in parallel. The draw shares
// the scene's render pass and depth buffer, so tubes and boards hide each
// other properly. Colours live in their own small buffer: lighting a net only
// rewrites that.

import { RING_SEGMENTS, packTubes } from "./tube-mesh.js";

const COMMON = /* wgsl */ `
struct Segment { start: u32, count: u32, vertexStart: u32, color: u32, radius: f32, p0: u32, p1: u32, p2: u32 };
struct Vertex { position: vec4f, normal: vec4f };
`;

const COMPUTE = /* wgsl */ `${COMMON}
const RING: u32 = ${RING_SEGMENTS}u;
const TAU: f32 = 6.283185307179586;
@group(0) @binding(0) var<storage, read> samples: array<vec4f>;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
@group(0) @binding(2) var<storage, read_write> frames: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vertices: array<Vertex>;
@group(0) @binding(4) var<uniform> counts: vec4u; // segments, samples, vertices

fn safeNormalize(v: vec3f) -> vec3f {
  let length = sqrt(dot(v, v));
  return select(vec3f(0.0, 0.0, 1.0), v / length, length > 1e-12);
}
fn point(s: Segment, i: u32) -> vec3f { return samples[s.start + i].xyz; }
fn tangent(s: Segment, i: u32) -> vec3f {
  let a = point(s, select(i - 1u, 0u, i == 0u));
  let b = point(s, min(i + 1u, s.count - 1u));
  return safeNormalize(b - a);
}
fn perpendicularTo(t: vec3f) -> vec3f {
  let a = abs(t);
  var axis = vec3f(0.0, 0.0, 1.0);
  if (a.x <= a.y && a.x <= a.z) { axis = vec3f(1.0, 0.0, 0.0); } else if (a.y <= a.z) { axis = vec3f(0.0, 1.0, 0.0); }
  return safeNormalize(cross(t, axis));
}

@compute @workgroup_size(64) fn framesMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= counts.x) { return; }
  let s = segments[id.x];
  var r = perpendicularTo(tangent(s, 0u));
  frames[s.start] = vec4f(r, 0.0);
  for (var i = 0u; i + 1u < s.count; i++) {
    let v1 = point(s, i + 1u) - point(s, i);
    let c1 = dot(v1, v1);
    if (c1 >= 1e-24) {
      let rL = r - (2.0 / c1) * dot(v1, r) * v1;
      let tL = tangent(s, i) - (2.0 / c1) * dot(v1, tangent(s, i)) * v1;
      let v2 = tangent(s, i + 1u) - tL;
      let c2 = dot(v2, v2);
      r = safeNormalize(select(rL - (2.0 / c2) * dot(v2, rL) * v2, rL, c2 < 1e-24));
    }
    frames[s.start + i + 1u] = vec4f(r, 0.0);
  }
}

fn segmentOf(vertex: u32) -> u32 {
  var low = 0u;
  var high = counts.x - 1u;
  loop {
    if (low >= high) { break; }
    let middle = (low + high + 1u) / 2u;
    if (segments[middle].vertexStart <= vertex) { low = middle; } else { high = middle - 1u; }
  }
  return low;
}

@compute @workgroup_size(64) fn ringsMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= counts.z) { return; }
  let index = segmentOf(id.x);
  let s = segments[index];
  let local = id.x - s.vertexStart;
  let ringVertices = s.count * RING;
  var position: vec3f;
  var normal: vec3f;
  if (local < ringVertices) {
    let i = local / RING;
    let angle = TAU * f32(local % RING) / f32(RING);
    let t = tangent(s, i);
    let r = frames[s.start + i].xyz;
    normal = cos(angle) * r + sin(angle) * cross(t, r);
    position = point(s, i) + s.radius * normal;
  } else if (local == ringVertices) {
    normal = -tangent(s, 0u);
    position = point(s, 0u);
  } else {
    normal = tangent(s, s.count - 1u);
    position = point(s, s.count - 1u);
  }
  vertices[id.x] = Vertex(vec4f(position, bitcast<f32>(s.color)), vec4f(normal, 0.0));
}
`;

const DRAW = /* wgsl */ `
struct Globals { viewProjection: mat4x4f, light: vec4f, time: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
@group(0) @binding(1) var<storage, read> colors: array<vec4f>; // rgb, mode: 0 idle, 1 lit, 2 dim

struct Out {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) @interpolate(flat) color: u32,
};
@vertex fn vs(@location(0) position: vec4f, @location(1) normal: vec4f) -> Out {
  var out: Out;
  out.position = globals.viewProjection * vec4f(position.xyz, 1.0);
  out.normal = normal.xyz;
  out.color = bitcast<u32>(position.w);
  return out;
}
@fragment fn fs(input: Out) -> @location(0) vec4f {
  let entry = colors[input.color];
  let mode = u32(entry.a + 0.5);
  var base = entry.rgb;
  if (mode == 1u) { base = base * (0.9 + 0.1 * sin(globals.time.x * 3.2)); }
  if (mode == 2u) { base = mix(base, vec3f(0.62, 0.64, 0.67), 0.7); }
  let n = normalize(input.normal);
  let diffuse = max(dot(n, normalize(globals.light.xyz)), 0.0);
  let hemi = mix(0.35, 0.7, n.z * 0.5 + 0.5);
  let lit = base * (hemi + 0.6 * diffuse);
  return vec4f(select(lit, max(lit, base * 0.95), mode == 1u), 1.0);
}
`;

const GLOBAL_BYTES = 96;

export class TubeRenderer {
  /** `host` is the scene's host `Renderer`: device, colour format and depth state. */
  constructor(host) {
    this.host = host;
    this.device = host.device;
    this.counts = { segments: 0, samples: 0, vertices: 0, indices: 0 };
    this.dirty = false;
    this.kept = [];
    const device = this.device;
    const computeModule = device.createShaderModule({ label: "harness-tubes-compute", code: COMPUTE });
    this.computeLayout = device.createBindGroupLayout({
      label: "harness-tubes-compute",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });
    const computePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] });
    this.framesPipeline = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: computeModule, entryPoint: "framesMain" } });
    this.ringsPipeline = device.createComputePipeline({ layout: computePipelineLayout, compute: { module: computeModule, entryPoint: "ringsMain" } });
    const drawModule = device.createShaderModule({ label: "harness-tubes-draw", code: DRAW });
    this.drawLayout = device.createBindGroupLayout({
      label: "harness-tubes-draw",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ],
    });
    this.drawPipeline = device.createRenderPipeline({
      label: "harness-tubes",
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.drawLayout] }),
      vertex: {
        module: drawModule,
        entryPoint: "vs",
        buffers: [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }, { shaderLocation: 1, offset: 16, format: "float32x4" }] }],
      },
      fragment: { module: drawModule, entryPoint: "fs", targets: [{ format: host.format }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: host.depthStencilState(),
      multisample: { count: host.sampleCount },
    });
    this.globals = device.createBuffer({ label: "harness-tubes-globals", size: GLOBAL_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.countBuffer = device.createBuffer({ label: "harness-tubes-counts", size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.buffers = {};
    this.capacity = { samples: 0, segments: 0, vertices: 0, indices: 0 };
    this.globalScratch = new Float32Array(GLOBAL_BYTES / 4);
  }

  /** A buffer of at least `bytes`, grown by half again when it must grow. */
  ensure(name, bytes, usage) {
    const current = this.buffers[name];
    if (current && current.size >= bytes) return false;
    current?.destroy();
    this.buffers[name] = this.device.createBuffer({ label: `harness-tubes-${name}`, size: Math.max(256, Math.ceil(bytes * 1.5 / 4) * 4), usage });
    return true;
  }

  /**
   * The tubes to draw (`{samplesMm, radiusMm}` each) and their colours
   * (`colorOf(tube) → {rgb: [r, g, b], mode: 0 | 1 | 2}`).
   */
  setTubes(tubes, colorOf) {
    const packed = packTubes(tubes);
    this.kept = packed.kept.map((index) => tubes[index]);
    this.counts = { segments: packed.kept.length, samples: packed.sampleCount, vertices: packed.vertexCount, indices: packed.indexCount };
    if (!this.counts.segments) {
      this.dirty = false;
      return;
    }
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    let rebind = false;
    rebind = this.ensure("samples", packed.samples.byteLength, usage) || rebind;
    rebind = this.ensure("segments", packed.segments.byteLength, usage) || rebind;
    rebind = this.ensure("frames", packed.samples.byteLength, GPUBufferUsage.STORAGE) || rebind;
    rebind = this.ensure("vertices", this.counts.vertices * 32, GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX) || rebind;
    this.ensure("indices", packed.indices.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
    const queue = this.device.queue;
    queue.writeBuffer(this.buffers.samples, 0, packed.samples);
    queue.writeBuffer(this.buffers.segments, 0, packed.segments);
    queue.writeBuffer(this.buffers.indices, 0, packed.indices);
    queue.writeBuffer(this.countBuffer, 0, new Uint32Array([this.counts.segments, this.counts.samples, this.counts.vertices, 0]));
    if (rebind || !this.computeGroup) {
      this.computeGroup = this.device.createBindGroup({
        layout: this.computeLayout,
        entries: ["samples", "segments", "frames", "vertices"].map((name, binding) => ({ binding, resource: { buffer: this.buffers[name] } }))
          .concat([{ binding: 4, resource: { buffer: this.countBuffer } }]),
      });
    }
    this.setColors(colorOf);
    this.dirty = true;
  }

  /** Recolour the tubes set last (a net lit or cleared): only the small colour buffer changes. */
  setColors(colorOf) {
    if (!this.counts.segments) return;
    const data = new Float32Array(this.counts.segments * 4);
    this.kept.forEach((tube, index) => {
      const { rgb, mode } = colorOf(tube);
      data.set([rgb[0], rgb[1], rgb[2], mode], index * 4);
    });
    if (this.ensure("colors", data.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) || !this.drawGroup || this.drawGroupColors !== this.buffers.colors) {
      this.drawGroup = this.device.createBindGroup({
        layout: this.drawLayout,
        entries: [{ binding: 0, resource: { buffer: this.globals } }, { binding: 1, resource: { buffer: this.buffers.colors } }],
      });
      this.drawGroupColors = this.buffers.colors;
    }
    this.device.queue.writeBuffer(this.buffers.colors, 0, data);
  }

  /** Rebuild the mesh in `encoder` when the tubes changed since the last frame. */
  encodeCompute(encoder) {
    if (!this.dirty || !this.counts.segments) return;
    const pass = encoder.beginComputePass({ label: "harness-tubes" });
    pass.setBindGroup(0, this.computeGroup);
    pass.setPipeline(this.framesPipeline);
    pass.dispatchWorkgroups(Math.ceil(this.counts.segments / 64));
    pass.setPipeline(this.ringsPipeline);
    pass.dispatchWorkgroups(Math.ceil(this.counts.vertices / 64));
    pass.end();
    this.dirty = false;
  }

  /** Draw into the scene's open pass; returns the triangles drawn. */
  draw(pass, viewProjection, time = 0) {
    if (!this.counts.segments) return 0;
    const g = this.globalScratch;
    g.fill(0);
    g.set(viewProjection, 0);
    g.set([0.35, -0.45, 0.82, 0], 16);
    g[20] = time;
    this.device.queue.writeBuffer(this.globals, 0, g);
    pass.setPipeline(this.drawPipeline);
    pass.setBindGroup(0, this.drawGroup);
    pass.setVertexBuffer(0, this.buffers.vertices);
    pass.setIndexBuffer(this.buffers.indices, "uint32");
    pass.drawIndexed(this.counts.indices);
    return this.counts.indices / 3;
  }

  gpuMemoryBytes() {
    return Object.values(this.buffers).reduce((sum, buffer) => sum + buffer.size, 0);
  }

  dispose() {
    for (const buffer of Object.values(this.buffers)) buffer.destroy();
    this.globals.destroy();
    this.countBuffer.destroy();
    this.buffers = {};
  }
}
