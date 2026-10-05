// The system 3D scene (System Builder SB2-27): every board of a system in one
// WebGPU view, from the `prism.system_scene.a0` descriptor (CONTRACTS_P2 §20).
//
// Each board asset (one bundle per project and commit) loads once into its own
// renderer of a `SceneRenderer` and draws at every occurrence that uses it:
// world matrix (mm) · bundleToBoard, scaled to the renderer's metres. The
// board tier (board context, copper tiles, barrels) loads when the asset is
// ready; components load when some copy of it first needs full detail.
// Occurrences without geometry (a restricted board, a bundle that is still
// building, missing or failed) draw as their box from the descriptor.
//
// This module keeps its state per instance, unlike main.js, so it does not
// share the one-board viewer's one-per-page limit.

import { AssetCache } from "./asset-cache.js";
import {
  boardRole,
  FINISH_COLORS,
  finishColorFor,
  innerCopperLayer,
  isOuterCopperLayer,
  mergeBounds,
  mergePrimitivesByMaterial,
  pasteLayerIdFor,
  runtimeBoundsFromGltf,
} from "./bundle-geometry.js";
import { absolutizeAssetPaths, bundleIsFinal } from "./bundle-urls.js";
import { CameraController } from "./camera.js";
import { loadGltf } from "./gltf-loader.js";
import { add, boundsRadius, cross, scale } from "./math.js";
import {
  AXES, SNAP, axisAmount, canonicalPose, localAxes, moveDescriptor, moveTarget, perpendicular,
  ringRotation, rotatePoseAbout, screenAngle, snapTo, translatePose,
} from "./move-gizmo.js";
import {
  IDENTITY, LOD_THRESHOLDS, normalizeLodThresholds, projectToViewport, transformBounds, transformPoint,
} from "./occurrences.js";
import { SceneRenderer } from "./scene-renderer.js";

const SCENE_SCHEMA = "prism.system_scene.a0";
const MM = 0.001; // descriptor millimetres → renderer metres
const TILE_CONCURRENCY = 6;
const COMPONENT_IDLE_EVICT_MS = 5000;
export const DEFAULT_SCENE_GPU_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024;

// Stand-in boxes by why the board has no geometry.
export const STAND_INS = Object.freeze({
  restricted: { color: [0.55, 0.57, 0.6, 1], label: "Restricted" },
  loading: { color: [0.7, 0.76, 0.82, 1], label: "Loading…" },
  building: { color: [0.62, 0.72, 0.84, 1], label: "Building 3D view…" },
  missing: { color: [0.78, 0.76, 0.7, 1], label: "No 3D view" },
  failed: { color: [0.86, 0.6, 0.56, 1], label: "3D view failed" },
  unknown: { color: [0.78, 0.76, 0.7, 1], label: "" },
});

const SCALE_MM = Object.freeze([MM, 0, 0, 0, 0, MM, 0, 0, 0, 0, MM, 0, 0, 0, 0, 1]);

// Column-major product in double precision: placement composes in float64 and is
// narrowed to float32 once, when the occurrence buffer is written.
function mat4Multiply(a, b) {
  const output = new Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
    }
  }
  return output;
}

function translation([x, y, z]) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function scaling([x, y, z]) {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

/** An asset occurrence's model matrix in renderer metres: S(1/1000) · world · bundleToBoard. */
export function assetOccurrenceMatrix(worldMatrix, bundleToBoard) {
  return mat4Multiply(SCALE_MM, mat4Multiply(worldMatrix, bundleToBoard));
}

/** A stand-in's matrix: the unit box mapped onto the occurrence's box (own frame, mm), then placed. */
export function standInMatrix(worldMatrix, boundsMm) {
  const min = boundsMm.minMm;
  const size = boundsMm.maxMm.map((value, index) => Math.max(value - min[index], 0.2));
  return mat4Multiply(SCALE_MM, mat4Multiply(worldMatrix, mat4Multiply(translation(min), scaling(size))));
}

/**
 * Why an occurrence draws as a stand-in, or null when its asset draws it.
 * `state` is the asset's load state here (waiting, loading, loaded, failed).
 */
export function standInKind(occurrence, asset, state) {
  if (occurrence.restricted) return "restricted";
  if (!occurrence.assetId || !asset) return "missing";
  if (state === "loaded") return null;
  if (state === "failed") return "failed";
  if (asset.status === "ready") return asset.bundleUrl && asset.bundleToBoard ? "loading" : "building";
  return STAND_INS[asset.status] ? asset.status : "unknown";
}

/** Occurrences to place: boards, and restricted assemblies (one box for a hidden child system). */
export function drawnOccurrences(descriptor) {
  return (descriptor?.occurrences || []).filter((item) => item.kind === "board" || item.restricted);
}

const GIZMO_PX = 90; // on-screen length of a translate arrow
const AXIS_COLORS = ["#e5484d", "#30a46c", "#3e63dd"];
const AXIS_NAMES = ["X", "Y", "Z"];

function samePose(a, b) {
  if (!a || !b) return false;
  const x = canonicalPose(a);
  const y = canonicalPose(b);
  const left = [...x.translationMm, ...x.rotation];
  const right = [...y.translationMm, ...y.rotation];
  return left.every((value, index) => Math.abs(value - right[index]) < 1e-6);
}

const LOD_STORAGE_KEY = "prism.systemScene.lodThresholds";
const TUNING_FIELDS = Object.freeze([
  { key: "fullPx", label: "Components", max: 600 },
  { key: "boardPx", label: "Copper", max: 400 },
  { key: "boxPx", label: "Box below", max: 120 },
]);

// Thresholds tuned in the panel stay with this browser; storage can be missing or throw.
function readLodThresholds() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(LOD_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") return normalizeLodThresholds(saved);
  } catch {
    // Fall back to the defaults.
  }
  return { ...LOD_THRESHOLDS };
}

function writeLodThresholds(thresholds) {
  try {
    if (thresholds) globalThis.localStorage?.setItem(LOD_STORAGE_KEY, JSON.stringify(thresholds));
    else globalThis.localStorage?.removeItem(LOD_STORAGE_KEY);
  } catch {
    // Tuning still applies for this page.
  }
}

export class SystemScene {
  constructor({
    canvas, labelsEl, statsEl, gizmoEl = null, helpEl = null, tuningEl = null,
    onSelectionChange = () => {}, onStatus = () => {}, onMove = () => {},
  }) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.statsEl = statsEl;
    this.gizmoEl = gizmoEl;
    this.helpEl = helpEl;
    this.tuningEl = tuningEl;
    this.onSelectionChange = onSelectionChange;
    this.onStatus = onStatus;
    this.onMove = onMove;
    // Move mode (SB2-29): `preview` is a pose not saved yet, shown over the host's descriptor.
    this.move = { allowed: false, enabled: false, space: "world", target: null, preview: null, drag: null };
    this.baseDescriptor = null;
    this.descriptor = null;
    // SB2-30: when the first descriptor arrived and when every ready board was first drawn.
    this.timing = { descriptorAt: null, boardsDrawnAt: null };
    this.assets = new Map(); // assetId → asset state
    this.placed = []; // { occurrence, rendererId, matrix, worldBounds, standIn }
    this.selection = null; // { index, key, featureId }
    this.gpuBudgetBytes = DEFAULT_SCENE_GPU_BUDGET_BYTES;
    this.showStats = false;
    // SB2-30a: level-of-detail thresholds, tunable with the stats overlay; kept per viewer.
    this.lodThresholds = readLodThresholds();
    this.showLabels = true;
    this.disposed = false;
    this.framed = false;
    this.frameSamples = [];
    this.lastFrame = performance.now();
    this.cache = AssetCache.open();
  }

  async init() {
    this.scene = await SceneRenderer.create(this.canvas);
    this.scene.setLodThresholds(this.lodThresholds);
    this.buildTuning();
    this.camera = new CameraController([-0.1, -0.1, -0.01, 0.1, 0.1, 0.01]);
    this.bindInteractions();
    this.loop = (now) => {
      if (this.disposed) return;
      this.frame(now);
      this.frameId = requestAnimationFrame(this.loop);
    };
    this.frameId = requestAnimationFrame(this.loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.unbind?.();
    this.scene?.dispose();
    this.scene = null;
  }

  /** Show a descriptor. Assets already loaded are kept; newly ready ones start loading. */
  setDescriptor(descriptor) {
    if (descriptor?.schema !== SCENE_SCHEMA) throw new Error(`Unsupported system scene schema: ${descriptor?.schema || "missing"}`);
    this.baseDescriptor = descriptor;
    this.timing.descriptorAt ??= performance.now();
    // A preview the host has now saved is simply the new state; any other survives re-reads.
    const target = this.move.target ? descriptor.occurrences.find((item) => item.path === this.move.target) : null;
    if (!target) this.dropTarget();
    else if (!this.move.drag && samePose(this.move.preview, target.pose)) this.move.preview = null;
    descriptor = this.shownDescriptor();
    this.descriptor = descriptor;
    const live = new Set();
    for (const asset of descriptor.assets || []) {
      live.add(asset.assetId);
      const known = this.assets.get(asset.assetId);
      if (known && known.bundleUrl === asset.bundleUrl && known.state !== "failed") {
        known.descriptor = asset;
        continue;
      }
      if (known) this.dropAsset(asset.assetId);
      const record = { descriptor: asset, bundleUrl: asset.bundleUrl, state: "waiting", componentTier: "idle", componentEntries: [], componentsWantedAt: 0 };
      this.assets.set(asset.assetId, record);
      if (asset.status === "ready" && asset.bundleUrl && asset.bundleToBoard) void this.loadAsset(asset.assetId, record);
    }
    for (const id of [...this.assets.keys()]) if (!live.has(id)) this.dropAsset(id);
    this.place();
    // The host re-read the scene (after a save, or while bundles build): let it show the saved state.
    if (this.move.enabled) this.emitMove("sync");
  }

  dropAsset(id) {
    this.assets.get(id)?.abort?.abort();
    this.assets.delete(id);
    this.scene?.removeAsset(id);
  }

  // ----- loading -------------------------------------------------------------

  async loadAsset(id, record) {
    record.state = "loading";
    record.abort = new AbortController();
    const signal = record.abort.signal;
    const current = () => !this.disposed && this.assets.get(id) === record && !signal.aborted;
    try {
      const bundleUrl = new URL(record.bundleUrl, document.baseURI).toString();
      const response = await fetch(bundleUrl, { cache: "no-store", signal });
      if (!response.ok) throw new Error(`Failed to load ${bundleUrl}: ${response.status}`);
      const bundle = await response.json();
      if (!current()) return;
      // The same cache key as the board's own 3D tab, so both share cached files.
      const cacheKey = bundle.readiness?.revision || record.descriptor.sourceRevisionKey || "";
      const cache = bundleIsFinal(bundle) && this.cache.enabled ? this.cache : null;
      record.cache = cache;
      const fetchJson = async (url) => {
        if (cache) return cache.fetchJson(url, { signal });
        const reply = await fetch(url, { cache: "no-store", signal });
        if (!reply.ok) throw new Error(`Failed to load ${url}: ${reply.status}`);
        return reply.json();
      };
      const geometryUrl = new URL(bundle.semantic_geometry || "semantic_geometry.json", bundleUrl).toString();
      const geometry = absolutizeAssetPaths(await fetchJson(geometryUrl), bundleUrl, bundle, cacheKey);
      const manifestPath = geometry.assets?.scene_manifest || geometry.semantic_gltf?.path;
      if (!manifestPath) throw new Error("The bundle has no scene manifest");
      record.manifestUrl = new URL(manifestPath, bundleUrl).toString();
      const manifest = await fetchJson(record.manifestUrl);
      if (!current()) return;
      record.geometry = geometry;
      record.manifest = manifest;
      record.copperLayers = (manifest.layers || []).filter((layer) => layer.role === "copper" || String(layer.name).endsWith(".Cu"));
      record.visibleLayers = new Set(record.copperLayers.map((layer) => Number(layer.id)));
      record.componentFeatures = new Map((manifest.components || []).map((component) => [component.designator, component]));
      record.features = new Map();
      for (const feature of manifest.objectFeatures || []) record.features.set(Number(feature.id), feature);
      for (const component of manifest.components || []) record.features.set(Number(component.featureId), { ...component, kind: "component" });
      record.fetchBytes = cache ? (url) => cache.fetchBytes(url, { signal }) : undefined;

      const renderer = this.scene.asset(id);
      renderer.setBarrels(manifest.barrels || []);
      let boardBounds = null;
      // As on the board's own 3D tab: KiCad-like copper (the finish isn't in the
      // scene's files, so outer copper takes the default ENIG gold).
      renderer.setBarrelColor([...FINISH_COLORS.copper.slice(0, 3), 0.78]);
      if (geometry.assets?.base_board_glb) {
        // The pipeline's own mask (with pad openings and paste) replaces any the
        // board export carries; a mask that fails to load leaves the board bare.
        const maskPath = geometry.assets.soldermask_glb;
        const [loaded, mask] = await Promise.all([
          loadGltf(geometry.assets.base_board_glb, { defaultFeatureId: 0, fetchBytes: record.fetchBytes }),
          maskPath
            ? loadGltf(maskPath, { defaultFeatureId: 0, fetchBytes: record.fetchBytes }).catch((error) => {
              console.warn(`System scene: solder mask of ${id} failed to load`, error);
              return null;
            })
            : null,
        ]);
        if (!current()) return;
        const context = [
          ...loaded.primitives.filter((primitive) => {
            const role = boardRole(primitive);
            return role !== "pad" && !(mask && role === "soldermask");
          }),
          ...(mask?.primitives || []),
        ];
        for (const primitive of mergePrimitivesByMaterial(context, boardRole)) {
          renderer.addPrimitive(primitive, {
            kind: "board",
            boardRole: primitive.groupKey,
            layerId: primitive.groupKey === "paste" ? pasteLayerIdFor(primitive, record.copperLayers) : 0,
            material: primitive.material,
            color: primitive.material.baseColor,
          });
        }
        boardBounds = mergeBounds(context.map((primitive) => primitive.bounds));
      }
      record.boardBounds = boardBounds || runtimeBoundsFromGltf(manifest.bbox);
      renderer.setBoardBounds(record.boardBounds);
      record.state = "loaded";
      this.place();
      await this.loadTiles(record, renderer, current);
      if (current()) this.emitStatus();
    } catch (error) {
      if (!current()) return;
      console.warn(`System scene: asset ${id} failed to load`, error);
      record.state = "failed";
      record.error = error?.message || String(error);
      this.scene.removeAsset(id);
      this.place();
    }
  }

  async loadTiles(record, renderer, current) {
    const tiles = [...record.manifest.tiles || []];
    const layers = new Map((record.manifest.layers || []).map((layer) => [Number(layer.id), layer]));
    const worker = async () => {
      while (tiles.length && current()) {
        const tile = tiles.shift();
        try {
          const url = new URL(tile.path, record.manifestUrl).toString();
          // One retry: a truncated response (seen through dev proxies) is not cached and usually succeeds again.
          const loaded = await loadGltf(url, { fetchBytes: record.fetchBytes, fetchCache: "no-store" })
            .catch(() => loadGltf(url, { fetchBytes: record.fetchBytes, fetchCache: "no-store" }));
          if (!current()) return;
          const layerId = Number(tile.layerId);
          const layer = layers.get(layerId);
          for (const primitive of loaded.primitives) {
            renderer.addPrimitive(primitive, {
              kind: "copper",
              tileId: tile.id,
              layerId,
              innerCopper: innerCopperLayer(layerId, record.copperLayers),
              color: isOuterCopperLayer(layer, record.copperLayers) ? finishColorFor(null) : FINISH_COLORS.copper,
              // Outer copper marks the stencil, so the mask over it draws lighter.
              stencilMark: isOuterCopperLayer(layer, record.copperLayers),
              baseZ: Number(layer?.z_mm || 0) / 1000,
              material: { baseColor: [1, 1, 1, 1], metallic: 0.78, roughness: 0.32 },
            });
          }
        } catch (error) {
          if (current()) console.warn(`System scene: tile ${tile.id} failed to load`, error);
        }
      }
    };
    await Promise.all(Array.from({ length: TILE_CONCURRENCY }, worker));
  }

  async loadComponents(id, record) {
    const path = record.geometry?.assets?.components_glb;
    if (!path || record.componentTier !== "idle") return;
    record.componentTier = "loading";
    try {
      const loaded = await loadGltf(path, { componentFeatures: record.componentFeatures, fetchBytes: record.fetchBytes });
      if (this.disposed || this.assets.get(id) !== record || !this.scene?.assets.has(id)) return;
      const renderer = this.scene.asset(id);
      record.componentEntries = mergePrimitivesByMaterial(loaded.primitives).map((primitive) => renderer.addPrimitive(primitive, {
        kind: "component",
        layerId: 0,
        material: primitive.material,
        color: primitive.material.baseColor,
      }));
      record.componentTier = "loaded";
    } catch (error) {
      record.componentTier = "idle";
      console.warn(`System scene: components of ${id} failed to load`, error);
    }
  }

  // ----- placement -----------------------------------------------------------

  /** Place every drawn occurrence: on its asset's renderer, or as a stand-in box. */
  place({ relabel = true } = {}) {
    if (!this.scene || !this.descriptor) return;
    const assetsById = new Map((this.descriptor.assets || []).map((asset) => [asset.assetId, asset]));
    const groups = new Map();
    const placed = [];
    for (const occurrence of drawnOccurrences(this.descriptor)) {
      const asset = occurrence.assetId ? assetsById.get(occurrence.assetId) : null;
      const record = occurrence.assetId ? this.assets.get(occurrence.assetId) : null;
      const kind = standInKind(occurrence, asset, record?.state);
      let rendererId;
      let matrix;
      let worldBounds;
      if (!kind) {
        rendererId = occurrence.assetId;
        matrix = assetOccurrenceMatrix(occurrence.worldMatrix, asset.bundleToBoard);
        worldBounds = transformBounds(matrix, record.boardBounds);
      } else {
        if (!occurrence.boundsMm) continue; // no box known yet (no PCB or no interface)
        rendererId = `stand-in:${kind}`;
        this.scene.standIn(rendererId, STAND_INS[kind].color);
        matrix = standInMatrix(occurrence.worldMatrix, occurrence.boundsMm);
        worldBounds = transformBounds(matrix, [0, 0, 0, 1, 1, 1]);
      }
      if (!groups.has(rendererId)) groups.set(rendererId, []);
      groups.get(rendererId).push({ matrix, key: occurrence.path });
      placed.push({ occurrence, rendererId, matrix, worldBounds, standIn: kind });
    }
    // Stand-in renderers no longer used draw nothing.
    for (const id of this.scene.assets.keys()) if (!groups.has(id)) groups.set(id, []);
    this.scene.setOccurrences(groups);
    // Scene-wide numbers follow the renderer order; index placements by key.
    const previous = this.placedByKey;
    this.placed = placed;
    this.placedByKey = new Map(placed.map((item) => [item.occurrence.path, item]));
    if (relabel || !previous) this.renderLabels();
    else for (const item of placed) item.label = previous.get(item.occurrence.path)?.label;
    this.sceneBounds = mergeBounds(placed.map((item) => item.worldBounds));
    if (this.sceneBounds) {
      this.camera.sceneRadius = boundsRadius(this.sceneBounds);
      if (!this.framed) {
        this.camera.frame(this.sceneBounds);
        this.camera.snap();
        this.framed = true;
      }
    }
    if (this.selection && !this.placedByKey.has(this.selection.key)) this.select(null);
    else if (this.selection) this.select(this.selection.key, this.selection.featureId, { quiet: true });
    this.emitStatus();
  }

  status() {
    const counts = { boards: 0, loaded: 0, loading: 0, restricted: 0, building: 0, missing: 0, failed: 0, unknown: 0, unplaced: 0 };
    for (const occurrence of drawnOccurrences(this.descriptor)) {
      counts.boards += 1;
      const item = this.placedByKey?.get(occurrence.path);
      if (!item) counts.unplaced += 1;
      else if (!item.standIn) counts.loaded += 1;
      else if (counts[item.standIn] !== undefined) counts[item.standIn] += 1;
    }
    return counts;
  }

  emitStatus() {
    this.onStatus(this.status());
  }

  // ----- camera and frames ---------------------------------------------------

  frameAll() {
    if (this.sceneBounds) this.camera.frame(this.sceneBounds);
  }

  frameOccurrence(key) {
    const item = this.placedByKey?.get(String(key));
    if (item) this.camera.frame(item.worldBounds);
  }

  panel() {
    return {
      layerId: 0,
      viewport: { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height },
      matrix: this.camera.matrix(this.canvas.width, this.canvas.height, false),
      lod: this.cameraLod(),
    };
  }

  cameraLod() {
    const { back } = this.camera.basis();
    return {
      eye: add(this.camera.focus, scale(back, this.camera.distance)),
      orthographic: false,
      pixelScale: this.canvas.height / 2 / Math.tan(this.camera.fov / 2),
    };
  }

  optionsFor(renderer) {
    const selected = this.selection && this.selection.renderer === renderer;
    return {
      activeNetId: 0,
      selectedFeatureId: selected ? this.selection.featureId || 0 : 0,
      time: performance.now() / 1000,
      visibleLayers: this.assetFor(renderer)?.visibleLayers || new Set(),
      showBoard: true,
      showComponents: true,
      componentOpacity: 1,
      boardOpacity: 1,
      isolateNet: false,
    };
  }

  assetFor(renderer) {
    for (const [id, record] of this.assets) if (this.scene.assets.get(id) === renderer) return record;
    return null;
  }

  frame(now) {
    const started = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    const interval = now - this.lastFrame;
    this.lastFrame = now;
    this.camera.update(dt);
    this.scene.resize();
    this.currentPanel = this.panel();
    this.scene.render(this.currentPanel, (renderer) => this.optionsFor(renderer));
    this.manageTiers(now);
    this.updateLabels();
    this.updateGizmo();
    if (this.timing.boardsDrawnAt == null && this.allReadyBoardsDrawn()) this.timing.boardsDrawnAt = performance.now();
    this.frameSamples.push([interval, performance.now() - started]);
    if (this.frameSamples.length > 240) this.frameSamples.shift();
    if (this.showStats && now - (this.statsAt || 0) > 250) {
      this.statsAt = now;
      this.renderStats();
    }
  }

  /** Every board whose bundle is ready draws its own geometry, not a stand-in (and there is at least one). */
  allReadyBoardsDrawn() {
    if (!this.placed.length) return false;
    let drawn = 0;
    for (const item of this.placed) {
      if (!item.standIn) drawn += 1;
      else if (item.standIn === "loading") return false;
    }
    return drawn > 0;
  }

  /** Components on approach, eviction over the GPU budget (as the one-board viewer, per asset). */
  manageTiers(now) {
    if (now - (this.tiersAt || 0) < 250) return;
    this.tiersAt = now;
    for (const [id, record] of this.assets) {
      const renderer = this.scene.assets.get(id);
      if (record.state !== "loaded" || !renderer) continue;
      if (renderer.cullCounts.full > 0) {
        record.componentsWantedAt = now;
        if (record.componentTier === "idle") void this.loadComponents(id, record);
      }
    }
    let bytes = this.scene.gpuMemoryBytes();
    if (bytes <= this.gpuBudgetBytes) return;
    for (const [id, record] of this.assets) {
      if (record.componentTier !== "loaded" || now - record.componentsWantedAt <= COMPONENT_IDLE_EVICT_MS) continue;
      this.scene.assets.get(id)?.removeEntries(record.componentEntries);
      record.componentEntries = [];
      record.componentTier = "idle";
      record.componentEvictions = (record.componentEvictions || 0) + 1;
      bytes = this.scene.gpuMemoryBytes();
      if (bytes <= this.gpuBudgetBytes) break;
    }
  }

  // ----- labels --------------------------------------------------------------

  renderLabels() {
    if (!this.labelsEl) return;
    this.labelsEl.replaceChildren(...this.placed.map((item) => {
      const label = document.createElement("div");
      label.className = `scene-label${item.standIn ? ` stand-in ${item.standIn}` : ""}`;
      const name = document.createElement("strong");
      name.textContent = item.occurrence.displayPath || item.occurrence.labels?.join(" / ") || item.occurrence.path;
      label.append(name);
      const note = item.standIn ? STAND_INS[item.standIn]?.label : "";
      if (note) {
        const span = document.createElement("span");
        span.textContent = note;
        label.append(span);
      }
      label.dataset.key = item.occurrence.path;
      item.label = label;
      return label;
    }));
  }

  updateLabels() {
    if (!this.labelsEl || !this.currentPanel) return;
    this.labelsEl.hidden = !this.showLabels;
    if (!this.showLabels) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width / Math.max(1, this.canvas.width);
    const sy = rect.height / Math.max(1, this.canvas.height);
    for (const item of this.placed) {
      if (!item.label) continue;
      const [x0, y0, , x1, y1, z1] = item.worldBounds;
      const pixel = projectToViewport(this.currentPanel.matrix, [(x0 + x1) / 2, (y0 + y1) / 2, z1], this.currentPanel.viewport);
      const visible = pixel && pixel.x >= 0 && pixel.y >= 0 && pixel.x <= this.canvas.width && pixel.y <= this.canvas.height;
      item.label.hidden = !visible;
      if (visible) item.label.style.transform = `translate(${(pixel.x * sx).toFixed(1)}px, ${(pixel.y * sy).toFixed(1)}px) translate(-50%, -100%)`;
      item.label.classList.toggle("selected", this.selection?.key === item.occurrence.path);
    }
  }

  // ----- picking and selection -----------------------------------------------

  /** Pick at client coordinates: the occurrence and what a click there would select. */
  async pickAt(clientX, clientY) {
    if (!this.currentPanel || !this.scene) return null;
    const rect = this.canvas.getBoundingClientRect();
    const hit = await this.scene.pick(
      this.currentPanel,
      (clientX - rect.left) * this.canvas.width / rect.width,
      (clientY - rect.top) * this.canvas.height / rect.height,
      (renderer) => this.optionsFor(renderer),
    );
    const item = hit.occurrenceKey != null ? this.placedByKey.get(hit.occurrenceKey) : null;
    return { ...hit, renderer: undefined, occurrence: item?.occurrence || null, selection: item ? this.describe(item, hit.featureId) : null };
  }

  describe(item, featureId) {
    const occurrence = item.occurrence;
    const base = {
      occurrence: occurrence.path,
      displayPath: occurrence.displayPath,
      instanceId: occurrence.instanceId,
      restricted: Boolean(occurrence.restricted),
      standIn: item.standIn || null,
    };
    const record = !item.standIn ? this.assets.get(occurrence.assetId) : null;
    const feature = featureId && record ? record.features.get(Number(featureId)) : null;
    if (!feature) return { kind: "board", ...base };
    const reference = feature.designator || feature.reference || feature.componentRef || null;
    return { kind: feature.kind === "component" ? "component" : "feature", ...base, featureId: Number(featureId), reference };
  }

  /** Select an occurrence by key (and optionally a feature of it), or clear with null. */
  select(key, featureId = 0, { quiet = false } = {}) {
    const item = key != null ? this.placedByKey?.get(String(key)) : null;
    if (!item) {
      const had = Boolean(this.selection);
      this.selection = null;
      this.scene?.setSelectedOccurrence(-1);
      if (had && !quiet) this.onSelectionChange(null);
      if (this.move.enabled && !quiet) this.retarget();
      return null;
    }
    const renderer = this.scene.assets.get(item.rendererId);
    const local = renderer.occurrenceKeys.indexOf(item.occurrence.path);
    const index = renderer.occurrenceBase + local;
    this.selection = { key: item.occurrence.path, featureId: item.standIn ? 0 : featureId, renderer, index };
    this.scene.setSelectedOccurrence(item.standIn ? -1 : index);
    const detail = this.describe(item, this.selection.featureId);
    if (!quiet) this.onSelectionChange(detail);
    if (this.move.enabled) this.retarget();
    return detail;
  }

  async clickAt(clientX, clientY) {
    const hit = await this.pickAt(clientX, clientY);
    if (!hit?.occurrence) return this.select(null);
    // Only components are selectable features for now; copper hits select their board.
    const featureId = hit.selection?.kind === "component" ? hit.featureId : 0;
    return this.select(hit.occurrence.path, featureId);
  }

  projectPoint(key, local) {
    const item = this.placedByKey?.get(String(key));
    if (!item || !this.currentPanel) return null;
    const pixel = projectToViewport(this.currentPanel.matrix, transformPoint(item.matrix ?? IDENTITY, local), this.currentPanel.viewport);
    if (!pixel) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + pixel.x * rect.width / this.canvas.width, y: rect.top + pixel.y * rect.height / this.canvas.height };
  }

  /** Client coordinates of an occurrence's box centre (top face), for tests and overlays. */
  projectOccurrence(key) {
    const item = this.placedByKey?.get(String(key));
    if (!item || !this.currentPanel) return null;
    const [x0, y0, , x1, y1, z1] = item.worldBounds;
    const pixel = projectToViewport(this.currentPanel.matrix, [(x0 + x1) / 2, (y0 + y1) / 2, z1], this.currentPanel.viewport);
    if (!pixel) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + pixel.x * rect.width / this.canvas.width, y: rect.top + pixel.y * rect.height / this.canvas.height };
  }

  // ----- move mode (SB2-29) ---------------------------------------------------

  /** The host's descriptor, with the unsaved preview pose applied. */
  shownDescriptor() {
    const base = this.baseDescriptor;
    if (!base || !this.move.target || !this.move.preview) return base;
    return moveDescriptor(base, this.move.target, this.move.preview);
  }

  /** Re-place everything after the preview changed (geometry only; assets and labels stay). */
  refreshPreview() {
    if (!this.baseDescriptor) return;
    this.descriptor = this.shownDescriptor();
    this.place({ relabel: false });
  }

  targetOccurrence() {
    return this.move.target ? this.baseDescriptor?.occurrences.find((item) => item.path === this.move.target) ?? null : null;
  }

  /** What the host needs to show and save: the target and its pose (the preview when there is one). */
  moveState() {
    const target = this.targetOccurrence();
    return {
      allowed: this.move.allowed,
      enabled: this.move.enabled,
      space: this.move.space,
      dragging: Boolean(this.move.drag),
      target: target ? {
        occurrence: target.path,
        instanceId: target.instanceId,
        displayPath: target.displayPath,
        kind: target.kind,
        restricted: Boolean(target.restricted),
        pose: canonicalPose(this.move.preview ?? target.pose),
        source: this.move.preview ? "manual" : target.pose?.source ?? "default",
        unsaved: Boolean(this.move.preview),
      } : null,
    };
  }

  emitMove(phase) {
    this.onMove({ phase, ...this.moveState() });
  }

  /** Whether this reader may move boards; turning it off leaves move mode. */
  setMoveAllowed(allowed) {
    this.move.allowed = Boolean(allowed);
    if (!this.move.allowed && this.move.enabled) this.setMoveMode(false);
  }

  setMoveMode(enabled) {
    const next = Boolean(enabled) && this.move.allowed;
    if (next === this.move.enabled) return;
    if (!next) this.dropTarget();
    this.move.enabled = next;
    if (next) this.retarget({ quiet: true });
    this.emitMove("mode");
  }

  setMoveSpace(space) {
    this.move.space = space === "local" ? "local" : "world";
    this.emitMove("mode");
  }

  /** Follow the selection: the moving instance is the selection's top-level occurrence. */
  retarget({ quiet = false } = {}) {
    const target = this.move.enabled ? moveTarget(this.baseDescriptor, this.selection?.key)?.path ?? null : null;
    if (target === this.move.target) return;
    this.dropTarget();
    this.move.target = target;
    if (!quiet) this.emitMove("target");
  }

  /** Forget the target, throwing away an unsaved preview. */
  dropTarget() {
    const had = Boolean(this.move.preview);
    this.move.drag = null;
    this.move.preview = null;
    this.move.target = null;
    if (had) this.refreshPreview();
  }

  /** Show `pose` for the target without saving it (the numeric panel); null shows the saved pose. */
  previewPose(pose) {
    if (!this.move.target) return;
    this.move.preview = pose ? canonicalPose(pose) : null;
    this.refreshPreview();
    this.emitMove("preview");
  }

  /** Throw away an unsaved preview (Esc, or a save that failed). */
  cancelMove() {
    if (!this.move.preview && !this.move.drag) return;
    this.move.drag = null;
    this.move.preview = null;
    this.refreshPreview();
    this.emitMove("cancel");
  }

  /** The target's box centre in world mm: the pivot for rotations and the gizmo's origin. */
  targetPivotMm() {
    const prefix = `${this.move.target}/`;
    const boxes = this.placed
      .filter((item) => item.occurrence.path === this.move.target || item.occurrence.path.startsWith(prefix))
      .map((item) => item.worldBounds);
    const bounds = mergeBounds(boxes);
    if (!bounds) return null;
    return [0, 1, 2].map((k) => (bounds[k] + bounds[k + 3]) / 2 / MM);
  }

  /** Client-space pixel for a world point in mm, or null behind the camera. */
  screenOf(pointMm) {
    const pixel = projectToViewport(this.currentPanel.matrix, scale(pointMm, MM), this.currentPanel.viewport);
    if (!pixel) return null;
    const rect = this.canvas.getBoundingClientRect();
    return [pixel.x * rect.width / this.canvas.width, pixel.y * rect.height / this.canvas.height];
  }

  /** Lay out the gizmo for this frame, and remember what a drag on each handle means. */
  updateGizmo() {
    const svg = this.gizmoEl;
    if (!svg) return;
    const target = this.targetOccurrence();
    const pivot = this.move.enabled && target && this.currentPanel ? this.targetPivotMm() : null;
    const center = pivot ? this.screenOf(pivot) : null;
    if (!center) {
      svg.toggleAttribute("hidden", true);
      this.gizmo = null;
      return;
    }
    svg.toggleAttribute("hidden", false);
    if (!svg.firstChild) this.buildGizmo(svg);
    const { right, back } = this.camera.basis();
    const step = this.screenOf(add(pivot, right));
    const pxPerMm = step ? Math.hypot(step[0] - center[0], step[1] - center[1]) : 0;
    if (!(pxPerMm > 1e-6)) {
      svg.toggleAttribute("hidden", true);
      return;
    }
    const sizeMm = GIZMO_PX / pxPerMm;
    const pose = this.move.preview ?? target.pose;
    const axes = this.move.space === "local" ? localAxes(pose) : AXES;
    const handles = [];
    axes.forEach((axis, index) => {
      const tip = this.screenOf(add(pivot, scale(axis, sizeMm)));
      const arrow = svg.querySelector(`[data-part="t${index}"]`);
      const shown = tip && Math.hypot(tip[0] - center[0], tip[1] - center[1]) > 12;
      arrow.style.display = shown ? "" : "none";
      if (shown) {
        arrow.querySelector("line").setAttribute("x1", center[0]);
        arrow.querySelector("line").setAttribute("y1", center[1]);
        arrow.querySelector("line").setAttribute("x2", tip[0]);
        arrow.querySelector("line").setAttribute("y2", tip[1]);
        arrow.querySelector("circle").setAttribute("cx", tip[0]);
        arrow.querySelector("circle").setAttribute("cy", tip[1]);
        arrow.querySelector("text").setAttribute("x", tip[0] + 9);
        arrow.querySelector("text").setAttribute("y", tip[1] - 7);
      }
      const u = perpendicular(axis);
      const v = cross(axis, u);
      const points = [];
      for (let i = 0; i <= 64; i += 1) {
        const angle = (i / 64) * Math.PI * 2;
        const point = this.screenOf(add(pivot, scale(add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle))), sizeMm * 0.7)));
        if (point) points.push(`${point[0].toFixed(1)},${point[1].toFixed(1)}`);
      }
      svg.querySelector(`[data-part="r${index}"]`).setAttribute("points", points.join(" "));
      handles.push({ axis, pxPerMm: tip ? [(tip[0] - center[0]) / sizeMm, (tip[1] - center[1]) / sizeMm] : [0, 0] });
    });
    const dot = svg.querySelector('[data-part="pivot"]');
    dot.setAttribute("cx", center[0]);
    dot.setAttribute("cy", center[1]);
    this.gizmo = { center, pivot, handles, back };
  }

  buildGizmo(svg) {
    const ns = "http://www.w3.org/2000/svg";
    const make = (tag, attributes) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      return node;
    };
    AXIS_COLORS.forEach((color, index) => {
      const ring = make("polyline", { "data-part": `r${index}`, class: "ring", stroke: color, fill: "none" });
      ring.append(make("title", {}));
      ring.firstChild.textContent = `Rotate about ${AXIS_NAMES[index]}`;
      svg.append(ring);
    });
    AXIS_COLORS.forEach((color, index) => {
      const group = make("g", { "data-part": `t${index}`, class: "arrow", stroke: color, fill: color });
      const title = make("title", {});
      title.textContent = `Move along ${AXIS_NAMES[index]}`;
      const label = make("text", { stroke: "none" });
      label.textContent = AXIS_NAMES[index];
      group.append(title, make("line", {}), make("circle", { r: 6 }), label);
      svg.append(group);
    });
    svg.append(make("circle", { "data-part": "pivot", r: 4, class: "pivot" }));
    svg.append(make("text", { "data-part": "readout", class: "readout" }));
    svg.addEventListener("pointerdown", (event) => this.startGizmoDrag(event));
    svg.addEventListener("pointermove", (event) => this.moveGizmoDrag(event));
    svg.addEventListener("pointerup", (event) => this.endGizmoDrag(event));
    svg.addEventListener("pointercancel", () => this.abortGizmoDrag());
  }

  startGizmoDrag(event) {
    const part = event.target.closest?.("[data-part]")?.dataset.part;
    if (!part || !this.gizmo || !/^[tr][012]$/.test(part)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = this.targetOccurrence();
    const rect = this.gizmoEl.getBoundingClientRect();
    const handle = this.gizmo.handles[Number(part[1])];
    this.move.drag = {
      kind: part[0] === "t" ? "translate" : "rotate",
      handle,
      start: [event.clientX - rect.left, event.clientY - rect.top],
      startPose: canonicalPose(this.move.preview ?? target.pose),
      hadPreview: Boolean(this.move.preview),
      center: this.gizmo.center,
      pivot: this.gizmo.pivot,
      back: this.gizmo.back,
      changed: false,
    };
    try {
      this.gizmoEl.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer cannot be captured; the drag still works while over the gizmo.
    }
    this.canvas.focus({ preventScroll: true });
  }

  moveGizmoDrag(event) {
    const drag = this.move.drag;
    if (!drag) return;
    const rect = this.gizmoEl.getBoundingClientRect();
    const now = [event.clientX - rect.left, event.clientY - rect.top];
    const fine = event.shiftKey;
    let pose;
    let readout;
    if (drag.kind === "translate") {
      const raw = axisAmount([now[0] - drag.start[0], now[1] - drag.start[1]], drag.handle.pxPerMm);
      const amount = snapTo(raw, fine ? SNAP.fineMm : SNAP.mm);
      pose = translatePose(drag.startPose, drag.handle.axis, amount);
      readout = `${amount >= 0 ? "+" : ""}${amount.toFixed(fine ? 1 : 0)} mm`;
    } else {
      const raw = ringRotation(drag.handle.axis, drag.back, screenAngle(drag.center, drag.start, now)) * 180 / Math.PI;
      const degrees = snapTo(raw, fine ? SNAP.fineDeg : SNAP.deg);
      pose = rotatePoseAbout(drag.startPose, drag.handle.axis, degrees * Math.PI / 180, drag.pivot);
      readout = `${degrees >= 0 ? "+" : ""}${degrees.toFixed(0)}°`;
    }
    drag.changed = drag.changed || !samePose(pose, drag.startPose);
    this.move.preview = canonicalPose(pose);
    const text = this.gizmoEl.querySelector('[data-part="readout"]');
    text.textContent = readout;
    text.setAttribute("x", now[0] + 14);
    text.setAttribute("y", now[1] - 10);
    this.refreshPreview();
    this.emitMove("preview");
  }

  /** Releasing a handle saves (D-P2-14): the host stores the pose and re-reads the scene. */
  endGizmoDrag(event) {
    const drag = this.move.drag;
    if (!drag) return;
    if (this.gizmoEl.hasPointerCapture?.(event.pointerId)) this.gizmoEl.releasePointerCapture(event.pointerId);
    this.move.drag = null;
    this.gizmoEl.querySelector('[data-part="readout"]').textContent = "";
    if (drag.changed) this.emitMove("commit");
    else if (!drag.hadPreview) this.cancelMove();
  }

  /** Esc during a drag: back to where it started. */
  abortGizmoDrag() {
    const drag = this.move.drag;
    if (!drag) return false;
    this.move.drag = null;
    this.move.preview = drag.hadPreview ? drag.startPose : null;
    this.gizmoEl.querySelector('[data-part="readout"]').textContent = "";
    this.refreshPreview();
    this.emitMove("cancel");
    return true;
  }

  setHelpVisible(visible) {
    if (this.helpEl) this.helpEl.hidden = !visible;
  }

  // ----- input -----------------------------------------------------------------

  bindInteractions() {
    const canvas = this.canvas;
    const drag = { active: false, x: 0, y: 0, startX: 0, startY: 0, mode: "orbit" };
    const onDown = (event) => {
      drag.active = true;
      drag.x = drag.startX = event.clientX;
      drag.y = drag.startY = event.clientY;
      drag.mode = event.shiftKey || event.button !== 0 ? "pan" : "orbit";
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic or already-released pointer cannot be captured; dragging still works.
      }
    };
    const onMove = (event) => {
      if (!drag.active) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.mode === "pan") this.camera.pan(dx, dy, canvas.clientHeight, false);
      else this.camera.orbit(dx, dy);
    };
    const onUp = (event) => {
      drag.active = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) void this.clickAt(event.clientX, event.clientY);
    };
    const onDouble = async (event) => {
      const detail = await this.clickAt(event.clientX, event.clientY);
      if (detail) this.frameOccurrence(detail.occurrence);
    };
    const onWheel = (event) => {
      event.preventDefault();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.4) this.camera.pan(-event.deltaX, 0, canvas.clientHeight, false);
      else this.camera.dolly(event.deltaY, false);
    };
    const onKey = (event) => {
      // Shortcuts act only while the scene has focus and no text field is active.
      if (event.target !== canvas) return;
      if (event.key === "Escape") {
        if (this.helpEl && !this.helpEl.hidden) this.setHelpVisible(false);
        else if (this.abortGizmoDrag()) { /* the drag is undone */ }
        else if (this.move.preview) this.cancelMove();
        else if (this.move.enabled) this.setMoveMode(false);
        else this.select(null);
      } else if ((event.key === "m" || event.key === "M") && this.move.allowed) this.setMoveMode(!this.move.enabled);
      else if ((event.key === "l" || event.key === "L") && this.move.enabled) {
        this.setMoveSpace(this.move.space === "world" ? "local" : "world");
      } else if (event.key === "Enter" && this.move.preview && !this.move.drag) this.emitMove("commit");
      else if (event.key === "?" || (event.key === "/" && event.shiftKey)) this.setHelpVisible(Boolean(this.helpEl?.hidden));
      else if (event.key === "f" || event.key === "F") {
        if (this.selection) this.frameOccurrence(this.selection.key);
        else this.frameAll();
      } else if (event.key === "a" || event.key === "A") this.frameAll();
      else if (event.key === "`") this.setStatsOverlay(!this.showStats);
      else return;
      event.preventDefault();
    };
    const preventMenu = (event) => event.preventDefault();
    canvas.tabIndex = 0;
    canvas.addEventListener("contextmenu", preventMenu);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("dblclick", onDouble);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    this.unbind = () => {
      canvas.removeEventListener("contextmenu", preventMenu);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("dblclick", onDouble);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
    };
  }

  // ----- stats -----------------------------------------------------------------

  setStatsOverlay(visible) {
    this.showStats = Boolean(visible);
    if (this.statsEl) this.statsEl.hidden = !this.showStats;
    if (this.tuningEl) this.tuningEl.hidden = !this.showStats;
    if (this.showStats) this.renderStats();
  }

  /** Level-of-detail thresholds in projected pixels (SB2-30a); returns the values in force. */
  setLodThresholds(thresholds) {
    const next = thresholds == null ? { ...LOD_THRESHOLDS } : normalizeLodThresholds({ ...this.lodThresholds, ...thresholds });
    this.lodThresholds = this.scene ? this.scene.setLodThresholds(next) : next;
    writeLodThresholds(thresholds == null ? null : this.lodThresholds);
    this.syncTuning();
    return { ...this.lodThresholds };
  }

  // The tuning panel beside the stats: one slider per threshold, live.
  buildTuning() {
    const root = this.tuningEl;
    if (!root) return;
    const rows = TUNING_FIELDS.map(({ key, label, max }) => `
      <label><span>${label}</span>
        <input type="range" name="${key}" min="0" max="${max}" step="1">
        <output name="${key}"></output></label>`).join("");
    root.innerHTML = `<h2>Detail thresholds (projected radius, px)</h2>${rows}
      <button type="button" data-action="reset">Defaults</button>`;
    root.addEventListener("input", (event) => {
      const input = event.target.closest("input[type=range]");
      if (input) this.setLodThresholds({ [input.name]: Number(input.value) });
    });
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-action=reset]")) this.setLodThresholds(null);
    });
    this.syncTuning();
  }

  syncTuning() {
    const root = this.tuningEl;
    if (!root) return;
    for (const { key } of TUNING_FIELDS) {
      const input = root.querySelector(`input[name="${key}"]`);
      const output = root.querySelector(`output[name="${key}"]`);
      if (input) input.value = String(Math.round(this.lodThresholds[key]));
      if (output) output.textContent = `${Math.round(this.lodThresholds[key])}`;
    }
  }

  setGpuBudget(bytes) {
    const value = Number(bytes);
    this.gpuBudgetBytes = Number.isFinite(value) && value > 0 ? value : DEFAULT_SCENE_GPU_BUDGET_BYTES;
  }

  stats() {
    const intervals = this.frameSamples.map(([interval]) => interval).sort((a, b) => a - b);
    const cpu = this.frameSamples.map(([, value]) => value).sort((a, b) => a - b);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const p95 = (values) => values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] || 0;
    const assets = [...this.assets.entries()].map(([id, record]) => ({
      assetId: id,
      state: record.state,
      componentTier: record.componentTier || "idle",
      occurrences: this.scene?.assets.get(id)?.occurrenceCount || 0,
      error: record.error || null,
    }));
    return {
      occurrences: this.placed.length,
      lod: this.scene ? this.scene.cullCounts() : { full: 0, board: 0, body: 0, box: 0, culled: 0 },
      triangles: this.scene?.frameStats.triangles || 0,
      draws: this.scene?.frameStats.draws || 0,
      gpuMemoryBytes: this.scene?.gpuMemoryBytes() || 0,
      gpuBudgetBytes: this.gpuBudgetBytes,
      assets,
      status: this.status(),
      cache: this.cache.summary(),
      frameIntervalMs: mean(intervals),
      frameIntervalP95Ms: p95(intervals),
      frameCpuMs: mean(cpu),
      frameCpuP95Ms: p95(cpu),
      fps: intervals.length ? 1000 / Math.max(1e-6, mean(intervals)) : 0,
      lodThresholds: { ...this.lodThresholds },
      // First frame with every ready board drawn: after the descriptor, and since the page started.
      firstFrame: this.timing.boardsDrawnAt == null ? null : {
        sinceSceneMs: this.timing.boardsDrawnAt - this.timing.descriptorAt,
        sinceNavigationMs: this.timing.boardsDrawnAt,
      },
    };
  }

  renderStats() {
    if (!this.statsEl) return;
    const stats = this.stats();
    const { full, board, body, box, culled } = stats.lod;
    const loaded = stats.assets.filter((asset) => asset.state === "loaded").length;
    const rows = [
      ["Boards", `${stats.occurrences} placed · ${loaded}/${stats.assets.length} designs loaded`],
      ["Detail", `${full} full · ${board} board · ${body} body · ${box} box · ${culled} culled`],
      ["Triangles", stats.triangles.toLocaleString()],
      ["Draws", stats.draws.toLocaleString()],
      ["GPU memory", `${(stats.gpuMemoryBytes / 1048576).toFixed(1)} / ${(stats.gpuBudgetBytes / 1048576).toFixed(0)} MB`],
      ["Cache", stats.cache.enabled ? `${stats.cache.hits} hits · ${stats.cache.misses} misses` : "off"],
      ["Frame", `${stats.frameIntervalMs.toFixed(1)} ms · p95 ${stats.frameIntervalP95Ms.toFixed(1)}`],
      ["CPU", `${stats.frameCpuMs.toFixed(2)} ms · p95 ${stats.frameCpuP95Ms.toFixed(2)}`],
      ["FPS", stats.fps.toFixed(0)],
    ];
    this.statsEl.innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
  }
}
