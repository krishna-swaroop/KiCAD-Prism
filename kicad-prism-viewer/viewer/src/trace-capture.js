// The Render action's capture (trace-scene.js): what the viewer shows, as
// plain data for the trace worker. Each board layer's coverage is drawn
// top-down through the analytic pick pipelines (as field-relief.js draws its
// copper mask), in tiles, into one byte per pixel; the board's outline comes
// from its laminate's contour edges, the components from the bundle's GLB.

import { ANALYTIC_PICK_TAG } from "./analytic-shaders.js";
import { analyticBoardLooks } from "./analytic-scene.js";
import { topDownMatrix } from "./field-relief.js";
import { BARREL_FLOATS, BARREL_WORDS } from "./analytic-pack.js";
import { HOLE_FLOATS, traceFinishColor, traceMaskColor } from "./trace-scene.js";

/** The coverage maps' longer side, pixels (a multiple of 256: rows copy whole). */
export const TRACE_MAP_PIXELS = 4096;
/** A pick tile's side, pixels. */
const TILE = 2048;

const COVERAGE_SHADER = /* wgsl */ `
const PICK_TAG = ${ANALYTIC_PICK_TAG}u;
struct Tile { origin: vec2f, pad: vec2f };
@group(0) @binding(0) var picked: texture_2d<u32>;
@group(0) @binding(1) var<uniform> tile: Tile;

@vertex fn vs_full(@builtin(vertex_index) vertex: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vertex << 1u) & 2u), f32(vertex & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment fn fs_cover(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let hit = textureLoad(picked, vec2u(position.xy - tile.origin), 0);
  if ((hit.x & PICK_TAG) == 0u || hit.y == 0u) { return vec4f(0.0); }
  return vec4f(1.0);
}
`;

/**
 * Square pixels over `boundsMm` padded so each side is a whole number of
 * 256-pixel rows: `{ boundsMm, width, height, pitchMm }`.
 */
export function mapGrid(boundsMm, pixels = TRACE_MAP_PIXELS) {
  const [x0, y0, x1, y1] = boundsMm;
  const pitch = Math.max(x1 - x0, y1 - y0) / pixels;
  const width = Math.max(256, Math.ceil((x1 - x0) / pitch / 256) * 256);
  const height = Math.max(256, Math.ceil((y1 - y0) / pitch / 256) * 256);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    boundsMm: [cx - (width * pitch) / 2, cy - (height * pitch) / 2, cx + (width * pitch) / 2, cy + (height * pitch) / 2],
    width,
    height,
    pitchMm: pitch,
  };
}

/** The analytic slices of each board layer the maps need, by side. */
export function traceLayerSlices(analytic, layers) {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const pick = (test) => analytic.slices.filter((slice) => test(slice, byId.get(slice.layerId)));
  const copperOf = (name) => pick((slice, layer) => (slice.role === undefined || slice.role === "copper") && layer?.name === name);
  const sideOf = (slice) => (slice.faceDown ?? slice.bottom ? "back" : "front");
  return {
    body: pick((slice) => slice.role === "dielectric").slice(0, 1),
    front: { copper: copperOf("F.Cu"), mask: pick((slice) => slice.role === "mask" && sideOf(slice) === "front"), silk: pick((slice) => slice.role === "silk" && sideOf(slice) === "front") },
    back: { copper: copperOf("B.Cu"), mask: pick((slice) => slice.role === "mask" && sideOf(slice) === "back"), silk: pick((slice) => slice.role === "silk" && sideOf(slice) === "back") },
  };
}

/**
 * Draws coverage maps through a viewer's renderer and its attached analytic
 * renderer. One instance per capture; `destroy()` when done.
 */
export class CoverageBaker {
  constructor(renderer, analytic, grid) {
    this.renderer = renderer;
    this.analytic = analytic;
    this.device = renderer.device;
    this.grid = grid;
    const { device } = this;
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.tileSize = Math.min(TILE, grid.width, grid.height);
    this.pick = device.createTexture({ label: "trace-pick", size: [this.tileSize, this.tileSize], format: "rg32uint", usage });
    this.depth = device.createTexture({ label: "trace-pick-depth", size: [this.tileSize, this.tileSize], format: renderer.depthFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.coverage = device.createTexture({ label: "trace-coverage", size: [grid.width, grid.height], format: "r8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.readback = device.createBuffer({ label: "trace-coverage-read", size: grid.width * grid.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.tileUniform = device.createBuffer({ label: "trace-tile", size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ label: "trace-coverage", code: COVERAGE_SHADER });
    this.pipeline = device.createRenderPipeline({
      label: "trace-coverage",
      layout: "auto",
      vertex: { module, entryPoint: "vs_full" },
      // Max: slices and tiles add up into one map.
      fragment: { module, entryPoint: "fs_cover", targets: [{ format: "r8unorm", blend: { color: { operation: "max", srcFactor: "one", dstFactor: "one" }, alpha: { operation: "max", srcFactor: "one", dstFactor: "one" } } }] },
      primitive: { topology: "triangle-list" },
    });
    this.group = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: this.pick.createView() }, { binding: 1, resource: { buffer: this.tileUniform } }],
    });
  }

  /** Coverage of `slices` (0 or 255 per pixel, rows along board +y), or null with none. */
  async bake(slices) {
    if (!slices.length) return null;
    const { device, renderer, analytic, grid, tileSize } = this;
    const [x0, y0] = grid.boundsMm;
    const extent = analytic.extent;
    const zLow = (extent?.[0][2] ?? -0.01) - 0.001;
    const zHigh = (extent?.[1][2] ?? 0.01) + 0.001;
    const innerMode = renderer.innerCopperMode;
    renderer.innerCopperMode = "all";
    try {
      // One submit per slice and tile: each writes the slice's uniform and the view.
      for (const slice of slices) {
        for (let ty = 0; ty < grid.height; ty += tileSize) {
          for (let tx = 0; tx < grid.width; tx += tileSize) {
            const tw = Math.min(tileSize, grid.width - tx);
            const th = Math.min(tileSize, grid.height - ty);
            const bounds = [x0 + tx * grid.pitchMm, y0 + ty * grid.pitchMm, x0 + (tx + tw) * grid.pitchMm, y0 + (ty + th) * grid.pitchMm];
            // The tile's view over the whole pick texture, drawn into its corner.
            const scaleX = tileSize / tw;
            const scaleY = tileSize / th;
            const matrix = topDownMatrix([bounds[0], bounds[1], bounds[0] + (bounds[2] - bounds[0]) * scaleX, bounds[1] + (bounds[3] - bounds[1]) * scaleY], zLow, zHigh);
            const encoder = device.createCommandEncoder();
            const depthAttachment = { view: this.depth.createView(), depthClearValue: 0, depthLoadOp: "clear", depthStoreOp: "discard" };
            if (renderer.stencil) Object.assign(depthAttachment, { stencilClearValue: 0, stencilLoadOp: "clear", stencilStoreOp: "discard" });
            const pass = encoder.beginRenderPass({
              colorAttachments: [{ view: this.pick.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
              depthStencilAttachment: depthAttachment,
            });
            const context = { matrix, showBoard: false };
            renderer.writeGlobals(matrix, 0, 0, 0, 0);
            analytic.context = context;
            analytic.writeView(matrix, null, context);
            if (renderer.stencil) pass.setStencilReference(1);
            analytic.encodeSlice(pass, analytic.pipelines.pick, slice, "opaque", null, null);
            pass.end();
            this.encodeTile(encoder, tx, ty, tw, th);
            device.queue.submit([encoder.finish()]);
          }
        }
      }
    } finally {
      renderer.innerCopperMode = innerMode;
    }
    return this.read();
  }

  encodeTile(encoder, tx, ty, tw, th) {
    this.device.queue.writeBuffer(this.tileUniform, 0, new Float32Array([tx, ty, 0, 0]));
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.coverage.createView(), loadOp: "load", storeOp: "store" }],
    });
    pass.setViewport(tx, ty, tw, th, 0, 1);
    pass.setScissorRect(tx, ty, tw, th);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.draw(3);
    pass.end();
  }

  async read() {
    const { device, grid } = this;
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.coverage }, { buffer: this.readback, bytesPerRow: grid.width }, [grid.width, grid.height]);
    // The next bake starts clear.
    const clear = encoder.beginRenderPass({ colorAttachments: [{ view: this.coverage.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }] });
    clear.end();
    device.queue.submit([encoder.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(this.readback.getMappedRange().slice(0));
    this.readback.unmap();
    return bytes;
  }

  destroy() {
    for (const resource of [this.pick, this.depth, this.coverage, this.readback, this.tileUniform]) resource.destroy();
  }
}

/** Every draw of `slices`'s layers, per side, baked: `{ grid, body, front, back }` with transferable bytes. */
export async function bakeBoardCoverage(renderer, analytic, layers, boundsMm, pixels = TRACE_MAP_PIXELS) {
  const grid = mapGrid(boundsMm, Math.min(pixels, renderer.device.limits.maxTextureDimension2D));
  const wanted = traceLayerSlices(analytic, layers);
  const baker = new CoverageBaker(renderer, analytic, grid);
  try {
    const side = async (set) => ({ copper: await baker.bake(set.copper), mask: await baker.bake(set.mask), silk: await baker.bake(set.silk) });
    return { grid, body: await baker.bake(wanted.body), front: await side(wanted.front), back: await side(wanted.back) };
  } finally {
    baker.destroy();
  }
}

/**
 * Everything the trace worker needs for one board's still: the board (maps'
 * coverage, outline, faces' heights, looks), its components and the camera.
 * `view` is the viewer's camera `{ eye, target, up, fovY, sceneRadius }`
 * (world metres); `components` the bundle's GLB as `loadGltfModels` gives it,
 * already without hidden parts, or null.
 */
export async function captureBoardScene({ renderer, analytic, pack, layers, stackup, boundsMm, view, components, mapPixels, holeOverride = null }) {
  const started = performance.now();
  const coverage = await bakeBoardCoverage(renderer, analytic, layers, boundsMm, mapPixels);
  const bakeMs = Math.round(performance.now() - started);
  const looks = analyticBoardLooks(stackup);
  const top = Math.max(...layers.map((layer) => layer.z_mm + layer.thickness_mm / 2));
  const bottom = Math.min(...layers.map((layer) => layer.z_mm - layer.thickness_mm / 2));
  const laminate = analytic.slices.find((slice) => slice.role === "dielectric" && slice.lowered?.contourEdges?.length);
  return {
    boards: [{
      coverage,
      outlineEdges: laminate ? Float32Array.from(laminate.lowered.contourEdges) : analytic.outlineEdges ? Float32Array.from(analytic.outlineEdges) : null,
      topY: top / 1000,
      bottomY: bottom / 1000,
      maskColor: {
        front: traceMaskColor(stackup?.maskColors?.front, looks.soldermask.front.slice(0, 3)),
        back: traceMaskColor(stackup?.maskColors?.back || stackup?.maskColors?.front, looks.soldermask.back.slice(0, 3)),
      },
      finishColor: traceFinishColor(stackup?.settings?.copperFinish),
      holes: pack ? traceHoles(await pack.barrels(), holeOverride) : null,
      components: components ? traceComponents(components) : [],
      // Where the board sits in the scene (viewer world, column-major); null for where it is.
      transform: null,
    }],
    camera: view,
    timings: { bakeMs },
  };
}

/**
 * The pack's plated holes as `HOLE_FLOATS` floats each. `override` (a
 * spike aid, to compare finishes) replaces every hole's protection flags.
 */
export function traceHoles(barrels, override = null) {
  const count = Math.floor(barrels.floats.length / BARREL_FLOATS);
  const holes = new Float32Array(count * HOLE_FLOATS);
  for (let index = 0; index < count; index += 1) {
    const f = barrels.floats.subarray(index * BARREL_FLOATS, index * BARREL_FLOATS + 5);
    holes.set(f, index * HOLE_FLOATS);
    holes[index * HOLE_FLOATS + 5] = override ?? barrels.words[index * BARREL_WORDS + 5];
  }
  return holes;
}

/** Models with their placements' rows, for the worker. */
export function traceComponents(models) {
  return models
    .filter((model) => model.placements.length)
    .map(({ primitive, placements }) => ({
      position: primitive.position,
      normal: primitive.normal,
      indices: primitive.indices,
      material: primitive.material,
      placements: placements.map((placement) => placement.rows),
    }));
}
