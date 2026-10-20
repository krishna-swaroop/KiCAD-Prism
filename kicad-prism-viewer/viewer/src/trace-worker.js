// The Render action's worker: builds a MuTracer scene from a capture
// (trace-scene.js), path-traces it at a fixed size and answers with a PNG.
// Its own WebGPU device, off the viewer's thread: the 3D view stays live while
// it runs. Messages in: { type: "render", capture, options } then optionally
// { type: "cancel" }. Out: { type: "progress" | "done" | "cancelled" | "error" }.

import {
  Camera,
  Engine,
  EnvironmentLight,
  Geometry,
  GeometryAttribute,
  Mesh,
  OpenPBRMaterial,
  Render,
  Texture,
} from "@meimu/mutracer";
import {
  BOARD_LOOK,
  TRACE_FRAME,
  TRACE_FRAME_INVERSE,
  composeFaceMaps,
  faceGeometry,
  multiply,
  rowsToMatrix,
  studioEnvironment,
  traceCamera,
  wallGeometry,
} from "./trace-scene.js";

let controller = null;

self.onmessage = async ({ data }) => {
  if (data?.type === "cancel") {
    controller?.abort();
    return;
  }
  if (data?.type !== "render") return;
  controller = new AbortController();
  try {
    const result = await render(data.capture, data.options || {}, controller.signal);
    self.postMessage({ type: "done", ...result });
  } catch (error) {
    if (controller.signal.aborted) self.postMessage({ type: "cancelled" });
    else self.postMessage({ type: "error", message: String(error?.message || error) });
  } finally {
    controller = null;
  }
};

const attribute = (array, size) => new GeometryAttribute(array, size);

function geometry({ position, normal, indices, uv, tangent }) {
  return new Geometry({
    position: attribute(position, 3),
    normal: normal ? attribute(normal, 3) : undefined,
    indices: indices ? attribute(indices, 1) : undefined,
    uv: uv ? attribute(uv, 2) : undefined,
    tangent: tangent ? attribute(tangent, 4) : undefined,
  });
}

/** One face's material from its maps. */
function faceMaterial(maps, look) {
  const color = new Texture({ data: maps.color, width: maps.width, height: maps.height });
  const data = new Texture({ data: maps.data, width: maps.width, height: maps.height });
  const normal = new Texture({ data: maps.normal, width: maps.width, height: maps.height });
  return new OpenPBRMaterial({
    baseColor: [1, 1, 1],
    baseMetalness: 1,
    specularRoughness: 1,
    map: color,
    mapAlphaUsage: "alpha",
    alphaMode: "mask",
    alphaCutoff: 0.5,
    metallicRoughnessMap: data,
    coatWeightMap: data,
    coatWeight: look.coatWeight,
    coatRoughness: look.coatRoughness,
    coatDarkening: 1,
    normalMap: normal,
  });
}

/** A viewer-world transform as the trace frame's. */
function traceTransform(transform) {
  return multiply(multiply(TRACE_FRAME, transform), TRACE_FRAME_INVERSE);
}

/** One board's meshes: its faces, walls and components, in the trace frame. */
function boardMeshes(board, timings) {
  const started = performance.now();
  const look = BOARD_LOOK;
  const meshes = [];
  const { grid } = board.coverage;
  const sides = [["front", true, board.topY], ["back", false, board.bottomY]];
  for (const [side, up, y] of sides) {
    const layers = board.coverage[side];
    const maps = composeFaceMaps(
      {
        width: grid.width, height: grid.height, pitchMm: grid.pitchMm, originMm: grid.boundsMm.slice(0, 2),
        copper: layers.copper, mask: layers.mask, silk: layers.silk, body: board.coverage.body, holes: board.holes, front: up,
      },
      { maskColor: board.maskColor[side], finishColor: board.finishColor },
    );
    meshes.push(new Mesh(geometry(faceGeometry(grid.boundsMm, y, up)), faceMaterial(maps, look)));
  }
  timings.mapsMs = (timings.mapsMs || 0) + Math.round(performance.now() - started);
  if (board.outlineEdges?.length) {
    const walls = new OpenPBRMaterial({ baseColor: look.laminate, specularRoughness: look.laminateRoughness, doubleSided: true });
    meshes.push(new Mesh(geometry(wallGeometry(board.outlineEdges, board.bottomY, board.topY)), walls));
  }
  const placed = board.transform ? traceTransform(board.transform) : null;
  if (placed) for (const mesh of meshes) mesh.transform = placed;
  const frame = board.transform ? multiply(TRACE_FRAME, board.transform) : TRACE_FRAME;
  for (const model of board.components || []) {
    const { baseColor = [0.6, 0.6, 0.6, 1], metallic = 0, roughness = 0.6 } = model.material || {};
    const material = new OpenPBRMaterial({
      baseColor: baseColor.slice(0, 3),
      baseMetalness: metallic,
      specularRoughness: Math.max(0.12, roughness),
      geometryOpacity: baseColor[3] ?? 1,
      doubleSided: true,
    });
    const shared = geometry(model);
    for (const rows of model.placements) {
      const mesh = new Mesh(shared, material);
      mesh.transform = multiply(frame, rowsToMatrix(rows));
      meshes.push(mesh);
    }
  }
  return meshes;
}

async function render(capture, options, signal) {
  const timings = {};
  const started = performance.now();
  const width = Math.max(16, Math.round(options.width || 1920));
  const height = Math.max(16, Math.round(options.height || 1080));
  const samples = Math.max(1, Math.round(options.samples || 64));
  const progress = (stage, extra = {}) => self.postMessage({ type: "progress", stage, elapsedMs: Math.round(performance.now() - started), ...extra });

  progress("scene");
  const meshes = (capture.boards || []).flatMap((board) => boardMeshes(board, timings));
  const camera = traceCamera(capture.camera);
  const engine = new Engine({ canvas: new OffscreenCanvas(width, height), backend: "webgpu" });
  try {
    engine.textureAtlasBudgetBytes = 768 * 1048576;
    engine.bvhBuilder = "tinybvh";
    engine.on("progress", ({ stage, progress: amount }) => progress(stage, { amount }));
    const environment = studioEnvironment(camera);
    const transparent = options.background === "transparent";
    engine.scene = {
      meshes,
      lights: [new EnvironmentLight({ map: new Texture(environment) })],
      background: transparent ? [0, 0, 0, 0] : options.backgroundColor || [0.018, 0.019, 0.022, 1],
    };
    const view = new Camera({ projection: "perspective", fov: camera.fov, near: camera.near, far: camera.far });
    view.position = camera.position;
    view.lookAt(camera.target, camera.up);
    engine.camera = view;
    engine.display.setSize(width, height);
    Object.assign(engine.display, { toneMapping: "agx", toneMappingExposure: options.exposure ?? 1.15 });
    await engine.init();
    timings.sceneMs = Math.round(performance.now() - started);
    const image = new Render(engine, { width, height, maxSamples: samples, bounces: options.bounces ?? 4, timeBudgetMs: 40 });
    if (options.denoise !== false) await image.setDenoiser({ type: "oidn", model: options.denoiseModel || "standard", ...(options.weightsBaseUrl ? { weightsBaseUrl: options.weightsBaseUrl } : {}) });
    engine.update();
    timings.firstSampleAtMs = null;
    const converge = performance.now();
    const result = await image.converge({
      samples,
      // Short submissions keep each under the GPU watchdog and the desktop responsive.
      samplesPerBatch: options.samplesPerBatch ?? 1,
      targetBatchTimeMs: options.targetBatchTimeMs ?? 60,
      signal,
      onProgress: ({ stage, samples: done, targetSamples }) => {
        if (done > 0 && timings.firstSampleAtMs === null) timings.firstSampleAtMs = Math.round(performance.now() - started);
        progress(stage, { samples: done, targetSamples });
      },
    });
    timings.convergeMs = Math.round(performance.now() - converge);
    progress("encoding");
    // WebGPU rounds the image up to 16 pixels: keep the size asked for.
    let blob = await engine.display.toBlob(image);
    if (image.width !== width || image.height !== height) blob = await crop(blob, width, height);
    timings.totalMs = Math.round(performance.now() - started);
    const diagnostics = engine.getDiagnostics?.();
    return {
      blob,
      width,
      height,
      samples: result.samples,
      timings,
      diagnostics: diagnostics ? { backend: diagnostics.backend, adapter: diagnostics.adapterName, bvh: diagnostics.bvh, shaders: diagnostics.shaders } : null,
      triangles: meshes.reduce((sum, mesh) => sum + (mesh.geometry?.triangleCount || 0), 0),
    };
  } finally {
    engine.dispose();
  }
}

async function crop(blob, width, height) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(width, height);
  // Centred: the padding splits evenly, so the view stays where it was framed.
  canvas.getContext("2d").drawImage(bitmap, -Math.floor((bitmap.width - width) / 2), -Math.floor((bitmap.height - height) / 2));
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}
