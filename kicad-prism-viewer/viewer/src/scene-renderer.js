// Several board assets in one WebGPU view (System Builder SB2-27).
//
// Each asset (one board bundle) is its own `Renderer`: geometry, occurrences,
// cull state and indirect slots, exactly as a one-asset scene. They share the
// host renderer's device, canvas, pipelines and targets, and a frame records
// every asset's cull pass, then every asset's draws into one render pass, so
// depth testing works across boards. Occurrence numbers are scene-wide: each
// asset's first occurrence is its `occurrenceBase`, written into its Globals,
// so the rg32uint pick target names one occurrence of the whole scene.
//
// Stand-ins are assets too: boxes for occurrences without geometry (restricted
// boards, bundles still building), one renderer per colour, drawing a unit box
// scaled into each occurrence's matrix, always at box detail. The host renderer
// owns the device and targets and draws nothing itself.

import { LOD_BOX, LOD_THRESHOLDS, normalizeLodThresholds } from "./occurrences.js";
import { Renderer } from "./renderer.js";

const UNIT_BOX = [0, 0, 0, 1, 1, 1];

export class SceneRenderer {
  static async create(canvas) {
    return new SceneRenderer(await Renderer.create(canvas));
  }

  constructor(host) {
    this.host = host;
    this.canvas = host.canvas;
    this.device = host.device;
    host.alwaysInstanced = true;
    host.setOccurrences([]);
    this.assets = new Map();
    this.order = [];
    this.frameStats = { triangles: 0, draws: 0 };
    this.lodThresholds = { ...LOD_THRESHOLDS };
  }

  /** A renderer for one asset, created on first use. */
  asset(id) {
    let renderer = this.assets.get(id);
    if (!renderer) {
      renderer = new Renderer(this.canvas, this.device, { shareFrom: this.host });
      renderer.setLodThresholds(this.lodThresholds);
      this.assets.set(id, renderer);
    }
    return renderer;
  }

  /** A stand-in renderer: occurrences draw as a unit box in `color`, mapped by their matrices. */
  standIn(id, color) {
    const renderer = this.asset(id);
    if (!renderer.standIn) {
      renderer.standIn = true;
      renderer.setBoardBounds(UNIT_BOX);
      renderer.setLodOverride(LOD_BOX);
    }
    renderer.boxColor = [...color];
    return renderer;
  }

  removeAsset(id) {
    const renderer = this.assets.get(id);
    if (!renderer) return;
    renderer.dispose();
    this.assets.delete(id);
  }

  /** The placed renderers, in the order of the last `setOccurrences`. */
  get renderers() {
    return this.order.map((id) => this.assets.get(id)).filter(Boolean);
  }

  /**
   * Place the scene: `assets` maps asset (or stand-in) id → `{ matrix, key }[]`,
   * matrices column-major in renderer units. Occurrences are numbered
   * scene-wide in that order; assets left out draw nothing.
   */
  setOccurrences(assets) {
    this.order = [...assets.keys()].filter((id) => this.assets.has(id));
    for (const [id, renderer] of this.assets) {
      if (!assets.has(id)) renderer.setOccurrences([]);
    }
    for (const id of this.order) this.assets.get(id).setOccurrences(assets.get(id));
    let base = 0;
    for (const renderer of this.renderers) {
      renderer.occurrenceBase = base;
      base += renderer.occurrenceCount;
    }
    this.occurrenceCount = base;
  }

  /** The renderer and local index of a scene-wide occurrence number, or null. */
  locate(index) {
    for (const renderer of this.renderers) {
      const local = index - renderer.occurrenceBase;
      if (local >= 0 && local < renderer.occurrenceCount) return { renderer, local };
    }
    return null;
  }

  keyOf(index) {
    const found = this.locate(index);
    return found ? found.renderer.occurrenceKeys[found.local] ?? null : null;
  }

  /** Keep the occurrence holding the selection at full detail (scene-wide number, or -1). */
  setSelectedOccurrence(index) {
    const found = index >= 0 ? this.locate(index) : null;
    for (const renderer of this.renderers) {
      renderer.selectedOccurrence = !renderer.standIn && found?.renderer === renderer ? found.local : -1;
    }
  }

  resize() {
    this.host.resize();
  }

  /**
   * One frame. `optionsFor(renderer)` gives each renderer's draw options
   * (visible layers and so on, as `Renderer.render` takes them).
   */
  render(panel, optionsFor) {
    const host = this.host;
    host.resize();
    const live = this.renderers.filter((renderer) => renderer.occurrenceCount > 0);
    const encoder = this.device.createCommandEncoder();
    const reads = live.filter((renderer) => renderer.encodeCull(encoder, panel));
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: host.context.getCurrentTexture().createView(),
        clearValue: { r: 0.91, g: 0.93, b: 0.94, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: host.depthAttachment(),
    });
    setViewport(pass, panel.viewport, this.canvas);
    let triangles = 0;
    let draws = 0;
    for (const renderer of live) {
      const counted = renderer.encodeDraws(pass, panel, optionsFor(renderer));
      triangles += counted.triangles;
      draws += counted.draws;
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    for (const renderer of reads) renderer.readCullCounts();
    this.frameStats = { triangles: Math.round(triangles), draws };
  }

  /** Pick at canvas pixel (x, y) across every asset: the scene-wide occurrence, its key and renderer. */
  pick(panel, x, y, optionsFor) {
    const operation = this.host.pickSerial.then(() => this.performPick(panel, x, y, optionsFor));
    this.host.pickSerial = operation.catch(() => 0);
    return operation;
  }

  async performPick(panel, x, y, optionsFor) {
    const host = this.host;
    host.resize();
    const pixelX = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(x)));
    const pixelY = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(y)));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: host.pickTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: host.depthAttachment(),
    });
    setViewport(pass, panel.viewport, this.canvas);
    for (const renderer of this.renderers) {
      if (renderer.occurrenceCount > 0) renderer.encodePick(pass, panel, optionsFor(renderer));
    }
    pass.end();
    const hit = await host.readPick(encoder, pixelX, pixelY);
    const found = hit.occurrenceIndex >= 0 ? this.locate(hit.occurrenceIndex) : null;
    return {
      ...hit,
      occurrenceKey: found ? found.renderer.occurrenceKeys[found.local] ?? null : null,
      renderer: found?.renderer || null,
      standIn: Boolean(found?.renderer?.standIn),
    };
  }

  gpuMemoryBytes() {
    let bytes = 0;
    for (const renderer of this.renderers) bytes += renderer.gpuMemoryBytes();
    // Every renderer counts the shared depth and pick targets; count them once.
    return bytes - Math.max(0, this.renderers.length - 1) * this.canvas.width * this.canvas.height * 12;
  }

  /** Level-of-detail thresholds for every asset, now and later (SB2-30a). */
  setLodThresholds(thresholds) {
    this.lodThresholds = normalizeLodThresholds({ ...this.lodThresholds, ...thresholds });
    for (const renderer of this.assets.values()) renderer.setLodThresholds(this.lodThresholds);
    return { ...this.lodThresholds };
  }

  /** Occurrences per level of detail, summed over the assets (stand-ins count as box). */
  cullCounts() {
    const total = { full: 0, board: 0, body: 0, box: 0, culled: 0 };
    for (const renderer of this.renderers) {
      if (!renderer.occurrenceCount) continue;
      for (const key of Object.keys(total)) total[key] += renderer.cullCounts[key] || 0;
    }
    return total;
  }

  /** Release everything, the device included: a closed tab frees its GPU memory at once, not at GC. */
  dispose() {
    for (const id of [...this.assets.keys()]) this.removeAsset(id);
    this.host.dispose();
    this.host.context?.unconfigure?.();
    this.device.destroy?.();
  }
}

function setViewport(pass, viewport, canvas) {
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(viewport.x)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(viewport.y)));
  const width = Math.max(1, Math.min(canvas.width - x, Math.floor(viewport.width)));
  const height = Math.max(1, Math.min(canvas.height - y, Math.floor(viewport.height)));
  pass.setViewport(x, y, width, height, 0, 1);
  pass.setScissorRect(x, y, width, height);
}
