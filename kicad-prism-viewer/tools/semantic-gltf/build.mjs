import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { Accessor, Document, Logger, NodeIO } from "@gltf-transform/core";
import {
  EXTMeshFeatures,
  EXTMeshoptCompression,
  KHRMeshQuantization,
} from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import earcut, { flatten as flattenRings } from "earcut";
import { MeshoptEncoder } from "meshoptimizer";
import polygonClipping from "polygon-clipping";

const CLIPPER_RESPONSE_SCHEMA = "prism.semantic_clipper_response_a1";
const CLIPPER_PROTOCOL_VERSION = 1;
const CLIPPER_DECIMAL_PLACES = 6;
const CLIPPER_COMPARE_EPSILON = 5e-3;
const CLIPPER_COVERAGE_AREA_EPSILON = 1e-4;
const CLIPPER_MODES = new Set([
  "js",
  "clipper2",
  "clipper2-a2",
  "auto",
  "verify",
  "verify-clipper2-a2",
]);

if (isMainThread) {
  await runMain();
} else {
  await runWorker();
}

async function runMain() {
  const [inputPath, outputDir] = process.argv.slice(2);
  if (!inputPath || !outputDir) {
    throw new Error("usage: node tools/semantic-gltf/build.mjs INPUT.json OUTPUT_DIR");
  }

  const metrics = createMetrics();
  const parseStart = performance.now();
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  metrics.input_parse_ms = elapsedMs(parseStart);
  const tileSize = Number(input.tileSizeMm || 20);
  const meshoptLevel = normalizeMeshoptLevel(
    input.meshoptLevel || process.env.PRISM_SEMANTIC_GLTF_MESHOPT_LEVEL || "medium",
  );
  const clipperMode = normalizeClipperMode(process.env.PRISM_SEMANTIC_CLIPPER || "auto");
  const startedAt = performance.now();
  const progress = createProgress(startedAt);
  const objects = input.objects || [];
  progress(
    `input objects=${objects.length} barrels=${(input.barrels || []).length} ` +
    `tileSizeMm=${tileSize} meshopt=${meshoptLevel} clipper=${clipperMode}`,
  );

  const clipResult = await buildClippedTiles(input, {
    tileSize,
    mode: clipperMode,
    metrics,
    progress,
  });
  mergeMetricObject(metrics.geometry_stats, clipResult.stats || {});
  const tiles = clipResult.tiles;

  await fs.mkdir(outputDir, { recursive: true });
  const manifest = {
    schema: "prism.semantic_gltf_a0",
    version: 0,
    tileSizeMm: tileSize,
    geometryRevision: input.geometryRevision,
    coordinateSystem: input.coordinateSystem,
    layers: input.layers || [],
    nets: input.nets || [],
    objectFeatures: input.objectFeatures || [],
    components: input.components || [],
    barrels: input.barrels || [],
    geometryCompiler: input.geometryCompiler || null,
    clipper: {
      protocolVersion: CLIPPER_PROTOCOL_VERSION,
      requested: clipperMode,
      backend: clipResult.backend,
      native: clipResult.native || null,
      stats: clipResult.stats,
    },
    copperLayerIds: (input.layers || [])
      .filter((layer) => layer.role === "copper" || String(layer.name || "").endsWith(".Cu"))
      .map((layer) => Number(layer.id)),
    bbox: sceneBounds(input.objects || [], input.barrels || []),
    tiles: [],
    netToTiles: {},
    analysis: {
      featureKey: "objectFeatureId",
      netKey: "netId",
      resultBinding: "geometryRevision + objectFeatureId",
    },
  };

  const sortedTiles = [...tiles.values()].sort(compareTiles);
  const workerCount = workerCountFor(sortedTiles.length);
  progress(`tile workers=${workerCount} tiles=${sortedTiles.length}`);
  const tileResults = await buildTilesWithWorkers(sortedTiles, {
    outputDir,
    meshoptLevel,
    tileSize,
    workerCount,
    metrics,
    progress,
  });

  for (const result of tileResults) {
    if (!result?.tile) continue;
    manifest.tiles.push(result.tile);
    for (const netId of result.tile.netIds) {
      if (!netId) continue;
      (manifest.netToTiles[String(netId)] ||= []).push(result.tile.id);
    }
  }

  await fs.writeFile(
    path.join(outputDir, "scene.manifest.json"),
    JSON.stringify(manifest),
  );
  metrics.total_ms = elapsedMs(startedAt);
  metrics.geometry_stats.tile_count = manifest.tiles.length;
  metrics.geometry_stats.vertices = manifest.tiles.reduce((sum, tile) => sum + Number(tile.vertices || 0), 0);
  metrics.geometry_stats.triangles = manifest.tiles.reduce((sum, tile) => sum + Number(tile.triangles || 0), 0);
  metrics.geometry_stats.output_bytes = manifest.tiles.reduce((sum, tile) => sum + Number(tile.bytes || 0), 0);
  await writeMetrics(metrics, {
    inputPath,
    outputDir,
    clipperMode,
    backend: clipResult.backend,
    meshoptLevel,
    tileSize,
    workerCount,
  });
  progress(`done manifestTiles=${manifest.tiles.length}`);
}

async function runWorker() {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshFeatures, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

  parentPort.on("message", async (message) => {
    if (message?.type === "stop") {
      parentPort.close();
      return;
    }
    if (message?.type !== "tile") return;
    try {
      const result = await buildTileFile(message.tile, {
        outputDir: workerData.outputDir,
        meshoptLevel: workerData.meshoptLevel,
        tileSize: workerData.tileSize,
        io,
      });
      parentPort.postMessage({ type: "result", taskId: message.taskId, result });
    } catch (error) {
      parentPort.postMessage({
        type: "error",
        taskId: message.taskId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : "",
      });
    }
  });
  parentPort.postMessage({ type: "ready" });
}

async function buildTilesWithWorkers(tiles, options) {
  if (!tiles.length) return [];
  const results = new Array(tiles.length).fill(null);
  let nextTask = 0;
  let completed = 0;
  let failed = false;

  const workers = [];
  const workerStartupStart = performance.now();
  await Promise.all(
    Array.from({ length: options.workerCount }, async () => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: {
          outputDir: options.outputDir,
          meshoptLevel: options.meshoptLevel,
          tileSize: options.tileSize,
        },
      });
      workers.push(worker);
      await waitForWorkerReady(worker);
    }),
  );
  options.metrics.worker_startup_ms = elapsedMs(workerStartupStart);

  const workerWallStart = performance.now();
  return await new Promise((resolve, reject) => {
    const stopWorkers = () => {
      for (const worker of workers) worker.postMessage({ type: "stop" });
    };
    const assign = (worker) => {
      if (failed) return;
      if (nextTask >= tiles.length) {
        if (completed >= tiles.length) {
          stopWorkers();
          resolve(results);
        }
        return;
      }
      const taskId = nextTask;
      nextTask += 1;
      worker.postMessage({ type: "tile", taskId, tile: tiles[taskId] });
    };
    for (const worker of workers) {
      worker.on("message", (message) => {
        if (message?.type === "result") {
          results[message.taskId] = message.result;
          mergeMetricObject(options.metrics.worker_phase_ms, message.result?.metrics || {});
          completed += 1;
          if (completed === tiles.length || completed % 25 === 0) {
            const manifestTiles = results.filter(Boolean).length;
            options.progress(`wrote tiles=${completed}/${tiles.length} manifestTiles=${manifestTiles}`);
          }
          assign(worker);
        } else if (message?.type === "error") {
          failed = true;
          stopWorkers();
          reject(new Error(`tile worker failed task=${message.taskId}: ${message.message}\n${message.stack || ""}`));
        }
      });
      worker.on("error", (error) => {
        failed = true;
        stopWorkers();
        reject(error);
      });
      assign(worker);
    }
  }).finally(async () => {
    options.metrics.node_pack_total_ms = elapsedMs(workerWallStart);
    options.metrics.earcut_ms = options.metrics.worker_phase_ms.earcut_ms;
    options.metrics.gltf_authoring_ms = options.metrics.worker_phase_ms.gltf_authoring_ms;
    options.metrics.meshopt_ms = options.metrics.worker_phase_ms.meshopt_ms;
    options.metrics.glb_write_ms = options.metrics.worker_phase_ms.glb_write_ms;
    await Promise.allSettled(workers.map((worker) => worker.terminate()));
  });
}

function waitForWorkerReady(worker) {
  return new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message?.type === "ready") {
        cleanup();
        resolve();
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
  });
}

async function buildTileFile(tile, options) {
  const metrics = {
    earcut_ms: 0,
    gltf_authoring_ms: 0,
    meshopt_ms: 0,
    glb_write_ms: 0,
  };
  const earcutStart = performance.now();
  const geometry = buildTileGeometry(tile);
  metrics.earcut_ms = elapsedMs(earcutStart);
  if (!geometry.indices.length) return { tile: null, metrics };
  const authorStart = performance.now();
  const document = createDocument(tile, geometry);
  metrics.gltf_authoring_ms = elapsedMs(authorStart);
  const meshoptStart = performance.now();
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: options.meshoptLevel }));
  metrics.meshopt_ms = elapsedMs(meshoptStart);
  const fileName = `layer-${tile.layerId}-tile-${tile.tile[0]}-${tile.tile[1]}.glb`;
  const filePath = path.join(options.outputDir, fileName);
  const writeStart = performance.now();
  await options.io.write(filePath, document);
  metrics.glb_write_ms = elapsedMs(writeStart);
  const netIds = [...new Set(geometry.netIds)].sort((a, b) => a - b);
  const stat = await fs.stat(filePath);
  return {
    tile: {
      id: `${tile.layerId}:${tile.tile[0]}:${tile.tile[1]}`,
      path: fileName,
      layerId: tile.layerId,
      layerName: tile.layerName,
      tile: tile.tile,
      boundsMm: tileBounds(tile.tile, options.tileSize),
      netIds,
      bytes: stat.size,
      vertices: geometry.positions.length / 3,
      triangles: geometry.indices.length / 3,
    },
    metrics,
  };
}

function workerCountFor(tileCount) {
  const requested = Number(process.env.PRISM_SEMANTIC_GLTF_WORKERS || 0);
  const cpuCount = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
  const automatic = Math.max(1, Math.min(cpuCount - 1, 6));
  const count = requested > 0 ? requested : automatic;
  return Math.max(1, Math.min(count, tileCount || 1));
}

function createProgress(startedAt) {
  return (message) => {
    const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    console.error(`[semantic-gltf +${elapsedSeconds}s] ${message}`);
  }
}

function createMetrics() {
  return {
    schema: "prism.semantic_gltf_metrics_a0",
    input_parse_ms: 0,
    tile_assignment_ms: 0,
    js_clip_ms: 0,
    preclipped_ingest_ms: 0,
    earcut_ms: 0,
    gltf_authoring_ms: 0,
    meshopt_ms: 0,
    glb_write_ms: 0,
    worker_startup_ms: 0,
    node_pack_total_ms: 0,
    total_ms: 0,
    worker_phase_ms: {
      earcut_ms: 0,
      gltf_authoring_ms: 0,
      meshopt_ms: 0,
      glb_write_ms: 0,
    },
    geometry_stats: {},
  };
}

async function writeMetrics(metrics, context) {
  const metricsPath = process.env.PRISM_SEMANTIC_GLTF_METRICS_PATH;
  if (!metricsPath) return;
  await fs.mkdir(path.dirname(metricsPath), { recursive: true });
  await fs.writeFile(
    metricsPath,
    JSON.stringify({
      ...metrics,
      context,
      worker_phase_ms: undefined,
    }, null, 2),
  );
}

function elapsedMs(start) {
  return performance.now() - start;
}

function mergeMetricObject(target, source) {
  if (!target || !source) return;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      target[key] = Number(target[key] || 0) + value;
    }
  }
}

function normalizeMeshoptLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  if (["low", "medium", "high"].includes(level)) return level;
  return "medium";
}

function normalizeClipperMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (CLIPPER_MODES.has(mode)) return mode;
  throw new Error(
    `PRISM_SEMANTIC_CLIPPER must be one of ${[...CLIPPER_MODES].join(", ")}; got ${JSON.stringify(value)}`,
  );
}

async function buildClippedTiles(input, options) {
  const clippedInput = await loadNativeClipResponse(input);
  if (options.mode === "js") {
    return buildJsClippedTiles(input, options);
  }
  if (isPreclippedMode(options.mode)) {
    if (!clippedInput) throw new Error(nativeUnavailableMessage());
    return buildPreclippedTiles(input, clippedInput, options);
  }
  if (isVerifyMode(options.mode)) {
    if (!clippedInput) throw new Error(`PRISM_SEMANTIC_CLIPPER=verify requires native clipped input. ${nativeUnavailableMessage()}`);
    const js = buildJsClippedTiles(input, options);
    const native = buildPreclippedTiles(input, clippedInput, options);
    compareClippedTiles(js.tiles, native.tiles);
    options.progress(`clipper verify passed: JS oracle matches ${native.backend} pre-clipped geometry`);
    return { ...native, verification: { oracle: "polygon-clipping", passed: true } };
  }
  if (clippedInput) {
    const backend = nativeBackendName(clippedInput);
    options.progress(`clipper auto: using ${backend} pre-clipped geometry`);
    return buildPreclippedTiles(input, clippedInput, options);
  }
  options.progress(`clipper auto: falling back to polygon-clipping (${nativeUnavailableMessage()})`);
  return buildJsClippedTiles(input, options);
}

function isPreclippedMode(mode) {
  return ["clipper2", "clipper2-a2"].includes(mode);
}

function isVerifyMode(mode) {
  return ["verify", "verify-clipper2-a2"].includes(mode);
}

async function loadNativeClipResponse(input) {
  if (input.clipperResponse) return input.clipperResponse;
  if (input.preclippedGeometry) return input.preclippedGeometry;
  const responsePath = process.env.PRISM_SEMANTIC_CLIPPED_INPUT;
  if (!responsePath) return null;
  return JSON.parse(await fs.readFile(responsePath, "utf8"));
}

function nativeUnavailableMessage() {
  return (
    "No Prism native scene-level clipped response was supplied. " +
    "Set PRISM_SEMANTIC_CLIPPED_INPUT to a " +
    `${CLIPPER_RESPONSE_SCHEMA} file produced by the native batch clipper.`
  );
}

function buildJsClippedTiles(input, options) {
  const tiles = new Map();
  const objects = input.objects || [];
  const stats = emptyClipperStats();
  let objectIndex = 0;

  for (const object of objects) {
    objectIndex += 1;
    for (const polygon of object.polygons || []) {
      stats.source_polygons += 1;
      const source = [[closeRing(polygon.outer), ...(polygon.holes || []).map(closeRing)]];
      const bounds = polygonBounds(polygon);
      const assignmentStart = performance.now();
      const polygonTiles = tilesForBounds(bounds, options.tileSize);
      options.metrics.tile_assignment_ms += elapsedMs(assignmentStart);
      stats.candidate_tiles += polygonTiles.length;
      if (polygonTiles.length === 1) {
        stats.single_tile_polygons += 1;
        appendTilePolygon(tiles, object, polygonTiles[0], source[0], polygon);
        stats.interior_fast_path_tiles += 1;
        stats.clipped_regions += 1;
        continue;
      }
      for (const tile of polygonTiles) {
        if (!boundsOverlap(bounds, tileBounds(tile, options.tileSize))) {
          stats.bbox_rejected_tiles += 1;
          continue;
        }
        if (tileWhollyInsidePolygon(polygon, tile, options.tileSize)) {
          appendTilePolygon(tiles, object, tile, [tileRing(tile, options.tileSize)], polygon);
          stats.interior_fast_path_tiles += 1;
          stats.clipped_regions += 1;
          continue;
        }
        const clip = [[tileRing(tile, options.tileSize)]];
        const clipStart = performance.now();
        const clipped = polygonClipping.intersection(source, clip);
        options.metrics.js_clip_ms += elapsedMs(clipStart);
        if (!clipped?.length) continue;
        for (const clippedPolygon of clipped) {
          appendTilePolygon(tiles, object, tile, clippedPolygon, polygon);
          stats.clipped_regions += 1;
        }
      }
    }
    if (objectIndex === objects.length || objectIndex % 1000 === 0) {
      options.progress(
        `clipped objects=${objectIndex}/${objects.length} polygons=${stats.source_polygons} ` +
        `singleTile=${stats.single_tile_polygons} candidateTiles=${stats.candidate_tiles} ` +
        `fastTiles=${stats.interior_fast_path_tiles} regions=${stats.clipped_regions} tiles=${tiles.size}`,
      );
    }
  }

  return { tiles, backend: "js", stats };
}

function buildPreclippedTiles(input, response, options) {
  const ingestStart = performance.now();
  validateNativeClipResponse(input, response, options.tileSize);
  const tiles = new Map();
  const records = sourcePolygonRecords(input, options.tileSize);
  const entries = response.clippedTiles || response.jobs || [];
  const backend = nativeBackendName(response);
  const stats = { ...emptyClipperStats(), ...(response.stats || {}) };
  stats.native_boolean_jobs = Number(stats.native_boolean_jobs || entries.length);
  stats.source_polygons = Number(stats.source_polygons || records.size);
  stats.clipped_regions = 0;
  stats.single_tile_polygons = 0;

  for (const record of records.values()) {
    if (!record.singleTile) continue;
    appendTilePolygon(tiles, record.object, record.singleTile, record.sourcePolygon, record.polygon);
    stats.single_tile_polygons += 1;
    stats.interior_fast_path_tiles += 1;
    stats.clipped_regions += 1;
  }

  for (const entry of entries) {
    const recordId = String(entry.sourcePolygonRecordId ?? entry.sourceRecordId ?? "");
    const record = records.get(recordId);
    if (!record) {
      throw new Error(`${backend} clipped response references unknown sourcePolygonRecordId=${JSON.stringify(recordId)}`);
    }
    if (record.singleTile) {
      throw new Error(
        `${backend} clipped response must not include single-tile direct sourcePolygonRecordId=${JSON.stringify(recordId)}`,
      );
    }
    const tile = normalizeTile(entry.tile);
    for (const region of entry.regions || entry.clippedRegions || []) {
      const polygon = [closeRing(region.outer || region.outline || []), ...(region.holes || []).map(closeRing)];
      if (!polygon[0]?.length) continue;
      appendTilePolygon(tiles, record.object, tile, polygon, record.polygon);
      stats.clipped_regions += 1;
    }
  }
  options.metrics.preclipped_ingest_ms += elapsedMs(ingestStart);
  options.progress(
    `clipper ${backend}: jobs=${stats.native_boolean_jobs} singleTile=${stats.single_tile_polygons} ` +
    `regions=${stats.clipped_regions} tiles=${tiles.size}`,
  );
  return {
    tiles,
    backend,
    native: response.native || response.clipper || null,
    stats,
  };
}

function nativeBackendName(response) {
  return String(response?.clipper?.backend || response?.native?.backend || "native");
}

function validateNativeClipResponse(input, response, tileSize) {
  const backend = nativeBackendName(response);
  if (!response || typeof response !== "object") {
    throw new Error(`${backend} clipped response must be a JSON object`);
  }
  if (response.schema !== CLIPPER_RESPONSE_SCHEMA) {
    throw new Error(`${backend} clipped response schema must be ${CLIPPER_RESPONSE_SCHEMA}; got ${JSON.stringify(response.schema)}`);
  }
  if (Number(response.protocolVersion || CLIPPER_PROTOCOL_VERSION) !== CLIPPER_PROTOCOL_VERSION) {
    throw new Error(`Unsupported ${backend} clipped response protocolVersion=${response.protocolVersion}`);
  }
  if (Number(response.precisionDecimalPlaces ?? CLIPPER_DECIMAL_PLACES) !== CLIPPER_DECIMAL_PLACES) {
    throw new Error(`${backend} clipped response must use ${CLIPPER_DECIMAL_PLACES} decimal places in millimetres`);
  }
  if (Number(response.tileSizeMm || tileSize) !== Number(tileSize)) {
    throw new Error(`${backend} clipped response tileSizeMm=${response.tileSizeMm} does not match input tileSizeMm=${tileSize}`);
  }
  if (
    response.sourceGeometryRevision &&
    input.sourceGeometryRevision &&
    response.sourceGeometryRevision !== input.sourceGeometryRevision
  ) {
    throw new Error(`${backend} clipped response sourceGeometryRevision does not match semantic input`);
  }
  if (
    response.coordinateSystem &&
    input.coordinateSystem &&
    JSON.stringify(response.coordinateSystem) !== JSON.stringify(input.coordinateSystem)
  ) {
    throw new Error(`${backend} clipped response coordinateSystem does not match semantic input`);
  }
  const nativeIdentity = response.native || response.clipper;
  if (nativeIdentity && (!nativeIdentity.version || !nativeIdentity.abi)) {
    throw new Error(`${backend} clipped response must include native version and ABI metadata`);
  }
  const seenJobs = new Set();
  for (const entry of response.clippedTiles || response.jobs || []) {
    const key = `${entry.sourcePolygonRecordId ?? entry.sourceRecordId ?? ""}:${normalizeTile(entry.tile).join(":")}`;
    if (seenJobs.has(key)) {
      throw new Error(`${backend} clipped response duplicated job binding ${key}`);
    }
    seenJobs.add(key);
    for (const region of entry.regions || entry.clippedRegions || []) {
      validateResponseRing(region.outer || region.outline || []);
      for (const hole of region.holes || []) validateResponseRing(hole);
    }
  }
}

function validateResponseRing(ring) {
  const open = openRing(ring);
  const distinct = new Set();
  for (const point of open) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new Error(`native clipped response contained non-finite coordinate: ${JSON.stringify(point)}`);
    }
    distinct.add(`${point[0]}:${point[1]}`);
  }
  if (distinct.size < 3) {
    throw new Error("native clipped response ring has fewer than three distinct vertices");
  }
}

function sourcePolygonRecords(input, tileSize = null) {
  const records = new Map();
  let fallbackId = 0;
  for (const object of input.objects || []) {
    for (const polygon of object.polygons || []) {
      fallbackId += 1;
      const id = String(polygon.sourcePolygonRecordId ?? fallbackId);
      const sourcePolygon = [
        closeRing(polygon.outer || []),
        ...(polygon.holes || []).map(closeRing),
      ];
      let singleTile = null;
      if (tileSize) {
        const polygonTiles = tilesForBounds(polygonBounds(polygon), tileSize);
        if (polygonTiles.length === 1) singleTile = polygonTiles[0];
      }
      records.set(id, { object, polygon, sourcePolygon, singleTile });
    }
  }
  return records;
}

function compareClippedTiles(expected, actual) {
  compareClippedTileCoverage(expected, actual);
  if (process.env.PRISM_SEMANTIC_VERIFY_STRICT === "1") {
    compareClippedTilesStrict(expected, actual);
  }
}

function compareClippedTilesStrict(expected, actual) {
  const expectedCanonical = canonicalTiles(expected);
  const actualCanonical = canonicalTiles(actual);
  assertSameKeys(expectedCanonical, actualCanonical, "tile");
  for (const [key, value] of expectedCanonical) {
    const actualValue = actualCanonical.get(key);
    if (!canonicalGeometryEquals(value, actualValue)) {
      throw new Error(
        `native clipped geometry differs from JS oracle for tile ${key}: ` +
        clippedTileDiffPreview(value, actualValue),
      );
    }
  }
}

function compareClippedTileCoverage(expected, actual) {
  const expectedCoverage = coverageTiles(expected);
  const actualCoverage = coverageTiles(actual);
  assertSameKeys(expectedCoverage, actualCoverage, "tile");
  for (const [tileKey, expectedBindings] of expectedCoverage) {
    const actualBindings = actualCoverage.get(tileKey) || new Map();
    assertSameKeys(expectedBindings, actualBindings, `semantic binding in tile ${tileKey}`);
    for (const [bindingKey, expectedPolygons] of expectedBindings) {
      const actualPolygons = actualBindings.get(bindingKey) || [];
      const expectedArea = multiPolygonArea(unionPolygons(expectedPolygons));
      const actualArea = multiPolygonArea(unionPolygons(actualPolygons));
      const symmetricDiffArea = multiPolygonArea(xorPolygons(expectedPolygons, actualPolygons));
      if (
        Math.abs(expectedArea - actualArea) > CLIPPER_COVERAGE_AREA_EPSILON ||
        symmetricDiffArea > CLIPPER_COVERAGE_AREA_EPSILON
      ) {
        throw new Error(
          `native clipped coverage differs from JS oracle for tile ${tileKey} binding ${bindingKey}: ` +
          `expectedArea=${expectedArea} actualArea=${actualArea} symmetricDiffArea=${symmetricDiffArea} ` +
          clippedTileDiffPreview(canonicalTiles(expected).get(tileKey), canonicalTiles(actual).get(tileKey)),
        );
      }
    }
  }
}

function coverageTiles(tiles) {
  const result = new Map();
  for (const [tileKey, tile] of tiles) {
    const bindings = new Map();
    for (const object of tile.objects) {
      const bindingKey = JSON.stringify([
        Number(object.netId || 0),
        Number(object.objectFeatureId || 0),
        String(object.sourcePolygonRecordId ?? ""),
        Number(object.sourceOrder ?? 0),
      ]);
      const polygons = bindings.get(bindingKey) || [];
      polygons.push(object.polygon);
      bindings.set(bindingKey, polygons);
    }
    result.set(tileKey, bindings);
  }
  return result;
}

function unionPolygons(polygons) {
  const geometries = polygons
    .filter((polygon) => polygon?.[0]?.length >= 3)
    .map((polygon) => [polygon]);
  if (!geometries.length) return [];
  return polygonClipping.union(...geometries);
}

function xorPolygons(left, right) {
  const geometries = [...left, ...right]
    .filter((polygon) => polygon?.[0]?.length >= 3)
    .map((polygon) => [polygon]);
  if (!geometries.length) return [];
  return polygonClipping.xor(...geometries);
}

function multiPolygonArea(multiPolygon) {
  let area = 0;
  for (const polygon of multiPolygon || []) {
    if (!polygon?.length) continue;
    area += Math.abs(ringArea(polygon[0]));
    for (const hole of polygon.slice(1)) {
      area -= Math.abs(ringArea(hole));
    }
  }
  return Math.max(0, area);
}

function ringArea(ring) {
  const open = openRing(ring);
  let area = 0;
  for (let index = 0; index < open.length; index += 1) {
    const current = open[index];
    const next = open[(index + 1) % open.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function canonicalGeometryEquals(left, right) {
  if (typeof left === "number" || typeof right === "number") {
    return Math.abs(Number(left) - Number(right)) <= CLIPPER_COMPARE_EPSILON;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!canonicalGeometryEquals(left[index], right[index])) return false;
    }
    return true;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) return false;
    return leftKeys.every((key) => canonicalGeometryEquals(left[key], right[key]));
  }
  return left === right;
}

function clippedTileDiffPreview(expected, actual) {
  const canonicalDiff = firstCanonicalDiff(expected, actual);
  const expectedItems = expected || [];
  const actualItems = actual || [];
  const limit = Math.max(expectedItems.length, actualItems.length);
  for (let index = 0; index < limit; index += 1) {
    const left = expectedItems[index] ?? null;
    const right = actualItems[index] ?? null;
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      return (
        `expectedCount=${expectedItems.length} actualCount=${actualItems.length} ` +
        `diffPath=${canonicalDiff?.path || "<unknown>"} diffExpected=${JSON.stringify(canonicalDiff?.left)} ` +
        `diffActual=${JSON.stringify(canonicalDiff?.right)} ` +
        `firstDiffIndex=${index} expected=${JSON.stringify(left)?.slice(0, 1200)} ` +
        `actual=${JSON.stringify(right)?.slice(0, 1200)}`
      );
    }
  }
  return `expectedCount=${expectedItems.length} actualCount=${actualItems.length}`;
}

function firstCanonicalDiff(left, right, path = "$") {
  if (typeof left === "number" || typeof right === "number") {
    return Math.abs(Number(left) - Number(right)) <= CLIPPER_COMPARE_EPSILON
      ? null
      : { path, left, right };
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, left, right };
    if (left.length !== right.length) return { path: `${path}.length`, left: left.length, right: right.length };
    for (let index = 0; index < left.length; index += 1) {
      const diff = firstCanonicalDiff(left[index], right[index], `${path}[${index}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) return { path: `${path}.keys`, left: leftKeys, right: rightKeys };
    for (const key of leftKeys) {
      const diff = firstCanonicalDiff(left[key], right[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  return left === right ? null : { path, left, right };
}

function canonicalTiles(tiles) {
  const result = new Map();
  for (const [key, tile] of tiles) {
    const objects = tile.objects.map((object) => ({
      netId: Number(object.netId || 0),
      objectFeatureId: Number(object.objectFeatureId || 0),
      sourcePolygonRecordId: String(object.sourcePolygonRecordId ?? ""),
      sourceOrder: Number(object.sourceOrder ?? 0),
      polygon: canonicalPolygon(object.polygon),
    }));
    objects.sort((a, b) =>
      a.netId - b.netId ||
      a.objectFeatureId - b.objectFeatureId ||
      a.sourceOrder - b.sourceOrder ||
      a.sourcePolygonRecordId.localeCompare(b.sourcePolygonRecordId) ||
      JSON.stringify(a.polygon).localeCompare(JSON.stringify(b.polygon)),
    );
    result.set(key, objects);
  }
  return result;
}

function canonicalPolygon(polygon) {
  return polygon.map((ring) => canonicalRing(ring)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function canonicalRing(ring) {
  const open = openRing(ring)
    .map((point) => [roundClipCompare(point[0]), roundClipCompare(point[1])])
    .filter((point, index, points) => index === 0 || !pointsNearlyEqual(point, points[index - 1]));
  if (open.length > 1) {
    const first = open[0];
    const last = open[open.length - 1];
    if (pointsNearlyEqual(first, last)) open.pop();
  }
  simplifyCollinearRing(open);
  if (!open.length) return [];
  const forward = canonicalRingRotation(open);
  const backward = canonicalRingRotation([...open].reverse());
  return JSON.stringify(forward) <= JSON.stringify(backward) ? forward : backward;
}

function canonicalRingRotation(open) {
  let best = 0;
  for (let index = 1; index < open.length; index += 1) {
    if (comparePoint(open[index], open[best]) < 0) best = index;
  }
  return [...open.slice(best), ...open.slice(0, best)];
}

function assertSameKeys(expected, actual, label) {
  const expectedKeys = [...expected.keys()].sort();
  const actualKeys = [...actual.keys()].sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    throw new Error(
      `native clipped response ${label} set differs from JS oracle: ` +
      `expected=${JSON.stringify(expectedKeys)} actual=${JSON.stringify(actualKeys)}`,
    );
  }
}

function emptyClipperStats() {
  return {
    source_polygons: 0,
    single_tile_polygons: 0,
    candidate_tiles: 0,
    bbox_rejected_tiles: 0,
    interior_fast_path_tiles: 0,
    native_boolean_jobs: 0,
    clipped_regions: 0,
  };
}

function appendTilePolygon(tiles, object, tile, polygon, sourcePolygon = null) {
  const key = `${object.layerId}:${tile[0]}:${tile[1]}`;
  const entry = tiles.get(key) || {
    layerId: object.layerId,
    layerName: object.layerName,
    zMm: object.zMm,
    thicknessMm: object.thicknessMm,
    tile,
    objects: [],
  };
  entry.objects.push({
    netId: object.netId,
    objectFeatureId: object.objectFeatureId,
    sourcePolygonRecordId: sourcePolygon?.sourcePolygonRecordId ?? "",
    sourceOrder: sourcePolygon?.sourceOrder ?? 0,
    polygon,
  });
  tiles.set(key, entry);
}

function createDocument(tile, geometry) {
  const document = new Document().setLogger(new Logger(Logger.Verbosity.ERROR));
  const buffer = document.createBuffer("geometry");
  const meshFeatures = document.createExtension(EXTMeshFeatures);
  const primitive = document
    .createPrimitive()
    .setAttribute(
      "POSITION",
      document
        .createAccessor("POSITION", buffer)
        .setType(Accessor.Type.VEC3)
        .setArray(new Float32Array(geometry.positions)),
    )
    .setAttribute(
      "NORMAL",
      document
        .createAccessor("NORMAL", buffer)
        .setType(Accessor.Type.VEC3)
        .setArray(new Float32Array(geometry.normals)),
    )
    .setAttribute(
      "_FEATURE_ID_0",
      document
        .createAccessor("netId", buffer)
        .setType(Accessor.Type.SCALAR)
        .setArray(new Float32Array(geometry.netIds)),
    )
    .setAttribute(
      "_FEATURE_ID_1",
      document
        .createAccessor("objectFeatureId", buffer)
        .setType(Accessor.Type.SCALAR)
        .setArray(new Float32Array(geometry.objectFeatureIds)),
    )
    .setIndices(
      document
        .createAccessor("indices", buffer)
        .setType(Accessor.Type.SCALAR)
        .setArray(
          geometry.positions.length / 3 <= 65535
            ? new Uint16Array(geometry.indices)
            : new Uint32Array(geometry.indices),
        ),
    );

  const features = meshFeatures
    .createFeatures()
    .addFeatureID(
      meshFeatures
        .createFeatureID()
        .setFeatureCount(maxValue(geometry.netIds, 1) + 1)
        .setAttribute(0)
        .setLabel("net"),
    )
    .addFeatureID(
      meshFeatures
        .createFeatureID()
        .setFeatureCount(maxValue(geometry.objectFeatureIds, 1) + 1)
        .setAttribute(1)
        .setLabel("pcb_object"),
    );
  primitive
    .setExtension("EXT_mesh_features", features)
    .setExtras({
      layerId: tile.layerId,
      layerName: tile.layerName,
      tile: tile.tile,
    });

  const mesh = document.createMesh(`layer-${tile.layerId}`).addPrimitive(primitive);
  const node = document.createNode(`tile-${tile.tile[0]}-${tile.tile[1]}`).setMesh(mesh);
  document.createScene("PCB").addChild(node);
  document.getRoot().setExtras({
    schema: "prism.semantic_gltf_tile_a0",
    layerId: tile.layerId,
    layerName: tile.layerName,
    tile: tile.tile,
  });
  return document;
}

function buildTileGeometry(tile) {
  const geometry = {
    positions: [],
    normals: [],
    netIds: [],
    objectFeatureIds: [],
    indices: [],
  };
  const y1 = Number(tile.zMm) + Number(tile.thicknessMm) / 2;
  for (const object of tile.objects) {
    appendSurfacePolygon(
      geometry,
      object.polygon,
      y1,
      Number(object.netId || 0),
      Number(object.objectFeatureId || 0),
    );
  }
  return geometry;
}

function appendSurfacePolygon(geometry, polygon, y, netId, objectFeatureId) {
  const rings = polygon.map(openRing).filter((ring) => ring.length >= 3);
  if (!rings.length) return;
  const flat = flattenRings(rings);
  const triangles = earcut(flat.vertices, flat.holes, flat.dimensions);
  const base = geometry.positions.length / 3;
  for (let index = 0; index < flat.vertices.length; index += 2) {
    appendVertex(geometry, flat.vertices[index], y, flat.vertices[index + 1], 0, 1, 0, netId, objectFeatureId);
  }
  for (let index = 0; index < triangles.length; index += 3) {
    const a = triangles[index];
    const b = triangles[index + 1];
    const c = triangles[index + 2];
    geometry.indices.push(base + a, base + b, base + c);
  }
}

function appendVertex(geometry, x, y, z, nx, ny, nz, netId, objectFeatureId) {
  geometry.positions.push(x / 1000, y / 1000, z / 1000);
  geometry.normals.push(nx, ny, nz);
  geometry.netIds.push(netId);
  geometry.objectFeatureIds.push(objectFeatureId);
}

function polygonBounds(polygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of [polygon.outer, ...(polygon.holes || [])]) {
    for (const point of ring) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  return [minX, minY, maxX, maxY];
}

function sceneBounds(objects, barrels) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    const half = Number(object.thicknessMm || 0) / 2;
    minY = Math.min(minY, Number(object.zMm || 0) - half);
    maxY = Math.max(maxY, Number(object.zMm || 0) + half);
    for (const polygon of object.polygons || []) {
      for (const ring of [polygon.outer, ...(polygon.holes || [])]) {
        for (const point of ring) {
          minX = Math.min(minX, point[0]);
          minZ = Math.min(minZ, point[1]);
          maxX = Math.max(maxX, point[0]);
          maxZ = Math.max(maxZ, point[1]);
        }
      }
    }
  }
  for (const barrel of barrels) {
    const bounds = barrel.boundsMm || [];
    if (bounds.length !== 6) continue;
    minX = Math.min(minX, bounds[0]);
    minZ = Math.min(minZ, bounds[1]);
    minY = Math.min(minY, bounds[2]);
    maxX = Math.max(maxX, bounds[3]);
    maxZ = Math.max(maxZ, bounds[4]);
    maxY = Math.max(maxY, bounds[5]);
  }
  if (!Number.isFinite(minX)) return { min: [0, 0, 0], max: [0.001, 0.001, 0.001] };
  return {
    min: [
      minX / 1000,
      (Number.isFinite(minY) ? minY : 0) / 1000,
      minZ / 1000,
    ],
    max: [
      maxX / 1000,
      (Number.isFinite(maxY) ? maxY : 1) / 1000,
      maxZ / 1000,
    ],
  };
}

function tilesForBounds(bounds, size) {
  const epsilon = 1e-9;
  const result = [];
  for (let y = Math.floor(bounds[1] / size); y <= Math.floor((bounds[3] - epsilon) / size); y++) {
    for (let x = Math.floor(bounds[0] / size); x <= Math.floor((bounds[2] - epsilon) / size); x++) {
      result.push([x, y]);
    }
  }
  return result;
}

function tileBounds(tile, size) {
  return [tile[0] * size, tile[1] * size, (tile[0] + 1) * size, (tile[1] + 1) * size];
}

function tileRing(tile, size) {
  const [minX, minY, maxX, maxY] = tileBounds(tile, size);
  return closeRing([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]);
}

function tileWhollyInsidePolygon(polygon, tile, size) {
  const bounds = tileBounds(tile, size);
  const epsilon = 1e-9;
  const corners = [
    [bounds[0] + epsilon, bounds[1] + epsilon],
    [bounds[2] - epsilon, bounds[1] + epsilon],
    [bounds[2] - epsilon, bounds[3] - epsilon],
    [bounds[0] + epsilon, bounds[3] - epsilon],
  ];
  if (!corners.every((point) => pointInFilledPolygon(point, polygon))) return false;
  const rings = [polygon.outer || [], ...(polygon.holes || [])];
  for (const ring of rings) {
    const open = openRing(ring);
    if (open.length < 3) continue;
    if (ringIntersectsBounds(open, bounds)) return false;
    if (open.some((point) => pointInsideBounds(point, bounds))) return false;
  }
  return true;
}

function pointInFilledPolygon(point, polygon) {
  if (!pointInRing(point, polygon.outer || [])) return false;
  for (const hole of polygon.holes || []) {
    if (pointInRing(point, hole)) return false;
  }
  return true;
}

function pointInRing(point, ring) {
  const open = openRing(ring);
  let inside = false;
  for (let index = 0, previous = open.length - 1; index < open.length; previous = index++) {
    const a = open[index];
    const b = open[previous];
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]);
    if (crosses) {
      const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

function ringIntersectsBounds(ring, bounds) {
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    if (pointInsideBounds(a, bounds) || pointInsideBounds(b, bounds)) return true;
    if (segmentIntersectsBounds(a, b, bounds)) return true;
  }
  return false;
}

function segmentIntersectsBounds(a, b, bounds) {
  const edges = [
    [[bounds[0], bounds[1]], [bounds[2], bounds[1]]],
    [[bounds[2], bounds[1]], [bounds[2], bounds[3]]],
    [[bounds[2], bounds[3]], [bounds[0], bounds[3]]],
    [[bounds[0], bounds[3]], [bounds[0], bounds[1]]],
  ];
  return edges.some(([c, d]) => segmentsIntersect(a, b, c, d));
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 === 0 && pointOnSegment(c, a, b)) return true;
  if (o2 === 0 && pointOnSegment(d, a, b)) return true;
  if (o3 === 0 && pointOnSegment(a, c, d)) return true;
  if (o4 === 0 && pointOnSegment(b, c, d)) return true;
  return o1 !== o2 && o3 !== o4;
}

function orientation(a, b, c) {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(value) <= 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

function pointOnSegment(point, a, b) {
  return (
    Math.min(a[0], b[0]) - 1e-9 <= point[0] &&
    point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    Math.min(a[1], b[1]) - 1e-9 <= point[1] &&
    point[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

function pointInsideBounds(point, bounds) {
  return bounds[0] < point[0] && point[0] < bounds[2] && bounds[1] < point[1] && point[1] < bounds[3];
}

function boundsOverlap(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function closeRing(ring) {
  if (!ring.length) return ring;
  const result = ring.map((point) => [Number(point[0]), Number(point[1])]);
  const first = result[0];
  const last = result[result.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) result.push([...first]);
  return result;
}

function openRing(ring) {
  const result = ring.map((point) => [Number(point[0]), Number(point[1])]);
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) result.pop();
  }
  return result;
}

function compareTiles(a, b) {
  return a.layerId - b.layerId || a.tile[1] - b.tile[1] || a.tile[0] - b.tile[0];
}

function maxValue(values, fallback = 0) {
  let maximum = fallback;
  for (const value of values) maximum = Math.max(maximum, Number(value || 0));
  return maximum;
}

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function comparePoint(a, b) {
  return a[0] - b[0] || a[1] - b[1];
}

function pointsNearlyEqual(a, b) {
  return Math.abs(a[0] - b[0]) <= CLIPPER_COMPARE_EPSILON && Math.abs(a[1] - b[1]) <= CLIPPER_COMPARE_EPSILON;
}

function simplifyCollinearRing(ring) {
  let changed = true;
  while (changed && ring.length >= 3) {
    changed = false;
    for (let index = 0; index < ring.length; index += 1) {
      const previous = ring[(index + ring.length - 1) % ring.length];
      const point = ring[index];
      const next = ring[(index + 1) % ring.length];
      if (pointNearlyOnSegment(point, previous, next)) {
        ring.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
}

function pointNearlyOnSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= CLIPPER_COMPARE_EPSILON * CLIPPER_COMPARE_EPSILON) {
    return pointsNearlyEqual(point, a) || pointsNearlyEqual(point, b);
  }
  const cross = Math.abs((point[0] - a[0]) * dy - (point[1] - a[1]) * dx);
  const distance = cross / Math.sqrt(lengthSquared);
  if (distance > CLIPPER_COMPARE_EPSILON) return false;
  const dot = (point[0] - a[0]) * dx + (point[1] - a[1]) * dy;
  return dot >= -CLIPPER_COMPARE_EPSILON && dot <= lengthSquared + CLIPPER_COMPARE_EPSILON;
}

function roundClip(value) {
  return Math.round(Number(value) * 10 ** CLIPPER_DECIMAL_PLACES) / 10 ** CLIPPER_DECIMAL_PLACES;
}

function roundClipCompare(value) {
  return Math.round(Number(value) / CLIPPER_COMPARE_EPSILON) * CLIPPER_COMPARE_EPSILON;
}

function normalizeTile(tile) {
  if (!Array.isArray(tile) || tile.length !== 2) {
    throw new Error(`invalid tile coordinate in native clipped response: ${JSON.stringify(tile)}`);
  }
  return [Number(tile[0]), Number(tile[1])];
}
