// In-page half of the analytic perf harness. Injected before any page script
// (Page.addScriptToEvaluateOnNewDocument), so its wrappers are in place when
// the viewer asks for its device. The viewer itself is unchanged.
//
// Per queue submission it records:
//   - GPU time: timestamp queries on every render and compute pass, summed
//     (requests "timestamp-query" when the adapter has it);
//   - commands: draws (direct and indirect), vertices of direct draws,
//     setPipeline, setBindGroup, setStencilReference, setScissorRect, bundles
//     executed, passes;
//   - uploads: writeBuffer and writeTexture calls and bytes;
//   - allocations: buffers, textures, bind groups, pipelines created.
// Per animation frame it records the frame callback's CPU time (the encode).
(() => {
  if (!globalThis.GPUAdapter || globalThis.__gpuMeter) return;
  const fresh = () => ({
    passes: 0, computePasses: 0, draws: 0, indirectDraws: 0, vertices: 0,
    pipelines: 0, bindGroupsSet: 0, stencilRefs: 0, scissors: 0, bundles: 0,
    writeBuffers: 0, writeBufferBytes: 0, writeTextures: 0, writeTextureBytes: 0,
    createdBuffers: 0, createdTextures: 0, createdBindGroups: 0, createdPipelines: 0,
  });
  const meter = (globalThis.__gpuMeter = {
    enabled: false,
    samples: [], // per submit: { at, gpuMs, ...counts }
    frames: [], // per rAF frame that ran: { at, cpuMs }
    pending: 0,
    counts: fresh(),
    drawnFrames: 0,
    pendingDraws: 0,
    wanted: null,
    timestamps: false,
    reset() {
      this.samples = [];
      this.frames = [];
      this.counts = fresh();
    },
    async drain() {
      for (let i = 0; i < 1000 && this.pending; i += 1) await new Promise((r) => setTimeout(r, 10));
    },
  });
  const bump = (key, by = 1) => {
    if (meter.enabled) meter.counts[key] += by;
  };
  const wrap = (proto, name, before) => {
    const native = proto?.[name];
    if (!native) return;
    proto[name] = function (...args) {
      before?.call(this, ...args);
      return native.apply(this, args);
    };
  };

  for (const proto of [globalThis.GPURenderPassEncoder?.prototype, globalThis.GPURenderBundleEncoder?.prototype]) {
    const inBundle = proto === globalThis.GPURenderBundleEncoder?.prototype;
    // Commands recorded into a bundle count when the bundle runs, not here.
    if (inBundle) continue;
    wrap(proto, "draw", (vertexCount, instanceCount = 1) => {
      meter.pendingDraws += 1;
      bump("draws");
      bump("vertices", vertexCount * instanceCount);
    });
    wrap(proto, "drawIndexed", (indexCount, instanceCount = 1) => {
      meter.pendingDraws += 1;
      bump("draws");
      bump("vertices", indexCount * instanceCount);
    });
    wrap(proto, "drawIndirect", () => { meter.pendingDraws += 1; bump("draws"); bump("indirectDraws"); });
    wrap(proto, "drawIndexedIndirect", () => { meter.pendingDraws += 1; bump("draws"); bump("indirectDraws"); });
    wrap(proto, "setPipeline", () => bump("pipelines"));
    wrap(proto, "setBindGroup", () => bump("bindGroupsSet"));
    wrap(proto, "setStencilReference", () => bump("stencilRefs"));
    wrap(proto, "setScissorRect", () => bump("scissors"));
    wrap(proto, "executeBundles", (bundles) => { meter.pendingDraws += bundles?.length || 0; bump("bundles", bundles?.length || 0); });
  }
  wrap(globalThis.GPUQueue?.prototype, "writeBuffer", (buffer, offset, data, dataOffset = 0, size) => {
    bump("writeBuffers");
    const bytes = data?.byteLength ?? 0;
    const element = data?.BYTES_PER_ELEMENT || 1;
    bump("writeBufferBytes", size !== undefined ? size * element : bytes - dataOffset * element);
  });
  wrap(globalThis.GPUQueue?.prototype, "writeTexture", (destination, data, layout, size) => {
    bump("writeTextures");
    const rows = Array.isArray(size) ? (size[1] ?? 1) : (size?.height ?? 1);
    bump("writeTextureBytes", (layout?.bytesPerRow || 0) * rows || data?.byteLength || 0);
  });

  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (descriptor = {}) {
    const features = [...(descriptor.requiredFeatures || [])];
    if (this.features.has("timestamp-query") && !features.includes("timestamp-query")) features.push("timestamp-query");
    const device = await requestDevice.call(this, { ...descriptor, requiredFeatures: features });
    attach(device);
    return device;
  };

  function attach(device) {
    for (const [name, key] of [["createBuffer", "createdBuffers"], ["createTexture", "createdTextures"], ["createBindGroup", "createdBindGroups"], ["createRenderPipeline", "createdPipelines"], ["createRenderPipelineAsync", "createdPipelines"], ["createComputePipeline", "createdPipelines"]]) {
      const native = device[name].bind(device);
      device[name] = (...args) => {
        bump(key);
        return native(...args);
      };
    }
    // Live render-attachment bytes (textures with RENDER_ATTACHMENT usage), by label.
    const BYTES = { "depth32float-stencil8": 8, depth32float: 4, rg32uint: 8, rgba16float: 8, r32float: 4, rg32float: 8, rgba32float: 16 };
    meter.attachments = new Map();
    const createTexture = device.createTexture.bind(device);
    device.createTexture = (desc) => {
      const texture = createTexture(desc);
      if (desc.usage & GPUTextureUsage.RENDER_ATTACHMENT) {
        const [w, h = 1] = Array.isArray(desc.size) ? desc.size : [desc.size.width, desc.size.height];
        const bytes = w * h * (BYTES[desc.format] ?? 4) * (desc.sampleCount || 1);
        meter.attachments.set(texture, { label: desc.label || desc.format, w, h, samples: desc.sampleCount || 1, format: desc.format, bytes });
        const destroy = texture.destroy.bind(texture);
        texture.destroy = () => { meter.attachments.delete(texture); destroy(); };
      }
      return texture;
    };
    meter.attachmentReport = () => [...meter.attachments.values()];
    meter.timestamps = device.features.has("timestamp-query");
    const CAPACITY = 1024;
    const querySet = meter.timestamps ? device.createQuerySet({ type: "timestamp", count: CAPACITY }) : null;
    let next = 0;
    let frame = [];
    const timed = (begin, kind) => function (descriptor = {}) {
      bump(kind);
      if (!meter.enabled || !querySet || descriptor.timestampWrites || next + 2 > CAPACITY) return begin.call(this, descriptor);
      const at = next;
      next += 2;
      frame.push(at);
      return begin.call(this, { ...descriptor, timestampWrites: { querySet, beginningOfPassWriteIndex: at, endOfPassWriteIndex: at + 1 } });
    };
    GPUCommandEncoder.prototype.beginRenderPass = timed(GPUCommandEncoder.prototype.beginRenderPass, "passes");
    GPUCommandEncoder.prototype.beginComputePass = timed(GPUCommandEncoder.prototype.beginComputePass, "computePasses");
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (buffers) {
      const result = submit.call(this, buffers);
      if (this === device.queue && meter.pendingDraws) {
        meter.drawnFrames += 1;
        meter.pendingDraws = 0;
      }
      if (!meter.enabled || this !== device.queue) return result;
      const sample = { at: performance.now(), gpuMs: null, ...meter.counts };
      meter.counts = fresh();
      meter.samples.push(sample);
      if (!frame.length) return result;
      const passes = frame;
      frame = [];
      const count = next;
      next = 0;
      const resolve = device.createBuffer({ size: count * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      const read = device.createBuffer({ size: count * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const encoder = device.createCommandEncoder();
      encoder.resolveQuerySet(querySet, 0, count, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, read, 0, count * 8);
      submit.call(this, [encoder.finish()]);
      meter.pending += 1;
      read.mapAsync(GPUMapMode.READ).then(() => {
        const times = new BigInt64Array(read.getMappedRange());
        let total = 0n;
        for (const at of passes) total += times[at + 1] - times[at];
        sample.gpuMs = Number(total) / 1e6;
        read.unmap();
        read.destroy();
        resolve.destroy();
      }).finally(() => { meter.pending -= 1; });
      return result;
    };
  }

  // The viewer's frame: CPU time of each animation-frame callback.
  // A capture of the next frame the viewer draws (a WebGPU canvas reads back
  // blank once presented, so it is read inside the frame, as probe.js does).
  meter.capture = (canvas) => new Promise((resolve) => { meter.wanted = { canvas, resolve }; });
  const grab = () => {
    const { canvas, resolve } = meter.wanted;
    const scratch = document.createElement("canvas");
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, scratch.width, scratch.height).data;
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    meter.wanted = null;
    resolve({ width: scratch.width, height: scratch.height, rgba: btoa(binary) });
  };
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => nativeRaf((at) => {
    if (meter.wanted) {
      const before = meter.drawnFrames;
      const result = callback(at);
      if (meter.drawnFrames !== before) { try { grab(); } catch (error) { meter.captureError = String(error); } }
      return result;
    }
    if (!meter.enabled) return callback(at);
    const started = performance.now();
    const before = meter.samples.length;
    try {
      return callback(at);
    } finally {
      meter.frames.push({ at, cpuMs: performance.now() - started, submitted: meter.samples.length > before });
    }
  });
})();
