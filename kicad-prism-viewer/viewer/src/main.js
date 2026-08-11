import { CameraController } from "./camera.js";
import { BomViewer } from "./bom-viewer.js";
import { escapeHtml } from "./escape-html.js";
import { loadGltf } from "./gltf-loader.js";
import { clamp } from "./math.js";
import { Renderer } from "./renderer.js";
import { SchematicWorldRenderer } from "./schematic-world-renderer.js";
import { collectStackupViaData } from "./stackup-vias.js";
import { SvgDomSchematicRenderer } from "./svg-dom-schematic-renderer.js";

const COPPER_TILE_GPU_BUDGET_BYTES = 512 * 1024 * 1024;
const COPPER_TILE_PREFETCH_MARGIN = 0.65;
const TILE_SCHEDULER_INTERVAL_MS = 120;
const MAX_TILE_LOADS_PER_TICK = 12;
const INTERACTIVE_TILE_LOADS_PER_TICK = 48;
const COMPARE_REVEAL_DURATION_MS = 230;
const TILE_VERTEX_STRIDE_BYTES = 40;
const TILE_INDEX_BYTES = 4;

let topology = window.__TOPOLOGY__ || {};
let semanticGeometry = window.__SEMANTIC_GEOMETRY__ || {};
let viewerReadiness = { stage: "semantic-ready", progress: 100 };
let viewerRoot = document;
let appEl;
let canvas;
let schematicCanvas;
let schematicDomLayer;
let schematicFlowOverlay;
let bomViewEl;
let statusEl;
let viewerKindEl;
let selectionEl;
let diagnosticsEl;
let layersEl;
let searchControlsEl;
let viewControlsEl;
let fallbackEl;
let labelsEl;
let schematicLabelsEl;
let gizmo;
let selectionCardEl;
let primaryHeadingEl;
let primaryDescriptionEl;
let stackupWorkspaceViewEl;
let modeSwitchEl;

const query = (selector) => viewerRoot.querySelector(selector);
const queryAll = (selector) => viewerRoot.querySelectorAll(selector);

function resolveDom(root = document) {
  viewerRoot = root;
  appEl = query("#app");
  canvas = query("#viewport");
  schematicCanvas = query("#schematic-viewport");
  schematicDomLayer = query("#schematic-dom-layer");
  schematicFlowOverlay = query("#schematic-flow-overlay");
  bomViewEl = query("#bom-view");
  statusEl = query("#status") || { set textContent(_value) {} };
  viewerKindEl = query("#viewer-kind") || { set textContent(_value) {} };
  selectionEl = query("#selection") || { set textContent(v) {} };
  diagnosticsEl = query("#diagnostics") || { set innerHTML(v) {} };
  layersEl = query("#layers");
  searchControlsEl = query("#search-controls");
  viewControlsEl = query("#view-controls");
  stackupWorkspaceViewEl = query("#stackup-workspace-view");
  fallbackEl = query("#fallback");
  labelsEl = query("#panel-labels");
  schematicLabelsEl = query("#schematic-labels");
  gizmo = query("#axis-gizmo");
  selectionCardEl = query("#selection-card");
  primaryHeadingEl = query("#primary-heading");
  primaryDescriptionEl = query("#primary-description");
  modeSwitchEl = query("#mode-switch");
  appEl.classList.add("workspace-pcb");
}

function initialState() {
  return {
    workspace: "pcb",
    mode: "3d",
    cameraTool: "orbit",
    compareLayers: new Set(),
    desiredCompareLayers: new Set(),
    visible3dLayers: new Set(),
    activeNetId: 0,
    selectedFeatureId: 0,
    selectionAnchor: null,
    showBoard: true,
    showComponents: true,
    isolateNet: false,
    /** User/view prefs restored after Esc; not overwritten by net-probe toggles. */
    savedShowBoard: true,
    savedShowComponents: true,
    preIsolation3dLayers: null,
    preIsolationCompareLayers: null,
    /** Snapshot of showBoard taken when entering Isolate (I); restored on exit. */
    preIsolationShowBoard: null,
    separation: 0,
    dragging: false,
    dragMode: "orbit",
    lastX: 0,
    lastY: 0,
    pointerStartX: 0,
    pointerStartY: 0,
    loadedBytes: 0,
    triangles: 0,
    residentTileBytes: 0,
    residentTileGpuBytes: 0,
    residentTileTriangles: 0,
    tileLoads: 0,
    tileEvictions: 0,
    tileSchedulerMs: 0,
    lastTileScheduleAt: 0,
    visibleTileIds: new Set(),
    frameCpuMs: 0,
    frameCpuP95Ms: 0,
    frameIntervalMs: 0,
    frameIntervalP95Ms: 0,
    frameSamples: [],
    fps: 0,
    frames: 0,
    fpsAt: performance.now(),
    activeTab: "layers",
    selectedPageId: "",
    selectedSchematicFeature: null,
    schematicDragging: false,
    schematicLastX: 0,
    schematicLastY: 0,
    schematicStartX: 0,
    schematicStartY: 0,
  };
}

function initialScene() {
  return {
    manifest: null,
    manifestUrl: "",
    layers: [],
    copperLayers: [],
    nets: [],
    features: new Map(),
    tiles: new Map(),
    loaded: new Set(),
    loading: new Map(),
    failed: new Map(),
    residentTiles: new Map(),
    componentFeatures: new Map(),
    runtimeBounds: null,
    layerZOffsets: new Float32Array(256),
    layerZOffsetSignature: "",
  };
}

function initialCompareAnimation() {
  return {
    key: "",
    started: 0,
    from: new Map(),
    current: new Map(),
  };
}

function initialCompareTransition() {
  return {
    phase: "idle",
    previous: new Set(),
    target: new Set(),
    previousOffsets: new Map(),
    started: 0,
  };
}

function initialSchematicScene() {
  return {
    manifest: null,
    manifestUrl: "",
    pages: [],
    byId: new Map(),
    activeNetUid: "",
    visiblePages: [],
    fitted: false,
    rendererMode: new URLSearchParams(location.search).get("schematicRenderer") || "svg-dom",
    domFallbackReason: "",
  };
}

const state = initialState();
const scene = initialScene();
const compareAnimation = initialCompareAnimation();
const compareTransition = initialCompareTransition();
const schematicScene = initialSchematicScene();
let gizmoHits = [];

let renderer;
let schematicRenderer;
let schematicDomRenderer;
let bomViewer;
let camera;
let panel;
let compareOffsets = new Map();
let lastFrame = performance.now();
let activeViewerToken = 0;
let animationFrameId = 0;
let selectionChangeCallback = null;
let suppressSelectionChange = false;
let viewerIsActive = () => true;
let legacyWorkspacesEnabled = true;

if (!window.__PRISM_SEMANTIC_VIEWER_MANUAL_BOOT__ && document.getElementById("app")) {
  mountStandaloneViewer().catch((error) => {
    console.error(error);
    if (statusEl) statusEl.textContent = "Renderer failed";
    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.textContent = error.stack || error.message || String(error);
    }
  });
}

function buildNetDetails(topo) {
  const components = new Map((topo.components || []).map(c => [c.uid, c]));
  const details = {};
  for (const terminal of topo.terminals || []) {
    const netUid = terminal.net_uid;
    if (!netUid) continue;
    const component = components.get(terminal.component_uid) || {};
    const endpoint = {
      designator: terminal.designator || component.designator || "",
      pin: terminal.pin || "",
      value: component.value || "",
      pcb_pad_id: terminal.pcb_pad_id || ""
    };
    if (!details[netUid]) {
      details[netUid] = { terminals: [] };
    }
    const terminals = details[netUid].terminals;
    if (!terminals.some(t => t.designator === endpoint.designator && t.pin === endpoint.pin)) {
      terminals.push(endpoint);
    }
  }
  return details;
}

function findFeatureIdByPcbPadId(pcbPadId) {
  if (!pcbPadId || !topology || !topology.physical_objects) return 0;
  const obj = topology.physical_objects.find(o => o.uid === pcbPadId);
  if (!obj || !obj.source_ids || !obj.source_ids.length) return 0;
  const uuid = obj.source_ids[0];
  for (const [id, feat] of scene.features.entries()) {
    if (feat.sourceUid === uuid) return id;
  }
  return 0;
}

function findTopologyComponent(designator) {
  if (!designator || !topology || !topology.components) return null;
  return topology.components.find(c => c.designator === designator);
}

function resetObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function disposeRuntimeResources() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }
  window.removeEventListener("keydown", handleKey);
  renderer?.dispose?.();
  renderer = null;
  schematicRenderer = null;
  schematicDomRenderer?.dispose?.();
  schematicDomRenderer = null;
  bomViewer = null;
  selectionChangeCallback = null;
  viewerIsActive = () => true;
  legacyWorkspacesEnabled = true;
}

function beginViewerSession() {
  activeViewerToken += 1;
  disposeRuntimeResources();
  resetObject(state, initialState());
  resetObject(scene, initialScene());
  resetObject(compareAnimation, initialCompareAnimation());
  resetObject(compareTransition, initialCompareTransition());
  resetObject(schematicScene, initialSchematicScene());
  gizmoHits = [];
  camera = null;
  panel = null;
  compareOffsets = new Map();
  lastFrame = performance.now();
  return activeViewerToken;
}

function disposeViewerSession(token) {
  if (token !== activeViewerToken) return;
  activeViewerToken += 1;
  disposeRuntimeResources();
}

function scheduleFrame(token) {
  if (token !== activeViewerToken) return;
  animationFrameId = requestAnimationFrame((now) => frame(now, token));
}

function viewerSessionActive(token) {
  return token === activeViewerToken;
}

export async function mountStandaloneViewer(options = {}) {
  const token = beginViewerSession();
  const performanceTimings = {};
  topology = options.topology || window.__TOPOLOGY__ || {};
  if (topology && !topology.net_details) {
    topology.net_details = buildNetDetails(topology);
  }
  semanticGeometry = options.semanticGeometry || window.__SEMANTIC_GEOMETRY__ || {};
  viewerReadiness = options.readiness || semanticGeometry.readiness || {
    stage: "semantic-ready",
    progress: 100,
  };
  selectionChangeCallback = typeof options.onSelectionChange === "function"
    ? options.onSelectionChange
    : null;
  viewerIsActive = typeof options.isActive === "function" ? options.isActive : () => true;
  legacyWorkspacesEnabled = options.workspaceScope !== "3d";
  resolveDom(options.root || document);
  if (!appEl || !canvas) throw new Error("Semantic viewer shell is missing required DOM nodes");
  await boot(token, performanceTimings, options.onPerformanceEvent);
  return {
    performance: performanceTimings,
    setSelection(selection) {
      suppressSelectionChange = true;
      try {
        if (!selection) clearSelection();
        else if (selection?.netName || selection?.netUid) {
          const match = scene.nets.find((item) =>
            (selection.netUid && item.uid === selection.netUid)
            || (selection.netName && item.name === selection.netName));
          if (match) selectNet(Number(match.id), true);
        }
        else if (selection?.netId) selectNet(Number(selection.netId), true);
        else if (selection?.featureId) selectFeature(Number(selection.featureId), true);
        else if (selection?.reference) selectComponentReference(String(selection.reference), true);
      } finally {
        suppressSelectionChange = false;
      }
    },
    resize() {
      renderer?.resize();
      schematicRenderer?.resize();
      if (state.workspace === "pcb" && state.mode === "layer") {
        activatePcbLayerMode();
      }
    },
    setWorkspace(workspace) {
      const nextWorkspace = workspace === "stackup" ? "stackup" : "pcb";
      if (state.workspace !== nextWorkspace) switchWorkspace(nextWorkspace);
    },
    dispose() {
      disposeViewerSession(token);
    },
  };
}

function emitSelectionChange(selection) {
  if (!suppressSelectionChange) selectionChangeCallback?.(selection);
}

function netSelection(net, feature = null) {
  if (!net) return null;
  return {
    kind: "net",
    sourceContext: "3D",
    netName: String(net.name || ""),
    netUid: String(net.uid || "") || undefined,
    netCode: Number(net.id || 0) || undefined,
    featureId: Number(feature?.id || 0) || undefined,
    uuid: String(feature?.sourceUid || "") || undefined,
  };
}

function featureSelection(feature) {
  if (!feature) return null;
  const reference = componentReferenceFromFeature(feature);
  const pin = String(feature.padNumber || feature.pin || feature.pinNumber || "");
  const net = scene.nets.find((item) => Number(item.id) === Number(feature.netId || 0));
  if (reference && pin) {
    return {
      kind: "terminal",
      sourceContext: "3D",
      reference,
      pin,
      netUid: net?.uid,
      netName: net?.name,
      netCode: net ? Number(net.id) : undefined,
      uuid: String(feature.sourceUid || "") || undefined,
      featureId: Number(feature.id || 0) || undefined,
    };
  }
  if (reference) {
    const component = findTopologyComponent(reference);
    return {
      kind: "component",
      sourceContext: "3D",
      reference,
      componentUid: component?.uid,
      uuid: String(feature.sourceUid || "") || undefined,
      featureId: Number(feature.id || 0) || undefined,
    };
  }
  return netSelection(net, feature);
}

function applyComponentProbeVisibility() {
  state.showBoard = true;
  state.showComponents = true;
  syncNetIsolationControls();
  if (typeof refreshControls === "function") refreshControls();
}

function applyNetProbeVisibility() {
  // Snapshot prefs only when leaving a non-probe visibility state so chained
  // net probes do not overwrite the user's last ON preferences with false.
  if (state.showBoard || state.showComponents) {
    state.savedShowBoard = state.showBoard;
    state.savedShowComponents = state.showComponents;
  }
  state.showBoard = false;
  state.showComponents = false;
  syncNetIsolationControls();
  if (typeof refreshControls === "function") refreshControls();
}

function restoreViewVisibilityPrefs() {
  state.showBoard = state.savedShowBoard !== false;
  state.showComponents = state.savedShowComponents !== false;
  syncNetIsolationControls();
  if (typeof refreshControls === "function") refreshControls();
}

async function boot(token, performanceTimings = {}, onPerformanceEvent = null) {
  const bootStarted = performance.now();
  const manifestPath = semanticGeometry.assets?.scene_manifest || semanticGeometry.semantic_gltf?.path;
  let started = performance.now();
  if (manifestPath) {
    scene.manifestUrl = new URL(manifestPath, location.href).toString();
    scene.manifest = await fetchJson(scene.manifestUrl);
    performanceTimings.scene_manifest_fetch_parse_ms = performance.now() - started;
    if (!viewerSessionActive(token)) return;
    if (scene.manifest.schema !== "prism.semantic_gltf_a0") {
      throw new Error(`Unsupported scene schema: ${scene.manifest.schema}`);
    }
  } else {
    scene.manifest = {
      schema: "prism.semantic_gltf_partial.a0",
      bbox: null,
      layers: [],
      nets: [],
      objectFeatures: [],
      components: [],
      tiles: [],
      barrels: [],
    };
    performanceTimings.scene_manifest_fetch_parse_ms = 0;
  }

  started = performance.now();
  scene.layers = scene.manifest.layers || [];
  scene.copperLayers = scene.layers.filter(
    (layer) => layer.role === "copper" || String(layer.name).endsWith(".Cu"),
  );
  scene.nets = scene.manifest.nets || [];
  for (const feature of scene.manifest.objectFeatures || []) {
    scene.features.set(Number(feature.id), { ...feature, bounds: runtimeBounds(feature.boundsMm) });
  }
  for (const component of scene.manifest.components || []) {
    scene.componentFeatures.set(component.designator, component);
    scene.features.set(Number(component.featureId), {
      ...component,
      kind: "component",
      sourceUid: component.uid,
      netId: 0,
      bounds: null,
    });
  }
  for (const tile of scene.manifest.tiles || []) scene.tiles.set(tile.id, tile);
  performanceTimings.scene_manifest_index_ms = performance.now() - started;

  const defaultCompareLayers = defaultPcbCompareLayers();
  for (const layerId of defaultCompareLayers) {
    state.compareLayers.add(layerId);
    state.desiredCompareLayers.add(layerId);
  }
  for (const layer of scene.copperLayers) state.visible3dLayers.add(Number(layer.id));

  started = performance.now();
  renderer = await Renderer.create(canvas);
  performanceTimings.webgpu_renderer_create_ms = performance.now() - started;
  if (!viewerSessionActive(token)) {
    renderer?.dispose?.();
    renderer = null;
    return;
  }
  renderer.setBarrels(scene.manifest.barrels || []);
  started = performance.now();
  const boardBounds = await loadBoard(token);
  performanceTimings.board_fetch_parse_upload_ms = performance.now() - started;
  if (!viewerSessionActive(token)) return;
  scene.runtimeBounds = boardBounds || runtimeBoundsFromGltf(scene.manifest.bbox);
  camera = new CameraController(scene.runtimeBounds);
  if (legacyWorkspacesEnabled) {
    await loadSchematicWorld(token);
    if (!viewerSessionActive(token)) return;
    await loadBom(token);
    if (!viewerSessionActive(token)) return;
  }
  started = performance.now();
  renderControls();
  bindInteractions();
  if (legacyWorkspacesEnabled) {
    bindSchematicInteractions();
    bindWorkspaceTabs();
  }
  bindPanelTabs();
  bindGizmoInteraction();
  performanceTimings.controls_and_bindings_ms = performance.now() - started;
  const stageLabels = {
    "board-ready": "Board ready · components and semantic layers are still generating",
    "components-ready": "Board and components ready · semantic layers are still generating",
    "semantic-ready": "WebGPU semantic glTF active",
  };
  statusEl.textContent = stageLabels[viewerReadiness.stage] || "Loading 3D assets";
  if (semanticGeometry.assets?.components_glb) {
    const componentsStarted = performance.now();
    void loadComponents(token).then(() => {
      if (!viewerSessionActive(token)) return;
      onPerformanceEvent?.({
        schema: "prism.semantic_viewer_performance.a0",
        milestone: "components-loaded",
        readiness_stage: viewerReadiness.stage,
        elapsed_ms: performance.now() - componentsStarted,
        bytes_loaded: state.loadedBytes,
      });
    });
  }
  scheduleTileResidency(performance.now(), { force: true });
  scheduleFrame(token);
  started = performance.now();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  performanceTimings.first_frame_wait_ms = performance.now() - started;
  performanceTimings.boot_total_ms = performance.now() - bootStarted;
}

async function loadSchematicWorld(token = activeViewerToken) {
  const nativePath = semanticGeometry.assets?.schematic_native_manifest
    || semanticGeometry.schematic_vector?.path
    || semanticGeometry.schematic_scene?.path;
  const fallbackPath = semanticGeometry.assets?.schematic_manifest
    || semanticGeometry.schematic_world?.path;
  const tab = query("[data-workspace=schematic]");
  if (!nativePath && !fallbackPath) {
    tab.disabled = true;
    tab.title = "No schematic world assets are available";
    return;
  }
  const candidates = [nativePath, fallbackPath].filter(Boolean);
  let lastError = null;
  for (const path of candidates) {
    try {
      schematicScene.manifestUrl = new URL(path, location.href).toString();
      const nextRenderer = await SchematicWorldRenderer.create(schematicCanvas, schematicScene.manifestUrl);
      if (!viewerSessionActive(token)) return;
      schematicRenderer = nextRenderer;
      schematicRenderer.setFlowOverlayCanvas(schematicFlowOverlay);
      break;
    } catch (error) {
      lastError = error;
      schematicRenderer = null;
      if (path === fallbackPath) throw error;
    }
  }
  if (!schematicRenderer) throw lastError || new Error("Failed to load schematic viewer assets");
  schematicScene.manifest = schematicRenderer.manifest;
  schematicScene.pages = schematicRenderer.pages;
  schematicScene.byId = new Map(schematicScene.pages.map((page) => [page.id, page]));
  state.selectedPageId = schematicScene.pages[0]?.id || "";
  schematicRenderer.selectedPageId = state.selectedPageId;
  const svgDomEnabled = !["native", "legacy", "webgpu"].includes(String(schematicScene.rendererMode).toLowerCase());
  if (svgDomEnabled) {
    schematicDomRenderer = SvgDomSchematicRenderer.create(
      schematicDomLayer,
      schematicScene.manifestUrl,
      schematicScene.manifest,
      schematicRenderer.featuresByPage,
      {
        onSelect: selectSchematicDomSelection,
        onBlank: clearSchematicSelection,
        onHighlightNet: highlightSchematicNetByUid,
        onOpenPage: openSchematicDomTarget,
        onFallback: (reason) => {
          schematicScene.domFallbackReason = reason;
          console.warn(reason);
        },
      },
    );
    void schematicDomRenderer.preloadPages(schematicScene.pages);
  }
  void schematicRenderer.preloadOverview();
}

async function loadBom(token = activeViewerToken) {
  const bomPath = semanticGeometry.assets?.bom || semanticGeometry.bom?.path;
  const tab = query("[data-workspace=bom]");
  if (!bomPath) {
    if (tab) {
      tab.disabled = true;
      tab.title = "No BoM artifact is available";
    }
    return;
  }
  try {
    const nextViewer = await BomViewer.create(bomViewEl, new URL(bomPath, location.href).toString(), {
      onSelectReference: (reference) => selectComponentReference(reference, true),
    });
    if (!viewerSessionActive(token)) return;
    bomViewer = nextViewer;
  } catch (error) {
    if (!viewerSessionActive(token)) return;
    console.warn(error);
    if (tab) {
      tab.disabled = true;
      tab.title = error?.message || "BoM artifact could not be loaded";
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "default" });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

async function loadLayer(layerId) {
  const token = activeViewerToken;
  await Promise.all(tilesForLayer(layerId).map((tile) => loadTile(tile, token)));
}

async function loadTile(tile, token = activeViewerToken) {
  if (!viewerSessionActive(token)) return;
  const resident = scene.residentTiles.get(tile.id);
  if (resident) {
    resident.lastUsed = performance.now();
    return;
  }
  const failed = scene.failed.get(tile.id);
  if (failed) {
    return;
  }
  if (scene.loading.has(tile.id)) return scene.loading.get(tile.id);
  const promise = (async () => {
    try {
      const loaded = await loadGltf(new URL(tile.path, scene.manifestUrl).toString(), {
        fetchCache: "no-store",
      });
      if (!viewerSessionActive(token) || !renderer) return;
      state.loadedBytes += loaded.byteLength;
      const layer = scene.layers.find((item) => Number(item.id) === Number(tile.layerId));
      const entries = [];
      let triangles = 0;
      let gpuBytes = 0;
      for (const primitive of loaded.primitives) {
        const entry = renderer.addPrimitive(primitive, {
          kind: "copper",
          tileId: tile.id,
          layerId: Number(tile.layerId),
          color: layerColor(layer),
          baseZ: Number(layer?.z_mm || 0) / 1000,
          material: { baseColor: [1, 1, 1, 1], metallic: 0.78, roughness: 0.32 },
        });
        entries.push(entry);
        triangles += primitive.indices.length / 3;
        gpuBytes += estimatePrimitiveGpuBytes(primitive);
      }
      const record = {
        tile,
        entries,
        byteLength: loaded.byteLength,
        gpuBytes,
        triangles,
        lastUsed: performance.now(),
        pinned: false,
      };
      scene.residentTiles.set(tile.id, record);
      scene.loaded.add(tile.id);
      state.tileLoads += 1;
      state.residentTileBytes += loaded.byteLength;
      state.residentTileGpuBytes += gpuBytes;
      state.residentTileTriangles += triangles;
      state.triangles = state.residentTileTriangles;
      scene.failed.delete(tile.id);
    } catch (error) {
      if (!viewerSessionActive(token)) return;
      const previous = scene.failed.get(tile.id) || { count: 0, message: "" };
      scene.failed.set(tile.id, { count: previous.count + 1, message: error?.message || String(error) });
      if (!previous.count) {
        console.warn(`Failed to load tile ${tile.id}; suppressing retries until assets are regenerated`, error);
      }
    } finally {
      if (viewerSessionActive(token)) scene.loading.delete(tile.id);
    }
  })();
  scene.loading.set(tile.id, promise);
  return promise;
}

function tilesForLayer(layerId) {
  return [...scene.tiles.values()].filter((tile) => Number(tile.layerId) === Number(layerId));
}

function estimatePrimitiveGpuBytes(primitive) {
  return (primitive.position.length / 3) * TILE_VERTEX_STRIDE_BYTES + primitive.indices.length * TILE_INDEX_BYTES;
}

function evictTile(tileId) {
  const record = scene.residentTiles.get(tileId);
  if (!record) return;
  renderer.removeEntries(record.entries);
  scene.residentTiles.delete(tileId);
  scene.loaded.delete(tileId);
  state.residentTileBytes = Math.max(0, state.residentTileBytes - record.byteLength);
  state.residentTileGpuBytes = Math.max(0, state.residentTileGpuBytes - record.gpuBytes);
  state.residentTileTriangles = Math.max(0, state.residentTileTriangles - record.triangles);
  state.triangles = state.residentTileTriangles;
  state.tileEvictions += 1;
}

function scheduleTileResidency(now = performance.now(), options = {}) {
  if (!renderer || !camera || state.workspace !== "pcb") return;
  const interactiveComparePreload = state.mode === "layer" && compareTransition.phase === "preload";
  if (!options.force && !interactiveComparePreload && now - state.lastTileScheduleAt < TILE_SCHEDULER_INTERVAL_MS) return;
  const started = performance.now();
  state.lastTileScheduleAt = now;
  const needed = neededTileIdsForView();
  state.visibleTileIds = needed;
  const activeLoads = scene.loading.size;
  const maxLoads = interactiveComparePreload ? INTERACTIVE_TILE_LOADS_PER_TICK : MAX_TILE_LOADS_PER_TICK;
  const loadBudget = Math.max(0, maxLoads - activeLoads);
  const missing = [...needed]
    .map((tileId) => scene.tiles.get(tileId))
    .filter((tile) => tile && !scene.residentTiles.has(tile.id) && !scene.loading.has(tile.id) && !scene.failed.has(tile.id))
    .sort((a, b) => tileDistanceToFocus(a) - tileDistanceToFocus(b))
    .slice(0, loadBudget);
  const token = activeViewerToken;
  for (const tile of missing) void loadTile(tile, token);
  for (const tileId of needed) {
    const record = scene.residentTiles.get(tileId);
    if (record) record.lastUsed = now;
  }
  evictUnneededTiles(needed);
  state.tileSchedulerMs = performance.now() - started;
}

function neededTileIdsForView() {
  const needed = new Set();
  const visibleLayers = state.mode === "3d" ? state.visible3dLayers : compareResidencyLayers();
  if (!visibleLayers.size || !panel) return needed;

  if (state.mode === "layer") {
    for (const tile of scene.tiles.values()) {
      if (visibleLayers.has(Number(tile.layerId))) needed.add(tile.id);
    }
    return needed;
  }

  const activeNetTiles = new Set();
  if (state.activeNetId) {
    for (const tile of scene.tiles.values()) {
      if (visibleLayers.has(Number(tile.layerId)) && tileHasNet(tile, state.activeNetId)) {
        activeNetTiles.add(tile.id);
      }
    }
  }
  for (const tile of scene.tiles.values()) {
    if (!visibleLayers.has(Number(tile.layerId))) continue;
    const offset = state.mode === "layer" ? compareOffsets.get(Number(tile.layerId)) : null;
    if (tileIntersectsView(tile, panel.matrix, offset, COPPER_TILE_PREFETCH_MARGIN)) needed.add(tile.id);
  }
  for (const tileId of activeNetTiles) needed.add(tileId);
  return needed;
}

function compareResidencyLayers() {
  if (state.mode !== "layer") return state.compareLayers;
  if (compareTransition.phase === "idle") return state.compareLayers;
  return unionSets(compareTransition.previous, compareTransition.target);
}

function compareRenderLayers() {
  if (state.mode !== "layer") return state.visible3dLayers;
  if (compareTransition.phase === "reveal") return unionSets(compareTransition.previous, compareTransition.target);
  return state.compareLayers;
}

function defaultPcbCompareLayers() {
  const ids = scene.copperLayers.map((layer) => Number(layer.id)).filter(Number.isFinite);
  if (!ids.length) return new Set();
  if (ids.length === 1) return new Set([ids[0]]);
  return new Set([ids[0], ids[ids.length - 1]]);
}

function ensurePcbCompareLayers() {
  const current = state.desiredCompareLayers.size ? state.desiredCompareLayers : state.compareLayers;
  if (current.size) return new Set([...current].map(Number));
  return defaultPcbCompareLayers();
}

function unionSets(...sets) {
  const output = new Set();
  for (const set of sets) {
    for (const value of set || []) output.add(Number(value));
  }
  return output;
}

function evictUnneededTiles(needed) {
  if (state.mode === "layer") return;
  const budget = COPPER_TILE_GPU_BUDGET_BYTES;
  if (state.residentTileGpuBytes <= budget) return;
  const candidates = [...scene.residentTiles.values()]
    .filter((record) => !needed.has(record.tile.id) && !scene.loading.has(record.tile.id))
    .sort((a, b) => a.lastUsed - b.lastUsed);
  for (const record of candidates) {
    if (state.residentTileGpuBytes <= budget) break;
    evictTile(record.tile.id);
  }
}

function tileIntersectsView(tile, matrix, offset = null, marginScale = 0) {
  const bounds = tileRuntimeBounds(tile);
  if (!bounds) return true;
  const margin = Math.max(bounds[3] - bounds[0], bounds[4] - bounds[1]) * marginScale;
  const expanded = [
    bounds[0] - margin + (offset?.[0] || 0),
    bounds[1] - margin + (offset?.[1] || 0),
    bounds[2] - 0.002,
    bounds[3] + margin + (offset?.[0] || 0),
    bounds[4] + margin + (offset?.[1] || 0),
    bounds[5] + 0.002,
  ];
  return boundsIntersectsClip(expanded, matrix);
}

function tileRuntimeBounds(tile) {
  const bounds = tile.boundsMm;
  if (!bounds || bounds.length !== 4) return null;
  const layer = scene.layers.find((item) => Number(item.id) === Number(tile.layerId));
  const z = Number(layer?.z_mm || 0) / 1000;
  return [
    bounds[0] / 1000,
    -bounds[3] / 1000,
    z - 0.0004,
    bounds[2] / 1000,
    -bounds[1] / 1000,
    z + 0.0004,
  ];
}

function boundsIntersectsClip(bounds, matrix) {
  const corners = [
    [bounds[0], bounds[1], bounds[2]],
    [bounds[3], bounds[1], bounds[2]],
    [bounds[0], bounds[4], bounds[2]],
    [bounds[3], bounds[4], bounds[2]],
    [bounds[0], bounds[1], bounds[5]],
    [bounds[3], bounds[1], bounds[5]],
    [bounds[0], bounds[4], bounds[5]],
    [bounds[3], bounds[4], bounds[5]],
  ].map((point) => clipPoint(matrix, point));
  const planes = [
    (point) => point[0] < -point[3],
    (point) => point[0] > point[3],
    (point) => point[1] < -point[3],
    (point) => point[1] > point[3],
    (point) => point[2] < 0,
    (point) => point[2] > point[3],
  ];
  return !planes.some((outside) => corners.every(outside));
}

function clipPoint(matrix, point) {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  ];
}

function tileHasNet(tile, netId) {
  return Array.isArray(tile.netIds) && tile.netIds.some((value) => Number(value) === Number(netId));
}

function tileDistanceToFocus(tile) {
  const bounds = tileRuntimeBounds(tile);
  if (!bounds || !camera) return 0;
  const x = (bounds[0] + bounds[3]) * 0.5 - camera.focus[0];
  const y = (bounds[1] + bounds[4]) * 0.5 - camera.focus[1];
  return x * x + y * y;
}

async function loadBoard(token = activeViewerToken) {
  const path = semanticGeometry.assets?.base_board_glb;
  if (!path) return null;
  const loaded = await loadGltf(new URL(path, location.href).toString(), { defaultFeatureId: 0 });
  if (!viewerSessionActive(token) || !renderer) return null;
  state.loadedBytes += loaded.byteLength;
  const contextPrimitives = loaded.primitives.filter((primitive) => boardRole(primitive) !== "pad");
  for (const primitive of mergePrimitivesByMaterial(contextPrimitives, boardRole)) {
    renderer.addPrimitive(primitive, {
      kind: "board",
      boardRole: primitive.groupKey,
      layerId: 0,
      material: primitive.material,
      color: primitive.material.baseColor,
    });
  }
  return mergeBounds(contextPrimitives.map((primitive) => primitive.bounds));
}

function mergeBounds(boundsList) {
  const valid = boundsList.filter((bounds) => Array.isArray(bounds) && bounds.length === 6);
  if (!valid.length) return null;
  return valid.reduce((merged, bounds) => [
    Math.min(merged[0], bounds[0]),
    Math.min(merged[1], bounds[1]),
    Math.min(merged[2], bounds[2]),
    Math.max(merged[3], bounds[3]),
    Math.max(merged[4], bounds[4]),
    Math.max(merged[5], bounds[5]),
  ], [...valid[0]]);
}

function sceneRuntimeBounds() {
  return scene.runtimeBounds || runtimeBoundsFromGltf(scene.manifest?.bbox);
}

function boardRole(primitive) {
  const name = `${primitive.nodeName || ""} ${primitive.meshName || ""} ${primitive.material?.name || ""}`.toLowerCase();
  if (name.includes("_pad") || name.includes(".pad") || name.endsWith("pad")) return "pad";
  if (name.includes("silkscreen")) return "silkscreen";
  if (name.includes("soldermask")) return "soldermask";
  return "substrate";
}

async function loadComponents(token = activeViewerToken) {
  const path = semanticGeometry.assets?.components_glb;
  if (!path) return;
  const loaded = await loadGltf(new URL(path, location.href).toString(), {
    componentFeatures: scene.componentFeatures,
  });
  if (!viewerSessionActive(token) || !renderer) return;
  state.loadedBytes += loaded.byteLength;
  for (const primitive of loaded.primitives) {
    const component = scene.componentFeatures.get(primitive.designator);
    if (component) mergeFeatureBounds(component.featureId, primitive.position);
  }
  for (const primitive of mergePrimitivesByMaterial(loaded.primitives)) {
    renderer.addPrimitive(primitive, {
      kind: "component",
      layerId: 0,
      material: primitive.material,
      color: primitive.material.baseColor,
    });
  }
}

function mergePrimitivesByMaterial(primitives, classifier = () => "") {
  const groups = new Map();
  for (const primitive of primitives) {
    const groupKey = classifier(primitive);
    const key = `${groupKey}:${JSON.stringify(primitive.material)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(primitive);
  }
  return [...groups.values()].map((group) => {
    const vertexCount = group.reduce((sum, item) => sum + item.position.length / 3, 0);
    const indexCount = group.reduce((sum, item) => sum + item.indices.length, 0);
    const position = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const netId = new Uint32Array(vertexCount);
    const objectFeatureId = new Uint32Array(vertexCount);
    const indices = new Uint32Array(indexCount);
    let vertexOffset = 0;
    let indexOffset = 0;
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const item of group) {
      const count = item.position.length / 3;
      position.set(item.position, vertexOffset * 3);
      normal.set(item.normal, vertexOffset * 3);
      netId.set(item.netId, vertexOffset);
      objectFeatureId.set(item.objectFeatureId, vertexOffset);
      for (let index = 0; index < item.indices.length; index += 1) {
        indices[indexOffset + index] = Number(item.indices[index]) + vertexOffset;
      }
      if (item.bounds) {
        bounds[0] = Math.min(bounds[0], item.bounds[0]);
        bounds[1] = Math.min(bounds[1], item.bounds[1]);
        bounds[2] = Math.min(bounds[2], item.bounds[2]);
        bounds[3] = Math.max(bounds[3], item.bounds[3]);
        bounds[4] = Math.max(bounds[4], item.bounds[4]);
        bounds[5] = Math.max(bounds[5], item.bounds[5]);
      }
      vertexOffset += count;
      indexOffset += item.indices.length;
    }
    return {
      position,
      normal,
      netId,
      objectFeatureId,
      indices,
      material: group[0].material,
      groupKey: classifier(group[0]),
      bounds: Number.isFinite(bounds[0]) ? bounds : null,
    };
  });
}

function runtimeBounds(bounds) {
  if (!bounds || bounds.length !== 6) return null;
  return [
    bounds[0] / 1000,
    -bounds[4] / 1000,
    bounds[2] / 1000,
    bounds[3] / 1000,
    -bounds[1] / 1000,
    bounds[5] / 1000,
  ];
}

function runtimeBoundsFromGltf(bounds) {
  const minimum = bounds?.min || [0, 0, 0];
  const maximum = bounds?.max || [0.08, 0.0016, 0.05];
  return [minimum[0], -maximum[2], minimum[1], maximum[0], -minimum[2], maximum[1]];
}

function mergeFeatureBounds(featureId, positions) {
  const feature = scene.features.get(Number(featureId));
  if (!feature || !positions.length) return;
  const incoming = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    incoming[0] = Math.min(incoming[0], positions[index]);
    incoming[1] = Math.min(incoming[1], positions[index + 1]);
    incoming[2] = Math.min(incoming[2], positions[index + 2]);
    incoming[3] = Math.max(incoming[3], positions[index]);
    incoming[4] = Math.max(incoming[4], positions[index + 1]);
    incoming[5] = Math.max(incoming[5], positions[index + 2]);
  }
  feature.bounds = feature.bounds
    ? [
        Math.min(feature.bounds[0], incoming[0]),
        Math.min(feature.bounds[1], incoming[1]),
        Math.min(feature.bounds[2], incoming[2]),
        Math.max(feature.bounds[3], incoming[3]),
        Math.max(feature.bounds[4], incoming[4]),
        Math.max(feature.bounds[5], incoming[5]),
      ]
    : incoming;
}

function layerColor(layer) {
  if (typeof layer?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(layer.color)) {
    return [...hex(layer.color), 1];
  }
  const colors = {
    "F.Cu": "#a9423c",
    "B.Cu": "#315b9a",
    "In1.Cu": "#477a55",
    "In2.Cu": "#806244",
    "In3.Cu": "#347c86",
    "In4.Cu": "#685889",
    "In5.Cu": "#92793e",
  };
  const inner = ["#477a55", "#806244", "#347c86", "#685889", "#92793e", "#82556e"];
  const name = String(layer?.name || "");
  const index = Math.max(0, scene.copperLayers.findIndex((item) => item.name === name) - 1);
  return [...hex(colors[name] || inner[index % inner.length]), 1];
}

function hex(value) {
  const clean = value.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
}

function frame(now, token = activeViewerToken) {
  if (token !== activeViewerToken || !renderer || !camera) return;
  const frameStarted = performance.now();
  const frameInterval = Math.max(0, now - lastFrame);
  if (state.workspace === "schematic" && schematicRenderer) {
    lastFrame = now;
    const visible = schematicRenderer.visiblePages();
    const domPages = schematicDomRenderer ? schematicDomDetailPages(visible) : [];
    schematicRenderer.setDomDetailPageIds(domPages.map((page) => page.id));
    schematicScene.visiblePages = schematicRenderer.render();
    schematicDomRenderer?.syncWorldPages(domPages, schematicRenderer, { activeNetUid: schematicScene.activeNetUid });
    updateSchematicLabels();
    recordFrameSample(frameInterval, performance.now() - frameStarted);
    updateDiagnostics(now);
    scheduleFrame(token);
    return;
  }
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  camera.update(dt);
  renderer.resize();
  const layerZOffsets = stackupOffsets();
  for (const entry of renderer.entries) entry.layerOffset = layerZOffsets[entry.layerId] || 0;
  updateCompareTransition(now);
  compareOffsets = updateCompareLayout(now);
  const compareAlphas = compareLayerAlphas(now);
  panel = {
    layerId: 0,
    viewport: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    matrix: camera.matrix(canvas.width, canvas.height, state.mode === "layer"),
  };
  scheduleTileResidency(now);
  const visibleLayers = state.mode === "3d" ? state.visible3dLayers : compareRenderLayers();
  renderer.render({
    panels: [panel],
    activeNetId: state.activeNetId,
    selectedFeatureId: state.selectedFeatureId,
    time: now / 1000,
    layerOffsets: layerZOffsets,
    visibleLayers,
    showBoard: state.showBoard,
    showComponents: state.showComponents,
    componentOpacity: clamp(1 - state.separation / 0.1, 0, 1),
    boardOpacity: state.activeNetId ? 0.34 : 1 - state.separation * 0.72,
    isolateNet: state.isolateNet,
    compareMode: state.mode === "layer",
    compareOffsets,
    layerAlphas: compareAlphas,
    visibleTileIds: state.mode === "3d" ? state.visibleTileIds : null,
  });
  drawGizmo();
  updateLayerLabels();
  recordFrameSample(frameInterval, performance.now() - frameStarted);
  updateDiagnostics(now);
  scheduleFrame(token);
}

function schematicPageScreenMetrics(page) {
  if (!schematicRenderer || !page) return { widthPx: 0, heightPx: 0, sourcePxPerMm: 0, area: 0 };
  const widthPx = schematicRenderer.pagePixelWidth(page);
  const heightPx = page.heightMm / Math.max(1e-6, schematicRenderer.scale);
  const sourcePxPerMm = schematicRenderer.pageSourcePixelsPerMm(page);
  return { widthPx, heightPx, sourcePxPerMm, area: widthPx * heightPx };
}

function schematicDomDetailPages(visiblePages) {
  if (!schematicDomRenderer || !schematicRenderer) return [];
  const visible = visiblePages || [];
  const viewportArea = Math.max(1, schematicCanvas.clientWidth * schematicCanvas.clientHeight);
  const detail = visible
    .map((page) => ({ page, ...schematicPageScreenMetrics(page) }))
    .filter((item) =>
      item.widthPx >= 760
      && item.heightPx >= 520
      && item.area >= viewportArea * 0.36
      && item.sourcePxPerMm >= 1.25)
    .sort((a, b) => b.area - a.area);
  const maxMounted = 1;
  return detail.slice(0, maxMounted).map((item) => item.page);
}

function stackupOffsets() {
  const bounds = sceneRuntimeBounds();
  const diagonal = Math.hypot(
    (bounds[3] - bounds[0]) * 1000,
    (bounds[4] - bounds[1]) * 1000,
  );
  const gap = state.separation * state.separation * clamp(diagonal * 0.12, 8, 25) / 1000;
  const signature = `${state.separation}:${gap}:${scene.copperLayers.length}`;
  if (scene.layerZOffsetSignature === signature) return scene.layerZOffsets;
  const output = scene.layerZOffsets;
  output.fill(0);
  const middle = (scene.copperLayers.length - 1) / 2;
  scene.copperLayers.forEach((layer, index) => {
    output[Number(layer.id)] = (middle - index) * gap;
  });
  scene.layerZOffsetSignature = signature;
  return output;
}

function updateCompareLayout(now) {
  if (state.mode !== "layer") {
    compareAnimation.key = "3d";
    compareAnimation.current.clear();
    return new Map();
  }
  const selected = scene.copperLayers.filter((layer) => state.compareLayers.has(Number(layer.id)));
  const count = Math.max(1, selected.length);
  const aspect = canvas.width / Math.max(1, canvas.height);
  let columns = 1;
  if (count === 2) columns = aspect >= 1 ? 2 : 1;
  else if (count === 3 || count === 4) columns = 2;
  else if (count > 4) columns = Math.ceil(Math.sqrt(count * aspect));
  const rows = Math.ceil(count / columns);
  const bounds = sceneRuntimeBounds();
  const boardWidth = bounds[3] - bounds[0];
  const boardHeight = bounds[4] - bounds[1];
  const pitchX = boardWidth * 1.18;
  const pitchY = boardHeight * 1.22;
  const targets = selected.map((layer, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      layer,
      layerId: Number(layer.id),
      column,
      row,
      offset: [
        (column - (columns - 1) / 2) * pitchX,
        ((rows - 1) / 2 - row) * pitchY,
        0,
      ],
    };
  });
  const key = `${columns}x${rows}:${targets.map((item) => item.layerId).join(",")}`;
  if (key !== compareAnimation.key) {
    compareAnimation.key = key;
    compareAnimation.started = now;
    compareAnimation.from = new Map(compareAnimation.current);
    const totalWidth = columns * boardWidth + (columns - 1) * (pitchX - boardWidth);
    const totalHeight = rows * boardHeight + (rows - 1) * (pitchY - boardHeight);
    camera.targetFocus = [
      (bounds[0] + bounds[3]) / 2,
      (bounds[1] + bounds[4]) / 2,
      (bounds[2] + bounds[5]) / 2,
    ];
    camera.targetOrthoScale = Math.max(totalHeight, totalWidth / aspect) * 1.08;
  }
  const progress = clamp((now - compareAnimation.started) / 420, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  const offsets = new Map();
  for (const target of targets) {
    const start = compareAnimation.from.get(target.layerId) || [0, 0, 0];
    const current = target.offset.map(
      (value, index) => start[index] + (value - start[index]) * eased,
    );
    offsets.set(target.layerId, current);
    compareAnimation.current.set(target.layerId, current);
  }
  if (compareTransition.phase === "reveal") {
    for (const layerId of compareTransition.previous) {
      if (!offsets.has(Number(layerId))) {
        offsets.set(Number(layerId), compareTransition.previousOffsets.get(Number(layerId)) || [0, 0, 0]);
      }
    }
  }
  for (const layerId of [...compareAnimation.current.keys()]) {
    if (!targets.some((item) => item.layerId === layerId)) {
      compareAnimation.current.delete(layerId);
    }
  }
  return offsets;
}

function beginCompareLayerTransition(targetLayers) {
  const target = new Set([...targetLayers].map(Number));
  if (setsEqual(target, state.desiredCompareLayers) && compareTransition.phase !== "idle") return;
  state.desiredCompareLayers = target;
  if (setsEqual(target, state.compareLayers)) {
    compareTransition.phase = "idle";
    compareTransition.previous.clear();
    compareTransition.target.clear();
    return;
  }
  compareTransition.phase = "preload";
  compareTransition.previous = new Set(state.compareLayers);
  compareTransition.target = new Set(target);
  compareTransition.previousOffsets = new Map(compareAnimation.current);
  compareTransition.started = performance.now();
  scheduleTileResidency(compareTransition.started, { force: true });
}

function activatePcbLayerMode({ snap = true } = {}) {
  state.mode = "layer";
  const target = ensurePcbCompareLayers();
  state.desiredCompareLayers = new Set(target);
  if (!state.compareLayers.size && target.size) {
    state.compareLayers = new Set(target);
  }
  compareTransition.phase = "idle";
  compareTransition.previous.clear();
  compareTransition.target.clear();
  compareAnimation.key = "";
  camera.setAxis("z", false);
  renderer?.resize();
  compareOffsets = updateCompareLayout(performance.now());
  if (snap) camera.snap();
  scheduleTileResidency(performance.now(), { force: true });
}

function updateCompareTransition(now) {
  if (state.mode !== "layer" || compareTransition.phase === "idle") return;
  if (compareTransition.phase === "preload") {
    if (!compareTargetTilesReady(compareTransition.target)) {
      scheduleTileResidency(now, { force: true });
      return;
    }
    compareTransition.phase = "reveal";
    compareTransition.started = now;
    compareTransition.previousOffsets = new Map(compareAnimation.current);
    state.compareLayers = new Set(compareTransition.target);
    compareAnimation.key = "";
    return;
  }
  if (compareTransition.phase === "reveal" && now - compareTransition.started >= COMPARE_REVEAL_DURATION_MS) {
    state.compareLayers = new Set(compareTransition.target);
    compareTransition.phase = "idle";
    compareTransition.previous.clear();
    compareTransition.target.clear();
    compareTransition.previousOffsets.clear();
    scheduleTileResidency(now, { force: true });
  }
}

function compareTargetTilesReady(targetLayers) {
  for (const tile of scene.tiles.values()) {
    if (!targetLayers.has(Number(tile.layerId))) continue;
    if (!scene.residentTiles.has(tile.id) && !scene.failed.has(tile.id)) return false;
  }
  return true;
}

function compareLayerAlphas(now) {
  if (state.mode !== "layer" || compareTransition.phase !== "reveal") return null;
  const progress = clamp((now - compareTransition.started) / COMPARE_REVEAL_DURATION_MS, 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  const alphas = new Map();
  for (const layerId of compareTransition.previous) {
    alphas.set(Number(layerId), compareTransition.target.has(Number(layerId)) ? 1 : 1 - eased);
  }
  for (const layerId of compareTransition.target) {
    alphas.set(Number(layerId), compareTransition.previous.has(Number(layerId)) ? 1 : eased);
  }
  return alphas;
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function renderControls() {
  if (state.workspace === "schematic") {
    renderSchematicControls();
    return;
  }
  if (state.workspace === "bom") {
    renderBomControls();
    return;
  }
  if (state.workspace === "stackup") {
    return;
  }
  viewerKindEl.textContent = viewerReadiness.stage === "semantic-ready"
    ? "Semantic GLTF A0"
    : "Prism staged 3D";
  primaryHeadingEl.textContent = "Layers";
  primaryDescriptionEl.textContent = "Visibility and compare";
  query('[data-panel="search"] .section-heading span').textContent = "Nets, components and pins";
  query('[data-panel="view"] .section-heading span').textContent = "Camera and stackup";
  const modeToolbar = `
    <div class="mode-toolbar">
      <button data-mode="layer">PCB</button>
      <button data-mode="3d">3D</button>
    </div>`;
  if (modeSwitchEl) modeSwitchEl.innerHTML = modeToolbar;
  layersEl.innerHTML = `
    ${modeSwitchEl ? "" : modeToolbar}
    <div class="layer-presets">
      <button data-preset="all">All</button><button data-preset="none">None</button>
      <button data-preset="outer">Outer</button><button data-preset="inner">Inner</button>
    </div>
    <div class="layer-list"></div>`;
  searchControlsEl.innerHTML = `
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Net, component or pin">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="show-net-layers">Net layers</button>
      <button id="isolate-net" aria-keyshortcuts="I" title="Toggle isolated net view (I)">Isolate</button>
      <button id="clear-selection">Clear</button>
    </div>`;
  viewControlsEl.innerHTML = `
    <div class="camera-toolbar mode-toolbar">
      <button data-tool="orbit">Orbit</button><button data-tool="pan">Pan</button>
    </div>
    <div class="toggle-list">
      <label class="toggle-row"><input id="show-board" type="checkbox"><span>Board substrate</span></label>
      <label class="toggle-row"><input id="show-components" type="checkbox"><span>Components</span></label>
    </div>
    <label class="control-field range-field"><span>Stackup separation</span>
      <input id="separation" type="range" min="0" max="1" step="0.002">
    </label>`;
  refreshControls();
  bindControlEvents();
}

function renderBomControls() {
  viewerKindEl.textContent = "BoM A0";
  primaryHeadingEl.textContent = "Bill of Materials";
  primaryDescriptionEl.textContent = "Grouped procurement view";
  query('[data-panel="search"] .section-heading span').textContent = "Search inside the BoM table";
  query('[data-panel="view"] .section-heading span').textContent = "BoM actions";
  const counts = bomViewer?.payload?.counts || {};
  layersEl.innerHTML = `
    <div class="selection-properties">
      <div class="selection-property"><small>Rows</small><strong>${counts.rows || 0}</strong></div>
      <div class="selection-property"><small>Components</small><strong>${counts.components || 0}</strong></div>
      <div class="selection-property"><small>DNP</small><strong>${counts.dnpComponents || 0}</strong></div>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Columns</span>
      <div class="selection-empty">Primary procurement and thermal columns are shown first. Additional symbol and footprint metadata is available in the row detail panel.</div>
    </div>`;
  searchControlsEl.innerHTML = `
    <div class="selection-empty">Use the BoM search box in the main view. Reference chips update the shared PCB and schematic selection without changing workspaces.</div>
    <div class="quick-actions">
      <button id="clear-selection">Clear</button>
    </div>`;
  viewControlsEl.innerHTML = `
    <div class="selection-section">
      <span class="selection-section-title">Cross-probing</span>
      <div class="selection-table">
        <div class="selection-row"><span><strong>PCB/Schematic</strong></span><span>Select component</span><span>Highlights matching BoM row</span></div>
        <div class="selection-row"><span><strong>BoM reference</strong></span><span>Click chip</span><span>Holds component selection for PCB and schematic</span></div>
      </div>
    </div>`;
  searchControlsEl.querySelector("#clear-selection")?.addEventListener("click", clearSelection);
}

function renderSchematicControls() {
  viewerKindEl.textContent = schematicDomRenderer
    ? "Schematic SVG DOM"
    : schematicScene.manifest?.schema === "prism.schematic_vector_a0"
    ? "Schematic Vector A0"
    : "Schematic World A0";
  primaryHeadingEl.textContent = "Pages";
  primaryDescriptionEl.textContent = `${schematicScene.pages.length} hierarchy instances`;
  query('[data-panel="search"] .section-heading span').textContent = "Pages, nets and components";
  query('[data-panel="view"] .section-heading span').textContent = "World navigation";
  layersEl.innerHTML = `
    <div class="layer-presets">
      <button data-page-action="world">Fit world</button>
      <button data-page-action="parent">Parent</button>
      <button data-page-action="previous">Previous</button>
      <button data-page-action="next">Next</button>
    </div>
    <div class="page-list">${schematicScene.pages.map((page) => `
      <button class="page-row ${page.id === state.selectedPageId ? "active" : ""}" data-page="${page.id}">
        <span>${page.sheetNumber}</span>
        <strong>${escapeHtml(page.name)}</strong>
        <small>L${page.depth}</small>
      </button>`).join("")}</div>`;
  searchControlsEl.innerHTML = `
    <label class="control-field"><span>Search</span>
      <input id="entity-search" class="layer-select" type="search" placeholder="Page, net or component">
      <div id="search-results" class="search-results"></div>
    </label>
    <div class="quick-actions">
      <button id="frame-selection">Frame</button>
      <button id="clear-selection">Clear</button>
    </div>`;
  viewControlsEl.innerHTML = `
    <div class="toggle-list">
      <label class="toggle-row"><input id="show-hierarchy" type="checkbox" checked><span>Hierarchy links</span></label>
    </div>
    <div class="selection-section">
      <span class="selection-section-title">Navigation</span>
      <div class="selection-table">
        <div class="selection-row"><span><strong>Home</strong></span><span>World</span><span>Frame every page</span></div>
        <div class="selection-row"><span><strong>[ / ]</strong></span><span>Pages</span><span>Previous or next instance</span></div>
        <div class="selection-row"><span><strong>Alt+Up</strong></span><span>Parent</span><span>Move up hierarchy</span></div>
      </div>
    </div>`;
  layersEl.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => selectSchematicPage(button.dataset.page, true));
  });
  layersEl.querySelectorAll("[data-page-action]").forEach((button) => {
    button.addEventListener("click", () => navigateSchematic(button.dataset.pageAction));
  });
  searchControlsEl.querySelector("#entity-search").addEventListener("input", (event) => {
    renderSchematicSearch(event.target.value);
  });
  searchControlsEl.querySelector("#frame-selection").addEventListener("click", frameSchematicSelection);
  searchControlsEl.querySelector("#clear-selection").addEventListener("click", clearSchematicSelection);
  viewControlsEl.querySelector("#show-hierarchy").checked = schematicRenderer?.showHierarchy ?? true;
  viewControlsEl.querySelector("#show-hierarchy").addEventListener("change", (event) => {
    schematicRenderer.showHierarchy = event.target.checked;
  });
}

function selectSchematicPage(pageId, shouldFrame) {
  const page = schematicScene.byId.get(pageId);
  if (!page || !schematicRenderer) return;
  state.selectedPageId = page.id;
  state.selectedSchematicFeature = null;
  schematicRenderer.selectedPageId = page.id;
  schematicRenderer.selectedFeatureId = 0;
  selectionEl.textContent = JSON.stringify(page, null, 2);
  if (shouldFrame) schematicRenderer.framePage(page);
  layersEl.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page.id);
  });
}

function navigateSchematic(action) {
  if (!schematicRenderer) return;
  if (action === "world") {
    schematicRenderer.frameWorld();
    return;
  }
  const index = Math.max(0, schematicScene.pages.findIndex((page) => page.id === state.selectedPageId));
  let target = null;
  if (action === "previous") target = schematicScene.pages[(index - 1 + schematicScene.pages.length) % schematicScene.pages.length];
  else if (action === "next") target = schematicScene.pages[(index + 1) % schematicScene.pages.length];
  else if (action === "parent") target = schematicScene.byId.get(schematicScene.pages[index]?.parentId);
  if (target) selectSchematicPage(target.id, true);
}

function openSchematicDomTarget(selection) {
  if (!selection || !schematicRenderer) return;
  clearSchematicSelection();
  if (selection.kind === "page" && selection.pageId) {
    selectSchematicPage(selection.pageId, true);
    return;
  }
  if (selection.kind !== "sheet") return;
  const currentPage = schematicScene.pages.find((page) => page.sheetInstancePath === selection.sheetInstancePath)
    || schematicScene.byId.get(state.selectedPageId);
  const sheetFile = String(selection.sheetFile || selection.feature?.sheet_file || "").replace(/\\/g, "/");
  const sheetName = String(selection.sheetName || selection.feature?.sheet_name || selection.feature?.objectId || "");
  const target = schematicScene.pages.find((page) => {
    if (currentPage && page.parentId && page.parentId !== currentPage.id) return false;
    const sourcePath = String(page.sourcePath || "").replace(/\\/g, "/");
    return (sheetFile && sourcePath.endsWith(sheetFile)) || (sheetName && page.name === sheetName);
  }) || schematicScene.pages.find((page) => {
    const sourcePath = String(page.sourcePath || "").replace(/\\/g, "/");
    return (sheetFile && sourcePath.endsWith(sheetFile)) || (sheetName && page.name === sheetName);
  });
  if (target) selectSchematicPage(target.id, true);
}

function renderSchematicSearch(query) {
  const container = searchControlsEl.querySelector("#search-results");
  const value = query.trim().toLowerCase();
  if (!value) {
    container.innerHTML = "";
    return;
  }
  const pages = schematicScene.pages.filter((page) =>
    `${page.name} ${page.sheetPath}`.toLowerCase().includes(value)).slice(0, 8);
  const nets = scene.nets.filter((net) => String(net.name).toLowerCase().includes(value)).slice(0, 8);
  container.innerHTML = [
    ...pages.map((page) => `<button data-page="${page.id}"><b>${escapeHtml(page.name)}</b><span>Page ${page.sheetNumber}</span></button>`),
    ...nets.map((net) => `<button data-schematic-net="${net.id}"><b>${escapeHtml(net.name)}</b><span>${(schematicScene.manifest.netToPages?.[net.uid] || []).length} pages</span></button>`),
  ].join("");
  container.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => selectSchematicPage(button.dataset.page, true));
  });
  container.querySelectorAll("[data-schematic-net]").forEach((button) => {
    button.addEventListener("click", () => selectSchematicNet(Number(button.dataset.schematicNet), true));
  });
}

function selectSchematicNet(netId, shouldFrame) {
  const net = scene.nets.find((item) => Number(item.id) === netId);
  if (!net || !schematicRenderer) return;
  state.activeNetId = netId;
  state.selectedFeatureId = 0;
  state.selectedSchematicFeature = null;
  schematicRenderer.selectedFeatureId = 0;
  schematicRenderer.selectedFeatureKey = "";
  schematicRenderer.selectedSourceId = "";
  schematicScene.activeNetUid = net.uid;
  schematicRenderer.activeNetUid = net.uid;
  schematicDomRenderer?.setHighlightedNet(net.uid);
  selectionEl.textContent = JSON.stringify(net, null, 2);
  updateSelectionCard();
  const pageIds = schematicScene.manifest.netToPages?.[net.uid] || [];
  if (shouldFrame && pageIds.length) selectSchematicPage(pageIds[0], true);
}

function highlightSchematicNetByUid(netUid, selection = null) {
  const net = scene.nets.find((item) => item.uid === netUid);
  if (!net) return;
  state.activeNetId = Number(net.id);
  schematicScene.activeNetUid = net.uid;
  if (schematicRenderer) {
    schematicRenderer.activeNetUid = net.uid;
    schematicRenderer.selectedFeatureId = Number(selection?.feature?.id || selection?.featureId || 0);
    schematicRenderer.selectedFeatureKey = selection?.feature?.stableKey || selection?.featureKey || "";
    schematicRenderer.selectedSourceId = selection?.feature?.sourceId || selection?.sourceId || "";
  }
  schematicDomRenderer?.setHighlightedNet(net.uid);
  if (selection) state.selectedSchematicFeature = { ...selection, pageId: state.selectedPageId };
  selectionEl.textContent = JSON.stringify(selection ? { ...selection, net } : net, null, 2);
  updateSelectionCard();
}

function clearSchematicSelection() {
  state.activeNetId = 0;
  state.selectedFeatureId = 0;
  state.selectedSchematicFeature = null;
  schematicScene.activeNetUid = "";
  if (schematicRenderer) {
    schematicRenderer.activeNetUid = "";
    schematicRenderer.selectedFeatureId = 0;
    schematicRenderer.selectedFeatureKey = "";
    schematicRenderer.selectedSourceId = "";
  }
  schematicDomRenderer?.setSelection(null);
  schematicDomRenderer?.setHighlightedNet("");
  selectionEl.textContent = "No object selected";
  updateSelectionCard();
}

function frameSchematicSelection() {
  const page = schematicScene.byId.get(state.selectedPageId);
  if (page) schematicRenderer.framePage(page);
  else schematicRenderer.frameWorld();
}

function selectSchematicDomSelection(selection) {
  state.selectedPageId = selection.sheetInstancePath
    ? (schematicScene.pages.find((page) => page.sheetInstancePath === selection.sheetInstancePath)?.id || state.selectedPageId)
    : state.selectedPageId;
  state.selectedFeatureId = 0;
  state.selectedSchematicFeature = { ...selection, pageId: state.selectedPageId };
  if (selection.anchor) state.selectionAnchor = selection.anchor;
  if (schematicRenderer) {
    schematicRenderer.selectedPageId = state.selectedPageId;
    schematicRenderer.selectedFeatureId = Number(selection.feature?.id || 0);
  }
  const net = selection.netUid ? scene.nets.find((item) => item.uid === selection.netUid) : null;
  const component = selection.reference ? scene.componentFeatures.get(selection.reference) : null;
  if (component) {
    state.selectedFeatureId = Number(component.featureId || 0);
    bomViewer?.setSelectionByReference(selection.reference, { scroll: state.workspace === "bom" });
  }
  selectionEl.textContent = JSON.stringify({ ...selection, net, component }, null, 2);
  updateSelectionCard();
}

function selectSchematicFeature(hit) {
  const { page, feature } = hit;
  if (!feature) {
    state.selectedSchematicFeature = null;
    schematicRenderer.selectedFeatureId = 0;
    selectSchematicPage(page.id, false);
    updateSelectionCard();
    return;
  }
  const featureId = Number(feature.id || 0);
  state.selectedPageId = page.id;
  schematicRenderer.selectedPageId = page.id;
  schematicRenderer.selectedFeatureId = featureId;
  state.selectedSchematicFeature = { ...feature, pageId: page.id };
  state.selectionAnchor = null;

  if (feature.netUid) {
    const net = scene.nets.find((item) => item.uid === feature.netUid);
    if (net) {
      selectSchematicNet(Number(net.id), false);
      state.selectedSchematicFeature = { ...feature, pageId: page.id };
      schematicRenderer.selectedFeatureId = featureId;
      return;
    }
  }
  if (feature.reference) {
    const component = scene.componentFeatures.get(feature.reference);
    if (component) {
      selectFeature(Number(component.featureId), false);
      state.selectedSchematicFeature = { ...feature, pageId: page.id };
      schematicRenderer.selectedFeatureId = featureId;
      return;
    }
  }
  state.activeNetId = 0;
  state.selectedFeatureId = 0;
  schematicRenderer.activeNetUid = "";
  selectionEl.textContent = JSON.stringify({ page: page.name, ...feature }, null, 2);
  updateSelectionCard();
}

function syncNetIsolationControls() {
  const isolate = state.isolateNet;
  const panelButton = searchControlsEl?.querySelector?.("#isolate-net");
  panelButton?.classList.toggle("active", isolate);
  panelButton?.setAttribute("aria-pressed", String(isolate));
  const cardButton = selectionCardEl?.querySelector?.("[data-action=isolate]");
  cardButton?.classList.toggle("active", isolate);
  cardButton?.setAttribute("aria-pressed", String(isolate));
  const boardToggle = viewControlsEl?.querySelector?.("#show-board");
  if (boardToggle) boardToggle.checked = state.showBoard;
  const componentsToggle = viewControlsEl?.querySelector?.("#show-components");
  if (componentsToggle) componentsToggle.checked = state.showComponents;
}

function layersForActiveNet() {
  const layers = new Set();
  if (!state.activeNetId) return layers;

  // The manifest's net record is the source of truth. It is available before
  // tile residency begins, whereas deriving membership only from resident tile
  // state can leave isolation with an empty layer set on its first activation.
  const net = scene.nets.find((item) => Number(item.id) === Number(state.activeNetId));
  const copperLayerIds = new Set(scene.copperLayers.map((layer) => Number(layer.id)));
  for (const layerId of Object.keys(net?.layerBoundsMm || {})) {
    const numericId = Number(layerId);
    if (copperLayerIds.has(numericId)) layers.add(numericId);
  }

  // Older manifests may only expose the human-readable layer list.
  if (!layers.size) {
    const idsByName = new Map(scene.copperLayers.map((layer) => [layer.name, Number(layer.id)]));
    for (const layerName of net?.metrics?.layers || []) {
      const layerId = idsByName.get(layerName);
      if (layerId != null) layers.add(layerId);
    }
  }

  // Retain compatibility with manifests generated before per-net layer bounds.
  if (layers.size) return layers;
  for (const tile of scene.tiles.values()) {
    if (tileHasNet(tile, state.activeNetId)) layers.add(Number(tile.layerId));
  }
  return layers;
}

function applyNetIsolationLayers() {
  const layers = layersForActiveNet();
  if (!layers.size) return;
  state.visible3dLayers = new Set(layers);
  if (state.mode === "layer") beginCompareLayerTransition(layers);
  else {
    state.compareLayers = new Set(layers);
    state.desiredCompareLayers = new Set(layers);
  }
  scheduleTileResidency(performance.now(), { force: true });
}

function setNetIsolation(enabled) {
  const next = Boolean(enabled && state.activeNetId);
  const wasIsolating = state.isolateNet;
  if (next && !state.isolateNet) {
    state.preIsolation3dLayers = new Set(state.visible3dLayers);
    state.preIsolationCompareLayers = new Set(state.desiredCompareLayers.size
      ? state.desiredCompareLayers
      : state.compareLayers);
  }
  state.isolateNet = next;
  if (state.isolateNet) {
    applyNetIsolationLayers();
  } else if (state.preIsolation3dLayers || state.preIsolationCompareLayers) {
    if (state.preIsolation3dLayers) {
      state.visible3dLayers = new Set(state.preIsolation3dLayers);
    }
    if (state.preIsolationCompareLayers) {
      const restored = new Set(state.preIsolationCompareLayers);
      if (state.mode === "layer") beginCompareLayerTransition(restored);
      else {
        state.compareLayers = restored;
        state.desiredCompareLayers = new Set(restored);
      }
    }
    state.preIsolation3dLayers = null;
    state.preIsolationCompareLayers = null;
    scheduleTileResidency(performance.now(), { force: true });
  }
  // Couple substrate hide/show to the Isolate transition only.
  // Restore the visibility that was current when Isolate was entered — not
  // savedShowBoard (user prefs for Esc). Net-probe already hides the board;
  // unisolating must not turn the substrate back on.
  if (next && !wasIsolating) {
    state.preIsolationShowBoard = state.showBoard;
    state.showBoard = false;
  } else if (!next && wasIsolating) {
    if (typeof state.preIsolationShowBoard === "boolean") {
      state.showBoard = state.preIsolationShowBoard;
    }
    state.preIsolationShowBoard = null;
  }
  syncNetIsolationControls();
  refreshControls();
}

function refreshControls() {
  (modeSwitchEl || layersEl).querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  viewControlsEl.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.cameraTool);
  });
  viewControlsEl.querySelector("#show-board").checked = state.showBoard;
  viewControlsEl.querySelector("#show-components").checked = state.showComponents;
  viewControlsEl.querySelector("#separation").value = state.separation;
  const list = layersEl.querySelector(".layer-list");
  const selected = state.mode === "3d" ? state.visible3dLayers : state.desiredCompareLayers;
  list.innerHTML = scene.copperLayers.map((layer, index) => `
    <label class="layer-row">
      <input type="checkbox" data-layer="${layer.id}" ${selected.has(Number(layer.id)) ? "checked" : ""}>
      <span class="swatch" style="background:${rgbCss(layerColor(layer))}"></span>
      <span>${escapeHtml(layer.name)}</span><small>${index + 1}</small>
    </label>`).join("");
  list.querySelectorAll("[data-layer]").forEach((input) => input.addEventListener("change", () => {
    const layerId = Number(input.dataset.layer);
    if (state.mode === "3d") {
      input.checked ? state.visible3dLayers.add(layerId) : state.visible3dLayers.delete(layerId);
      scheduleTileResidency(performance.now(), { force: true });
    } else {
      const target = new Set(state.desiredCompareLayers);
      input.checked ? target.add(layerId) : target.delete(layerId);
      beginCompareLayerTransition(target);
    }
  }));
  syncNetIsolationControls();
}

function bindControlEvents() {
  (modeSwitchEl || layersEl).querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.mode === "layer") {
      activatePcbLayerMode();
    } else {
      state.mode = "3d";
      camera.frame(sceneRuntimeBounds());
      camera.snap();
      state.visibleTileIds = new Set();
      scheduleTileResidency(performance.now(), { force: true });
    }
    refreshControls();
  }));
  layersEl.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    const target = state.mode === "3d" ? state.visible3dLayers : new Set();
    target.clear();
    const preset = button.dataset.preset;
    for (const [index, layer] of scene.copperLayers.entries()) {
      const include = preset === "all"
        || (preset === "outer" && (index === 0 || index === scene.copperLayers.length - 1))
        || (preset === "inner" && index > 0 && index < scene.copperLayers.length - 1);
      if (include) target.add(Number(layer.id));
    }
    if (state.mode === "3d") scheduleTileResidency(performance.now(), { force: true });
    else beginCompareLayerTransition(target);
    refreshControls();
  }));
  viewControlsEl.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
    state.cameraTool = button.dataset.tool;
    refreshControls();
  }));
  viewControlsEl.querySelector("#show-board").addEventListener("change", (event) => {
    state.showBoard = event.target.checked;
    state.savedShowBoard = state.showBoard;
    if (state.showBoard && state.isolateNet) setNetIsolation(false);
  });
  viewControlsEl.querySelector("#show-components").addEventListener("change", (event) => {
    state.showComponents = event.target.checked;
    state.savedShowComponents = state.showComponents;
  });
  viewControlsEl.querySelector("#separation").addEventListener("input", (event) => {
    state.separation = Number(event.target.value);
  });
  searchControlsEl.querySelector("#clear-selection").addEventListener("click", clearSelection);
  searchControlsEl.querySelector("#isolate-net").addEventListener("click", () => {
    setNetIsolation(!state.isolateNet);
  });
  searchControlsEl.querySelector("#frame-selection").addEventListener("click", frameSelection);
  searchControlsEl.querySelector("#show-net-layers").addEventListener("click", showNetLayers);
  const search = searchControlsEl.querySelector("#entity-search");
  search.addEventListener("input", () => renderSearch(search.value));
}

function bindPanelTabs() {
  queryAll(".rail-tab").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    const closing = state.activeTab === tab && !appEl.classList.contains("panel-collapsed");
    state.activeTab = tab;
    appEl.classList.toggle("panel-collapsed", closing);
    queryAll(".rail-tab").forEach((item) => {
      item.classList.toggle("active", !closing && item.dataset.tab === tab);
    });
    queryAll(".tab-panel").forEach((item) => {
      item.classList.toggle("active", !closing && item.dataset.panel === tab);
    });
  }));
}

function showNetLayers() {
  const net = scene.nets.find((item) => Number(item.id) === state.activeNetId);
  if (!net) return;
  const names = new Set(net.metrics?.layers || []);
  const target = state.mode === "3d" ? state.visible3dLayers : new Set();
  target.clear();
  for (const layer of scene.copperLayers) {
    if (names.has(layer.name)) target.add(Number(layer.id));
  }
  if (state.mode === "3d") scheduleTileResidency(performance.now(), { force: true });
  else beginCompareLayerTransition(target);
  refreshControls();
}

function renderSearch(query) {
  const container = searchControlsEl.querySelector("#search-results");
  const value = query.trim().toLowerCase();
  if (!value) {
    container.innerHTML = "";
    return;
  }
  const nets = scene.nets.filter((net) => String(net.name).toLowerCase().includes(value)).slice(0, 8);
  const components = [...scene.componentFeatures.values()].filter((item) =>
    `${item.designator} ${item.value} ${item.footprint}`.toLowerCase().includes(value)).slice(0, 6);
  container.innerHTML = [
    ...nets.map((net) => `<button data-net="${net.id}"><b>${escapeHtml(net.name)}</b><span>${escapeHtml(net.netClass || "")}</span></button>`),
    ...components.map((item) => `<button data-feature="${item.featureId}"><b>${escapeHtml(item.designator)}</b><span>${escapeHtml(item.value)}</span></button>`),
  ].join("");
  container.querySelectorAll("[data-net]").forEach((button) => {
    button.addEventListener("click", () => selectNet(Number(button.dataset.net), true));
  });
  container.querySelectorAll("[data-feature]").forEach((button) => {
    button.addEventListener("click", () => selectFeature(Number(button.dataset.feature), true));
  });
}

function selectNet(netId, shouldFrame) {
  if (shouldFrame) state.selectionAnchor = null;
  state.activeNetId = netId;
  state.selectedFeatureId = 0;
  const net = scene.nets.find((item) => Number(item.id) === netId);
  if (state.workspace === "schematic" && net && schematicRenderer) {
    schematicScene.activeNetUid = net.uid;
    schematicRenderer.activeNetUid = net.uid;
  }
  applyNetProbeVisibility();
  selectionEl.textContent = JSON.stringify(net || {}, null, 2);
  updateSelectionCard();
  if (state.isolateNet) applyNetIsolationLayers();
  if (shouldFrame && net?.boundsMm) camera.frame(runtimeBounds(net.boundsMm));
  scheduleTileResidency(performance.now(), { force: true });
  emitSelectionChange(netSelection(net));
}

function selectFeature(featureId, shouldFrame = false) {
  const feature = scene.features.get(featureId);
  if (shouldFrame) state.selectionAnchor = null;
  state.selectedFeatureId = featureId;
  state.activeNetId = Number(feature?.netId || 0);
  const reference = componentReferenceFromFeature(feature);
  if (reference) bomViewer?.setSelectionByReference(reference, { scroll: state.workspace === "bom" });
  const selection = featureSelection(feature);
  if (selection?.kind === "net") applyNetProbeVisibility();
  else applyComponentProbeVisibility();
  selectionEl.textContent = feature ? JSON.stringify(feature, null, 2) : "No object selected";
  updateSelectionCard();
  if (state.isolateNet && state.activeNetId) applyNetIsolationLayers();
  if (shouldFrame && feature?.bounds) framePcbFeature(feature);
  scheduleTileResidency(performance.now(), { force: true });
  emitSelectionChange(selection);
}

function selectComponentReference(reference, shouldFrame = false) {
  const component = scene.componentFeatures.get(reference);
  bomViewer?.setSelectionByReference(reference, { scroll: state.workspace === "bom" });
  if (!component?.featureId) return;
  applyComponentProbeVisibility();
  selectFeature(Number(component.featureId), false);

  const schematicMatch = findSchematicFeatureByReference(reference);
  if (schematicMatch) {
    const { page, feature } = schematicMatch;
    state.selectedPageId = page.id;
    state.selectedSchematicFeature = { ...feature, pageId: page.id };
    if (schematicRenderer) {
      schematicRenderer.selectedPageId = page.id;
      schematicRenderer.selectedFeatureId = Number(feature.id || 0);
    }
    schematicDomRenderer?.setSelection?.({
      kind: "component",
      featureKey: feature.stableKey || "",
      sheetInstancePath: feature.sheetInstancePath || page.sheetInstancePath || "",
      sourceId: feature.sourceId || feature.uuid || "",
      reference,
      feature,
      pageId: page.id,
    });
    if (shouldFrame && state.workspace === "schematic") {
      selectSchematicPage(page.id, true);
      schematicDomRenderer?.frameSelection?.();
    }
  }

  if (shouldFrame && state.workspace === "pcb") {
    const feature = scene.features.get(Number(component.featureId));
    if (feature?.bounds) framePcbFeature(feature, true);
  }
  updateSelectionCard();
}

function componentReferenceFromFeature(feature) {
  return feature?.designator || feature?.reference || feature?.componentDesignator || "";
}

function framePcbFeature(feature, forceComponent = false) {
  if (!feature?.bounds) return;
  const isComponent = forceComponent || feature.kind === "component" || Boolean(componentReferenceFromFeature(feature));
  if (isComponent) {
    const centerZ = (feature.bounds[2] + feature.bounds[5]) * 0.5;
    const isBottomComponent = centerZ < 0;
    // Compare against the destination orientation as well as the current
    // interpolated camera. Repeated cross-probes during an in-progress flip
    // must not cancel or reverse the requested board side.
    const isCameraBottom = camera.targetPolar > Math.PI / 2;
    if (isBottomComponent !== isCameraBottom) {
      camera.setAxis("z", isBottomComponent);
    }
  }
  camera.frame(feature.bounds);
}

function findSchematicFeatureByReference(reference) {
  if (!reference || !schematicRenderer?.featuresByPage) return null;
  const currentPage = schematicScene.byId.get(state.selectedPageId);
  const orderedPages = [
    ...(currentPage ? [currentPage] : []),
    ...(schematicScene.pages || []).filter((page) => page.id !== currentPage?.id),
  ];
  const priority = (feature) => {
    const kind = String(feature.kind || "").toLowerCase();
    if (kind === "component" || kind === "symbol_body" || kind === "symbol_instance") return 0;
    if (kind === "symbol_reference") return 1;
    if (kind.startsWith("pin")) return 2;
    return 3;
  };
  for (const page of orderedPages) {
    const matches = (schematicRenderer.featuresByPage[page.id] || [])
      .filter((feature) => String(feature.reference || feature.designator || feature.componentDesignator || "") === reference)
      .sort((a, b) => priority(a) - priority(b));
    if (matches.length) return { page, feature: matches[0] };
  }
  return null;
}

function clearSelection() {
  state.activeNetId = 0;
  state.selectedFeatureId = 0;
  state.selectedSchematicFeature = null;
  state.selectionAnchor = null;
  const wasIsolating = state.isolateNet;
  if (wasIsolating) setNetIsolation(false);
  else {
    // Still clear isolation bookkeeping without forcing substrate ON.
    state.isolateNet = false;
  }
  restoreViewVisibilityPrefs();
  schematicScene.activeNetUid = "";
  if (schematicRenderer) schematicRenderer.activeNetUid = "";
  schematicDomRenderer?.setSelection(null);
  schematicDomRenderer?.setHighlightedNet("");
  selectionEl.textContent = "No object selected";
  bomViewer?.clearSelection?.();
  updateSelectionCard();
  emitSelectionChange(null);
}

function selectionProperties(items) {
  return `<div class="selection-properties">${items.map(([label, value]) => `
    <div class="selection-property">
      <small>${escapeHtml(label)}</small>
      <strong title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</strong>
    </div>`).join("")}</div>`;
}

function selectionHeader(type, title, accent) {
  return `
    <div class="selection-card-head">
      <span class="selection-card-accent" style="background:${accent}"></span>
      <div class="selection-card-drag-handle" title="Drag to move card">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <circle cx="2" cy="2" r="1"/>
          <circle cx="6" cy="2" r="1"/>
          <circle cx="10" cy="2" r="1"/>
          <circle cx="2" cy="6" r="1"/>
          <circle cx="6" cy="6" r="1"/>
          <circle cx="10" cy="6" r="1"/>
          <circle cx="2" cy="10" r="1"/>
          <circle cx="6" cy="10" r="1"/>
          <circle cx="10" cy="10" r="1"/>
        </svg>
      </div>
      <div class="selection-card-title"><small>${escapeHtml(type)}</small><strong>${escapeHtml(title)}</strong></div>
      <button class="selection-card-close" type="button" aria-label="Clear selection">&times;</button>
    </div>`;
}

function netSelectionContent(net) {
  const details = topology.net_details?.[net.uid] || {};
  const terminals = details.terminals || [];
  const metrics = net.metrics || {};
  const traceLength = Number(metrics.traceLengthMm || 0).toFixed(2);
  const viaCount = metrics.objectCounts?.via || 0;
  const pinCount = terminals.length;

  const isPower = /^(VCC|VDD|GND|3V3|5V|12V|VIN|POWER)/i.test(net.name);
  const accentColor = isPower ? "#10b981" : "#8b5cf6";
  const classBadge = net.netClass || "Default";

  const endpointRows = terminals.length
    ? terminals.map((terminal) => `
      <div class="selection-row pin-row-interactive" data-ref="${escapeHtml(terminal.designator)}" data-pin="${escapeHtml(terminal.pin)}">
        <span class="refdes-col"><strong>${escapeHtml(terminal.designator)}</strong></span>
        <span class="pin-col">Pin ${escapeHtml(terminal.pin)}</span>
        <span class="val-col" title="${escapeHtml(terminal.value || "")}">${escapeHtml(terminal.value || "-")}</span>
      </div>`).join("")
    : `<div class="selection-empty">No connected pin metadata is available.</div>`;

  return `
    ${selectionHeader("Net", net.name, accentColor)}
    <div class="selection-net-dashboard">
      <div class="net-metric-grid">
        <div class="metric-card">
          <small>Length</small>
          <strong>${traceLength} <span class="unit">mm</span></strong>
        </div>
        <div class="metric-card">
          <small>Vias</small>
          <strong>${viaCount}</strong>
        </div>
        <div class="metric-card">
          <small>Pins</small>
          <strong>${pinCount}</strong>
        </div>
        <div class="metric-card">
          <small>Class</small>
          <strong title="${escapeHtml(classBadge)}">${escapeHtml(classBadge)}</strong>
        </div>
      </div>
      
      <div class="selection-section">
        <span class="selection-section-title">Layers</span>
        <div class="net-layers-badges">
          ${(metrics.layers || []).length 
            ? metrics.layers.map(l => `<span class="layer-badge">${escapeHtml(l)}</span>`).join("")
            : `<span class="layer-badge unknown">None</span>`
          }
        </div>
      </div>

      <div class="selection-section">
        <span class="selection-section-title">Connected Pins</span>
        <div class="selection-table compact-scroll" style="max-height: 120px;">
          ${endpointRows}
        </div>
      </div>
    </div>`;
}

function componentSelectionContent(component, selectedPin = null) {
  const topoComp = findTopologyComponent(component.designator);
  const value = topoComp ? topoComp.value : (component.value || "Not specified");
  const footprint = topoComp ? topoComp.footprint : (component.footprint || "Not specified");
  
  const params = topoComp?.parameters || {};
  const mfr = params["Manufacturer"] || params["Mfr"] || "";
  const mpn = params["Manufacturer Part Number"] || params["MPN"] || params["Part Number"] || "";
  const dnp = params["kicad_dnp"] === "true" || params["DNP"] === "true" || params["kicad_in_bom"] === "false";

  let detailsSection = "";
  if (mfr || mpn) {
    detailsSection = `
      <div class="selection-section">
        <span class="selection-section-title">Component details</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Manufacturer</strong></span>
            <span title="${escapeHtml(mfr)}">${escapeHtml(mfr || "-")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Part Number</strong></span>
            <span title="${escapeHtml(mpn)}">${escapeHtml(mpn || "-")}</span>
          </div>
        </div>
      </div>`;
  }

  let pinSection = "";
  if (selectedPin) {
    pinSection = `
      <div class="selection-section">
        <span class="selection-section-title">Selected Pin</span>
        <div class="selection-table">
          <div class="selection-row">
            <span><strong>Pin</strong></span>
            <span>Pin ${escapeHtml(selectedPin.pinNumber || selectedPin.pin || "")}</span>
            <span title="${escapeHtml(selectedPin.pinName || "")}">${escapeHtml(selectedPin.pinName || "No name")}</span>
          </div>
          <div class="selection-row">
            <span><strong>Net</strong></span>
            <span class="net-ref-interactive" data-net-name="${escapeHtml(selectedPin.netName || "")}">${escapeHtml(selectedPin.netName || "Not connected")}</span>
          </div>
        </div>
      </div>`;
  }

  return `
    ${selectionHeader("Component", component.designator || "Unknown", "#3b82f6")}
    <div class="selection-component-dashboard">
      ${dnp ? `<div class="dnp-banner" style="background:#b45309;color:#fff;font-size:9px;font-weight:750;text-align:center;padding:3px;margin-bottom:8px;border-radius:2px;text-transform:uppercase;letter-spacing:0.05em;">DNP (Do Not Populate)</div>` : ""}
      ${selectionProperties([
        ["Value", value],
        ["Footprint", footprint.split(":").pop() || footprint],
      ])}
      ${detailsSection}
      ${pinSection}
    </div>`;
}

function schematicFeatureSelectionContent(feature, page) {
  const kind = String(feature.kind || "").toLowerCase();
  const isPin = kind.startsWith("pin");
  const isComponent = kind === "component" || kind.includes("symbol");
  if (isComponent) {
    return `
      ${selectionHeader("Component", feature.reference || feature.componentDesignator || "Unknown", "#3b82f6")}
      ${selectionProperties([
        ["Value", feature.value || feature.componentValue || "Not specified"],
        ["Footprint", feature.componentFootprint || feature.footprint || "Not specified"],
        ["Library", feature.libraryRef || "Not specified"],
        ["UID", feature.componentUid || feature.uuid || feature.sourceId || "Not resolved"],
      ])}
      <div class="selection-section">
        <span class="selection-section-title">Schematic placement</span>
        ${selectionProperties([
          ["Page", page?.name || "Unknown"],
          ["Sheet", feature.sheetInstancePath || "/"],
        ])}
      </div>`;
  }
  const pinRows = isPin
    ? [
        ["Symbol", feature.reference || feature.designator || "Unknown"],
        ["Value", feature.value || feature.componentValue || "Not specified"],
        ["Pin", `${feature.pinNumber || "-"}${feature.pinName ? ` ${feature.pinName}` : ""}`],
        ["Net", feature.netName || "Not connected"],
        ["PCB Pad", feature.pcbPadId || "Not resolved"],
        ["Component UID", feature.componentUid || "Not resolved"],
      ]
    : [
        ["Page", page?.name || "Unknown"],
        ["Kind", feature.kind.replaceAll("_", " ")],
        ["Net", feature.netName || "Not connected"],
      ];
  return `
    ${selectionHeader(
      feature.kind.replaceAll("_", " "),
      feature.pinName || feature.reference || feature.designator || feature.text || feature.netName || "Schematic object",
      "#3b82f6",
    )}
    ${selectionProperties(pinRows)}
    <div class="selection-section">
      <span class="selection-section-title">Source identity</span>
      <div class="selection-table">
        <div class="selection-row">
          <span><strong>${isPin ? "Pin UUID" : "UUID"}</strong></span>
          <span title="${escapeHtml(feature.uuid || feature.sourceId || "")}">${escapeHtml(feature.uuid || feature.sourceId || "-")}</span>
          <span title="${escapeHtml(feature.objectId || "")}">${escapeHtml(feature.objectId || "No object ID")}</span>
        </div>
        <div class="selection-row">
          <span><strong>Sheet</strong></span>
          <span>${escapeHtml(page?.name || "Unknown")}</span>
          <span title="${escapeHtml(feature.sheetInstancePath || "")}">${escapeHtml(feature.sheetInstancePath || "/")}</span>
        </div>
      </div>
    </div>`;
}

function updateSelectionCard() {
  if (state.workspace === "bom") {
    selectionCardEl.hidden = true;
    selectionCardEl.innerHTML = "";
    return;
  }

  const feature = scene.features.get(state.selectedFeatureId);
  let component = feature?.kind === "component" ? feature : null;
  const schematicFeature = state.workspace === "schematic" ? state.selectedSchematicFeature : null;
  const schematicPage = schematicFeature ? schematicScene.byId.get(schematicFeature.pageId) : null;
  let net = state.activeNetId
    ? scene.nets.find((item) => Number(item.id) === state.activeNetId)
    : null;

  // Consolidate schematic selections to Net or Component
  if (!net && schematicFeature) {
    if (schematicFeature.netUid) {
      net = scene.nets.find(n => n.uid === schematicFeature.netUid);
    } else if (schematicFeature.netName) {
      net = scene.nets.find(n => n.name === schematicFeature.netName);
    }
  }

  if (!component && schematicFeature) {
    const designator = schematicFeature.reference || schematicFeature.componentDesignator || schematicFeature.designator;
    if (designator) {
      component = scene.componentFeatures.get(designator) || { designator };
    }
  }

  if (!component && !net && !schematicFeature) {
    selectionCardEl.hidden = true;
    selectionCardEl.innerHTML = "";
    return;
  }

  let cardHtml = "";
  if (net) {
    cardHtml = netSelectionContent(net);
  } else if (component) {
    const selectedPin = schematicFeature?.kind?.startsWith("pin") ? schematicFeature : null;
    cardHtml = componentSelectionContent(component, selectedPin);
  } else if (schematicFeature) {
    cardHtml = schematicFeatureSelectionContent(schematicFeature, schematicPage);
  }

  selectionCardEl.innerHTML = `
    ${cardHtml}
    <div class="selection-card-actions">
      ${net ? `
        <button type="button" data-action="isolate" aria-keyshortcuts="I" title="Toggle isolated net view (I)" class="${state.isolateNet ? "active" : ""}">Isolate</button>
        <button type="button" data-action="net-layers">Layers</button>
      ` : ""}
      <button type="button" data-action="frame">Frame selection</button>
    </div>`;

  // Dynamic clamping to prevent clipping off screen
  selectionCardEl.hidden = false;
  const activeCanvas = state.workspace === "schematic" ? schematicCanvas : canvas;
  const anchor = state.selectionAnchor;
  
  const cardWidth = selectionCardEl.offsetWidth || 360;
  const cardHeight = selectionCardEl.offsetHeight || 330;

  if (anchor) {
    const maxLeft = Math.max(16, activeCanvas.clientWidth - cardWidth - 24);
    const maxTop = Math.max(16, activeCanvas.clientHeight - cardHeight - 24);
    selectionCardEl.style.left = `${clamp(anchor.x + 18, 16, maxLeft)}px`;
    selectionCardEl.style.top = `${clamp(anchor.y + 18, 16, maxTop)}px`;
  } else {
    selectionCardEl.style.left = "20px";
    selectionCardEl.style.top = "20px";
  }

  selectionCardEl.querySelector(".selection-card-close").addEventListener("click", clearSelection);
  selectionCardEl.querySelector("[data-action=frame]").addEventListener("click", frameSelection);
  
  if (net) {
    const isolateBtn = selectionCardEl.querySelector("[data-action=isolate]");
    if (isolateBtn) {
      isolateBtn.addEventListener("click", () => {
        setNetIsolation(!state.isolateNet);
      });
    }
    const layersBtn = selectionCardEl.querySelector("[data-action=net-layers]");
    if (layersBtn) {
      layersBtn.addEventListener("click", showNetLayers);
    }
    
    // Bind click events on pin rows for cross-probing
    selectionCardEl.querySelectorAll(".pin-row-interactive").forEach((row) => {
      row.addEventListener("click", () => {
        const ref = row.dataset.ref;
        const pin = row.dataset.pin;
        if (!ref) return;
        
        const details = topology.net_details?.[net.uid] || {};
        const terminals = details.terminals || [];
        const terminal = terminals.find(t => t.designator === ref && t.pin === pin);
        
        const padFeatureId = terminal ? findFeatureIdByPcbPadId(terminal.pcb_pad_id) : 0;
        if (padFeatureId) {
          selectFeature(padFeatureId, true);
        } else {
          selectComponentReference(ref, true);
        }
      });
    });
  }

  // Cross-probe for Net link inside Component selected pin section
  const netRef = selectionCardEl.querySelector(".net-ref-interactive");
  if (netRef) {
    netRef.addEventListener("click", () => {
      const netName = netRef.dataset.netName;
      if (!netName) return;
      const targetNet = scene.nets.find(n => n.name === netName);
      if (targetNet) {
        selectNet(Number(targetNet.id), true);
      }
    });
  }
}

function frameSelection() {
  if (state.workspace === "schematic") {
    frameSchematicSelection();
    return;
  }
  const feature = scene.features.get(state.selectedFeatureId);
  if (feature?.bounds) {
    framePcbFeature(feature);
  } else {
    const net = scene.nets.find((item) => Number(item.id) === state.activeNetId);
    if (net?.boundsMm) camera.frame(runtimeBounds(net.boundsMm));
  }
}

function bindInteractions() {
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.dragMode =
      state.mode === "layer"
      || state.cameraTool === "pan"
      || event.shiftKey
      || event.button !== 0
        ? "pan"
        : "orbit";
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    if (state.dragMode === "pan") camera.pan(dx, dy, canvas.clientHeight, state.mode === "layer");
    else camera.orbit(dx, dy);
  });
  canvas.addEventListener("pointerup", async (event) => {
    state.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
    if (Math.hypot(event.clientX - state.pointerStartX, event.clientY - state.pointerStartY) < 3) {
      await pickAt(event);
    }
  });
  canvas.addEventListener("dblclick", async (event) => {
    await pickAt(event);
    frameSelection();
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.4) {
      camera.pan(-event.deltaX, 0, canvas.clientHeight, state.mode === "layer");
    } else {
      camera.dolly(event.deltaY, state.mode === "layer");
    }
  }, { passive: false });
  window.addEventListener("keydown", handleKey);
  makeCardMovable();
}

function makeCardMovable() {
  let isDragging = false;
  let startX, startY;
  let cardX = 0, cardY = 0;

  selectionCardEl.addEventListener("pointerdown", (event) => {
    const head = event.target.closest(".selection-card-head");
    if (!head || event.target.closest(".selection-card-close")) return;

    isDragging = true;
    selectionCardEl.classList.add("dragging");
    
    const rect = selectionCardEl.getBoundingClientRect();
    cardX = rect.left;
    cardY = rect.top;
    
    startX = event.clientX;
    startY = event.clientY;
    
    selectionCardEl.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });

  selectionCardEl.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    
    const activeCanvas = state.workspace === "schematic" ? schematicCanvas : canvas;
    const cardWidth = selectionCardEl.offsetWidth || 360;
    const cardHeight = selectionCardEl.offsetHeight || 330;
    
    const maxLeft = Math.max(16, activeCanvas.clientWidth - cardWidth - 24);
    const maxTop = Math.max(16, activeCanvas.clientHeight - cardHeight - 24);
    
    const newLeft = clamp(cardX + dx, 16, maxLeft);
    const newTop = clamp(cardY + dy, 16, maxTop);
    
    selectionCardEl.style.left = `${newLeft}px`;
    selectionCardEl.style.top = `${newTop}px`;
    
    state.selectionAnchor = {
      x: newLeft - 18,
      y: newTop - 18
    };
    event.stopPropagation();
  });

  selectionCardEl.addEventListener("pointerup", (event) => {
    if (!isDragging) return;
    isDragging = false;
    selectionCardEl.classList.remove("dragging");
    selectionCardEl.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  });
}

function bindWorkspaceTabs() {
  queryAll("[data-workspace]").forEach((button) => {
    button.addEventListener("click", () => switchWorkspace(button.dataset.workspace));
  });
}

function switchWorkspace(workspace) {
  if (workspace === "schematic" && !schematicRenderer) return;
  if (workspace === "bom" && !bomViewer) return;
  state.workspace = workspace;
  
  appEl.classList.remove("workspace-pcb", "workspace-schematic", "workspace-bom", "workspace-stackup");
  appEl.classList.add(`workspace-${workspace}`);
  
  if (workspace === "schematic" && (state.activeTab === "view" || state.activeTab === "inspect" || state.activeTab === "stats")) {
    openTab("layers");
  } else if (workspace === "bom" || workspace === "stackup") {
    openTab("layers");
  }

  const layersTabBtn = query('.rail-tab[data-tab="layers"]');
  if (layersTabBtn) {
    if (workspace === "schematic") {
      layersTabBtn.textContent = "Pages";
      layersTabBtn.title = "Schematic pages";
    } else if (workspace === "bom") {
      layersTabBtn.textContent = "Summary";
      layersTabBtn.title = "BoM summary";
    } else {
      layersTabBtn.textContent = "Layers";
      layersTabBtn.title = "Layers and compare";
    }
  }

  const schematic = workspace === "schematic";
  const bom = workspace === "bom";
  const stackup = workspace === "stackup";
  
  canvas.hidden = schematic || bom || stackup;
  if (schematicCanvas) schematicCanvas.hidden = !schematic;
  if (schematicDomLayer) schematicDomLayer.hidden = !schematic || !schematicDomRenderer;
  if (schematicFlowOverlay) schematicFlowOverlay.hidden = !schematic;
  if (bomViewEl) bomViewEl.hidden = !bom;
  if (stackupWorkspaceViewEl) {
    stackupWorkspaceViewEl.hidden = !stackup;
  }
  gizmo.hidden = schematic || bom || stackup;
  labelsEl.hidden = schematic || bom || stackup;
  if (schematicLabelsEl) schematicLabelsEl.hidden = !schematic;
  
  queryAll("[data-workspace]").forEach((button) => {
    button.classList.toggle("active", button.dataset.workspace === workspace);
  });
  
  statusEl.textContent = bom
    ? "Semantic BoM active"
    : schematic
      ? schematicDomRenderer ? "SVG DOM + WebGPU schematic world active" : "WebGPU schematic world active"
      : stackup
        ? "Layer Stackup active"
        : "WebGPU semantic glTF active";
        
  if (schematic && !schematicScene.fitted) {
    schematicRenderer.resize();
    schematicRenderer.frameWorld();
    schematicScene.fitted = true;
  }
  if (!schematic && !bom && !stackup) {
    renderer?.resize();
    if (state.mode === "layer") {
      activatePcbLayerMode();
    } else {
      scheduleTileResidency(performance.now(), { force: true });
    }
  }
  
  if (stackup) {
    try {
      renderStackupWorkspace();
    } catch (error) {
      console.error("Failed to render stackup workspace", error);
      if (stackupWorkspaceViewEl) {
        stackupWorkspaceViewEl.innerHTML = `
          <div class="selection-empty" style="padding:40px;text-align:center;">
            Stackup view failed to render. ${escapeHtml(error?.message || String(error))}
          </div>
        `;
      }
    }
  }
  
  renderControls();
  updateSelectionCard();
}

function bindSchematicInteractions() {
  schematicCanvas.addEventListener("pointerdown", (event) => {
    if (schematicDomRenderer?.worldActive || schematicDomRenderer?.active) return;
    state.schematicDragging = true;
    state.schematicLastX = event.clientX;
    state.schematicLastY = event.clientY;
    state.schematicStartX = event.clientX;
    state.schematicStartY = event.clientY;
    schematicCanvas.setPointerCapture(event.pointerId);
  });
  schematicCanvas.addEventListener("pointermove", (event) => {
    if (schematicDomRenderer?.worldActive || schematicDomRenderer?.active) return;
    if (!state.schematicDragging || !schematicRenderer) return;
    const dx = event.clientX - state.schematicLastX;
    const dy = event.clientY - state.schematicLastY;
    state.schematicLastX = event.clientX;
    state.schematicLastY = event.clientY;
    schematicRenderer.pan(dx, dy);
  });
  schematicCanvas.addEventListener("pointerup", async (event) => {
    if (schematicDomRenderer?.worldActive || schematicDomRenderer?.active) return;
    state.schematicDragging = false;
    schematicCanvas.releasePointerCapture(event.pointerId);
    if (Math.hypot(event.clientX - state.schematicStartX, event.clientY - state.schematicStartY) < 3) {
      const hit = await schematicRenderer.pickFeature(event.clientX, event.clientY);
      if (hit) selectSchematicFeature(hit);
      else clearSchematicSelection();
    }
  });
  schematicCanvas.addEventListener("dblclick", (event) => {
    if (schematicDomRenderer?.worldActive || schematicDomRenderer?.active) return;
    const page = schematicRenderer.hitPage(event.clientX, event.clientY);
    if (page) selectSchematicPage(page.id, true);
  });
  schematicCanvas.addEventListener("wheel", (event) => {
    if (schematicDomRenderer?.worldActive || schematicDomRenderer?.active) return;
    event.preventDefault();
    schematicRenderer.zoom(event.deltaY, event.clientX, event.clientY);
  }, { passive: false });
}

async function pickAt(event) {
  if (!panel) return;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (event.clientY - rect.top) * canvas.height / rect.height;
  state.selectionAnchor = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  const featureId = await renderer.pick(panel, x, y, {
    activeNetId: state.activeNetId,
    selectedFeatureId: state.selectedFeatureId,
    layerOffsets: stackupOffsets(),
    visibleLayers: state.mode === "3d" ? state.visible3dLayers : state.compareLayers,
    showBoard: state.showBoard,
    showComponents: state.showComponents,
    componentOpacity: clamp(1 - state.separation / 0.1, 0, 1),
    boardOpacity: 1 - state.separation * 0.72,
    isolateNet: state.isolateNet,
    compareMode: state.mode === "layer",
    compareOffsets,
    visibleTileIds: state.mode === "3d" ? state.visibleTileIds : null,
  });
  if (featureId) selectFeature(featureId, true);
  else clearSelection();
}

function handleKey(event) {
  if (!viewerIsActive()) return;
  if (event.target instanceof HTMLInputElement) {
    if (event.key === "Escape") event.target.blur();
    return;
  }
  const key = event.key.toLowerCase();
  if (state.workspace === "schematic") {
    if (key === "/") {
      event.preventDefault();
      openTab("search");
      searchControlsEl.querySelector("#entity-search")?.focus();
    } else if (key === "escape") {
      if (schematicScene.activeNetUid) {
        schematicScene.activeNetUid = "";
        state.activeNetId = 0;
        schematicRenderer.activeNetUid = "";
        schematicDomRenderer?.setHighlightedNet("");
        updateSelectionCard();
      } else clearSchematicSelection();
    }
    else if (key === "~" || event.key === "~") {
      event.preventDefault();
      const netUid = state.selectedSchematicFeature?.netUid;
      if (netUid) {
        if (schematicScene.activeNetUid === netUid) {
          schematicScene.activeNetUid = "";
          state.activeNetId = 0;
          schematicRenderer.activeNetUid = "";
          schematicDomRenderer?.setHighlightedNet("");
        } else highlightSchematicNetByUid(netUid, state.selectedSchematicFeature);
      }
    }
    else if (key === "home") {
      schematicRenderer?.frameWorld();
    }
    else if (key === "[") navigateSchematic("previous");
    else if (key === "]") navigateSchematic("next");
    else if (key === "n") {
      event.preventDefault();
      const result = schematicRenderer?.cycleNetIntrasheetLink(event.shiftKey ? -1 : 1);
      if (result?.pageId) {
        state.selectedPageId = result.pageId;
        schematicRenderer.selectedPageId = result.pageId;
        updateSchematicLabels();
      }
    }
    else if (event.altKey && key === "arrowup") navigateSchematic("parent");
    else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const dx = event.key === "ArrowRight" ? 32 : event.key === "ArrowLeft" ? -32 : 0;
      const dy = event.key === "ArrowDown" ? 32 : event.key === "ArrowUp" ? -32 : 0;
      schematicRenderer?.pan(dx, dy);
    }
    return;
  }
  if (key === "/") {
    event.preventDefault();
    openTab("search");
    searchControlsEl.querySelector("#entity-search").focus();
  } else if (key === "escape") clearSelection();
  else if (key === "i" && state.workspace === "pcb" && state.activeNetId) {
    event.preventDefault();
    setNetIsolation(!state.isolateNet);
  }
  else if (key === "home") camera.frame(sceneRuntimeBounds());
  else if (["x", "y", "z"].includes(key)) camera.setAxis(key, event.shiftKey);
  else if (key === "f") camera.flip();
  else if (key === "r") camera.rotateZ(event.shiftKey ? -1 : 1);
  else if (key === " ") {
    event.preventDefault();
    const feature = scene.features.get(state.selectedFeatureId);
    if (feature?.bounds) {
      camera.setFocus([
        (feature.bounds[0] + feature.bounds[3]) / 2,
        (feature.bounds[1] + feature.bounds[4]) / 2,
        (feature.bounds[2] + feature.bounds[5]) / 2,
      ]);
    }
  } else if (event.key.startsWith("Arrow")) {
    event.preventDefault();
    const dx = event.key === "ArrowRight" ? 32 : event.key === "ArrowLeft" ? -32 : 0;
    const dy = event.key === "ArrowDown" ? 32 : event.key === "ArrowUp" ? -32 : 0;
    camera.pan(dx, dy, canvas.clientHeight, state.mode === "layer");
  }
}

function openTab(tab) {
  state.activeTab = tab;
  appEl.classList.remove("panel-collapsed");
  queryAll(".rail-tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === tab);
  });
  queryAll(".tab-panel").forEach((item) => {
    item.classList.toggle("active", item.dataset.panel === tab);
  });
}

function drawGizmo() {
  const context = gizmo.getContext("2d");
  context.clearRect(0, 0, gizmo.width, gizmo.height);
  const center = [gizmo.width / 2, gizmo.height / 2];
  const basis = camera.basis();
  const worldAxes = [
    { axis: "x", label: "X", color: "#e23838", vector: [1, 0, 0] },
    { axis: "y", label: "Y", color: "#2dbd50", vector: [0, 1, 0] },
    { axis: "z", label: "Z", color: "#3157d5", vector: [0, 0, 1] },
  ];
  const endpoints = [];
  for (const axis of worldAxes) {
    for (const sign of [-1, 1]) {
      const vector = axis.vector.map((value) => value * sign);
      const projected = [
        dot3(vector, basis.right),
        -dot3(vector, basis.up),
        dot3(vector, basis.back),
      ];
      endpoints.push({
        ...axis,
        sign,
        depth: projected[2],
        point: [center[0] + projected[0] * 34, center[1] + projected[1] * 34],
      });
    }
  }
  for (const axis of worldAxes) {
    const positive = endpoints.find((item) => item.axis === axis.axis && item.sign === 1);
    context.strokeStyle = axis.color;
    context.lineWidth = 2.4;
    context.beginPath();
    context.moveTo(...center);
    context.lineTo(...positive.point);
    context.stroke();
  }
  gizmoHits = [];
  for (const endpoint of endpoints.sort((a, b) => b.depth - a.depth)) {
    const front = endpoint.sign === 1;
    const radius = front ? 13 : 9;
    context.beginPath();
    context.arc(endpoint.point[0], endpoint.point[1], radius, 0, Math.PI * 2);
    context.fillStyle = front ? endpoint.color : `${endpoint.color}66`;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = darken(endpoint.color, front ? 0.45 : 0.58);
    context.stroke();
    if (front) {
      context.fillStyle = "#07101c";
      context.font = "700 13px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(endpoint.label, endpoint.point[0], endpoint.point[1] + 0.5);
    }
    gizmoHits.push({ ...endpoint, radius: radius + 5 });
  }
}

function bindGizmoInteraction() {
  if (!gizmo || gizmo.dataset.bound === "true") return;
  gizmo.dataset.bound = "true";
  gizmo.addEventListener("click", (event) => {
    const scaleX = gizmo.width / gizmo.clientWidth;
    const scaleY = gizmo.height / gizmo.clientHeight;
    const point = [event.offsetX * scaleX, event.offsetY * scaleY];
    const hit = gizmoHits
      .map((item) => ({ item, distance: Math.hypot(point[0] - item.point[0], point[1] - item.point[1]) }))
      .filter(({ item, distance }) => distance <= item.radius)
      .sort((a, b) => a.distance - b.distance)[0]?.item;
    if (hit) camera.setAxis(hit.axis, hit.sign < 0);
  });
}

function updateLayerLabels() {
  if (state.mode !== "layer" || !panel) {
    labelsEl.innerHTML = "";
    return;
  }
  const bounds = sceneRuntimeBounds();
  const visibleLayers = compareRenderLayers();
  labelsEl.innerHTML = scene.copperLayers
    .filter((layer) => visibleLayers.has(Number(layer.id)))
    .map((layer) => {
      const offset = compareOffsets.get(Number(layer.id)) || [0, 0, 0];
      const screen = projectPoint(
        [bounds[0] + offset[0], bounds[4] + offset[1], 0],
        panel.matrix,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      if (!screen || screen[0] < -100 || screen[0] > canvas.clientWidth + 100
        || screen[1] < -100 || screen[1] > canvas.clientHeight + 100) return "";
      return `<span style="left:${screen[0]}px;top:${screen[1]}px">${escapeHtml(layer.name)}</span>`;
    }).join("");
}

function updateSchematicLabels() {
  if (state.workspace !== "schematic" || !schematicRenderer) {
    schematicLabelsEl.innerHTML = "";
    return;
  }
  schematicLabelsEl.innerHTML = schematicScene.visiblePages
    .filter((page) => schematicRenderer.pagePixelWidth(page) > 120)
    .map((page) => {
      const [left, top] = schematicRenderer.worldToScreen(
        page.worldX + 8 * schematicRenderer.scale,
        page.worldY - 6 * schematicRenderer.scale,
      );
      const selected = page.id === state.selectedPageId;
      const containsNet = schematicScene.activeNetUid && page.netUids.includes(schematicScene.activeNetUid);
      const accent = containsNet ? "#18ef52" : selected ? "#3b82f6" : "#4b8de8";
      return `<div class="schematic-page-label" style="left:${left}px;top:${top}px;border-left-color:${accent}">
        <strong>${escapeHtml(page.name)}</strong>
        <small>Page ${page.sheetNumber} &middot; ${page.featureCount.toLocaleString()} features</small>
      </div>`;
    }).join("");
}

function projectPoint(point, matrix, width, height) {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (Math.abs(clipW) < 1e-8) return null;
  return [
    (clipX / clipW * 0.5 + 0.5) * width,
    (0.5 - clipY / clipW * 0.5) * height,
  ];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function darken(color, factor) {
  const clean = color.replace("#", "");
  return `#${[0, 2, 4].map((offset) =>
    Math.round(parseInt(clean.slice(offset, offset + 2), 16) * factor)
      .toString(16).padStart(2, "0")).join("")}`;
}

function recordFrameSample(intervalMs, cpuMs) {
  state.frameSamples.push({ intervalMs, cpuMs });
  if (state.frameSamples.length > 180) state.frameSamples.shift();
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function updateDiagnostics(now) {
  if (!diagnosticsEl) return;
  state.frames += 1;
  if (now - state.fpsAt <= 500) return;
  state.fps = state.frames * 1000 / (now - state.fpsAt);
  const samples = state.frameSamples;
  state.frameIntervalMs = samples.length ? samples.reduce((sum, item) => sum + item.intervalMs, 0) / samples.length : 0;
  state.frameCpuMs = samples.length ? samples.reduce((sum, item) => sum + item.cpuMs, 0) / samples.length : 0;
  state.frameIntervalP95Ms = percentile(samples.map((item) => item.intervalMs), 0.95);
  state.frameCpuP95Ms = percentile(samples.map((item) => item.cpuMs), 0.95);
  state.frames = 0;
  state.fpsAt = now;
  if (state.workspace === "bom") {
    const counts = bomViewer?.payload?.counts || {};
    const rows = [
      ["Renderer", "BoM DOM table"],
      ["Schema", bomViewer?.payload?.schema || "-"],
      ["Grouped rows", counts.rows || 0],
      ["Components", counts.components || 0],
      ["DNP components", counts.dnpComponents || 0],
      ["Extra columns", bomViewer?.payload?.extraColumns?.length || 0],
      ["Frame interval", `${state.frameIntervalMs.toFixed(2)} ms avg / ${state.frameIntervalP95Ms.toFixed(2)} p95`],
      ["CPU frame", `${state.frameCpuMs.toFixed(2)} ms avg / ${state.frameCpuP95Ms.toFixed(2)} p95`],
      ["FPS", state.fps.toFixed(1)],
    ];
    diagnosticsEl.innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
    return;
  }
  const schematicStats = state.workspace === "schematic" && schematicRenderer ? schematicRenderer.stats() : null;
  const domStats = state.workspace === "schematic" && schematicDomRenderer ? schematicDomRenderer.stats() : null;
  const rows = state.workspace === "schematic" && schematicRenderer
    ? schematicDomRenderer?.active
      ? [
      ["Renderer", "SVG DOM schematic detail"],
      ["Pages", schematicScene.pages.length],
      ["Mounted pages", domStats.mountedPages],
      ["Active page", domStats.activePage],
      ["DOM nodes", domStats.domNodes.toLocaleString()],
      ["Indexed features", domStats.indexedFeatures.toLocaleString()],
      ["Indexed nets", domStats.indexedNets.toLocaleString()],
      ["SVG cache", `${domStats.cachedSvgPages} pages / ${(domStats.cachedSvgBytes / 1048576).toFixed(1)} MB`],
      ["Selection", `${domStats.selectionMs.toFixed(1)} ms`],
      ["Active net", scene.nets.find((net) => net.uid === schematicScene.activeNetUid)?.name || "-"],
      ["Tracking links", `${schematicStats.netFlowSegments} total / ${schematicStats.netFlowIntrasheetSegments} local`],
      ["Tracking verts", schematicStats.netFlowVertices.toLocaleString()],
      ["Mount", `${domStats.mountMs.toFixed(1)} ms`],
      ["Highlight", `${domStats.highlightMs.toFixed(1)} ms`],
      ["Fallback", domStats.fallbackReason || "-"],
      ["Frame interval", `${state.frameIntervalMs.toFixed(2)} ms avg / ${state.frameIntervalP95Ms.toFixed(2)} p95`],
      ["CPU frame", `${state.frameCpuMs.toFixed(2)} ms avg / ${state.frameCpuP95Ms.toFixed(2)} p95`],
      ["FPS", state.fps.toFixed(1)],
    ]
      : [
      ["Renderer", schematicDomRenderer ? "SVG DOM + WebGPU world" : "WebGPU schematic world"],
      ["Pages", schematicScene.pages.length],
      ["Visible pages", schematicScene.visiblePages.length],
      ["DOM pages", domStats ? domStats.mountedPages : 0],
      ["DOM nodes", domStats ? domStats.domNodes.toLocaleString() : "0"],
      ["Indexed SVG features", domStats ? domStats.indexedFeatures.toLocaleString() : "0"],
      ["SVG cache", domStats ? `${domStats.cachedSvgPages} pages / ${(domStats.cachedSvgBytes / 1048576).toFixed(1)} MB` : "0 pages"],
      ["JS heap", domStats?.heapMb ? `${domStats.heapMb.toFixed(1)} MB` : "-"],
      ["Hierarchy links", schematicScene.manifest.edges?.length || 0],
      ["Selected page", schematicScene.byId.get(state.selectedPageId)?.name || "-"],
      ["Active net", scene.nets.find((net) => net.uid === schematicScene.activeNetUid)?.name || "-"],
      ["Tracking links", `${schematicStats.netFlowSegments} total / ${schematicStats.netFlowIntrasheetSegments} local`],
      ["Downloaded", `${(schematicRenderer.downloadedBytes / 1048576).toFixed(1)} MB`],
      ["Resident vectors", `${(schematicStats.residentVectorBytes / 1048576).toFixed(1)} MB`],
      ["Vector pages", `${schematicStats.vectorChunks} loaded / ${schematicStats.vectorLoads} loading`],
      ["Vector draw", `${schematicStats.vectorVertices.toLocaleString()} verts / ${schematicStats.vectorDrawChunks} chunks`],
      ["Native detail", `${schematicStats.nativeDetailPages} pages @ ${schematicStats.nativePxPerMm} / ${schematicStats.nativeThresholdPxPerMm} px/mm`],
      ["Vector failures", schematicStats.failedVectorChunks],
      ["Truncated", schematicStats.truncatedVectors],
      ["Frame interval", `${state.frameIntervalMs.toFixed(2)} ms avg / ${state.frameIntervalP95Ms.toFixed(2)} p95`],
      ["CPU frame", `${state.frameCpuMs.toFixed(2)} ms avg / ${state.frameCpuP95Ms.toFixed(2)} p95`],
      ["FPS", state.fps.toFixed(1)],
    ]
    : [
    ["Renderer", "WebGPU semantic glTF"],
    ["Mode", state.mode === "3d" ? "3D" : "Layer Compare"],
    ["Visible layers", state.mode === "3d" ? state.visible3dLayers.size : state.compareLayers.size],
    ["Resident tiles", scene.loaded.size],
    ["Loading tiles", scene.loading.size],
    ["Failed tiles", scene.failed.size],
    ["Triangles", Math.round(state.triangles).toLocaleString()],
    ["Downloaded", `${(state.loadedBytes / 1048576).toFixed(1)} MB`],
    ["Resident GLB", `${(state.residentTileBytes / 1048576).toFixed(1)} MB`],
    ["Resident GPU", `${(state.residentTileGpuBytes / 1048576).toFixed(1)} MB`],
    ["Tile loads", state.tileLoads.toLocaleString()],
    ["Tile evictions", state.tileEvictions.toLocaleString()],
    ["Tile scheduler", `${state.tileSchedulerMs.toFixed(2)} ms`],
    ["Active net", scene.nets.find((net) => Number(net.id) === state.activeNetId)?.name || "-"],
    ["Frame interval", `${state.frameIntervalMs.toFixed(2)} ms avg / ${state.frameIntervalP95Ms.toFixed(2)} p95`],
    ["CPU frame", `${state.frameCpuMs.toFixed(2)} ms avg / ${state.frameCpuP95Ms.toFixed(2)} p95`],
    ["FPS", state.fps.toFixed(1)],
  ];
  diagnosticsEl.innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}

function rgbCss(color) {
  return `rgb(${color.slice(0, 3).map((value) => Math.round(value * 255)).join(" ")})`;
}

function renderStackupWorkspace() {
  if (!stackupWorkspaceViewEl) return;

  const layers = scene.layers || [];
  if (!layers.length) {
    stackupWorkspaceViewEl.innerHTML = `<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>`;
    return;
  }

  const physicalLayers = layers.filter(
    (l) => ["copper", "dielectric", "paste", "silkscreen", "soldermask"].includes(l.role)
  );
  const stackupMetadata = topology.board?.stackup || {};
  const displayFinish = (value) => {
    if (value === undefined || value === null || value === "") return "None";
    const text = String(value);
    return escapeHtml(text.includes(".") ? text.split(".").pop() : text);
  };
  const displayMaterialFloat = (value, digits = 4) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number.toFixed(digits) : "-";
  };
  const displayMm = (value, digits = 3) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "-";
  };
  const displayManufacturingYesNo = (value) => {
    if (value === undefined || value === null || value === "") return "No";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const text = String(value).trim().toLowerCase();
    const normalized = text.includes(".") ? text.split(".").pop() : text;
    if (["0", "false", "no", "n", "off", "none"].includes(normalized)) return "No";
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return "Yes";
    return "Yes";
  };
  const layerRoleLabel = (role) => ({
    copper: "Copper",
    dielectric: "Dielectric",
    paste: "Paste",
    silkscreen: "Silkscreen",
    soldermask: "Solder mask",
  })[role] || String(role || "Layer");
  const dielectricSubtype = (layer) => {
    if (layer.role !== "dielectric") return "";
    if (layer.type === "core") return "Core";
    if (layer.type === "prepreg") return "Prepreg";
    return (layer.material || "").toLowerCase().includes("prepreg") ? "Prepreg" : "Core";
  };
  const layerThicknessLabel = (layer, digits = 4) => {
    const value = Number(layer.thickness_mm);
    return Number.isFinite(value) && value > 0 ? `${value.toFixed(digits)} mm` : "Not specified";
  };
  const layerGraphicDetails = (layer) => {
    const role = layerRoleLabel(layer.role);
    const material = String(layer.material || "").trim();
    const meaningfulMaterial = material && material.toLowerCase() !== String(layer.role || "").toLowerCase();
    if (layer.role === "dielectric") {
      const secondary = [
        meaningfulMaterial ? material : "",
        displayMaterialFloat(layer.epsilon_r, 3) !== "-" ? `εr ${displayMaterialFloat(layer.epsilon_r, 3)}` : "",
        displayMaterialFloat(layer.loss_tangent, 4) !== "-" ? `tan δ ${displayMaterialFloat(layer.loss_tangent, 4)}` : "",
      ].filter(Boolean).join(" · ");
      return {
        primary: `${layer.name} · ${dielectricSubtype(layer)}`,
        secondary,
      };
    }
    return {
      primary: [layer.name, role, meaningfulMaterial ? material : ""].filter(Boolean).join(" · "),
      secondary: "",
    };
  };

  let signalCount = 0;
  let planeCount = 0;
  let dielectricCount = 0;
  let totalThickness = 0;

  physicalLayers.forEach((l) => {
    totalThickness += l.thickness_mm || 0;
    if (l.role === "copper") {
      if (l.name.toLowerCase().includes("gnd") || l.name.toLowerCase().includes("pwr") || l.name.toLowerCase().includes("plane")) {
        planeCount++;
      } else {
        signalCount++;
      }
    } else if (l.role === "dielectric") {
      dielectricCount++;
    }
  });

  // --- Via classification using copper layer index spans ---
  const copperLayers = scene.copperLayers || [];
  let thruCount = 0;
  let blindCount = 0;
  let buriedCount = 0;

  const viaRecords = [
    ...(scene.manifest?.barrels || []).filter((barrel) => barrel.kind === "via"),
    ...[...scene.features.values()].filter((feature) => feature.kind === "via"),
  ];
  const viaData = collectStackupViaData(copperLayers, viaRecords);
  thruCount = viaData.counts.thru;
  blindCount = viaData.counts.blind;
  buriedCount = viaData.counts.buried;
  const uniqueSpans = viaData.spans;

  // --- SVG cross-section diagram ---
  const svgTopPadding = 30;
  let svgHeight = svgTopPadding;
  const svgLayersData = [];

  const originalOrder = new Map(physicalLayers.map((layer, index) => [layer, index]));
  const fallbackDisplayOrder = fallbackStackupDisplayOrder(physicalLayers);
  const stackOrder = (layer, fallbackIndex) => {
    const fallbackOrder = fallbackDisplayOrder.get(layer.name);
    if (fallbackOrder !== undefined) return fallbackOrder;
    const index = Number(layer.stack_index);
    if (Number.isFinite(index)) return index;
    return fallbackIndex + 100000;
  };
  const sortedLayers = [...physicalLayers].sort((a, b) => {
    const aIndex = stackOrder(a, originalOrder.get(a) || 0);
    const bIndex = stackOrder(b, originalOrder.get(b) || 0);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return (b.z_mm || 0) - (a.z_mm || 0);
  });

  sortedLayers.forEach((layer) => {
    let layerHeight = 12;
    if (layer.role === "dielectric") {
      layerHeight = Math.max(160, Math.min(360, (layer.thickness_mm || 0.1) * 140));
    } else if (layer.role === "copper") {
      layerHeight = 22;
    } else if (layer.role === "soldermask") {
      layerHeight = 14;
    }
    svgLayersData.push({
      ...layer,
      svgY: svgHeight,
      svgHeight: layerHeight
    });
    svgHeight += layerHeight;
  });

  const svgWidth = 800;
  const boardX = 130;
  const boardWidth = 240;
  const dimensionX = boardX + boardWidth + 16;
  const labelX = dimensionX + 84;

  let svgRectsHtml = "";
  svgLayersData.forEach((layer) => {
    let color = layer.color || "#7f7f7f";
    if (layer.role === "copper") color = layer.color || "#f97316";
    else if (layer.role === "dielectric") color = "#a98d5c";
    else if (layer.role === "paste") color = "#cbd5e1";
    else if (layer.role === "soldermask") color = "#1b4332";
    else if (layer.role === "silkscreen") color = "#e2e8f0";

    const copperIdx = copperLayers.findIndex(cl => cl.name === layer.name);
    const details = layerGraphicDetails(layer);
    const centerY = layer.svgY + layer.svgHeight / 2;
    const showSecondary = Boolean(details.secondary) && layer.svgHeight >= 38;
    const primaryY = showSecondary ? centerY - 5 : centerY + 3;
    const layerId = escapeHtml(layer.id);
    const layerName = escapeHtml(layer.name);
    const hasThickness = Number.isFinite(Number(layer.thickness_mm)) && Number(layer.thickness_mm) > 0;
    const thickness = escapeHtml(hasThickness ? layerThicknessLabel(layer) : "—");
    const fullDescription = escapeHtml([
      details.primary,
      details.secondary,
      `Thickness ${layerThicknessLabel(layer)}`,
    ].filter(Boolean).join("; "));

    svgRectsHtml += `
      <g class="stackup-svg-layer" data-layer-id="${layerId}" data-layer-name="${layerName}">
        <title>${fullDescription}</title>
        <rect x="${boardX}" y="${layer.svgY}" width="${boardWidth}" height="${layer.svgHeight}" fill="${color}" opacity="0.85" rx="1"/>
        <text x="${boardX - 8}" y="${layer.svgY + layer.svgHeight / 2 + 3}" fill="var(--muted)" font-size="9px" text-anchor="end" font-weight="700">
          ${layer.role === "copper" ? (copperIdx + 1) : ""}
        </text>
        <path class="stackup-layer-dimension" d="M ${dimensionX + 6} ${layer.svgY + 1} H ${dimensionX} V ${layer.svgY + layer.svgHeight - 1} H ${dimensionX + 6}" />
        <text class="stackup-layer-thickness" x="${dimensionX + 10}" y="${centerY + 3}" fill="var(--muted)" font-size="8.5px" font-weight="650">
          ${thickness}
        </text>
        <text class="stackup-layer-name" x="${labelX}" y="${primaryY}" fill="var(--foreground)" font-size="9px" font-weight="650">
          ${escapeHtml(details.primary)}
        </text>
        ${showSecondary ? `<text class="stackup-layer-metadata" x="${labelX}" y="${centerY + 10}" fill="var(--muted)" font-size="8px">${escapeHtml(details.secondary)}</text>` : ""}
      </g>
    `;
  });

  // Via span lines in SVG
  let svgViasHtml = "";
  const copperSvgLayers = svgLayersData.filter(l => l.role === "copper");

  uniqueSpans.forEach((span, spanIdx) => {
    const topL = svgLayersData.find(l => l.name === span.startName);
    const botL = svgLayersData.find(l => l.name === span.endName);
    if (!topL || !botL) return;

    const yStart = topL.svgY;
    const yEnd = botL.svgY + botL.svgHeight;
    const xPos = boardX + ((spanIdx + 1) * boardWidth) / (uniqueSpans.length + 1);
    const viaLabel = span.type === "thru" ? "Thru" : span.type === "blind" ? "Blind" : "Buried";
    const viaColor = `var(--stackup-via-${span.type})`;

    svgViasHtml += `
      <g class="stackup-svg-via" data-via-type="${span.type}">
        <title>${viaLabel}: ${span.startName} → ${span.endName}</title>
        ${copperSvgLayers.map(cl => {
          if (cl.svgY >= topL.svgY && cl.svgY <= botL.svgY) {
            return `<rect x="${xPos - 5}" y="${cl.svgY}" width="10" height="${cl.svgHeight}" fill="${viaColor}" rx="0.5" />`;
          }
          return "";
        }).join("")}
        <rect x="${xPos - 2}" y="${yStart}" width="4" height="${yEnd - yStart}" fill="${viaColor}" opacity="0.95" />
        <rect x="${xPos - 0.75}" y="${yStart - 1}" width="1.5" height="${yEnd - yStart + 2}" fill="var(--panel)" opacity="0.9" />
      </g>
    `;
  });

  const svgMarkup = `
    <svg class="stackup-visual-svg" viewBox="0 0 ${svgWidth} ${svgHeight + 10}" width="${svgWidth}" height="${svgHeight + 10}">
      <g class="stackup-svg-column-headings" aria-hidden="true">
        <text x="${dimensionX + 10}" y="15">Thickness</text>
        <text x="${labelX}" y="15">Layer / material properties</text>
      </g>
      <g class="stackup-total-dimension" aria-label="Total board thickness ${totalThickness.toFixed(4)} millimetres">
        <path d="M 76 ${svgTopPadding} H 68 V ${svgHeight} H 76" />
        <text x="68" y="15">Total ${totalThickness.toFixed(4)} mm</text>
      </g>
      ${svgRectsHtml}
      ${svgViasHtml}
    </svg>
    <div class="stackup-via-legend" aria-label="Via span legend">
      <span><i data-via-type="thru"></i>Thru</span>
      <span><i data-via-type="blind"></i>Blind</span>
      <span><i data-via-type="buried"></i>Buried</span>
    </div>
  `;

  // --- Layers table ---
  let tableRowsHtml = "";
  sortedLayers.forEach((layer) => {
    let badgeClass = "silk";
    if (layer.role === "copper") badgeClass = "copper";
    else if (layer.role === "dielectric") badgeClass = "dielectric";
    else if (layer.role === "paste") badgeClass = "paste";
    else if (layer.role === "soldermask") badgeClass = "mask";

    const dielectricType = dielectricSubtype(layer);
    const layerId = escapeHtml(layer.id);
    const layerName = escapeHtml(layer.name);
    const graphicDetails = layerGraphicDetails(layer);

    tableRowsHtml += `
      <tr data-layer-id="${layerId}" data-layer-name="${layerName}" tabindex="0" aria-label="${escapeHtml(`${graphicDetails.primary}; thickness ${layerThicknessLabel(layer)}`)}">
        <td><strong>${layerName}</strong></td>
        <td><span class="stackup-badge ${badgeClass}">${layer.role}</span></td>
        <td>${dielectricType || "-"}</td>
        <td>${escapeHtml(layer.material || "-")}</td>
        <td>${layer.role === "dielectric" ? displayMaterialFloat(layer.epsilon_r, 3) : "-"}</td>
        <td>${layer.role === "dielectric" ? displayMaterialFloat(layer.loss_tangent, 4) : "-"}</td>
        <td>${layer.thickness_mm ? layer.thickness_mm.toFixed(4) + " mm" : "-"}</td>
      </tr>
    `;
  });

  // --- Impedance net classes table ---
  let impedanceRowsHtml = "";
  const netClasses = topology.board?.net_classes || [];
  const displayRuleMm = (value) => {
    const formatted = displayMm(value);
    return formatted === "-" ? formatted : `${formatted} mm`;
  };

  if (netClasses.length) {
    netClasses.forEach((nc) => {
      impedanceRowsHtml += `
        <tr>
          <td><strong>${nc.name}</strong></td>
          <td>${displayRuleMm(nc.track_width)}</td>
          <td>${displayRuleMm(nc.clearance)}</td>
          <td>${displayRuleMm(nc.diff_pair_width)}</td>
          <td>${displayRuleMm(nc.diff_pair_gap)}</td>
          <td>${Number.isFinite(Number(nc.via_diameter)) ? `${displayMm(nc.via_drill)}/${displayMm(nc.via_diameter)} mm` : "-"}</td>
        </tr>
      `;
    });
  } else {
    impedanceRowsHtml = `
      <tr>
        <td colspan="6" class="selection-empty" style="text-align: center;">No design rules or impedance classes defined.</td>
      </tr>
    `;
  }

  // --- Build full-screen layout ---
  stackupWorkspaceViewEl.innerHTML = `
    <div class="stackup-header">
      <div class="stackup-header-title">
        <h1>Layer Stackup</h1>
        <p>Board cross-section profile, layer properties & design rules</p>
      </div>
    </div>

    <div class="stackup-workspace-body">
      <div class="stackup-diagram-card">
        <span class="stackup-section-title">Cross-Section Profile</span>
        ${svgMarkup}
      </div>
      <aside class="stackup-side-panel">
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Total Thickness</label>
          <span>${totalThickness.toFixed(4)} mm</span>
        </div>
        <div class="stackup-summary-card">
          <label>Copper Layers</label>
          <span>${copperLayers.length} (${signalCount} Sig / ${planeCount} Plane)</span>
        </div>
        <div class="stackup-summary-card">
          <label>Dielectrics</label>
          <span>${dielectricCount} Layers</span>
        </div>
        <div class="stackup-summary-card">
          <label>Thru Vias</label>
          <span>${thruCount}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Blind Vias</label>
          <span>${blindCount}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Buried Vias</label>
          <span>${buriedCount}</span>
        </div>
      </div>
      <span class="stackup-section-title stackup-section-heading">Fabrication</span>
      <div class="stackup-summary-grid">
        <div class="stackup-summary-card">
          <label>Copper Finish</label>
          <span>${displayFinish(stackupMetadata.copper_finish)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Connector</label>
          <span>${displayManufacturingYesNo(stackupMetadata.edge_connector)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Castellated Holes</label>
          <span>${displayManufacturingYesNo(stackupMetadata.castellated_pads)}</span>
        </div>
        <div class="stackup-summary-card">
          <label>Edge Plating</label>
          <span>${displayManufacturingYesNo(stackupMetadata.edge_plating)}</span>
        </div>
      </div>
      <div class="stackup-tables-container">
        <div class="stackup-table-section">
          <div class="stackup-section-title stackup-section-heading">
            <span>Layers Stackup</span>
            <small>Hover or focus a row to locate it</small>
          </div>
          <div class="stackup-table-wrapper">
            <table class="stackup-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Type</th>
                  <th>Subtype</th>
                  <th>Material</th>
                  <th>εr</th>
                  <th>tan δ</th>
                  <th>Thickness</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <div class="stackup-table-section">
          <span class="stackup-section-title stackup-section-heading">Impedance Net Classes</span>
          <div class="stackup-table-wrapper">
            <table class="stackup-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Width</th>
                  <th>Clearance</th>
                  <th>Diff W</th>
                  <th>Diff Gap</th>
                  <th>Drill/Dia</th>
                </tr>
              </thead>
              <tbody>
                ${impedanceRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </aside>
    </div>
  `;

  // --- Hover highlight syncing ---
  const syncLayerSelection = (layerId, isActive) => {
    stackupWorkspaceViewEl.querySelectorAll(".stackup-svg-layer").forEach((el) => {
      const match = el.dataset.layerId === layerId;
      el.classList.toggle("active", match && isActive);
    });
    stackupWorkspaceViewEl.querySelectorAll(".stackup-table tbody tr[data-layer-id]").forEach((el) => {
      const match = el.dataset.layerId === layerId;
      el.classList.toggle("active", match && isActive);
    });
  };

  const revealLayerInDiagram = (layerId) => {
    const diagram = stackupWorkspaceViewEl.querySelector(".stackup-diagram-card");
    const target = stackupWorkspaceViewEl.querySelector(`.stackup-svg-layer[data-layer-id="${CSS.escape(layerId)}"]`);
    if (!diagram || !target || diagram.scrollHeight <= diagram.clientHeight) return;
    const diagramRect = diagram.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = diagram.scrollTop + targetRect.top - diagramRect.top - (diagram.clientHeight - targetRect.height) / 2;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    diagram.scrollTo({ top: Math.max(0, targetTop), behavior: reducedMotion ? "auto" : "smooth" });
  };

  const addLayerListeners = (elements, { revealDiagram = false } = {}) => {
    elements.forEach((el) => {
      const activate = () => {
        const layerId = el.dataset.layerId;
        syncLayerSelection(layerId, true);
        if (revealDiagram) revealLayerInDiagram(layerId);
      };
      const deactivate = () => syncLayerSelection(null, false);

      el.addEventListener("mouseenter", activate);
      el.addEventListener("mouseleave", deactivate);
      if (revealDiagram) {
        el.addEventListener("focus", activate);
        el.addEventListener("blur", deactivate);
      }
    });
  };

  addLayerListeners(stackupWorkspaceViewEl.querySelectorAll(".stackup-svg-layer"));
  addLayerListeners(stackupWorkspaceViewEl.querySelectorAll(".stackup-table tbody tr[data-layer-id]"), { revealDiagram: true });
}

function fallbackStackupDisplayOrder(layers) {
  const dielectricLayers = layers.filter((layer) => layer.role === "dielectric");
  const hasSyntheticBoardOnly = dielectricLayers.length === 1 && dielectricLayers[0]?.name === "Board";
  if (!hasSyntheticBoardOnly) return new Map();

  const order = new Map();
  [
    "F.SilkS",
    "F.Paste",
    "F.Mask",
    "F.Cu",
    "Board",
    "B.Cu",
    "B.Mask",
    "B.Paste",
    "B.SilkS",
  ].forEach((name, index) => order.set(name, index));

  return order;
}
