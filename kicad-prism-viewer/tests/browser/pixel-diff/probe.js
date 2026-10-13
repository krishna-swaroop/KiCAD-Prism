// In-page half of the pixel-diff harness (VT-00). Load it as a classic script
// *before* the viewer element module, so its requestAnimationFrame and
// GPUQueue.submit wrappers are in place when the viewer starts.
//
// A WebGPU canvas reads back blank once its frame is presented, so the
// capture happens inside the frame: after each rAF callback, while armed, the
// viewport is drawn into a 2D canvas. Frames where the viewer did not render
// read back blank and are skipped.
//
// It also works pasted into the console of a running Prism 3D tab, but there
// it must be loaded before the 3D tab mounts (reload with the script injected).
(() => {
  if (window.__vtProbe) return;
  const state = {
    element: null,
    armed: false,
    frames: [], // { at, hash } of rendered (non-blank) frames, newest last
    last: null, // { at, hash, image } of the newest rendered frame
    timing: false,
    gpuMs: [],
  };
  const scratch = document.createElement("canvas");
  let context = null;

  const viewport = () => state.element?.shadowRoot?.getElementById("viewport") || null;

  const fnv1a = (bytes) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i += 1) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };

  let grabbedAt = -1;
  const grab = (at) => {
    const canvas = viewport();
    if (!canvas || !canvas.width || !canvas.height) return;
    if (scratch.width !== canvas.width || scratch.height !== canvas.height) {
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      context = scratch.getContext("2d", { willReadFrequently: true });
    }
    context.clearRect(0, 0, scratch.width, scratch.height);
    context.drawImage(canvas, 0, 0);
    const image = context.getImageData(0, 0, scratch.width, scratch.height);
    const { data } = image;
    let drawn = false;
    for (let i = 3; i < data.length; i += 4 * 97) {
      if (data[i] !== 0) { drawn = true; break; }
    }
    if (!drawn) return;
    const hash = fnv1a(data);
    // Several rAF callbacks share one frame; keep one entry per frame.
    if (at === grabbedAt && state.frames.length) state.frames[state.frames.length - 1] = { at, hash };
    else state.frames.push({ at, hash });
    if (state.frames.length > 64) state.frames.shift();
    grabbedAt = at;
    state.last = { at, hash, image };
  };

  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => nativeRaf((at) => {
    callback(at);
    if (state.armed) grab(at);
  });

  // Submit-to-done latency per queue submission, only while timing (perf runs).
  if (window.GPUQueue) {
    const nativeSubmit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function submit(buffers) {
      const result = nativeSubmit.call(this, buffers);
      state.queue = this;
      if (state.timing && state.timestamps) void collectTimestamps(buffers);
      if (state.timing) {
        const started = performance.now();
        this.onSubmittedWorkDone().then(() => state.gpuMs.push(performance.now() - started));
      }
      return result;
    };
  }

  // GPU execution time per submission from timestamp queries, while timing,
  // where the adapter offers them: every render and compute pass gets a
  // begin and end timestamp, and a submission's time is the sum of its passes.
  if (window.GPUAdapter) {
    const nativeRequest = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function requestDevice(descriptor = {}) {
      const wanted = this.features.has("timestamp-query") ? ["timestamp-query"] : [];
      const device = await nativeRequest.call(this, { ...descriptor, requiredFeatures: [...(descriptor.requiredFeatures || []), ...wanted] });
      if (wanted.length) state.timestamps = { device, pool: [] };
      return device;
    };
    const nativeEncoder = GPUDevice.prototype.createCommandEncoder;
    GPUDevice.prototype.createCommandEncoder = function createCommandEncoder(descriptor) {
      const encoder = nativeEncoder.call(this, descriptor);
      if (state.timing && state.timestamps?.device === this) encoder.__vtPasses = [];
      return encoder;
    };
    const timed = (native) => function begin(descriptor = {}) {
      if (!this.__vtPasses || descriptor.timestampWrites) return native.call(this, descriptor);
      const { device, pool } = state.timestamps;
      const querySet = pool.pop() || device.createQuerySet({ type: "timestamp", count: 2 });
      this.__vtPasses.push(querySet);
      return native.call(this, { ...descriptor, timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } });
    };
    GPUCommandEncoder.prototype.beginRenderPass = timed(GPUCommandEncoder.prototype.beginRenderPass);
    GPUCommandEncoder.prototype.beginComputePass = timed(GPUCommandEncoder.prototype.beginComputePass);
    const nativeFinish = GPUCommandEncoder.prototype.finish;
    GPUCommandEncoder.prototype.finish = function finish(descriptor) {
      const passes = this.__vtPasses;
      if (passes?.length) {
        const { device } = state.timestamps;
        const resolve = device.createBuffer({ size: passes.length * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        const read = device.createBuffer({ size: passes.length * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        passes.forEach((querySet, index) => this.resolveQuerySet(querySet, 0, 2, resolve, index * 16));
        this.copyBufferToBuffer(resolve, 0, read, 0, passes.length * 16);
        const buffer = nativeFinish.call(this, descriptor);
        buffer.__vtTiming = { passes, resolve, read };
        return buffer;
      }
      return nativeFinish.call(this, descriptor);
    };
  }

  const collectTimestamps = async (buffers) => {
    for (const buffer of buffers) {
      const timing = buffer?.__vtTiming;
      if (!timing) continue;
      await timing.read.mapAsync(GPUMapMode.READ);
      const values = new BigUint64Array(timing.read.getMappedRange().slice(0));
      timing.read.destroy();
      timing.resolve.destroy();
      let total = 0;
      for (let i = 0; i < values.length; i += 2) if (values[i + 1] > values[i]) total += Number(values[i + 1] - values[i]) / 1e6;
      state.gpuPassMs.push(total);
      state.timestamps.pool.push(...timing.passes);
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => nativeRaf(resolve));

  const toBase64 = (bytes) => {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };

  const percentile = (values, q) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))].toFixed(2);
  };

  window.__vtProbe = {
    // Mount <prism-semantic-viewer> on a bundle and resolve once it is ready.
    mount(bundleUrl, { width = 1280, height = 800 } = {}) {
      return new Promise((resolve, reject) => {
        const element = document.createElement("prism-semantic-viewer");
        element.style.cssText = `display:block;width:${width}px;height:${height}px`;
        element.setAttribute("active", "true");
        element.setAttribute("hide-panel", "true");
        element.addEventListener("prism-semantic-viewer:ready", () => resolve(true), { once: true });
        element.addEventListener("prism-semantic-viewer:error", (event) => reject(new Error(event.detail?.message || "viewer error")), { once: true });
        element.setAttribute("bundle-url", new URL(bundleUrl, location.href).toString());
        document.body.append(element);
        state.element = element;
        state.armed = true;
      });
    },

    get element() {
      return state.element;
    },

    // The newest rendered frame's hash, and how many identical rendered
    // frames end the history (the runner waits for that and network idle).
    frameStatus() {
      const { frames } = state;
      if (!frames.length) return { hash: null, stable: 0, stableMs: 0, frames: 0 };
      const newest = frames[frames.length - 1];
      let stable = 0;
      let first = newest;
      for (let i = frames.length - 1; i >= 0 && frames[i].hash === newest.hash; i -= 1) {
        stable += 1;
        first = frames[i];
      }
      return { hash: newest.hash, stable, stableMs: newest.at - first.at, frames: frames.length };
    },

    resetFrames() {
      state.frames = [];
      state.last = null;
    },

    // Apply a named view. `default` and `exploded` keep the loaded camera and
    // only set the separation. `top` and `bottom` press the viewer's own axis
    // keys (the board view has no axis API); they move the camera for good, so
    // the runner captures them last.
    async applyView(name) {
      const element = state.element;
      element.setSeparation?.(name === "exploded" ? 0.5 : 0);
      if (name === "top" || name === "bottom") {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", shiftKey: name === "bottom", bubbles: true }));
      } else if (name !== "default" && name !== "exploded") {
        throw new Error(`unknown view ${name}`);
      }
      this.resetFrames();
      await nextFrame();
    },

    // The newest rendered frame as raw RGBA (base64).
    capture() {
      const last = state.last;
      if (!last) return null;
      return {
        width: last.image.width,
        height: last.image.height,
        hash: last.hash,
        rgba: toBase64(last.image.data),
      };
    },

    stats() {
      return state.element?.getStats?.() ?? null;
    },

    // Orbit with synthetic drags for `orbitMs`, then report rAF intervals,
    // the viewer's own CPU frame time, and submit-to-done GPU latency.
    // `drain` waits for each frame's GPU work before the next, so with the
    // frame-rate cap lifted an interval is one frame's whole cost.
    async orbit({ orbitMs = 4000, stepPx = 3, drain = false } = {}) {
      const canvas = viewport();
      const rect = canvas.getBoundingClientRect();
      let x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const fire = (type) => canvas.dispatchEvent(new PointerEvent(type, {
        clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true,
      }));
      state.armed = false;
      state.gpuMs = [];
      state.gpuPassMs = [];
      state.timing = true;
      fire("pointerdown");
      const intervals = [];
      let last = await nextFrame();
      const started = last;
      while (last - started < orbitMs) {
        x += stepPx;
        fire("pointermove");
        let now = await nextFrame();
        if (drain && state.queue) {
          await state.queue.onSubmittedWorkDone();
          now = performance.now();
        }
        intervals.push(now - last);
        last = now;
      }
      fire("pointerup");
      await sleep(500);
      state.timing = false;
      const stats = this.stats() || {};
      const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length);
      return {
        frames: intervals.length,
        intervalMeanMs: +mean.toFixed(2),
        intervalP50Ms: percentile(intervals, 0.5),
        intervalP95Ms: percentile(intervals, 0.95),
        cpuP95Ms: stats.frameCpuP95Ms == null ? null : +stats.frameCpuP95Ms.toFixed(2),
        gpuSubmitP50Ms: percentile(state.gpuMs, 0.5),
        gpuSubmitP95Ms: percentile(state.gpuMs, 0.95),
        gpuSubmits: state.gpuMs.length,
        // GPU execution per submission (timestamp queries), when available.
        gpuPassP50Ms: percentile(state.gpuPassMs || [], 0.5),
        gpuPassP95Ms: percentile(state.gpuPassMs || [], 0.95),
        triangles: stats.triangles ?? null,
        draws: stats.draws ?? null,
        gpuMemoryMB: stats.gpuMemoryBytes == null ? null : +(stats.gpuMemoryBytes / 1048576).toFixed(1),
      };
    },
  };
})();
