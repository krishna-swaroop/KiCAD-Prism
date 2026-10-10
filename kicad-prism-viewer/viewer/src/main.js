import { CameraController } from "./camera.js";
import { BomViewer } from "./bom-viewer.js";
import {
  boardRole,
  copperLayerColor,
  FINISH_COLORS,
  finishColorFor,
  isOuterCopperLayer,
  innerCopperLayer,
  mergeBounds,
  mergePrimitivesByMaterial,
  pasteLayerIdFor,
  runtimeBounds,
  runtimeBoundsFromGltf,
} from "./bundle-geometry.js";
import {
  buildComponentFeatureGroups,
  isComponentHidden,
  planComponentVisibility,
} from "./component-visibility.js";
import { escapeHtml } from "./escape-html.js";
import { EMPHASIS_PALETTE, findNetByName, packEmphasisColor, resolveNetIds } from "./net-emphasis.js";
import { componentDraws } from "./component-models.js";
import { loadGltf, loadGltfModels } from "./gltf-loader.js";
import { add, boundsRadius, clamp, cross, mat4Multiply, scale } from "./math.js";
import {
  AXES, SNAP, axisAmount, canonicalPose, localAxes, moveDescriptor, moveTarget, perpendicular,
  ringRotation, rotatePoseAbout, screenAngle, snapTo, translatePose,
} from "./move-gizmo.js";
import {
  IDENTITY, LOD_THRESHOLDS, isIdentity, normalizeLodThresholds, projectToViewport, transformBounds, transformPoint,
} from "./occurrences.js";
import { primitiveGpuBytes, Renderer } from "./renderer.js";
import { SceneRenderer } from "./scene-renderer.js";
import { SchematicWorldRenderer } from "./schematic-world-renderer.js";
import { collectStackupViaData } from "./stackup-vias.js";
import { SvgDomSchematicRenderer } from "./svg-dom-schematic-renderer.js";
import { harnessKey, harnessSegments, hubPoint, litEnds, litHarnessWires, segmentColor } from "./system-harness.js";
import { AUTO, bendNode, levelMatrix, nodeHandles, toLevel, toWorld, withNodePreview } from "./harness-edit.js";
import { pickTube } from "./tube-pick.js";
import { dragInViewPlane, isDrag } from "./route-drag.js";
import { cameraRay, surfaceHit } from "./model-pick.js";
// SB2-44: the placement library is shared with the app (one implementation, CONTRACTS_P2 §17).
import { harnessScene } from "../../../frontend/src/features/system-builder/placement/harness-tubes.ts";
import { allReadyBoardsDrawn, assetLoadable, assetOccurrenceMatrix, boardTransition, boxRendererId, drawnOccurrences, STAND_INS, standInKind, standInMatrix } from "./system-placement.js";
import { LOD_FULL } from "./occurrences.js";
import { insetMatrix, mmToRuntime, projectInset, runtimeBoundsToMm } from "./inset-view.js";

const COPPER_TILE_GPU_BUDGET_BYTES = 512 * 1024 * 1024;
const COPPER_TILE_PREFETCH_MARGIN = 0.65;
// SB2-87: tiles stay loaded within this wider margin; beyond it they go after a while unused.
const COPPER_TILE_KEEP_MARGIN = 1.5;
const COPPER_TILE_IDLE_RELEASE_MS = 15000;
const TILE_SCHEDULER_INTERVAL_MS = 120;
const MAX_TILE_LOADS_PER_TICK = 12;
const INTERACTIVE_TILE_LOADS_PER_TICK = 48;
const COMPARE_REVEAL_DURATION_MS = 230;

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
let sceneStatsEl;
let lodTuningEl;
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
// System mode (SB2-31f): board labels, the move gizmo and the key list.
let systemLabelsEl;
let moveGizmoEl;
let systemHelpEl;
let systemHarnessEl;
let harnessNodesEl;

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
  sceneStatsEl = query("#scene-stats");
  lodTuningEl = query("#lod-tuning");
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
  systemLabelsEl = query("#system-labels");
  moveGizmoEl = query("#move-gizmo");
  systemHelpEl = query("#system-help");
  systemHarnessEl = query("#system-harnesses");
  harnessNodesEl = query("#harness-nodes");
  // A handle drag (D-P2-53) captures the pointer here.
  harnessNodesEl?.addEventListener("pointermove", (event) => moveRouteDrag(event));
  harnessNodesEl?.addEventListener("pointerup", (event) => endRouteDrag(event));
  appEl.classList.add("workspace-pcb");
}

function initialState() {
  return {
    workspace: "pcb",
    mode: "3d",
    activeNetId: 0,
    selectedFeatureId: 0,
    // The occurrence the selection belongs to (SB2-24); 0 in the one-board view.
    selectedOccurrence: 0,
    selectionAnchor: null,
    showBoard: true,
    showComponents: true,
    showPlaceholders: true,
    realisticColors: true,
    isolateNet: false,
    /** User/view prefs restored after Esc; not overwritten by net-probe toggles. */
    savedShowBoard: true,
    savedShowComponents: true,
    /** Snapshot of showBoard taken when entering Isolate (I); restored on exit. */
    preIsolationShowBoard: null,
    separation: 0,
    dragging: false,
    dragMode: "orbit",
    lastX: 0,
    lastY: 0,
    pointerStartX: 0,
    pointerStartY: 0,
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

/**
 * One board of the viewer (SB2-31d): its bundle (topology, semantic geometry,
 * readiness, asset cache), its loaded scene and renderer, and the view state
 * that is per board: layer visibility, tile residency, highlighted and hidden sets.
 */
function createBoard(options = {}) {
  return {
    key: options.key ?? "board",
    topology: options.topology || window.__TOPOLOGY__ || {},
    semanticGeometry: options.semanticGeometry || window.__SEMANTIC_GEOMETRY__ || {},
    viewerReadiness: options.readiness || { stage: "semantic-ready", progress: 100 },
    assetCache: options.assetCache || null,
    deferComponents: Boolean(options.deferComponents),
    scene: initialScene(),
    renderer: null,
    compareLayers: new Set(),
    desiredCompareLayers: new Set(),
    visible3dLayers: new Set(),
    preIsolation3dLayers: null,
    preIsolationCompareLayers: null,
    /** Host-highlighted nets (Prism #305), emphasised alongside the active net. */
    highlightedNetIds: new Set(),
    hiddenComponents: new Set(),
    hiddenComponentRequest: null,
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
    gpuBytes: 0,
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
    componentModelCounts: new Map(),
    // The component tier (SB2-26): idle → loading → loaded, and back to idle when evicted.
    componentTier: "idle",
    componentEntries: [],
    componentsWantedAt: 0,
    componentEvictions: 0,
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
// SB2-31d: everything that belongs to one board (its bundle, scene, renderer,
// layer visibility, tile residency, highlight and hidden sets). The 3D tab is a
// viewer with one board; a system scene (SB2-31e) holds several.
let board = createBoard();
// SB2-31e: the system scene (several boards), or null in the one-board view.
let system = null;
const compareAnimation = initialCompareAnimation();
const compareTransition = initialCompareTransition();
const schematicScene = initialSchematicScene();
let gizmoHits = [];
// SB2-26: the browser cache for this bundle's assets (null: network only), and
// whether components wait until some occurrence needs full detail.
const DEFAULT_GPU_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024;
// Components unused this long (no occurrence at full detail) may be evicted over budget.
const COMPONENT_IDLE_EVICT_MS = 5000;
// SB2-81: inner copper a system board no longer needs is released after this long unused.
const INNER_COPPER_IDLE_RELEASE_MS = 5000;

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
let viewStateChangeCallback = null;
let contextMenuCallback = null;
let viewStateChangeQueued = false;
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
      pcb_pad_id: terminal.pcb_pad_id || "",
      pcb_pad_source_uid: terminal.pcb_pad_source_uid || ""
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

// A terminal's pad is the scene feature whose sourceUid is the pad's KiCad
// UUID. Older bundles only carry the pad object uid, which resolves through
// physical_objects when the board emitted pad objects.
function findTerminalPadFeatureId(terminal, b = board) {
  if (!terminal || !b.scene?.features) return 0;
  let uuid = terminal.pcb_pad_source_uid || "";
  if (!uuid && terminal.pcb_pad_id) {
    const obj = (b.topology?.physical_objects || []).find(o => o.uid === terminal.pcb_pad_id);
    uuid = obj?.source_ids?.[0] || "";
  }
  if (!uuid) return 0;
  for (const [id, feat] of b.scene.features.entries()) {
    if (feat.sourceUid === uuid && feat.kind === "pad") return id;
  }
  return 0;
}

function findTopologyComponent(designator, b = board) {
  if (!designator || !b.topology || !b.topology.components) return null;
  return b.topology.components.find(c => c.designator === designator);
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
  if (system) {
    for (const item of system.boards.values()) item.abort?.abort();
    // The scene owns every board's renderer (and the device).
    system.scene.dispose();
    system = null;
  } else {
    board.renderer?.dispose?.();
  }
  board.renderer = null;
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
  board = createBoard();
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
  board.topology = options.topology || window.__TOPOLOGY__ || {};
  if (board.topology && !board.topology.net_details) {
    board.topology.net_details = buildNetDetails(board.topology);
  }
  board.semanticGeometry = options.semanticGeometry || window.__SEMANTIC_GEOMETRY__ || {};
  board.viewerReadiness = options.readiness || board.semanticGeometry.readiness || {
    stage: "semantic-ready",
    progress: 100,
  };
  selectionChangeCallback = typeof options.onSelectionChange === "function"
    ? options.onSelectionChange
    : null;
  contextMenuCallback = typeof options.onContextMenu === "function" ? options.onContextMenu : null;
  viewStateChangeCallback = typeof options.onViewStateChange === "function"
    ? options.onViewStateChange
    : null;
  viewerIsActive = typeof options.isActive === "function" ? options.isActive : () => true;
  legacyWorkspacesEnabled = options.workspaceScope !== "3d";
  board.assetCache = options.assetCache || null;
  state.gpuBudgetBytes = DEFAULT_GPU_BUDGET_BYTES;
  resolveDom(options.root || document);
  if (!appEl || !canvas) throw new Error("Semantic viewer shell is missing required DOM nodes");
  await boot(token, performanceTimings, options.onPerformanceEvent);
  return {
    performance: performanceTimings,
    setSelection(selection) {
      suppressSelectionChange = true;
      try {
        if (selection?.occurrence != null) selectOccurrenceByKey(selection.occurrence);
        if (!selection) clearSelection();
        else if (selection?.netName || selection?.netUid) {
          const match = (selection.netUid && board.scene.nets.find((item) => item.uid === selection.netUid))
            || (selection.netName && findNetByName(board.scene.nets, selection.netName));
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
      board.renderer?.resize();
      schematicRenderer?.resize();
      if (state.workspace === "pcb" && state.mode === "layer") {
        activatePcbLayerMode();
      }
    },
    setWorkspace(workspace) {
      const nextWorkspace = workspace === "stackup" ? "stackup" : "pcb";
      if (state.workspace !== nextWorkspace) switchWorkspace(nextWorkspace);
    },
    setHiddenComponents(references) {
      return applyHiddenComponents(references);
    },
    getComponentReferences() {
      return [...board.scene.componentFeatures.keys()];
    },
    setHighlightedNets(refs) {
      return applyHighlightedNets(refs);
    },
    setStatsOverlay(visible) {
      setStatsOverlay(visible);
    },
    stats() {
      return sceneStats();
    },
    // Force a level of detail on every occurrence (0 full, 1 board, 2 body, 3 box), or null for automatic.
    setLodOverride(lod) {
      board.renderer?.setLodOverride(lod);
    },
    setGpuBudget(bytes) {
      const value = Number(bytes);
      state.gpuBudgetBytes = Number.isFinite(value) && value > 0 ? value : DEFAULT_GPU_BUDGET_BYTES;
      for (const item of system ? system.boards.values() : [board]) item.tiersCheckedAt = 0;
    },
    // Query the pick target at a client point without changing the selection.
    pickAt(clientX, clientY) {
      return pickHitAt(clientX, clientY);
    },
    // Where a component's centre appears on screen (client px), or null.
    projectComponent(reference) {
      return projectComponentCenter(board, reference, (local) => projectBoardPoint(local, IDENTITY));
    },
    // Where a board-local runtime point (metres) appears on screen (client px), or null.
    projectPoint(point) {
      return projectBoardPoint(point, IDENTITY);
    },
    getViewState: pcbViewState,
    setViewMode,
    setLayerVisible,
    applyLayerPreset,
    setShowBoard,
    setShowComponents,
    setShowPlaceholders,
    setRealisticColors,
    setSeparation,
    showNetLayers,
    setNetIsolation,
    // IN-60/IN-61: inset views through cameras of their own.
    renderInset(target, view, key) {
      return renderInsetView(target, view, key);
    },
    insetReady() {
      return insetViewReady();
    },
    insetSurfaceZ(bottom) {
      return insetSurfaceZ(Boolean(bottom));
    },
    releaseInset(key) {
      insetViews.delete(String(key));
    },
    insetTarget(reference, pin) {
      return insetTargetFor(reference, pin);
    },
    projectInset(view, width, height, pointMm) {
      return projectInsetPoint(view, width, height, pointMm);
    },
    onSceneChange(listener) {
      insetListeners.add(listener);
      return () => insetListeners.delete(listener);
    },
    insetStats() {
      return { ...insetStats, views: insetViews.size, targets: [insetGpu.width, insetGpu.height] };
    },
    insetSettings(settings) {
      Object.assign(insetSettings, settings || {});
      return { ...insetSettings };
    },
    /** Resolves when the GPU has finished everything submitted so far. */
    gpuIdle() {
      return board.renderer?.device.queue.onSubmittedWorkDone() ?? Promise.resolve();
    },
    dispose() {
      releaseInsets();
      disposeViewerSession(token);
    },
  };
}

function releaseInsets() {
  insetGpu.depth?.destroy();
  Object.assign(insetGpu, { canvas: null, context: null, depth: null, depthView: null, width: 0, height: 0 });
  insetViews.clear();
  insetListeners.clear();
  lastFrameInputs = null;
}

/**
 * The PCB 3D controls a host renders in place of the built-in panel. Coalesced
 * to one callback per task: a single click can touch several of these fields.
 */
function notifyViewStateChange() {
  if (!viewStateChangeCallback || viewStateChangeQueued) return;
  viewStateChangeQueued = true;
  queueMicrotask(() => {
    viewStateChangeQueued = false;
    viewStateChangeCallback?.(pcbViewState());
  });
}

function pcbViewState() {
  const selected = state.mode === "3d" ? board.visible3dLayers : board.desiredCompareLayers;
  return {
    mode: state.mode,
    layers: board.scene.copperLayers.map((layer) => ({
      id: Number(layer.id),
      name: String(layer.name),
      color: rgbCss(layerColor(layer)),
      visible: selected.has(Number(layer.id)),
    })),
    showBoard: state.showBoard,
    showComponents: state.showComponents,
    showPlaceholders: state.showPlaceholders,
    realisticColors: state.realisticColors,
    separation: system ? system.separation.get(selectedPlacementKey()) || 0 : state.separation,
    isolateNet: state.isolateNet,
    hasNet: Boolean(state.activeNetId) || anyEmphasis(),
    // SB2-31e: a layer section per placed board, and the placement holding the selection.
    ...(system ? { boards: systemBoardViews(), selectedBoard: selectedPlacementKey() } : {}),
  };
}

function emitSelectionChange(selection) {
  // Move mode follows the selection to its top-level instance (SB2-29).
  if (system?.move.enabled) retargetMove();
  if (suppressSelectionChange) return;
  // In a system scene every selection names its occurrence (SB2-24).
  const occurrence = board.renderer && !board.renderer.identityOnly ? board.renderer.occurrenceKeys[state.selectedOccurrence] : null;
  selectionChangeCallback?.(selection && occurrence != null ? { ...selection, occurrence } : selection);
}

function selectOccurrenceByKey(key) {
  const index = board.renderer?.occurrenceKeys.indexOf(String(key)) ?? -1;
  if (index >= 0) state.selectedOccurrence = index;
}

// Board-local runtime bounds placed at the selected occurrence.
function placedBounds(bounds) {
  if (!bounds || !board.renderer || board.renderer.identityOnly) return bounds;
  const model = board.renderer.occurrenceMatrices[state.selectedOccurrence];
  return model ? transformBounds(model, bounds) : bounds;
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

function featureSelection(feature, b = board) {
  if (!feature) return null;
  const reference = componentReferenceFromFeature(feature);
  const pin = String(feature.padNumber || feature.pin || feature.pinNumber || "");
  const net = b.scene.nets.find((item) => Number(item.id) === Number(feature.netId || 0));
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
    const component = findTopologyComponent(reference, b);
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

/** Whether any net is lit: on this board, or (SB2-31e) a system net on any board. */
function anyEmphasis() {
  return emphasizedNetIds().size > 0 || Boolean(system?.emphasisSets.length);
}

/** Net ids drawn emphasised: the active (inspected) net plus the highlight set. */
function emphasizedNetIds() {
  const ids = new Set(board.highlightedNetIds);
  if (state.activeNetId) ids.add(Number(state.activeNetId));
  return ids;
}

/**
 * Replace the host's highlighted nets. Resolved by uid then exact name;
 * unresolved references are dropped. Entering or leaving an emphasised view
 * follows the single-net probe's board/component visibility so the copper
 * reads the same way whether one net or several are lit.
 */
function applyHighlightedNets(refs) {
  const requested = Array.isArray(refs) ? refs : [];
  const ids = resolveNetIds(board.scene.nets, requested);
  const hadEmphasis = anyEmphasis();
  board.highlightedNetIds = ids;
  board.renderer?.setEmphasizedNetIds(ids);
  const hasEmphasis = anyEmphasis();
  if (hasEmphasis && !hadEmphasis) applyNetProbeVisibility();
  else if (!hasEmphasis && hadEmphasis) restoreViewVisibilityPrefs();
  if (state.isolateNet && hasEmphasis) applyNetIsolationLayers();
  scheduleTileResidency(performance.now(), { force: true });
  return { applied: ids.size, requested: requested.length };
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

/**
 * Fetch a board's scene manifest and index it: layers, nets, features, tiles,
 * and the default visible layer sets. False when the session ended meanwhile.
 */
async function indexBoardScene(b, token, performanceTimings = {}) {
  const manifestPath = b.semanticGeometry.assets?.scene_manifest || b.semanticGeometry.semantic_gltf?.path;
  let started = performance.now();
  if (manifestPath) {
    b.scene.manifestUrl = new URL(manifestPath, location.href).toString();
    b.scene.manifest = await fetchJson(b.scene.manifestUrl, b);
    performanceTimings.scene_manifest_fetch_parse_ms = performance.now() - started;
    if (!viewerSessionActive(token)) return false;
    if (b.scene.manifest.schema !== "prism.semantic_gltf_a0") {
      throw new Error(`Unsupported scene schema: ${b.scene.manifest.schema}`);
    }
  } else {
    b.scene.manifest = {
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
  b.scene.layers = b.scene.manifest.layers || [];
  b.scene.copperLayers = b.scene.layers.filter(
    (layer) => layer.role === "copper" || String(layer.name).endsWith(".Cu"),
  );
  b.scene.nets = b.scene.manifest.nets || [];
  for (const feature of b.scene.manifest.objectFeatures || []) {
    b.scene.features.set(Number(feature.id), { ...feature, bounds: runtimeBounds(feature.boundsMm) });
  }
  for (const component of b.scene.manifest.components || []) {
    b.scene.componentFeatures.set(component.designator, component);
    b.scene.features.set(Number(component.featureId), {
      ...component,
      kind: "component",
      sourceUid: component.uid,
      netId: 0,
      bounds: null,
    });
  }
  for (const tile of b.scene.manifest.tiles || []) b.scene.tiles.set(tile.id, tile);
  performanceTimings.scene_manifest_index_ms = performance.now() - started;

  const defaultCompareLayers = defaultPcbCompareLayers(b);
  for (const layerId of defaultCompareLayers) {
    b.compareLayers.add(layerId);
    b.desiredCompareLayers.add(layerId);
  }
  for (const layer of b.scene.copperLayers) b.visible3dLayers.add(Number(layer.id));

  return true;
}

async function boot(token, performanceTimings = {}, onPerformanceEvent = null) {
  const bootStarted = performance.now();
  if (!(await indexBoardScene(board, token, performanceTimings))) return;

  let started = performance.now();
  board.renderer = await Renderer.create(canvas);
  performanceTimings.webgpu_renderer_create_ms = performance.now() - started;
  if (!viewerSessionActive(token)) {
    board.renderer?.dispose?.();
    board.renderer = null;
    return;
  }
  board.renderer.setBarrels(board.scene.manifest.barrels || []);
  applyCopperColors();
  started = performance.now();
  const boardBounds = await loadBoard(token);
  performanceTimings.board_fetch_parse_upload_ms = performance.now() - started;
  if (!viewerSessionActive(token)) return;
  board.scene.runtimeBounds = boardBounds || runtimeBoundsFromGltf(board.scene.manifest.bbox);
  camera = new CameraController(board.scene.runtimeBounds);
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
  statusEl.textContent = stageLabels[board.viewerReadiness.stage] || "Loading 3D assets";
  if (board.semanticGeometry.assets?.components_glb && !board.deferComponents) {
    const componentsStarted = performance.now();
    void loadComponents(token).then(() => {
      if (!viewerSessionActive(token)) return;
      addFootprintPlaceholders(boardBounds);
      onPerformanceEvent?.({
        schema: "prism.semantic_viewer_performance.a0",
        milestone: "components-loaded",
        readiness_stage: board.viewerReadiness.stage,
        elapsed_ms: performance.now() - componentsStarted,
        bytes_loaded: board.loadedBytes,
      });
    });
  } else {
    addFootprintPlaceholders(boardBounds);
  }
  scheduleTileResidency(performance.now(), { force: true });
  scheduleFrame(token);
  started = performance.now();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  performanceTimings.first_frame_wait_ms = performance.now() - started;
  performanceTimings.boot_total_ms = performance.now() - bootStarted;
}

async function loadSchematicWorld(token = activeViewerToken) {
  const nativePath = board.semanticGeometry.assets?.schematic_native_manifest
    || board.semanticGeometry.schematic_vector?.path
    || board.semanticGeometry.schematic_scene?.path;
  const fallbackPath = board.semanticGeometry.assets?.schematic_manifest
    || board.semanticGeometry.schematic_world?.path;
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
  const bomPath = board.semanticGeometry.assets?.bom || board.semanticGeometry.bom?.path;
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

async function fetchJson(url, b = board) {
  if (b.assetCache) return b.assetCache.fetchJson(String(url));
  const response = await fetch(url, { cache: "default" });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

async function loadLayer(layerId) {
  const token = activeViewerToken;
  await Promise.all(tilesForLayer(layerId).map((tile) => loadTile(tile, token)));
}

/** SB2-92: true once a system scene has drawn all its boards, or has none still loading. */
function scenePrefetchReady() {
  if (!system) return true;
  if (system.timing.boardsDrawnAt != null) return true;
  return ![...system.boards.values()].some((b) => b.loadState === "loading" || b.loadState === "waiting");
}

/**
 * SB2-87: GPU uploads per frame are capped, so tiles finishing together upload
 * over a few frames instead of stalling one. A single upload larger than the
 * cap still goes, alone in its frame.
 */
const UPLOAD_BYTES_PER_FRAME = 24 * 1024 * 1024;
const uploadFrame = { bytes: 0, waiting: null };
async function uploadBudget(bytes) {
  for (;;) {
    if (uploadFrame.bytes === 0 || uploadFrame.bytes + bytes <= UPLOAD_BYTES_PER_FRAME) {
      uploadFrame.bytes += bytes;
      uploadFrame.waiting ??= new Promise((resolve) => requestAnimationFrame(() => {
        uploadFrame.bytes = 0;
        uploadFrame.waiting = null;
        resolve();
      }));
      return;
    }
    await uploadFrame.waiting;
  }
}

async function loadTile(tile, token = activeViewerToken, b = board) {
  if (!viewerSessionActive(token)) return;
  const resident = b.scene.residentTiles.get(tile.id);
  if (resident) {
    resident.lastUsed = performance.now();
    return;
  }
  const failed = b.scene.failed.get(tile.id);
  if (failed) {
    return;
  }
  if (b.scene.loading.has(tile.id)) return b.scene.loading.get(tile.id);
  const promise = (async () => {
    try {
      const loaded = await loadGltf(new URL(tile.path, b.scene.manifestUrl).toString(), {
        fetchBytes: assetFetcher(b),
        fetchCache: "no-store",
      });
      if (!viewerSessionActive(token) || !b.renderer) return;
      await uploadBudget(loaded.primitives.reduce((sum, primitive) => sum + estimatePrimitiveGpuBytes(primitive), 0));
      if (!viewerSessionActive(token) || !b.renderer) return;
      b.loadedBytes += loaded.byteLength;
      const layer = b.scene.layers.find((item) => Number(item.id) === Number(tile.layerId));
      const entries = [];
      let triangles = 0;
      let gpuBytes = 0;
      for (const primitive of loaded.primitives) {
        const entry = b.renderer.addPrimitive(primitive, {
          kind: "copper",
          tileId: tile.id,
          layerId: Number(tile.layerId),
          innerCopper: isInnerCopperLayer(Number(tile.layerId), b),
          color: copperColor(layer, b),
          stencilMark: isOuterCopper(layer, b),
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
      b.scene.residentTiles.set(tile.id, record);
      b.scene.loaded.add(tile.id);
      b.tileLoads += 1;
      b.residentTileBytes += loaded.byteLength;
      b.residentTileGpuBytes += gpuBytes;
      b.residentTileTriangles += triangles;
      b.triangles = b.residentTileTriangles;
      b.scene.failed.delete(tile.id);
    } catch (error) {
      if (!viewerSessionActive(token)) return;
      const previous = b.scene.failed.get(tile.id) || { count: 0, message: "" };
      b.scene.failed.set(tile.id, { count: previous.count + 1, message: error?.message || String(error) });
      if (!previous.count) {
        console.warn(`Failed to load tile ${tile.id}; suppressing retries until assets are regenerated`, error);
      }
    } finally {
      if (viewerSessionActive(token)) b.scene.loading.delete(tile.id);
    }
  })();
  b.scene.loading.set(tile.id, promise);
  return promise;
}

function tilesForLayer(layerId, b = board) {
  return [...b.scene.tiles.values()].filter((tile) => Number(tile.layerId) === Number(layerId));
}

function estimatePrimitiveGpuBytes(primitive) {
  return primitiveGpuBytes(primitive.position.length / 3, primitive.indices.length);
}

function evictTile(tileId, b = board) {
  const record = b.scene.residentTiles.get(tileId);
  if (!record) return;
  b.renderer.removeEntries(record.entries);
  b.scene.residentTiles.delete(tileId);
  b.scene.loaded.delete(tileId);
  b.residentTileBytes = Math.max(0, b.residentTileBytes - record.byteLength);
  b.residentTileGpuBytes = Math.max(0, b.residentTileGpuBytes - record.gpuBytes);
  b.residentTileTriangles = Math.max(0, b.residentTileTriangles - record.triangles);
  b.triangles = b.residentTileTriangles;
  b.tileEvictions += 1;
}

function scheduleTileResidency(now = performance.now(), options = {}, b = board) {
  if (!b.renderer || !camera || state.workspace !== "pcb") return;
  const interactiveComparePreload = state.mode === "layer" && compareTransition.phase === "preload";
  if (!options.force && !interactiveComparePreload && now - b.lastTileScheduleAt < TILE_SCHEDULER_INTERVAL_MS) return;
  const started = performance.now();
  b.lastTileScheduleAt = now;
  const needed = neededTileIdsForView(b);
  b.visibleTileIds = needed;
  const activeLoads = b.scene.loading.size;
  const maxLoads = interactiveComparePreload ? INTERACTIVE_TILE_LOADS_PER_TICK : MAX_TILE_LOADS_PER_TICK;
  const loadBudget = Math.max(0, maxLoads - activeLoads);
  const missing = [...needed]
    .map((tileId) => b.scene.tiles.get(tileId))
    .filter((tile) => tile && !b.scene.residentTiles.has(tile.id) && !b.scene.loading.has(tile.id) && !b.scene.failed.has(tile.id))
    .sort((left, right) => tileDistanceToFocus(left, b) - tileDistanceToFocus(right, b))
    .slice(0, loadBudget);
  const token = activeViewerToken;
  for (const tile of missing) void loadTile(tile, token, b);
  for (const tileId of needed) {
    const record = b.scene.residentTiles.get(tileId);
    if (record) record.lastUsed = now;
  }
  evictUnneededTiles(needed, undefined, b);
  releaseDeferredInnerTiles(needed, now, b);
  releaseDistantTiles(needed, now, b);
  b.tileSchedulerMs = performance.now() - started;
}

function neededTileIdsForView(b = board) {
  const needed = new Set();
  const visibleLayers = state.mode === "3d" ? b.visible3dLayers : compareResidencyLayers();
  if (!visibleLayers.size || !panel) return needed;

  if (state.mode === "layer") {
    for (const tile of b.scene.tiles.values()) {
      if (visibleLayers.has(Number(tile.layerId))) needed.add(tile.id);
    }
    return needed;
  }

  const activeNetTiles = new Set();
  const emphasized = litNetIds(b);
  if (emphasized.size) {
    for (const tile of b.scene.tiles.values()) {
      if (!visibleLayers.has(Number(tile.layerId))) continue;
      for (const netId of emphasized) {
        if (tileHasNet(tile, netId)) {
          activeNetTiles.add(tile.id);
          break;
        }
      }
    }
  }
  const deferInner = innerCopperDeferred(b);
  // SB2-87: the view now, where the camera is heading and one step beyond, each with a margin.
  // IN-60: and what open insets show, so their copper loads too.
  const views = [panel.matrix, ...prefetchViews(), ...(b === board ? activeInsetViews() : [])];
  let misses = 0;
  for (const tile of b.scene.tiles.values()) {
    if (!visibleLayers.has(Number(tile.layerId))) continue;
    if (deferInner && isInnerCopperLayer(Number(tile.layerId), b)) continue;
    const offset = state.mode === "layer" ? compareOffsets.get(Number(tile.layerId)) : null;
    if (views.some((matrix) => tileIntersectsView(tile, matrix, offset, COPPER_TILE_PREFETCH_MARGIN, b))) needed.add(tile.id);
    if (!b.scene.residentTiles.has(tile.id) && tileIntersectsView(tile, panel.matrix, offset, 0, b)) misses += 1;
  }
  for (const tileId of activeNetTiles) needed.add(tileId);
  // On screen but not loaded yet: what a user would see arrive late (SB2-87 measures this).
  b.visibleTileMisses = misses;
  return needed;
}

/**
 * SB2-87: views to load for besides the current one while the camera moves:
 * its destination and a lead one step further along the same move. Every move
 * (frame, zoom, pan, orbit) sets the camera's targets first and eases there.
 */
function prefetchViews() {
  if (!camera?.moving?.() || state.mode === "layer") return [];
  const now = performance.now();
  if (prefetchViewCache.at === now) return prefetchViewCache.views;
  prefetchViewCache.at = now;
  prefetchViewCache.views = [0, 1].map((lead) => camera.targetMatrix(canvas.width, canvas.height, false, lead));
  return prefetchViewCache.views;
}
const prefetchViewCache = { at: -1, views: [] };

/**
 * SB2-87: copper tiles outside a wider ring around the view (hysteresis: wider
 * than the load margin, so a tile at the edge does not load and unload in turn)
 * are released once unused for a while, whether or not memory is short.
 */
function releaseDistantTiles(needed, now, b) {
  if (state.mode === "layer" || !panel) return;
  const deferInner = innerCopperDeferred(b);
  for (const record of [...b.scene.residentTiles.values()]) {
    if (needed.has(record.tile.id) || b.scene.loading.has(record.tile.id)) continue;
    // Only a tile the view would otherwise want stays for being near it: a hidden
    // layer's, or inner copper the board hides (SB2-85), ages out as before.
    const layerId = Number(record.tile.layerId);
    const wanted = b.visible3dLayers.has(layerId) && !(deferInner && isInnerCopperLayer(layerId, b));
    if (wanted && tileIntersectsView(record.tile, panel.matrix, null, COPPER_TILE_KEEP_MARGIN, b)) {
      record.lastUsed = now;
      continue;
    }
    if (now - record.lastUsed > COPPER_TILE_IDLE_RELEASE_MS) evictTile(record.tile.id, b);
  }
}

/**
 * SB2-85 (user, 2026-10-08): an exploded or hidden board (a net probe hides it)
 * shows all inner copper, as before; an opaque board, whose substrate hides it,
 * draws only the lit nets' inner copper, or none while nothing is lit.
 */
function innerCopperMode(revealed, lit) {
  return revealed ? "all" : lit ? "lit" : "none";
}

/** Inner-layer tiles load only when all inner copper shows; otherwise only those with a lit net (SB2-81, SB2-85). */
function innerCopperDeferred(b) {
  return Boolean(b.renderer) && b.renderer.innerCopperMode !== "all";
}

function releaseDeferredInnerTiles(needed, now, b) {
  if (!innerCopperDeferred(b)) return;
  for (const record of [...b.scene.residentTiles.values()]) {
    if (needed.has(record.tile.id) || b.scene.loading.has(record.tile.id)) continue;
    if (!isInnerCopperLayer(Number(record.tile.layerId), b)) continue;
    if (now - record.lastUsed > INNER_COPPER_IDLE_RELEASE_MS) evictTile(record.tile.id, b);
  }
}

function compareResidencyLayers() {
  if (state.mode !== "layer") return board.compareLayers;
  if (compareTransition.phase === "idle") return board.compareLayers;
  return unionSets(compareTransition.previous, compareTransition.target);
}

function compareRenderLayers() {
  if (state.mode !== "layer") return board.visible3dLayers;
  if (compareTransition.phase === "reveal") return unionSets(compareTransition.previous, compareTransition.target);
  return board.compareLayers;
}

function defaultPcbCompareLayers(b = board) {
  const ids = b.scene.copperLayers.map((layer) => Number(layer.id)).filter(Number.isFinite);
  if (!ids.length) return new Set();
  if (ids.length === 1) return new Set([ids[0]]);
  return new Set([ids[0], ids[ids.length - 1]]);
}

function ensurePcbCompareLayers() {
  const current = board.desiredCompareLayers.size ? board.desiredCompareLayers : board.compareLayers;
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

function evictUnneededTiles(needed, tileBudget = COPPER_TILE_GPU_BUDGET_BYTES, b = board) {
  if (state.mode === "layer") return;
  const budget = Math.min(COPPER_TILE_GPU_BUDGET_BYTES, tileBudget);
  if (b.residentTileGpuBytes <= budget) return;
  const candidates = [...b.scene.residentTiles.values()]
    .filter((record) => !needed.has(record.tile.id) && !b.scene.loading.has(record.tile.id))
    .sort((left, right) => left.lastUsed - right.lastUsed);
  for (const record of candidates) {
    if (b.residentTileGpuBytes <= budget) break;
    evictTile(record.tile.id, b);
  }
}

function tileIntersectsView(tile, matrix, offset = null, marginScale = 0, b = board) {
  const bounds = tileRuntimeBounds(tile, b);
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
  const occurrences = b.renderer?.occurrenceMatrices;
  if (!occurrences || (occurrences.length === 1 && isIdentity(occurrences[0]))) {
    return boundsIntersectsClip(expanded, matrix);
  }
  return occurrences.some((model) => boundsIntersectsClip(expanded, mat4Multiply(matrix, model)));
}

function tileRuntimeBounds(tile, b = board) {
  const bounds = tile.boundsMm;
  if (!bounds || bounds.length !== 4) return null;
  const layer = b.scene.layers.find((item) => Number(item.id) === Number(tile.layerId));
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

function tileDistanceToFocus(tile, b = board) {
  const bounds = tileRuntimeBounds(tile, b);
  if (!bounds || !camera) return 0;
  const x = (bounds[0] + bounds[3]) * 0.5 - camera.focus[0];
  const y = (bounds[1] + bounds[4]) * 0.5 - camera.focus[1];
  return x * x + y * y;
}

async function loadBoard(token = activeViewerToken, b = board) {
  const path = b.semanticGeometry.assets?.base_board_glb;
  if (!path) return null;
  // The pipeline's own mask (with pad openings) replaces any the board export
  // carries. Fetched alongside the board; a failed mask leaves the board bare.
  const maskPath = b.semanticGeometry.assets?.soldermask_glb;
  const [loaded, mask] = await Promise.all([
    loadGltf(new URL(path, location.href).toString(), { defaultFeatureId: 0, fetchBytes: assetFetcher(b) }),
    maskPath
      ? loadGltf(new URL(maskPath, location.href).toString(), { defaultFeatureId: 0, fetchBytes: assetFetcher(b) }).catch((error) => {
        console.warn("[prism-semantic-viewer] solder mask failed to load", error);
        return null;
      })
      : null,
  ]);
  if (!viewerSessionActive(token) || !b.renderer) return null;
  b.loadedBytes += loaded.byteLength;
  if (mask) b.loadedBytes += mask.byteLength;
  const contextPrimitives = [
    ...loaded.primitives.filter((primitive) => {
      const role = boardRole(primitive);
      return role !== "pad" && !(mask && role === "soldermask");
    }),
    ...(mask?.primitives || []),
  ];
  for (const primitive of mergePrimitivesByMaterial(contextPrimitives, boardRole)) {
    b.renderer.addPrimitive(primitive, {
      kind: "board",
      boardRole: primitive.groupKey,
      layerId: primitive.groupKey === "paste" ? pasteLayerId(primitive, b) : 0,
      material: primitive.material,
      color: primitive.material.baseColor,
    });
  }
  return mergeBounds(contextPrimitives.map((primitive) => primitive.bounds));
}


function sceneRuntimeBounds(b = board) {
  return b.scene.runtimeBounds || runtimeBoundsFromGltf(b.scene.manifest?.bbox);
}

// Outer copper is the first and last copper layer by height; the rest sit inside the b.
function isInnerCopperLayer(layerId, b = board) {
  return innerCopperLayer(layerId, b.scene.copperLayers);
}

// What the cull pass needs to size occurrences on screen (SB2-25): the eye, and
// pixels per runtime unit at unit distance (perspective) or flat (orthographic).
function cameraLod(viewportHeight, orthographic) {
  const { back } = camera.basis();
  return {
    eye: add(camera.focus, scale(back, camera.distance)),
    orthographic,
    pixelScale: orthographic
      ? viewportHeight / Math.max(1e-9, camera.orthoScale)
      : viewportHeight / 2 / Math.tan(camera.fov / 2),
  };
}

// Scene numbers for the stats overlay and for measurements through the element.
function sceneStats() {
  if (system) return systemStats();
  const counts = board.renderer?.cullCounts || { full: 0, board: 0, body: 0, box: 0, culled: 0 };
  const single = !board.renderer || board.renderer.identityOnly;
  return {
    occurrences: board.renderer?.occurrenceMatrices.length || 0,
    lod: single ? { full: 1, board: 0, body: 0, box: 0, culled: 0 } : { ...counts },
    triangles: board.renderer?.frameStats.triangles || 0,
    draws: board.renderer?.frameStats.draws || 0,
    gpuMemoryBytes: board.renderer?.gpuMemoryBytes() || 0,
    gpuBreakdown: board.renderer?.gpuMemoryBreakdown() || null,
    gpuBudgetBytes: state.gpuBudgetBytes,
    componentTier: board.scene.componentTier,
    componentEvictions: board.scene.componentEvictions,
    tileEvictions: board.tileEvictions,
    visibleTileMisses: board.visibleTileMisses || 0,
    cache: board.assetCache ? board.assetCache.summary() : { enabled: false },
    frameIntervalMs: state.frameIntervalMs,
    frameIntervalP95Ms: state.frameIntervalP95Ms,
    frameCpuMs: state.frameCpuMs,
    frameCpuP95Ms: state.frameCpuP95Ms,
    fps: state.fps,
  };
}

// The same numbers over every board of a system scene.
function systemStats() {
  const boards = systemBoards();
  const tiers = boards.map((b) => b.scene.componentTier);
  return {
    occurrences: system.scene.occurrenceCount || 0,
    lod: system.scene.cullCounts(),
    triangles: system.scene.frameStats.triangles,
    draws: system.scene.frameStats.draws,
    gpuMemoryBytes: system.scene.gpuMemoryBytes(),
    gpuBreakdown: system.scene.gpuMemoryBreakdown(),
    gpuBudgetBytes: state.gpuBudgetBytes,
    componentTier: `${tiers.filter((tier) => tier === "loaded").length}/${boards.length} loaded`,
    componentEvictions: boards.reduce((sum, b) => sum + b.scene.componentEvictions, 0),
    tileEvictions: boards.reduce((sum, b) => sum + b.tileEvictions, 0),
    visibleTileMisses: boards.reduce((sum, b) => sum + (b.visibleTileMisses || 0), 0),
    // Boards drawn at full detail whose components have not arrived (SB2-87): parts popping in.
    componentMisses: boards.filter((b) => b.renderer.cullCounts.full > 0 && b.scene.componentTier !== "loaded"
      && b.semanticGeometry.assets?.components_glb).length,
    cache: boards.find((b) => b.assetCache)?.assetCache.summary() || { enabled: false },
    frameIntervalMs: state.frameIntervalMs,
    frameIntervalP95Ms: state.frameIntervalP95Ms,
    frameCpuMs: state.frameCpuMs,
    frameCpuP95Ms: state.frameCpuP95Ms,
    fps: state.fps,
    // First frame with every ready board drawn: after the descriptor, and since the page started.
    firstFrame: system.timing.boardsDrawnAt == null ? null : {
      sinceSceneMs: system.timing.boardsDrawnAt - system.timing.descriptorAt,
      sinceNavigationMs: system.timing.boardsDrawnAt,
    },
  };
}

function setStatsOverlay(visible) {
  state.showStats = Boolean(visible);
  if (sceneStatsEl) sceneStatsEl.hidden = !state.showStats;
  if (lodTuningEl) lodTuningEl.hidden = !(state.showStats && system);
  if (state.showStats && system) buildLodTuning();
  updateSceneStats();
}

// ----- level-of-detail thresholds (SB2-30a) -----------------------------------
//
// In projected CSS pixels of a board's radius: components draw at or above
// `fullPx`, copper, barrels, silkscreen and paste at or above `boardPx`, the
// substrate and mask (the body) down to `boxPx`, and a box below it. Tuned live
// beside the stats overlay; kept per browser.

const LOD_STORAGE_KEY = "prism.systemScene.lodThresholds";
const LOD_TUNING_FIELDS = Object.freeze([
  { key: "fullPx", label: "Parts", max: 600 },
  { key: "boardPx", label: "Copper", max: 400 },
  { key: "boxPx", label: "Box below", max: 120 },
]);

function readLodThresholds() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(LOD_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") return normalizeLodThresholds(saved);
  } catch {
    // Storage can be missing or throw: the defaults apply.
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

/** Set the thresholds (merged into the current ones); null restores the defaults. Returns those in force. */
function setSystemLodThresholds(thresholds) {
  if (!system) return null;
  const next = thresholds == null ? { ...LOD_THRESHOLDS } : { ...system.scene.lodThresholds, ...thresholds };
  const applied = system.scene.setLodThresholds(next);
  writeLodThresholds(thresholds == null ? null : applied);
  syncLodTuning();
  return applied;
}

function buildLodTuning() {
  if (!lodTuningEl || lodTuningEl.childElementCount) return syncLodTuning();
  const title = document.createElement("h2");
  title.textContent = "Detail thresholds (CSS px)";
  lodTuningEl.append(title);
  for (const field of LOD_TUNING_FIELDS) {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = field.label;
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min: "0", max: String(field.max), step: "1" });
    input.dataset.key = field.key;
    const output = document.createElement("output");
    input.addEventListener("input", () => setSystemLodThresholds({ [field.key]: Number(input.value) }));
    label.append(name, input, output);
    lodTuningEl.append(label);
  }
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Defaults";
  reset.addEventListener("click", () => setSystemLodThresholds(null));
  lodTuningEl.append(reset);
  syncLodTuning();
}

function syncLodTuning() {
  if (!lodTuningEl || !system) return;
  const values = system.scene.lodThresholds;
  for (const input of lodTuningEl.querySelectorAll("input[data-key]")) {
    input.value = String(values[input.dataset.key]);
    input.nextElementSibling.value = String(Math.round(values[input.dataset.key]));
  }
}

function updateSceneStats() {
  if (!sceneStatsEl || !state.showStats) return;
  const stats = sceneStats();
  const { full, board: boardLod, body, box, culled } = stats.lod;
  const rows = [
    ["Occurrences", `${stats.occurrences} (${full + boardLod + body + box} visible)`],
    ["Detail", `${full} full · ${boardLod} board · ${body} body · ${box} box · ${culled} culled`],
    ["Triangles", stats.triangles.toLocaleString()],
    ["Draws", stats.draws.toLocaleString()],
    ["GPU memory", `${(stats.gpuMemoryBytes / 1048576).toFixed(1)} / ${(stats.gpuBudgetBytes / 1048576).toFixed(0)} MB`],
    ["Components", `${stats.componentTier}${stats.componentEvictions ? ` · ${stats.componentEvictions} evicted` : ""}`],
    ["Cache", stats.cache.enabled ? `${stats.cache.hits} hits · ${stats.cache.misses} misses · ${(stats.cache.bytes / 1048576).toFixed(0)} MB` : "off"],
    ["Frame", `${stats.frameIntervalMs.toFixed(1)} ms · p95 ${stats.frameIntervalP95Ms.toFixed(1)}`],
    ["CPU", `${stats.frameCpuMs.toFixed(2)} ms · p95 ${stats.frameCpuP95Ms.toFixed(2)}`],
    ["FPS", stats.fps.toFixed(0)],
  ];
  sceneStatsEl.innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}



// ----- system scene (SB2-31e) -------------------------------------------------
//
// The 3D tab with several boards (D-P2-25). Each board asset (one bundle) loads
// into its own renderer of a SceneRenderer and draws at every placement that
// uses it; placements without geometry draw as stand-in boxes. `board` is the
// board the selection belongs to, so everything the 3D tab does to "the board"
// (inspect, probe a net, frame, isolate) works on it unchanged, while the
// frame, picks, tiles, components and net emphasis run over every board.
// Each placement shows its own copper layers (D-P2-26).

const SYSTEM_SCENE_SCHEMA = "prism.system_scene.a0";

/** Loaded boards of the system scene; empty in the one-board view. */
function systemBoards() {
  return system ? [...system.boards.values()].filter((b) => b.renderer && b.loadState === "loaded") : [];
}

export async function mountSystemViewer(options = {}) {
  const token = beginViewerSession();
  selectionChangeCallback = typeof options.onSelectionChange === "function" ? options.onSelectionChange : null;
  contextMenuCallback = typeof options.onContextMenu === "function" ? options.onContextMenu : null;
  viewStateChangeCallback = typeof options.onViewStateChange === "function" ? options.onViewStateChange : null;
  viewerIsActive = typeof options.isActive === "function" ? options.isActive : () => true;
  legacyWorkspacesEnabled = false;
  state.gpuBudgetBytes = DEFAULT_GPU_BUDGET_BYTES;
  resolveDom(options.root || document);
  if (!appEl || !canvas) throw new Error("Semantic viewer shell is missing required DOM nodes");
  if (typeof options.loadBundle !== "function") throw new Error("A system scene needs a bundle loader");
  const scene = await SceneRenderer.create(canvas);
  if (!viewerSessionActive(token)) {
    scene.dispose();
    return null;
  }
  scene.setLodThresholds(readLodThresholds());
  system = {
    scene,
    loadBundle: options.loadBundle,
    onEmphasis: typeof options.onEmphasis === "function" ? options.onEmphasis : null,
    onMove: typeof options.onMove === "function" ? options.onMove : null,
    onHarness: typeof options.onHarness === "function" ? options.onHarness : null,
    // The host's descriptor; `descriptor` is what is shown (with an unsaved move preview).
    baseDescriptor: null,
    descriptor: null,
    move: initialMove(),
    gizmo: null,
    // A selected stand-in board (it has no board of its own), or null.
    standInKey: null,
    showLabels: true,
    // SB2-34: proxy harnesses from the descriptor, their lit wires, and the drawn overlay.
    harnesses: [],
    harnessLit: new Map(),
    showHarnesses: true,
    harnessDrawn: null,
    // SB2-44: tube segments of the harnesses whose ends can be posed, and those harnesses' keys.
    tubes: [],
    tubedHarnesses: new Set(),
    // SB2-45b: the picked harness `{key, segmentId, pointMm}`, its occurrences' world matrices,
    // and an unsaved node position `{harness, id, positionMm}` (level frame).
    harnessPick: null,
    worlds: new Map(),
    nodePreview: null,
    // SB2-47: housing models by GLB key, `{ state: "loading" | "ready" | "failed" }`.
    housingModels: new Map(),
    // SB2-30: when the first descriptor arrived and when every ready board was first drawn.
    timing: { descriptorAt: null, boardsDrawnAt: null },
    boards: new Map(),
    groups: new Map(),
    placed: [],
    placements: new Map(),
    // Placement path → copper layer ids that placement hides.
    hiddenLayers: new Map(),
    // Placement path → its stackup separation, 0…1 (SB2-31f).
    separation: new Map(),
    bounds: null,
    framed: false,
    snapped: false,
    boardSelected: false,
    inputs: new Map(),
    emphasisSets: [],
    emphasisBounds: new Map(),
    emphasisReport: null,
  };
  // No board is selected yet: an empty one stands in until a pick picks one.
  board = createBoard({ key: "" });
  camera = new CameraController([-0.1, -0.1, -0.01, 0.1, 0.1, 0.01]);
  renderControls();
  bindInteractions();
  bindPanelTabs();
  bindGizmoInteraction();
  statusEl.textContent = "System scene";
  scheduleFrame(token);
  return {
    setSystemScene,
    setNetEmphasis,
    frameNetEmphasis,
    frameAll() {
      if (system?.bounds) camera.frame(system.bounds);
    },
    setMoveAllowed,
    setMoveMode,
    setMoveSpace,
    previewPose,
    cancelMove,
    getMoveState: () => (system ? moveState() : null),
    targetHarnessNode,
    selectHarness,
    previewHarnessNode,
    cancelHarnessNode,
    getHarnessState: () => (system ? harnessState() : null),
    setLabelsVisible(visible) {
      if (!system) return;
      system.showLabels = Boolean(visible);
      if (systemLabelsEl) systemLabelsEl.hidden = !system.showLabels;
    },
    setHelpVisible: setSystemHelpVisible,
    isHelpVisible: () => Boolean(systemHelpEl && !systemHelpEl.hidden),
    setHarnessesVisible(visible) {
      if (!system) return;
      system.showHarnesses = Boolean(visible);
      system.harnessDrawn = null;
      placeSystem({ relabel: false });
    },
    frameBoard(key) {
      const item = system?.placements.get(String(key));
      if (item) camera.frame(item.worldBounds);
      return Boolean(item);
    },
    frameParts,
    setSelection(selection) {
      suppressSelectionChange = true;
      try {
        if (!selection) clearSelection();
        else selectInSystem(selection);
      } finally {
        suppressSelectionChange = false;
      }
    },
    resize() {
      system?.scene.resize();
    },
    setStatsOverlay,
    stats: sceneStats,
    setLodOverride(lod) {
      for (const b of systemBoards()) b.renderer.setLodOverride(lod);
    },
    setLodThresholds: setSystemLodThresholds,
    setGpuBudget(bytes) {
      const value = Number(bytes);
      state.gpuBudgetBytes = Number.isFinite(value) && value > 0 ? value : DEFAULT_GPU_BUDGET_BYTES;
      for (const b of system?.boards.values() || []) b.tiersCheckedAt = 0;
    },
    pickAt(clientX, clientY) {
      return pickHitAt(clientX, clientY);
    },
    pickSurfaceAt,
    focusMoveTarget,
    /** Look along a world axis from its + side (or its − side), framing the scene (SB2-48b's face buttons). */
    viewAxis(axis, opposite = false) {
      if (!system || !["x", "y", "z"].includes(axis)) return;
      camera.setAxis(axis, Boolean(opposite));
      if (system.bounds) camera.frame(system.bounds);
    },
    projectPoint(point, occurrenceKey) {
      return projectPlacementPoint(point, occurrenceKey);
    },
    projectComponent(reference, occurrenceKey) {
      const item = system?.placements.get(String(occurrenceKey));
      if (!item?.board) return null;
      return projectComponentCenter(item.board, reference, (local) => projectPlacementPoint(local, occurrenceKey));
    },
    getViewState: pcbViewState,
    setLayerVisible,
    applyLayerPreset,
    setShowBoard,
    setShowComponents,
    setShowPlaceholders,
    setRealisticColors,
    setSeparation,
    setNetIsolation,
    showNetLayers,
    dispose() {
      disposeViewerSession(token);
    },
  };
}

/**
 * Show a `prism.system_scene.a0` descriptor (CONTRACTS_P2 §20). Boards already
 * loaded are kept; newly ready ones start loading.
 */
function setSystemScene(descriptor) {
  if (!system) return;
  if (descriptor?.schema !== SYSTEM_SCENE_SCHEMA) {
    throw new Error(`Unsupported system scene schema: ${descriptor?.schema || "missing"}`);
  }
  system.baseDescriptor = descriptor;
  system.timing.descriptorAt ??= performance.now();
  // A preview the host has now saved is simply the new state; any other survives re-reads.
  const target = system.move.target ? descriptor.occurrences.find((item) => item.path === system.move.target) : null;
  if (!target) {
    system.move.drag = null;
    system.move.preview = null;
    system.move.target = null;
  } else if (!system.move.drag && samePose(system.move.preview, target.pose)) system.move.preview = null;
  system.descriptor = shownDescriptor();
  system.harnesses = Array.isArray(descriptor.harnesses) ? descriptor.harnesses : [];
  system.harnessDrawn = null;
  const live = new Set();
  for (const asset of descriptor.assets || []) {
    live.add(asset.assetId);
    const known = system.boards.get(asset.assetId);
    const transition = boardTransition(known, asset);
    if (transition !== "create") {
      known.asset = asset;
      // A staged bundle that became ready at the same URL loads now (retro D5).
      if (transition === "load") void loadSystemBoard(known, activeViewerToken);
      continue;
    }
    if (known) dropSystemBoard(asset.assetId);
    const b = createBoard({ key: asset.assetId, topology: {}, semanticGeometry: {}, deferComponents: true });
    Object.assign(b, { asset, bundleUrl: asset.bundleUrl, loadState: "waiting", abort: null });
    system.boards.set(asset.assetId, b);
    if (assetLoadable(asset)) void loadSystemBoard(b, activeViewerToken);
  }
  for (const id of [...system.boards.keys()]) if (!live.has(id)) dropSystemBoard(id);
  placeSystem();
  syncHarnessPick();
  if (system.move.enabled) {
    retargetMove({ quiet: true });
    // The host re-read the scene (after a save, or while bundles build): let it show the saved state.
    emitMove("sync");
  }
}

function dropSystemBoard(id) {
  const b = system.boards.get(id);
  b?.abort?.abort();
  system.boards.delete(id);
  system.scene.removeAsset(id);
  if (b) b.renderer = null;
  if (board === b) unfocusBoard();
}

/** One board's bundle, manifest and board tier; copper tiles and components follow the view. */
async function loadSystemBoard(b, token) {
  b.loadState = "loading";
  b.abort = new AbortController();
  const current = () => viewerSessionActive(token) && system?.boards.get(b.key) === b && !b.abort.signal.aborted;
  try {
    const loaded = await system.loadBundle(b.bundleUrl, b.abort.signal);
    if (!current()) return;
    b.topology = loaded.topology || {};
    if (!b.topology.net_details) b.topology.net_details = buildNetDetails(b.topology);
    b.semanticGeometry = loaded.semanticGeometry || {};
    b.viewerReadiness = loaded.readiness || b.semanticGeometry.readiness || { stage: "semantic-ready", progress: 100 };
    b.assetCache = loaded.assetCache || null;
    if (!(await indexBoardScene(b, token)) || !current()) return;
    b.renderer = system.scene.asset(b.key);
    b.renderer.setBarrels(b.scene.manifest.barrels || []);
    applyCopperColors(b);
    const bounds = await loadBoard(token, b);
    if (!current()) return;
    b.scene.runtimeBounds = bounds || runtimeBoundsFromGltf(b.scene.manifest.bbox);
    b.renderer.setBoardBounds(b.scene.runtimeBounds);
    b.loadState = "loaded";
    placeSystem();
  } catch (error) {
    if (!current()) return;
    console.warn(`[prism-semantic-viewer] system board ${b.key} failed to load`, error);
    b.loadState = "failed";
    b.error = error?.message || String(error);
    system.scene.removeAsset(b.key);
    b.renderer = null;
    if (board === b) unfocusBoard();
    placeSystem();
  }
}

/** Place every drawn occurrence: at its board's renderer, or as a stand-in box. */
function placeSystem({ relabel = true } = {}) {
  const descriptor = system?.descriptor;
  if (!descriptor) return;
  // Harness anchors follow the boards (loaded, moved, previewed).
  system.harnessDrawn = null;
  const selectedKey = selectedPlacementKey();
  const assetsById = new Map((descriptor.assets || []).map((asset) => [asset.assetId, asset]));
  const groups = new Map();
  const placed = [];
  for (const occurrence of drawnOccurrences(descriptor)) {
    const asset = occurrence.assetId ? assetsById.get(occurrence.assetId) : null;
    const b = occurrence.assetId ? system.boards.get(occurrence.assetId) : null;
    const own = occurrence.kind !== "board" && !occurrence.restricted ? ownGeometry(occurrence) : null;
    if (own) {
      if (!groups.has(own.rendererId)) groups.set(own.rendererId, []);
      groups.get(own.rendererId).push({ matrix: own.matrix, key: occurrence.path, hiddenLayers: [], explode: null });
      placed.push({ occurrence, rendererId: own.rendererId, board: null, matrix: own.matrix, worldBounds: own.worldBounds,
        standIn: null, own: own.kind, primitives: own.primitives });
      continue;
    }
    if (occurrence.model || occurrence.box) continue; // its model is still loading and it has no box
    const kind = standInKind(occurrence, asset, b?.loadState);
    let rendererId;
    let matrix;
    let worldBounds;
    if (!kind) {
      rendererId = b.key;
      matrix = assetOccurrenceMatrix(occurrence.worldMatrix, asset.bundleToBoard);
      worldBounds = transformBounds(matrix, b.scene.runtimeBounds);
    } else {
      if (!occurrence.boundsMm) continue; // no box known yet (no PCB or no interface)
      rendererId = `stand-in:${kind}`;
      system.scene.standIn(rendererId, STAND_INS[kind].color);
      matrix = standInMatrix(occurrence.worldMatrix, occurrence.boundsMm);
      worldBounds = transformBounds(matrix, [0, 0, 0, 1, 1, 1]);
    }
    if (!groups.has(rendererId)) groups.set(rendererId, []);
    groups.get(rendererId).push({
      matrix,
      key: occurrence.path,
      hiddenLayers: kind ? [] : [...(system.hiddenLayers.get(occurrence.path) || [])],
      explode: kind ? null : explodeFor(b, system.separation.get(occurrence.path) || 0),
    });
    placed.push({ occurrence, rendererId, board: kind ? null : b, matrix, worldBounds, standIn: kind });
  }
  const harnessed = computeHarnessScene();
  placeHousings(groups, harnessed.housings);
  // Renderers no longer used draw nothing.
  for (const id of system.scene.assets.keys()) if (!groups.has(id)) groups.set(id, []);
  system.scene.setOccurrences(groups);
  system.groups = groups;
  const previous = system.placements;
  system.placed = placed;
  system.placements = new Map(placed.map((item) => [item.occurrence.path, item]));
  if (relabel || !previous) renderSystemLabels();
  else for (const item of placed) item.label = previous.get(item.occurrence.path)?.label;
  system.bounds = mergeBounds(placed.map((item) => item.worldBounds));
  if (system.bounds) {
    camera.sceneRadius = boundsRadius(system.bounds);
    // The opening view follows the boards as they load (a box while loading is
    // not the board's size), until every board is in or the reviewer moves.
    if (!system.framed) {
      camera.frame(system.bounds);
      if (!system.snapped) camera.snap();
      system.snapped = true;
      if (!placed.some((item) => item.standIn === "loading")) system.framed = true;
    }
  }
  for (const b of systemBoards()) refreshBoardLayers(b);
  // The selection follows its placement to its new slot, or goes with it.
  if (selectedKey != null) {
    const item = system.placements.get(selectedKey);
    if (item?.board === board) state.selectedOccurrence = board.renderer.occurrenceKeys.indexOf(selectedKey);
    else unfocusBoard();
  }
  refreshSystemTubes(harnessed);
  applySystemEmphasis();
  notifyViewStateChange();
}

// ----- harness tubes (SB2-44) -----------------------------------------------------

const HARNESS_RGB = [0.17, 0.18, 0.2];
const PICKED_RGB = [0.24, 0.39, 0.87]; // the picked harness (SB2-45b), the move gizmo's Z blue
const COLLIDING_RGB = [0.9, 0.28, 0.3]; // a segment through a board (SB2-46, SYS-V12), the gizmo's X red

/** Rebuild the tubes from the shown descriptor's placements (a load, a move, a drag preview). */
/** The harnesses' tubes and end housings for the shown placements (with an unsaved node move). */
function computeHarnessScene() {
  system.worlds = new Map(system.descriptor.occurrences.map((occurrence) => [occurrence.path, occurrence.worldMatrix]));
  if (!system.showHarnesses || !system.harnesses.length) return { tubes: [], housings: [] };
  try {
    // SB2-46: boards as boxes (outline × thickness) for the collision check (§17.10).
    const boards = system.descriptor.occurrences
      .filter((occurrence) => occurrence.kind === "board" && occurrence.boundsMm)
      .map((occurrence) => ({ id: occurrence.path, matrix: occurrence.worldMatrix, ...occurrence.boundsMm }));
    return harnessScene(withNodePreview(system.harnesses, system.nodePreview, harnessKey), worldMatrixOf, boards);
  } catch (error) {
    console.warn("[prism-semantic-viewer] harness geometry failed", error);
    return { tubes: [], housings: [] };
  }
}

/** Rebuild the tubes (a node preview needs only these; a placement change passes what it computed). */
function refreshSystemTubes(computed = null) {
  if (!system?.descriptor) return;
  const tubes = (computed ?? computeHarnessScene()).tubes;
  system.tubes = tubes;
  system.tubedHarnesses = new Set(tubes.map((tube) => tube.harness));
  system.scene.setTubes(tubes, tubeColor);
}

// ----- housings at harness ends (SB2-47) -------------------------------------------
//
// An end with a part model draws the model (catalog GLB, under its alignment);
// any other end, or a model still loading or that failed, draws a proxy box.

const HOUSING_PROXY_RGBA = [0.42, 0.45, 0.5, 1];
// Geometer's GLBs keep the STEP's axes (z up) in metres; the loader reads glTF's
// y-up as z-up ((x, y, z) → (x, −z, y)). This undoes both: loader space → STEP mm.
const GLB_TO_STEP_MM = Object.freeze([1000, 0, 0, 0, 0, 0, -1000, 0, 0, 1000, 0, 0, 0, 0, 0, 1]);

function housingInputs(now) {
  return { ...standInInputs(now), showBoard: false, showComponents: true };
}

/** Inputs for a renderer the boards' frame inputs don't cover: a housing model, or a stand-in box. */
function extraInputs(renderer, now) {
  return renderer.housing ? housingInputs(now) : standInInputs(now);
}

/**
 * An occurrence's own geometry (SB2-48b): a catalog model (`model: {glbKey, matrixMm, boundsMm}`, the
 * GLB placed in the occurrence frame by `matrixMm`, its proxy box while it loads) or a coloured box
 * (`box: {boundsMm, rgba}`). Null for an occurrence with neither.
 */
function ownGeometry(occurrence) {
  if (occurrence.model?.glbKey) {
    const placedModel = mat4Multiply(occurrence.worldMatrix, occurrence.model.matrixMm || IDENTITY);
    const entry = system.housingModels.get(occurrence.model.glbKey);
    if (!entry) void loadHousingModel(occurrence.model.glbKey);
    if (entry?.state === "ready") {
      const matrix = assetOccurrenceMatrix(placedModel, GLB_TO_STEP_MM);
      return { kind: "model", rendererId: `housing:${occurrence.model.glbKey}`, matrix,
        worldBounds: transformBounds(matrix, entry.bounds), primitives: entry.primitives };
    }
    if (occurrence.model.boundsMm) {
      system.scene.standIn("housing:proxy", HOUSING_PROXY_RGBA);
      const matrix = standInMatrix(placedModel, occurrence.model.boundsMm);
      return { kind: "model", rendererId: "housing:proxy", matrix, worldBounds: transformBounds(matrix, [0, 0, 0, 1, 1, 1]) };
    }
  }
  if (occurrence.box?.boundsMm) {
    const rgba = occurrence.box.rgba || HOUSING_PROXY_RGBA;
    const rendererId = boxRendererId(rgba);
    system.scene.standIn(rendererId, rgba);
    const matrix = standInMatrix(occurrence.worldMatrix, occurrence.box.boundsMm);
    return { kind: "box", rendererId, matrix, worldBounds: transformBounds(matrix, [0, 0, 0, 1, 1, 1]) };
  }
  return null;
}

/** Add each housing to the occurrence groups (a model's renderer once its GLB is in, else a proxy box). */
function placeHousings(groups, housings) {
  const push = (id, entry) => {
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ ...entry, hiddenLayers: [], explode: null });
  };
  for (const item of housings) {
    const key = `housing:${item.key}`;
    const model = item.model ? system.housingModels.get(item.model.glbKey) : null;
    if (item.model && !model) void loadHousingModel(item.model.glbKey);
    if (model?.state === "ready") {
      push(`housing:${item.model.glbKey}`, { key, matrix: assetOccurrenceMatrix(item.matrix, GLB_TO_STEP_MM) });
      continue;
    }
    system.scene.standIn("housing:proxy", HOUSING_PROXY_RGBA);
    // A model's own bounds while it loads (or if it failed); the unit box of a proxy otherwise.
    const bounds = item.model ? item.model.boundsMm : { minMm: [0, 0, 0], maxMm: [1, 1, 1] };
    push("housing:proxy", { key, matrix: standInMatrix(item.matrix, bounds) });
  }
}

/** Fetch a housing GLB once and give it a renderer; the scene is placed again when it is in. */
async function loadHousingModel(glbKey) {
  system.housingModels.set(glbKey, { state: "loading" });
  const token = activeViewerToken;
  try {
    const loaded = await loadGltf(new URL(`/api/catalog/models/${encodeURIComponent(glbKey)}.glb`, location.href).toString(),
      { fetchCache: "force-cache" });
    if (!viewerSessionActive(token) || !system) return;
    const renderer = system.scene.asset(`housing:${glbKey}`);
    renderer.housing = true;
    renderer.setLodOverride(LOD_FULL);
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const primitive of loaded.primitives) {
      for (let k = 0; k < 3; k += 1) {
        bounds[k] = Math.min(bounds[k], primitive.bounds[k]);
        bounds[k + 3] = Math.max(bounds[k + 3], primitive.bounds[k + 3]);
      }
      renderer.addPrimitive(primitive, { kind: "component", layerId: 0, material: primitive.material, color: primitive.material.baseColor });
    }
    if (loaded.primitives.length) renderer.setBoardBounds(bounds);
    // The triangles stay for surface picks on model occurrences (SB2-48b); housings never pick them.
    system.housingModels.set(glbKey, { state: "ready", bounds, primitives: loaded.primitives });
  } catch (error) {
    console.warn("[prism-semantic-viewer] housing model failed", glbKey, error);
    if (system) system.housingModels.set(glbKey, { state: "failed" });
  }
  if (system?.descriptor) placeSystem({ relabel: false });
}

function worldMatrixOf(path) {
  return system.worlds.get(path) ?? null;
}

/** A tube's colour: a lit wire's set colour, dimmed while another net is lit, the picked harness in blue, else grey. */
function tubeColor(tube) {
  const lit = system.harnessLit.get(tube.harness);
  const color = lit ? tube.wires.map((wire) => lit.get(wire)).find(Boolean) : null;
  if (color) return { rgb: hexColor(color), mode: 1 };
  if (tube.collides.length) return { rgb: COLLIDING_RGB, mode: 0 };
  if (system.harnessPick?.key === tube.harness) return { rgb: PICKED_RGB, mode: 0 };
  return { rgb: HARNESS_RGB, mode: system.emphasisSets.length ? 2 : 0 };
}

function hexColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value));
  if (!match) return HARNESS_RGB;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** The placement path the selection belongs to, or null. */
function selectedPlacementKey() {
  if (!system || !board.renderer || !hasSystemSelection()) return null;
  return board.renderer.occurrenceKeys[state.selectedOccurrence] ?? null;
}

function hasSystemSelection() {
  return Boolean(state.selectedFeatureId || state.activeNetId || system?.boardSelected);
}

/** Make `b` the board the selection belongs to; a selection on another board goes. */
function focusBoard(b) {
  if (board === b) return;
  const quiet = suppressSelectionChange;
  suppressSelectionChange = true;
  try {
    clearSelection();
  } finally {
    suppressSelectionChange = quiet;
  }
  board = b;
  refreshControls();
}

/** The selected board went away (dropped, failed or no longer placed): clear and stand down. */
function unfocusBoard() {
  clearSelection();
  board = createBoard({ key: "" });
  refreshControls();
}

// ----- frame ------------------------------------------------------------------

function frameSystem(now, token) {
  const frameStarted = performance.now();
  const frameInterval = Math.max(0, now - lastFrame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  camera.update(dt);
  system.scene.resize();
  panel = {
    layerId: 0,
    viewport: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    matrix: camera.matrix(canvas.width, canvas.height, false),
    // Thresholds are in CSS pixels, so a 2× screen does not keep every board at full detail (SB2-30a).
    lod: cameraLod(canvas.height / Math.min(devicePixelRatio || 1, 2), false),
  };
  const emphasis = anyEmphasis();
  const inputs = new Map();
  for (const b of systemBoards()) {
    // Each placement explodes itself (SB2-31f): the renderer holds per-layer steps, each occurrence its gap.
    const layerZOffsets = stackupSteps(b);
    if (b.scene.copperRealism !== copperRealism()) applyCopperColors(b);
    // As on the 3D tab (SB2-85): all inner copper once the board is exploded or hidden, else only lit nets'.
    b.renderer.setInnerCopperMode(innerCopperMode(!state.showBoard || boardSeparated(b), litNetIds(b).size > 0));
    // Copper of boards with nothing lit dims too while any net is lit anywhere.
    b.renderer.dimCopper = emphasis;
    scheduleTileResidency(now, {}, b);
    const selected = b === board;
    inputs.set(b.renderer, {
      activeNetId: selected ? state.activeNetId : 0,
      selectedFeatureId: selected ? state.selectedFeatureId : 0,
      time: now / 1000,
      layerOffsets: layerZOffsets,
      visibleLayers: b.visible3dLayers,
      showBoard: state.showBoard,
      showComponents: state.showComponents,
      // Paste, parts and mask opacity follow each placement's own separation (explodeFor).
      showPaste: true,
      componentOpacity: 1,
      boardOpacity: emphasis ? 0.34 : 1,
      isolateNet: state.isolateNet,
      compareMode: false,
      compareOffsets: new Map(),
      layerAlphas: null,
      visibleTileIds: b.visibleTileIds,
    });
  }
  system.inputs = inputs;
  system.scene.setSelectedOccurrence(board.renderer && hasSystemSelection() ? board.renderer.occurrenceBase + state.selectedOccurrence : -1);
  // As on the 3D tab (R1): an idle view skips the GPU work; labels follow the picture.
  if (systemFrameNeedsRender(now, inputs, emphasis)) {
    system.scene.render(panel, (renderer) => inputs.get(renderer) || extraInputs(renderer, now));
    drawGizmo();
    updateSystemLabels();
  }
  updateSystemHarnesses();
  updateHarnessNodes();
  updateMoveGizmo();
  if (system.timing.boardsDrawnAt == null && allReadyBoardsDrawn(system.placed)) system.timing.boardsDrawnAt = performance.now();
  for (const b of systemBoards()) manageTiers(now, b);
  recordFrameSample(frameInterval, performance.now() - frameStarted);
  updateDiagnostics(now);
  scheduleFrame(token);
}

// Stand-in boxes draw no entries; they only need valid options.
function standInInputs(now) {
  return {
    activeNetId: 0,
    selectedFeatureId: 0,
    time: now / 1000,
    visibleLayers: new Set(),
    showBoard: true,
    showComponents: false,
    componentOpacity: 1,
    boardOpacity: 1,
    isolateNet: false,
  };
}

// ----- picking and selection ----------------------------------------------------

function pickSystem(x, y) {
  const now = performance.now();
  return system.scene.pick(panel, x, y, (renderer) => system.inputs.get(renderer) || extraInputs(renderer, now));
}

/** A click in the system scene: a feature or a board's body selects on that board. */
function selectSystemHit(hit) {
  // A housing (SB2-47) picks its harness, on the segment leaving that end.
  const housing = typeof hit.occurrenceKey === "string" && hit.occurrenceKey.startsWith("housing:")
    ? hit.occurrenceKey.slice("housing:".length) : null;
  if (housing) {
    const cut = housing.lastIndexOf("/");
    const [key, end] = [housing.slice(0, cut), housing.slice(cut + 1)];
    const tube = system.tubes.find((item) => item.harness === key && (item.from === end || item.to === end));
    if (tube) pickHarness({ key, segmentId: tube.segmentId, pointMm: null });
    else clearSelection();
    return;
  }
  const item = hit.occurrenceKey != null ? system.placements.get(hit.occurrenceKey) : null;
  if (!item) return clearSelection();
  if (item.standIn || item.own) return selectStandIn(item); // a box or a catalog model selects as itself
  const b = item.board;
  // Isolated, only lit copper draws: a hit on anything else is a click on empty space.
  if (state.isolateNet && !litFeatureAt(b, item.occurrence.path, hit.featureId)) return clearSelection();
  focusBoard(b);
  state.selectedOccurrence = b.renderer.occurrenceKeys.indexOf(item.occurrence.path);
  // Moving boards, a click picks the board and leaves the camera where it is.
  if (hit.featureId && !system.move.enabled) selectFeature(hit.featureId, true);
  else selectBoardContext();
}

/** The host selects in the system: `{ occurrence, featureId | reference | netName | netId }` or the board alone. */
function selectInSystem(selection) {
  const item = selection.occurrence != null ? system?.placements.get(String(selection.occurrence)) : null;
  if (!item) return;
  if (item.standIn || item.own) {
    selectStandIn(item);
    return;
  }
  focusBoard(item.board);
  state.selectedOccurrence = board.renderer.occurrenceKeys.indexOf(item.occurrence.path);
  if (selection.netName || selection.netUid) {
    const match = (selection.netUid && board.scene.nets.find((net) => net.uid === selection.netUid))
      || (selection.netName && findNetByName(board.scene.nets, selection.netName));
    if (match) selectNet(Number(match.id), true);
  } else if (selection.netId) selectNet(Number(selection.netId), true);
  else if (selection.featureId) selectFeature(Number(selection.featureId), true);
  else if (selection.reference) selectComponentReference(String(selection.reference), true);
  else selectBoardContext();
}

// A board without geometry (restricted, still building) is selectable as itself.
function selectStandIn(item) {
  const quiet = suppressSelectionChange;
  suppressSelectionChange = true;
  try {
    clearSelection();
  } finally {
    suppressSelectionChange = quiet;
  }
  system.standInKey = item.occurrence.path;
  if (system.move.enabled) retargetMove();
  if (!suppressSelectionChange) {
    selectionChangeCallback?.({ kind: "board", sourceContext: "3D", occurrence: item.occurrence.path, standIn: item.standIn });
  }
}

/** Whether a feature of a placement is copper of a net lit there. */
function litFeatureAt(b, key, featureId) {
  const netId = Number(b.scene.features.get(Number(featureId))?.netId) || 0;
  if (!netId) return false;
  const local = b.renderer.occurrenceKeys.indexOf(key);
  if (local < 0) return false;
  if (b.renderer.occurrenceEmphasis?.[local]?.has(netId)) return true;
  return b === board && local === state.selectedOccurrence && netId === Number(state.activeNetId);
}

function projectPlacementPoint(local, key) {
  const item = system?.placements.get(String(key));
  return item ? projectBoardPoint(local, item.matrix) : null;
}

// ----- layers per placement -----------------------------------------------------

/** Net ids lit on a board: the inspected net and, in a system, the system nets at any placement. */
function litNetIds(b = board) {
  if (!system) return emphasizedNetIds();
  const ids = new Set(b === board ? emphasizedNetIds() : []);
  for (const row of b.renderer?.occurrenceEmphasis || []) {
    if (row) for (const id of row.keys()) ids.add(Number(id));
  }
  return ids;
}

/**
 * The layers a system board draws and keeps tiles for: those some placement
 * shows, and while isolated only the lit nets' layers among them.
 */
function refreshBoardLayers(b) {
  const placements = system.groups.get(b.key) || [];
  const shown = new Set();
  for (const layer of b.scene.copperLayers) {
    const id = Number(layer.id);
    if (placements.some((item) => !(system.hiddenLayers.get(item.key)?.has(id)))) shown.add(id);
  }
  if (state.isolateNet) {
    const lit = new Set();
    for (const netId of litNetIds(b)) for (const id of layersForNet(netId, b)) lit.add(id);
    b.visible3dLayers = new Set([...shown].filter((id) => lit.has(id)));
  } else {
    b.visible3dLayers = shown;
  }
  scheduleTileResidency(performance.now(), { force: true }, b);
}

/** Show or hide copper layers of placements (`keys`), or of every placement of the selected board. */
function setPlacementLayers(keys, update) {
  const targets = keys ?? (system.groups.get(board.key) || []).map((item) => item.key);
  for (const key of targets) {
    const hidden = new Set(system.hiddenLayers.get(String(key)) || []);
    update(hidden, system.placements.get(String(key))?.board);
    system.hiddenLayers.set(String(key), hidden);
  }
  for (const b of systemBoards()) {
    const list = system.groups.get(b.key) || [];
    for (const item of list) item.hiddenLayers = [...(system.hiddenLayers.get(item.key) || [])];
    b.renderer.setOccurrenceHiddenLayers(list.map((item) => item.hiddenLayers));
    refreshBoardLayers(b);
  }
  refreshControls();
  notifyViewStateChange();
}

/** Net layers on the placement holding the inspected net: only the copper layers it uses stay shown. */
function showPlacementNetLayers() {
  const key = selectedPlacementKey();
  if (key == null || !state.activeNetId) return;
  const used = layersForNet(state.activeNetId, board);
  if (!used.size) return;
  setPlacementLayers([key], (hidden) => {
    hidden.clear();
    for (const layer of board.scene.copperLayers) if (!used.has(Number(layer.id))) hidden.add(Number(layer.id));
  });
}

// ----- separation per placement (SB2-31f) ----------------------------------------

/** Copper layer steps from the board's middle (the 3D tab's offsets for a gap of one). */
function stackupSteps(b) {
  if (b.scene.layerSteps) return b.scene.layerSteps;
  const steps = new Float32Array(256);
  const middle = (b.scene.copperLayers.length - 1) / 2;
  b.scene.copperLayers.forEach((layer, index) => {
    steps[Number(layer.id)] = middle - index;
  });
  b.scene.layerSteps = steps;
  return steps;
}

/** One placement's separation as its occurrence record carries it: the board 3D tab's rules. */
function explodeFor(b, separation) {
  const bounds = b?.scene.runtimeBounds;
  const diagonal = bounds ? Math.hypot((bounds[3] - bounds[0]) * 1000, (bounds[4] - bounds[1]) * 1000) : 0;
  const gap = separation * separation * clamp(diagonal * 0.12, 8, 25) / 1000;
  return [gap, separation < 0.0999 ? 1 : 0, 1 - separation * 0.72, 1];
}

function boardSeparated(b) {
  return (system.groups.get(b.key) || []).some((item) => (system.separation.get(item.key) || 0) > 0.001);
}

/** Set one placement's separation, or every placement of the selected board's. */
function setPlacementSeparation(value, placementKey) {
  const keys = placementKey != null ? [String(placementKey)] : (system.groups.get(board.key) || []).map((item) => item.key);
  for (const key of keys) system.separation.set(key, value);
  for (const b of systemBoards()) {
    const list = system.groups.get(b.key) || [];
    b.renderer.setOccurrenceExplode(list.map((item) => explodeFor(b, system.separation.get(item.key) || 0)));
  }
  notifyViewStateChange();
}

/** The per-board layer sections for a host that renders the controls (D-P2-26). */
function systemBoardViews() {
  // A module (own geometry, SB2-50) has no PCB layers: no section.
  return system.placed.filter((item) => !item.own).map((item) => {
    const hidden = system.hiddenLayers.get(item.occurrence.path) || new Set();
    const b = item.board;
    return {
      key: item.occurrence.path,
      name: item.occurrence.displayPath || item.occurrence.path,
      standIn: item.standIn || null,
      separation: system.separation.get(item.occurrence.path) || 0,
      layers: b
        ? b.scene.copperLayers.map((layer) => ({
          id: Number(layer.id),
          name: String(layer.name),
          color: rgbCss(layerColor(layer, b)),
          visible: !hidden.has(Number(layer.id)),
        }))
        : [],
    };
  });
}

// ----- net emphasis (SB2-31) ----------------------------------------------------

/**
 * Light system nets: `sets` is `[{ key, color?, members: [{ occurrence, net }] }]`,
 * a member being a board placement path and that board's net name. Each set
 * takes its `color` ("#rrggbb" or [r, g, b]) or the next palette colour. As
 * the 3D tab's net probe, the boards' bodies and components hide while any net
 * is lit and unlit copper dims; I isolates the lit copper. Returns the report
 * (also sent to `onEmphasis` whenever boards load): per set, its colour, how
 * many members lit, and those that could not (not drawn, still loading,
 * restricted, or a net the board's 3D model doesn't have).
 */
function setNetEmphasis(sets) {
  if (!system) return [];
  const hadEmphasis = anyEmphasis();
  system.emphasisSets = (Array.isArray(sets) ? sets : []).map((set, index) => {
    const mark = packEmphasisColor(set?.color ?? EMPHASIS_PALETTE[index % EMPHASIS_PALETTE.length]);
    return {
      key: String(set?.key ?? index),
      mark,
      color: `#${(mark & 0xffffff).toString(16).padStart(6, "0")}`,
      members: (Array.isArray(set?.members) ? set.members : [])
        .filter((member) => member && typeof member.occurrence === "string" && typeof member.net === "string"),
      // SB2-34: harness wires the net runs through, `{harness, wire, occurrence?}`.
      wires: (Array.isArray(set?.wires) ? set.wires : [])
        .filter((ref) => ref && typeof ref.harness === "string" && typeof ref.wire === "string"),
    };
  });
  const report = applySystemEmphasis();
  const hasEmphasis = anyEmphasis();
  if (hasEmphasis && !hadEmphasis) applyNetProbeVisibility();
  else if (!hasEmphasis && hadEmphasis) {
    if (state.isolateNet) setNetIsolation(false);
    restoreViewVisibilityPrefs();
  }
  if (state.isolateNet && hasEmphasis) applyNetIsolationLayers();
  return report;
}

function applySystemEmphasis() {
  if (!system) return [];
  const rows = new Map();
  for (const [id, list] of system.groups) rows.set(id, list.map(() => null));
  const localIndex = new Map();
  for (const list of system.groups.values()) list.forEach((entry, index) => localIndex.set(entry.key, index));
  system.emphasisBounds = new Map();
  const report = system.emphasisSets.map((set) => {
    const result = { key: set.key, color: set.color, lit: 0, unresolved: [] };
    const boxes = [];
    system.emphasisBounds.set(set.key, boxes);
    for (const member of set.members) {
      const item = system.placements.get(member.occurrence);
      const b = item?.board;
      if (!b && item?.own) {
        // A module's pin (SB2-50): the signal reaches the drawn module; it frames with the set.
        result.lit += 1;
        if (item.worldBounds) boxes.push({ occurrence: member.occurrence, box: item.worldBounds });
        continue;
      }
      if (!b) {
        const reason = !item ? "not-drawn"
          : item.standIn === "loading" || item.standIn === "building" ? "loading"
            : item.standIn === "restricted" ? "restricted" : "not-drawn";
        result.unresolved.push({ occurrence: member.occurrence, net: member.net, reason });
        continue;
      }
      const net = findNetByName(b.scene.nets, member.net);
      const netId = Number(net?.id) || 0;
      if (!netId) {
        result.unresolved.push({ occurrence: member.occurrence, net: member.net, reason: "unknown-net" });
        continue;
      }
      const list = rows.get(b.key);
      const index = localIndex.get(member.occurrence);
      if (!list || index == null) continue;
      list[index] = list[index] || new Map();
      // The first set to claim a net keeps its colour.
      if (!list[index].has(netId)) list[index].set(netId, set.mark);
      result.lit += 1;
      const local = runtimeBounds(net.boundsMm);
      if (local) boxes.push({ occurrence: member.occurrence, box: transformBounds(item.matrix, local) });
    }
    return result;
  });
  system.harnessLit = litHarnessWires(system.harnesses, system.emphasisSets);
  system.harnessDrawn = null;
  system.scene.setTubeColors(tubeColor);
  for (const result of report) {
    result.wires = 0;
    for (const wires of system.harnessLit.values()) for (const color of wires.values()) if (color === result.color) result.wires += 1;
  }
  const lit = system.emphasisSets.length > 0;
  for (const b of systemBoards()) b.renderer.setOccurrenceEmphasis(lit ? rows.get(b.key) || null : null, { dimCopper: lit });
  if (state.isolateNet) for (const b of systemBoards()) refreshBoardLayers(b);
  const changed = JSON.stringify(report) !== JSON.stringify(system.emphasisReport);
  system.emphasisReport = report;
  if (changed) system.onEmphasis?.(report);
  return report;
}

/**
 * Frame the copper a lit set covers (by key, or every set), on one placement
 * (by path) or on all, as the 3D tab frames a net: its own box, no padding.
 * False when nothing is lit there.
 */
function frameNetEmphasis(key = null, occurrence = null) {
  const boxes = [];
  for (const [setKey, list] of system?.emphasisBounds || []) {
    if (key != null && setKey !== String(key)) continue;
    for (const lit of list) if (occurrence == null || lit.occurrence === occurrence) boxes.push(lit.box);
  }
  const bounds = mergeBounds(boxes);
  if (!bounds) return false;
  camera.frame(bounds);
  return true;
}

/**
 * Frame parts on their placements (SB2-32: a hop of a traced net, its two
 * connectors): `[{ occurrence, reference }]`. Parts not drawn are skipped;
 * false when none is.
 */
/** Frame components by `{occurrence, reference}`; a part with no reference frames its whole occurrence (SB2-108). */
function frameParts(parts) {
  const boxes = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    const item = system?.placements.get(String(part?.occurrence));
    if (item && !part?.reference) {
      if (item.worldBounds) boxes.push(item.worldBounds);
      continue;
    }
    const component = item?.board?.scene.componentFeatures.get(String(part?.reference));
    const bounds = component ? item.board.scene.features.get(Number(component.featureId))?.bounds : null;
    if (bounds) boxes.push(transformBounds(item.matrix, bounds));
  }
  const bounds = mergeBounds(boxes);
  if (!bounds) return false;
  camera.frame(bounds);
  return true;
}

// ----- move mode (SB2-29, in this viewer since SB2-31f) ------------------------
//
// Move mode only previews: the gizmo or the host's numeric panel shows a pose
// over the host's descriptor; releasing a handle or Enter sends "commit", and
// the host saves the pose and gives back the re-read scene (or calls
// `cancelMove` when the save fails). The target is the top-level instance of
// the selected board.

const MOVE_MM = 0.001; // descriptor millimetres → renderer metres
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

function initialMove() {
  // `node`: a harness node the gizmo moves instead of a board (SB2-45b), or null.
  // `route` (D-P2-51): move mode for harness routes only; boards never take the gizmo.
  return { allowed: false, enabled: false, route: false, space: "world", target: null, preview: null, drag: null, node: null };
}

/** The host's descriptor with the unsaved preview pose applied. */
function shownDescriptor() {
  const base = system.baseDescriptor;
  if (!base || !system.move.target || !system.move.preview) return base;
  return moveDescriptor(base, system.move.target, system.move.preview);
}

/** Re-place everything after the preview changed (geometry only; boards stay loaded). */
function refreshPreview() {
  if (!system.baseDescriptor) return;
  system.descriptor = shownDescriptor();
  placeSystem({ relabel: false });
}

function moveTargetOccurrence() {
  const path = system.move.target;
  return path ? system.baseDescriptor?.occurrences.find((item) => item.path === path) ?? null : null;
}

/** What the host needs to show and save: the target and its pose (the preview when there is one). */
function moveState() {
  const move = system.move;
  const target = moveTargetOccurrence();
  return {
    allowed: move.allowed,
    enabled: move.enabled,
    route: move.route,
    space: move.space,
    dragging: Boolean(move.drag),
    target: target ? {
      occurrence: target.path,
      instanceId: target.instanceId,
      displayPath: target.displayPath,
      kind: target.kind,
      restricted: Boolean(target.restricted),
      pose: canonicalPose(move.preview ?? target.pose),
      source: move.preview ? "manual" : target.pose?.source ?? "default",
      unsaved: Boolean(move.preview),
    } : null,
  };
}

function emitMove(phase) {
  system.onMove?.({ phase, ...moveState() });
}

/** Whether this reader may move boards; turning it off leaves move mode. */
function setMoveAllowed(allowed) {
  system.move.allowed = Boolean(allowed);
  if (!system.move.allowed && system.move.enabled) setMoveMode(false);
}

function setMoveMode(enabled, { route = false } = {}) {
  const next = Boolean(enabled) && system.move.allowed;
  const nextRoute = next && Boolean(route);
  if (next === system.move.enabled && nextRoute === system.move.route) return;
  system.move.route = nextRoute;
  if (nextRoute) dropMoveTarget();
  if (!next) {
    dropMoveTarget();
    if (system.move.node) {
      system.move.node = null;
      if (system.nodePreview) {
        system.nodePreview = null;
        refreshSystemTubes();
      }
      emitHarness("target");
    }
  }
  system.move.enabled = next;
  if (next) retargetMove({ quiet: true });
  emitMove("mode");
}

function setMoveSpace(space) {
  system.move.space = space === "local" ? "local" : "world";
  emitMove("mode");
}

/** The placement path the selection is on, a stand-in's included; null without a selection. */
function selectionKey() {
  return system.standInKey ?? selectedPlacementKey();
}

/** Follow the selection: the moving instance is the selection's top-level occurrence. */
function retargetMove({ quiet = false } = {}) {
  if (!system) return;
  const key = selectionKey();
  const top = system.move.enabled && !system.move.route && key != null ? moveTarget(system.baseDescriptor, key) : null;
  const target = top && top.move !== false ? top.path : null; // `move: false` (SB2-48b): fixed in place
  if (target === system.move.target) return;
  dropMoveTarget();
  system.move.target = target;
  if (!quiet) emitMove("target");
}

/** Forget the target, throwing away an unsaved preview. */
function dropMoveTarget() {
  const had = Boolean(system.move.preview);
  system.move.drag = null;
  system.move.preview = null;
  system.move.target = null;
  if (had) refreshPreview();
}

/** Show `pose` for the target without saving it (the numeric panel); null shows the saved pose. */
function previewPose(pose) {
  if (!system?.move.target) return;
  system.move.preview = pose ? canonicalPose(pose) : null;
  refreshPreview();
  emitMove("preview");
}

/** Throw away an unsaved preview (Esc, or a save that failed). */
function cancelMove() {
  if (!system || (!system.move.preview && !system.move.drag)) return;
  system.move.drag = null;
  system.move.preview = null;
  refreshPreview();
  emitMove("cancel");
}

/** The target's box centre in world mm: the pivot for rotations and the gizmo's origin. */
function movePivotMm() {
  const prefix = `${system.move.target}/`;
  const bounds = mergeBounds(system.placed
    .filter((item) => item.occurrence.path === system.move.target || item.occurrence.path.startsWith(prefix))
    .map((item) => item.worldBounds));
  if (!bounds) return null;
  return [0, 1, 2].map((k) => (bounds[k] + bounds[k + 3]) / 2 / MOVE_MM);
}

/** Client-space pixel (relative to the canvas) for a world point in mm, or null behind the camera. */
function screenOfMm(pointMm) {
  const pixel = projectToViewport(panel.matrix, scale(pointMm, MOVE_MM), panel.viewport);
  if (!pixel) return null;
  const rect = canvas.getBoundingClientRect();
  return [pixel.x * rect.width / canvas.width, pixel.y * rect.height / canvas.height];
}

/** Lay out the gizmo for this frame, and remember what a drag on each handle means. */
function updateMoveGizmo() {
  const svg = moveGizmoEl;
  if (!svg) return;
  // A harness node (SB2-45b) takes the gizmo from the board: translate only, world axes.
  const node = system.move.enabled && panel ? targetHandle() : null;
  const target = node ? null : moveTargetOccurrence();
  // An occurrence may limit its gizmo (SB2-48b): `move: {translate, rotate, rotateSnapDeg, pivot}`, in its own axes.
  const limits = target && typeof target.move === "object" ? target.move : null;
  const limitPose = limits ? system.move.preview ?? target.pose : null;
  const pivot = node ? node.worldMm
    : system.move.enabled && target && panel ? (limits?.pivot === "origin" ? [...limitPose.translationMm] : movePivotMm()) : null;
  const center = pivot ? screenOfMm(pivot) : null;
  if (!center) {
    svg.toggleAttribute("hidden", true);
    system.gizmo = null;
    return;
  }
  svg.toggleAttribute("hidden", false);
  if (!svg.firstChild) buildMoveGizmo(svg);
  const { right, back } = camera.basis();
  const step = screenOfMm(add(pivot, right));
  const pxPerMm = step ? Math.hypot(step[0] - center[0], step[1] - center[1]) : 0;
  if (!(pxPerMm > 1e-6)) {
    svg.toggleAttribute("hidden", true);
    return;
  }
  const sizeMm = GIZMO_PX / pxPerMm;
  const pose = target ? system.move.preview ?? target.pose : null;
  const axes = pose && (limits || system.move.space === "local") ? localAxes(pose) : AXES;
  const handles = [];
  axes.forEach((axis, index) => {
    const tip = screenOfMm(add(pivot, scale(axis, sizeMm)));
    const arrow = svg.querySelector(`[data-part="t${index}"]`);
    const shown = tip && Math.hypot(tip[0] - center[0], tip[1] - center[1]) > 12 && (!limits || (limits.translate || []).includes(index));
    arrow.style.display = shown ? "" : "none";
    if (shown) {
      const line = arrow.querySelector("line");
      line.setAttribute("x1", center[0]);
      line.setAttribute("y1", center[1]);
      line.setAttribute("x2", tip[0]);
      line.setAttribute("y2", tip[1]);
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
      const point = screenOfMm(add(pivot, scale(add(scale(u, Math.cos(angle)), scale(v, Math.sin(angle))), sizeMm * 0.7)));
      if (point) points.push(`${point[0].toFixed(1)},${point[1].toFixed(1)}`);
    }
    const ring = svg.querySelector(`[data-part="r${index}"]`);
    ring.setAttribute("points", points.join(" "));
    ring.style.display = node || (limits && !(limits.rotate || []).includes(index)) ? "none" : "";
    handles.push({ axis, pxPerMm: tip ? [(tip[0] - center[0]) / sizeMm, (tip[1] - center[1]) / sizeMm] : [0, 0] });
  });
  const dot = svg.querySelector('[data-part="pivot"]');
  dot.setAttribute("cx", center[0]);
  dot.setAttribute("cy", center[1]);
  system.gizmo = { center, pivot, handles, back, limits };
}

function buildMoveGizmo(svg) {
  const ns = "http://www.w3.org/2000/svg";
  const make = (tag, attributes) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  AXIS_COLORS.forEach((color, index) => {
    const ring = make("polyline", { "data-part": `r${index}`, class: "ring", stroke: color, fill: "none" });
    const title = make("title", {});
    title.textContent = `Rotate about ${AXIS_NAMES[index]}`;
    ring.append(title);
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
  svg.addEventListener("pointerdown", startGizmoDrag);
  svg.addEventListener("pointermove", moveGizmoDrag);
  svg.addEventListener("pointerup", endGizmoDrag);
  // The gizmo sits on a targeted waypoint's handle: a double-click there removes the node (D-P2-53).
  svg.addEventListener("dblclick", (event) => {
    if (!system?.move.node || system.move.node === AUTO) return;
    event.preventDefault();
    event.stopPropagation();
    emitHarness("delete");
  });
  svg.addEventListener("pointercancel", () => abortGizmoDrag());
}

function startGizmoDrag(event) {
  const part = event.target.closest?.("[data-part]")?.dataset.part;
  if (!system || !part || !system.gizmo || !/^[tr][012]$/.test(part)) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = moveGizmoEl.getBoundingClientRect();
  const node = targetHandle();
  if (node) {
    if (part[0] !== "t") return;
    system.move.drag = {
      kind: "node",
      handle: system.gizmo.handles[Number(part[1])],
      start: [event.clientX - rect.left, event.clientY - rect.top],
      startMm: node.worldMm,
      startPreview: system.nodePreview,
      matrix: levelMatrix(pickedHarness(), worldMatrixOf),
      changed: false,
    };
    try {
      moveGizmoEl.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer cannot be captured; the drag still works while over the gizmo.
    }
    return;
  }
  const target = moveTargetOccurrence();
  const limits = system.gizmo.limits;
  if (limits && !((part[0] === "t" ? limits.translate : limits.rotate) || []).includes(Number(part[1]))) return;
  system.move.drag = {
    kind: part[0] === "t" ? "translate" : "rotate",
    snapDeg: limits?.rotateSnapDeg ?? null,
    handle: system.gizmo.handles[Number(part[1])],
    start: [event.clientX - rect.left, event.clientY - rect.top],
    startPose: canonicalPose(system.move.preview ?? target.pose),
    hadPreview: Boolean(system.move.preview),
    center: system.gizmo.center,
    pivot: system.gizmo.pivot,
    back: system.gizmo.back,
    changed: false,
  };
  try {
    moveGizmoEl.setPointerCapture(event.pointerId);
  } catch {
    // A synthetic pointer cannot be captured; the drag still works while over the gizmo.
  }
}

function moveGizmoDrag(event) {
  const drag = system?.move.drag;
  if (!drag) return;
  const rect = moveGizmoEl.getBoundingClientRect();
  const now = [event.clientX - rect.left, event.clientY - rect.top];
  const fine = event.shiftKey;
  if (drag.kind === "node") {
    const amount = snapTo(axisAmount([now[0] - drag.start[0], now[1] - drag.start[1]], drag.handle.pxPerMm), fine ? SNAP.fineMm : SNAP.mm);
    const world = add(drag.startMm, scale(drag.handle.axis, amount));
    drag.changed = drag.changed || amount !== 0;
    system.nodePreview = { harness: system.harnessPick.key, id: system.move.node, positionMm: drag.matrix ? toLevel(drag.matrix, world) : world };
    showReadout(`${amount >= 0 ? "+" : ""}${amount.toFixed(fine ? 1 : 0)} mm`, now);
    refreshSystemTubes();
    emitHarness("preview");
    return;
  }
  let pose;
  let readout;
  if (drag.kind === "translate") {
    const amount = snapTo(axisAmount([now[0] - drag.start[0], now[1] - drag.start[1]], drag.handle.pxPerMm), fine ? SNAP.fineMm : SNAP.mm);
    pose = translatePose(drag.startPose, drag.handle.axis, amount);
    readout = `${amount >= 0 ? "+" : ""}${amount.toFixed(fine ? 1 : 0)} mm`;
  } else {
    const raw = ringRotation(drag.handle.axis, drag.back, screenAngle(drag.center, drag.start, now)) * 180 / Math.PI;
    const degrees = snapTo(raw, drag.snapDeg ?? (fine ? SNAP.fineDeg : SNAP.deg));
    pose = rotatePoseAbout(drag.startPose, drag.handle.axis, degrees * Math.PI / 180, drag.pivot);
    readout = `${degrees >= 0 ? "+" : ""}${degrees.toFixed(0)}°`;
  }
  drag.changed = drag.changed || !samePose(pose, drag.startPose);
  system.move.preview = canonicalPose(pose);
  showReadout(readout, now);
  refreshPreview();
  emitMove("preview");
}

function showReadout(text, at) {
  const readout = moveGizmoEl.querySelector('[data-part="readout"]');
  readout.textContent = text;
  readout.setAttribute("x", at[0] + 14);
  readout.setAttribute("y", at[1] - 10);
}

/** Releasing a handle saves (D-P2-14): the host stores the pose (or node) and re-reads the scene. */
function endGizmoDrag(event) {
  const drag = system?.move.drag;
  if (!drag) return;
  if (moveGizmoEl.hasPointerCapture?.(event.pointerId)) moveGizmoEl.releasePointerCapture(event.pointerId);
  system.move.drag = null;
  moveGizmoEl.querySelector('[data-part="readout"]').textContent = "";
  if (drag.kind === "node") {
    if (drag.changed) emitHarness("commit");
    return;
  }
  if (drag.changed) emitMove("commit");
  else if (!drag.hadPreview) cancelMove();
}

/** Esc during a drag: back to where it started. */
function abortGizmoDrag() {
  const drag = system?.move.drag;
  if (!drag) return false;
  if (drag.kind === "route" || drag.kind === "handle") {
    system.move.drag = null;
    if (drag.changed) {
      system.nodePreview = drag.kind === "handle" ? drag.startPreview : null;
      refreshSystemTubes();
      emitHarness("cancel");
    }
    return true;
  }
  system.move.drag = null;
  if (drag.kind === "node") {
    moveGizmoEl.querySelector('[data-part="readout"]').textContent = "";
    system.nodePreview = drag.startPreview;
    refreshSystemTubes();
    emitHarness("cancel");
    return true;
  }
  system.move.preview = drag.hadPreview ? drag.startPose : null;
  moveGizmoEl.querySelector('[data-part="readout"]').textContent = "";
  refreshPreview();
  emitMove("cancel");
  return true;
}

/** The system keys on top of the 3D tab's; true when the key was used. */
function handleSystemKey(event, key) {
  const move = system.move;
  if (key === "escape") {
    if (systemHelpEl && !systemHelpEl.hidden) systemHelpEl.hidden = true;
    else if (abortGizmoDrag()) { /* the drag is undone */ }
    else if (cancelHarnessNode()) { /* the node is back */ }
    else if (move.node) targetHarnessNode(null);
    else if (move.preview) cancelMove();
    else if (system.harnessPick) pickHarness(null);
    else if (move.enabled) setMoveMode(false);
    else return false; // the 3D tab's Esc: clear the selection
    return true;
  }
  if (key === "m" && move.allowed) setMoveMode(!move.enabled);
  else if (key === "l" && move.enabled) setMoveSpace(move.space === "world" ? "local" : "world");
  else if (key === "enter" && move.node && system.nodePreview && !move.drag) emitHarness("commit");
  else if (key === "enter" && move.preview && !move.drag) emitMove("commit");
  else if ((key === "delete" || key === "backspace") && move.node && move.node !== AUTO && !move.drag) emitHarness("delete");
  else if (event.key === "?") setSystemHelpVisible(Boolean(systemHelpEl?.hidden));
  else if (key === "a") camera.frame(system.bounds || sceneRuntimeBounds());
  else return false;
  return true;
}

function setSystemHelpVisible(visible) {
  if (systemHelpEl) systemHelpEl.hidden = !visible;
}

// ----- proxy harnesses (SB2-34) ----------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

/** An end's anchor in world space: its connector's centre, else its board's box centre. */
function harnessAnchor(end) {
  const item = end.occurrence ? system.placements.get(end.occurrence) : null;
  if (!item) return null;
  const component = end.reference && item.board ? item.board.scene.componentFeatures.get(end.reference) : null;
  const bounds = component ? item.board.scene.features.get(Number(component.featureId))?.bounds : null;
  if (bounds) return transformPoint(item.matrix, [0, 1, 2].map((k) => (bounds[k] + bounds[k + 3]) / 2));
  const box = item.worldBounds;
  return box ? [0, 1, 2].map((k) => (box[k] + box[k + 3]) / 2) : null;
}

/** Build the overlay's elements: a line per segment, a dot per end, coloured by what is lit. */
function buildHarnessOverlay() {
  const emphasis = system.emphasisSets.length > 0;
  const drawn = [];
  const nodes = [];
  for (const harness of system.showHarnesses ? system.harnesses : []) {
    const lit = system.harnessLit.get(harnessKey(harness));
    const glowing = litEnds(harness, lit);
    const anchors = new Map(harness.ends.map((end) => [end.id, harnessAnchor(end)]));
    anchors.set("hub", harness.ends.length > 2 ? hubPoint([...anchors.values()]) : null);
    const title = harness.name || "Harness";
    // A harness drawn as tubes keeps only its end dots here.
    for (const segment of system.tubedHarnesses.has(harnessKey(harness)) ? [] : harnessSegments(harness)) {
      const color = segmentColor(segment, lit);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("class", `segment${color ? " lit" : emphasis ? " dim" : ""}`);
      if (color) Object.assign(line.style, { stroke: color, color });
      const label = document.createElementNS(SVG_NS, "title");
      label.textContent = `${title}: ${segment.wires.size} wire${segment.wires.size === 1 ? "" : "s"}`;
      line.append(label);
      nodes.push(line);
      drawn.push({ node: line, kind: "line", a: anchors.get(segment.a), b: anchors.get(segment.b) });
    }
    for (const end of harness.ends) {
      const color = glowing.get(end.id);
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("class", `end${color ? " lit" : emphasis ? " dim" : ""}`);
      dot.setAttribute("r", color ? "6" : "4");
      if (color) dot.style.fill = color;
      nodes.push(dot);
      drawn.push({ node: dot, kind: "dot", a: anchors.get(end.id) });
    }
  }
  systemHarnessEl.replaceChildren(...nodes);
  system.harnessDrawn = { items: drawn, matrix: null };
}

/** Project the overlay for this frame; only when the view or the scene moved. */
function updateSystemHarnesses() {
  if (!systemHarnessEl || !panel) return;
  if (!system.harnessDrawn) buildHarnessOverlay();
  const drawn = system.harnessDrawn;
  systemHarnessEl.toggleAttribute("hidden", !drawn.items.length);
  // A moved board (preview) rebuilds `harnessDrawn`; otherwise only the camera moves the overlay.
  const matrix = panel.matrix.join(",");
  if (drawn.matrix === matrix) return;
  drawn.matrix = matrix;
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / Math.max(1, canvas.width);
  const sy = rect.height / Math.max(1, canvas.height);
  const screen = (point) => {
    const pixel = point ? projectToViewport(panel.matrix, point, panel.viewport) : null;
    return pixel ? [pixel.x * sx, pixel.y * sy] : null;
  };
  for (const item of drawn.items) {
    const a = screen(item.a);
    const b = item.kind === "line" ? screen(item.b) : null;
    const shown = item.kind === "line" ? Boolean(a && b) : Boolean(a);
    item.node.style.display = shown ? "" : "none";
    if (!shown) continue;
    if (item.kind === "line") {
      item.node.setAttribute("x1", a[0].toFixed(1));
      item.node.setAttribute("y1", a[1].toFixed(1));
      item.node.setAttribute("x2", b[0].toFixed(1));
      item.node.setAttribute("y2", b[1].toFixed(1));
    } else {
      item.node.setAttribute("cx", a[0].toFixed(1));
      item.node.setAttribute("cy", a[1].toFixed(1));
    }
  }
}

// ----- harness picking and node editing (SB2-45b) ---------------------------------
//
// A click on a tube picks its harness and segment; the host learns it through
// `harness` events. In move mode the picked harness shows a handle per breakout
// and waypoint (and its automatic breakout); a handle takes the gizmo, which
// then only translates. Like a board move, a drag only previews: releasing it
// sends "commit" with the node's new place, and the host saves the node list.

/** Screen pixels per mm at a world point (mm), along the view's right axis. */
function pxPerMmAt(point) {
  const { right } = camera.basis();
  const a = screenOfMm(point);
  const b = screenOfMm(add(point, right));
  return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
}

/** The tube under the pointer: `{tube, pointMm}`, or null. Route mode is forgiving: a thin tube is hard to hit. */
function tubeAt(event) {
  if (!system?.tubes.length || !panel) return null;
  const rect = canvas.getBoundingClientRect();
  const hit = pickTube(system.tubes, [event.clientX - rect.left, event.clientY - rect.top], screenOfMm, pxPerMmAt,
    system.move.route ? 10 : 5);
  return hit ? { tube: system.tubes[hit.index], pointMm: hit.pointMm } : null;
}

/** A click on a tube picks it; true when one was hit. A miss drops a picked harness. */
function pickSystemTube(event) {
  const hit = tubeAt(event);
  if (!hit) {
    pickHarness(null);
    return false;
  }
  pickHarness({ key: hit.tube.harness, segmentId: hit.tube.segmentId, pointMm: hit.pointMm });
  return true;
}

// ----- Route mode: bend a harness by dragging it (D-P2-53) ------------------------

/** A press on an editable harness in Route mode picks it and starts a bend; true when it did. */
function startRouteDrag(event) {
  if (!system?.move.enabled || !system.move.route || event.button !== 0 || event.shiftKey) return false;
  const hit = tubeAt(event);
  const harness = hit ? system.harnesses.find((item) => harnessKey(item) === hit.tube.harness) : null;
  if (!hit || !harnessEditable(harness)) return false;
  pickHarness({ key: hit.tube.harness, segmentId: hit.tube.segmentId, pointMm: hit.pointMm });
  system.move.drag = {
    kind: "route", start: [event.clientX, event.clientY], startMm: hit.pointMm, nowMm: hit.pointMm,
    pxPerMm: pxPerMmAt(hit.pointMm), basis: camera.basis(), breakout: event.altKey, changed: false,
    matrix: levelMatrix(harness, worldMatrixOf), capture: canvas, harness,
    segment: { from: hit.tube.from, to: hit.tube.to, samplesMm: hit.tube.samplesMm },
  };
  canvas.setPointerCapture(event.pointerId);
  return true;
}

/** A press on a waypoint or breakout handle: it is targeted, and a drag moves it in the view plane. */
function startHandleDrag(event, id) {
  targetHarnessNode(id);
  const handle = targetHandle();
  if (!handle) return;
  system.move.drag = {
    kind: "handle", start: [event.clientX, event.clientY], startMm: handle.worldMm, nowMm: handle.worldMm,
    pxPerMm: pxPerMmAt(handle.worldMm), basis: camera.basis(), changed: false, startPreview: system.nodePreview,
    matrix: levelMatrix(pickedHarness(), worldMatrixOf), capture: harnessNodesEl,
  };
  try {
    harnessNodesEl.setPointerCapture(event.pointerId);
  } catch {
    // A synthetic pointer cannot be captured.
  }
}

/** True when a bend or handle drag used the move. */
function moveRouteDrag(event) {
  const drag = system?.move.drag;
  if (!drag || (drag.kind !== "route" && drag.kind !== "handle")) return false;
  const now = [event.clientX, event.clientY];
  if (!drag.changed && !isDrag(drag.start, now)) return true;
  drag.changed = true;
  drag.nowMm = dragInViewPlane(drag.startMm, now[0] - drag.start[0], now[1] - drag.start[1], drag.pxPerMm, drag.basis);
  const local = drag.matrix ? toLevel(drag.matrix, drag.nowMm) : [...drag.nowMm];
  if (drag.kind === "handle") {
    system.nodePreview = { harness: system.harnessPick.key, id: system.move.node, positionMm: local };
  } else {
    // The bend is a node already: the tube re-solves through it on every move (D-P2-53).
    system.nodePreview = { harness: system.harnessPick.key, insert: bendNode(drag.harness.nodes ?? [], {
      kind: drag.breakout ? "breakout" : "waypoint", segment: drag.segment, atMm: drag.startMm, positionMm: local,
      toWorldMm: (point) => (drag.matrix ? toWorld(drag.matrix, point) : point),
    }) };
  }
  refreshSystemTubes();
  emitHarness("preview");
  return true;
}

/** Release: a bend asks the host for a new waypoint (or breakout); a moved handle commits. */
function endRouteDrag(event) {
  const drag = system?.move.drag;
  if (!drag || (drag.kind !== "route" && drag.kind !== "handle")) return false;
  if (drag.capture?.hasPointerCapture?.(event.pointerId)) drag.capture.releasePointerCapture(event.pointerId);
  system.move.drag = null;
  if (!drag.changed) return true;
  if (drag.kind === "handle") {
    emitHarness("commit");
    return true;
  }
  const local = (point) => (drag.matrix ? toLevel(drag.matrix, point) : [...point]);
  emitHarness("route-drag", { atMm: local(drag.startMm), positionMm: local(drag.nowMm), breakout: drag.breakout });
  return true;
}


/**
 * The host picks a root-level harness by id (SB2-61), as a click on its first
 * segment would; null drops the pick. Picking the picked harness again is a no-op.
 */
function selectHarness(id) {
  if (!system) return false;
  if (id == null) {
    pickHarness(null);
    return true;
  }
  const key = harnessKey({ level: "", id: String(id) });
  if (system.harnessPick?.key === key) return true;
  const tube = system.tubes.find((item) => item.harness === key);
  if (!tube) return false;
  const middle = Math.floor(tube.samplesMm.length / 6) * 3;
  pickHarness({ key, segmentId: tube.segmentId, pointMm: tube.samplesMm.slice(middle, middle + 3) });
  return true;
}

/** Pick a harness (`{key, segmentId, pointMm}`, world mm) or drop the pick. */
function pickHarness(pick) {
  if (!pick && !system.harnessPick) return;
  if (pick) {
    // A harness replaces any board selection (the host hears it as a cleared selection).
    clearSelection();
    retargetMove({ quiet: true });
  }
  const sameHarness = pick && system.harnessPick?.key === pick.key;
  system.harnessPick = pick;
  if (!sameHarness) {
    system.move.node = null;
    system.nodePreview = null;
  }
  refreshSystemTubes();
  emitHarness("select");
}

function pickedHarness() {
  const pick = system?.harnessPick;
  return pick ? system.harnesses.find((harness) => harnessKey(harness) === pick.key) ?? null : null;
}

/** Root-level harnesses are edited here; a child system's are frozen in its snapshot. */
function harnessEditable(harness) {
  return Boolean(harness) && !harness.level && system.move.allowed;
}

/** The picked harness's handles, with an unsaved position applied. */
function pickedHandles() {
  const harness = pickedHarness();
  if (!harness) return [];
  const shown = withNodePreview([harness], system.nodePreview, harnessKey)[0];
  const tubes = system.tubes.filter((tube) => tube.harness === system.harnessPick.key);
  return nodeHandles(shown, tubes, levelMatrix(harness, worldMatrixOf) ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function targetHandle() {
  return system.move.node ? pickedHandles().find((handle) => handle.id === system.move.node) ?? null : null;
}

/**
 * What the host needs: the harness, the picked segment with its samples, the
 * picked point and the automatic breakout, and the targeted node; points in the
 * harness's level frame (mm).
 */
function harnessState() {
  const harness = pickedHarness();
  if (!harness) return { harness: null, segment: null, pointMm: null, autoMm: null, node: null, editable: false };
  const matrix = levelMatrix(harness, worldMatrixOf);
  const local = (point) => (matrix ? toLevel(matrix, point) : [...point]);
  const pick = system.harnessPick;
  const tube = system.tubes.find((item) => item.harness === pick.key && item.segmentId === pick.segmentId);
  const samples = [];
  for (let i = 0; tube && i + 2 < tube.samplesMm.length; i += 3) samples.push(local(tube.samplesMm.slice(i, i + 3)));
  const handles = pickedHandles();
  const auto = handles.find((handle) => handle.auto);
  const node = targetHandle();
  const unsaved = Boolean(node && system.nodePreview?.id === node.id);
  return {
    harness: { id: harness.id, level: harness.level ?? null, name: harness.name || "" },
    segment: tube ? { id: tube.segmentId, from: tube.from, to: tube.to, samplesMm: samples } : null,
    pointMm: pick.pointMm ? local(pick.pointMm) : null,
    autoMm: auto ? local(auto.worldMm) : null,
    node: node ? { id: node.id, kind: node.kind, auto: Boolean(node.auto), pinned: node.pinned,
      positionMm: unsaved ? [...system.nodePreview.positionMm] : local(node.worldMm), unsaved } : null,
    editable: harnessEditable(harness),
  };
}

function emitHarness(phase, extra = {}) {
  system.onHarness?.({ phase, ...harnessState(), ...extra });
}

/** Give the gizmo to a node of the picked harness (null gives it back). */
function targetHarnessNode(id) {
  if (!system) return;
  const next = id && harnessEditable(pickedHarness()) && system.move.enabled ? String(id) : null;
  if (next === system.move.node) return;
  system.move.node = next;
  system.move.drag = null;
  if (system.nodePreview && system.nodePreview.id !== next) {
    system.nodePreview = null;
    refreshSystemTubes();
  }
  emitHarness("target");
}

/** Show a node at a level-frame position without saving it (the host's numbers); null shows the saved place. */
function previewHarnessNode(positionMm) {
  if (!system?.move.node || !system.harnessPick) return;
  system.nodePreview = positionMm ? { harness: system.harnessPick.key, id: system.move.node, positionMm: [...positionMm] } : null;
  refreshSystemTubes();
  emitHarness("preview");
}

/** Throw away an unsaved node position (Esc, or a save that failed). */
function cancelHarnessNode() {
  if (!system?.nodePreview) return false;
  system.nodePreview = null;
  system.move.drag = null;
  refreshSystemTubes();
  emitHarness("cancel");
  return true;
}

/** After a re-read: keep the pick and target while they exist; a saved preview is now the stored state. */
function syncHarnessPick() {
  const harness = pickedHarness();
  if (!harness) {
    if (system.harnessPick) {
      system.harnessPick = null;
      system.move.node = null;
      system.nodePreview = null;
      emitHarness("select");
    }
    return;
  }
  if (!system.move.drag) system.nodePreview = null;
  if (system.move.node && !pickedHandles().some((handle) => handle.id === system.move.node)) system.move.node = null;
  // A breakout added or removed renames the segments: keep the one that now runs nearest the picked point.
  const pick = system.harnessPick;
  const tubes = system.tubes.filter((tube) => tube.harness === pick.key);
  if (pick.pointMm && tubes.length && !tubes.some((tube) => tube.segmentId === pick.segmentId)) {
    const distance = (tube) => {
      let best = Infinity;
      for (let i = 0; i + 2 < tube.samplesMm.length; i += 3) {
        best = Math.min(best, Math.hypot(tube.samplesMm[i] - pick.pointMm[0], tube.samplesMm[i + 1] - pick.pointMm[1],
          tube.samplesMm[i + 2] - pick.pointMm[2]));
      }
      return best;
    };
    pick.segmentId = tubes.reduce((best, tube) => (distance(tube) < distance(best) ? tube : best)).segmentId;
  }
  emitHarness("sync");
}

/** Lay out the node handles for this frame: in move mode, on an editable picked harness. */
function updateHarnessNodes() {
  const svg = harnessNodesEl;
  if (!svg) return;
  const harness = system.move.enabled && panel ? pickedHarness() : null;
  const handles = harnessEditable(harness) ? pickedHandles() : [];
  svg.toggleAttribute("hidden", !handles.length);
  if (!handles.length) {
    if (svg.firstChild) svg.replaceChildren();
    return;
  }
  const byId = new Map([...svg.children].map((node) => [node.dataset.node, node]));
  const seen = new Set();
  for (const handle of handles) {
    const at = screenOfMm(handle.worldMm);
    let dot = byId.get(handle.id);
    if (!dot) {
      dot = document.createElementNS(SVG_NS, "circle");
      dot.dataset.node = handle.id;
      const title = document.createElementNS(SVG_NS, "title");
      dot.append(title);
      dot.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startHandleDrag(event, dot.dataset.node);
      });
      dot.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        targetHarnessNode(dot.dataset.node);
        if (system.move.node && system.move.node !== AUTO) emitHarness("delete");
      });
      svg.append(dot);
    }
    seen.add(handle.id);
    dot.setAttribute("class", `node ${handle.kind}${handle.auto ? " auto" : ""}${handle.pinned ? " pinned" : ""}${handle.id === system.move.node ? " target" : ""}`);
    dot.setAttribute("r", handle.kind === "breakout" ? "7" : "5.5");
    dot.querySelector("title").textContent = handle.auto ? "Automatic breakout: drag to place it"
      : handle.kind === "breakout" ? "Breakout" : handle.pinned ? "Pinned waypoint" : "Waypoint";
    dot.style.display = at ? "" : "none";
    if (at) {
      dot.setAttribute("cx", at[0].toFixed(1));
      dot.setAttribute("cy", at[1].toFixed(1));
    }
  }
  for (const [id, node] of byId) if (!seen.has(id)) node.remove();
}

// ----- board labels -------------------------------------------------------------

function renderSystemLabels() {
  if (!systemLabelsEl) return;
  system.labelsDrawn = null; // new label elements start unplaced
  systemLabelsEl.replaceChildren(...system.placed.map((item) => {
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
    item.label = label;
    return label;
  }));
}

function updateSystemLabels() {
  if (!systemLabelsEl || !panel) return;
  systemLabelsEl.hidden = !system.showLabels;
  if (!system.showLabels) {
    system.labelsDrawn = null;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const selected = selectionKey();
  // R5: labels move only when the view, the selection or the placements change, not on pulse frames.
  const key = `${selected}|${rect.width}x${rect.height}|${Array.prototype.join.call(panel.matrix, ",")}`;
  if (system.labelsDrawn?.placed === system.placed && system.labelsDrawn.key === key) return;
  system.labelsDrawn = { placed: system.placed, key };
  const sx = rect.width / Math.max(1, canvas.width);
  const sy = rect.height / Math.max(1, canvas.height);
  for (const item of system.placed) {
    if (!item.label) continue;
    const [x0, y0, , x1, y1, z1] = item.worldBounds;
    const pixel = projectToViewport(panel.matrix, [(x0 + x1) / 2, (y0 + y1) / 2, z1], panel.viewport);
    const visible = pixel && pixel.x >= 0 && pixel.y >= 0 && pixel.x <= canvas.width && pixel.y <= canvas.height;
    item.label.hidden = !visible;
    if (visible) item.label.style.transform = `translate(${(pixel.x * sx).toFixed(1)}px, ${(pixel.y * sy).toFixed(1)}px) translate(-50%, -100%)`;
    item.label.classList.toggle("selected", selected === item.occurrence.path);
  }
}

function pasteLayerId(primitive, b = board) {
  return pasteLayerIdFor(primitive, b.scene.copperLayers);
}

async function loadComponents(token = activeViewerToken, b = board) {
  const path = b.semanticGeometry.assets?.components_glb;
  if (!path || b.scene.componentTier !== "idle") return;
  b.scene.componentTier = "loading";
  let loaded;
  try {
    loaded = await loadGltfModels(new URL(path, location.href).toString(), {
      componentFeatures: b.scene.componentFeatures,
      fetchBytes: assetFetcher(b),
    });
  } catch (error) {
    if (viewerSessionActive(token)) b.scene.componentTier = "idle";
    throw error;
  }
  if (!viewerSessionActive(token) || !b.renderer) return;
  const draws = componentDraws(loaded.models);
  // SB2-87: the upload waits its turn (per-frame cap); the tier stays "loading" meanwhile.
  await uploadBudget([...draws.instanced.map((draw) => draw.primitive), ...draws.baked]
    .reduce((sum, primitive) => sum + estimatePrimitiveGpuBytes(primitive), 0));
  if (!viewerSessionActive(token) || !b.renderer) return;
  b.scene.componentTier = "loaded";
  b.loadedBytes += loaded.byteLength;
  for (const model of loaded.models) {
    for (const placement of model.placements) {
      const component = b.scene.componentFeatures.get(placement.designator);
      if (component) mergeFeatureBounds(component.featureId, placement.bounds, b);
    }
  }
  // Harness ends anchor at their connector's bounds, known only now; until then they sat at the board's centre.
  if (system) {
    system.harnessDrawn = null;
    system.labelsDrawn = null;
  }
  // A reference whose GLB has two top-level model nodes is an
  // alternate-footprint pair; the group builder keeps it visible.
  for (const [designator, count] of loaded.componentNodeCounts || []) {
    b.scene.componentModelCounts.set(designator, count);
  }
  // A hidden set that arrived before the models were counted treated
  // alternate-footprint pairs as ordinary references and hid them; redo it now
  // that the pairs are known, so load order never changes what is hidden.
  if (b.hiddenComponentRequest) applyHiddenComponents(b.hiddenComponentRequest);
  // SB2-86: models placed often draw once per placement from one copy; the rest bake in, merged by material.
  const metadataOf = (primitive) => ({ kind: "component", layerId: 0, material: primitive.material, color: primitive.material.baseColor });
  b.scene.componentEntries = [
    ...b.renderer.addInstancedPrimitives(draws.instanced.map((model) => ({
      primitive: model.primitive,
      placements: model.placements,
      metadata: metadataOf(model.primitive),
    }))),
    ...draws.baked.map((primitive) => b.renderer.addPrimitive(primitive, metadataOf(primitive))),
  ];
}

// Bundle assets through the browser cache when this bundle is final (SB2-26).
function assetFetcher(b = board) {
  return b.assetCache ? (url) => b.assetCache.fetchBytes(url) : undefined;
}

/**
 * Tiers and the GPU budget (SB2-26), a few times a second. Components load
 * when an occurrence first needs full detail ("on approach"); over budget, the
 * component tier goes once nothing has needed it for a while, then unneeded
 * copper tiles (least recently used first). A re-approach reloads from the
 * browser cache. The one-board view always wants its components.
 */
function manageTiers(now, b = board) {
  if (!b.renderer || now - (b.tiersCheckedAt || 0) < 250) return;
  b.tiersCheckedAt = now;
  // A deferred (system) load waits for a full-detail occurrence, not the brief
  // one-board frames before its occurrences are applied.
  // SB2-87: any copy drawn above box detail wants them. Instanced (SB2-86) they cost little, and a board
  // zoomed from afar to full detail in one move then finds them already there instead of popping in.
  // SB2-92: that prefetch waits until every board has drawn once; loading all components alongside
  // the boards delayed the first full frame by ~3 s. A copy at full detail still loads them at once.
  const counts = b.renderer.cullCounts;
  const prefetch = scenePrefetchReady() && counts.board + counts.body > 0;
  const wanted = (b.renderer.identityOnly && !b.deferComponents) || (!b.renderer.identityOnly && (counts.full > 0 || prefetch));
  if (wanted) b.scene.componentsWantedAt = now;
  if (wanted && b.scene.componentTier === "idle" && b.semanticGeometry.assets?.components_glb) {
    void loadComponents(activeViewerToken, b)
      // A system board (SB2-31e) gets its model-less footprints' boxes once the models are known.
      .then(() => { if (system && b.renderer && b.scene.componentTier === "loaded") addFootprintPlaceholders(b.scene.runtimeBounds, b); })
      .catch((error) => console.warn("Failed to load components", error));
  }
  // A system scene (SB2-31f) keeps one budget for every board together.
  const used = () => (system ? system.scene.gpuMemoryBytes() : b.renderer.gpuMemoryBytes());
  b.gpuBytes = used();
  if (b.gpuBytes <= state.gpuBudgetBytes) return;
  if (b.scene.componentTier === "loaded" && now - b.scene.componentsWantedAt > COMPONENT_IDLE_EVICT_MS) {
    b.renderer.removeEntries(b.scene.componentEntries);
    b.scene.componentEntries = [];
    b.scene.componentTier = "idle";
    b.scene.componentEvictions += 1;
    b.gpuBytes = used();
  }
  if (b.gpuBytes > state.gpuBudgetBytes) {
    evictUnneededTiles(b.visibleTileIds || new Set(), Math.max(0, b.residentTileGpuBytes - (b.gpuBytes - state.gpuBudgetBytes)), b);
  }
}

const PLACEHOLDER_HEIGHT_M = 0.0004;
// Clear of the mask and silkscreen, so the box's base never shares their plane.
const PLACEHOLDER_GAP_M = 0.00005;
const PLACEHOLDER_MATERIAL = { baseColor: [0.62, 0.7, 0.8, 1], metallic: 0, roughness: 0.8, emissive: [0, 0, 0] };

/**
 * Footprints without a 3D model get a faint box over their pad extent, on their
 * board side, tagged with the component's feature id. Picking, cross-probe
 * highlight, framing and hiding then work as for a real model.
 */
function addFootprintPlaceholders(boardBounds, b = board) {
  if (!b.renderer) return;
  const bodies = new Map();
  for (const item of b.topology.physical_objects || []) {
    if (item.kind === "footprint_body" && item.designator && item.bbox_mm?.length === 4) {
      bodies.set(item.designator, item);
    }
  }
  const top = (boardBounds?.[5] ?? 0.0008) + PLACEHOLDER_GAP_M;
  const bottom = (boardBounds?.[2] ?? -0.0008) - PLACEHOLDER_GAP_M;
  const primitives = [];
  for (const component of b.scene.componentFeatures.values()) {
    const featureId = Number(component.featureId);
    const feature = b.scene.features.get(featureId);
    const body = bodies.get(component.designator);
    if (!feature || feature.bounds || !body) continue;
    const [x0, y0, x1, y1] = body.bbox_mm.map(Number);
    const back = String(body.layer || "").startsWith("B.");
    const bounds = [
      x0 / 1000,
      -y1 / 1000,
      back ? bottom - PLACEHOLDER_HEIGHT_M : top,
      x1 / 1000,
      -y0 / 1000,
      back ? bottom : top + PLACEHOLDER_HEIGHT_M,
    ];
    feature.bounds = bounds;
    feature.placeholder = true;
    primitives.push(boxPrimitive(bounds, featureId));
  }
  if (!primitives.length) return;
  for (const primitive of mergePrimitivesByMaterial(primitives)) {
    b.renderer.addPrimitive(primitive, {
      kind: "component",
      layerId: 0,
      material: primitive.material,
      color: primitive.material.baseColor,
      opacityScale: 0.3,
      translucent: true,
      placeholder: true,
    });
  }
}

function boxPrimitive([x0, y0, z0, x1, y1, z1], featureId) {
  const faces = [
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]]],
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[-1, 0, 0], [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]]],
    [[0, 1, 0], [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
  ];
  const position = new Float32Array(24 * 3);
  const normal = new Float32Array(24 * 3);
  const indices = new Uint32Array(36);
  faces.forEach(([faceNormal, corners], face) => {
    corners.forEach((corner, index) => {
      position.set(corner, (face * 4 + index) * 3);
      normal.set(faceNormal, (face * 4 + index) * 3);
    });
    const first = face * 4;
    indices.set([first, first + 1, first + 2, first, first + 2, first + 3], face * 6);
  });
  return {
    position,
    normal,
    netId: new Uint32Array(24),
    objectFeatureId: new Uint32Array(24).fill(featureId),
    indices,
    material: PLACEHOLDER_MATERIAL,
    bounds: [x0, y0, z0, x1, y1, z1],
  };
}



function mergeFeatureBounds(featureId, positions, b = board) {
  const feature = b.scene.features.get(Number(featureId));
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

function layerColor(layer, b = board) {
  return copperLayerColor(layer, b.scene.copperLayers);
}

const DEFAULT_BARREL_COLOR = [0.55, 0.35, 0.16, 0.78];
function finishColor(b = board) {
  return finishColorFor(b.topology?.board?.stackup?.copper_finish);
}

function isOuterCopper(layer, b = board) {
  return isOuterCopperLayer(layer, b.scene.copperLayers);
}

// Separation at which copper has fully turned to layer colours.
const LAYER_COLOR_SEPARATION = 0.25;

/**
 * 1 for KiCad-like copper, 0 for layer colours. Opening the stackup blends to
 * layer colours, so separated layers stay tell-apart; 2D always uses them.
 */
function copperRealism() {
  if (!state.realisticColors || state.mode === "layer") return 0;
  return 1 - clamp(state.separation / LAYER_COLOR_SEPARATION, 0, 1);
}

function copperColor(layer, b = board) {
  const realistic = isOuterCopper(layer, b) ? finishColor(b) : FINISH_COLORS.copper;
  return mixColor(layerColor(layer, b), realistic, copperRealism());
}

function mixColor(from, to, amount) {
  return from.map((value, index) => value + (to[index] - value) * amount);
}

function frame(now, token = activeViewerToken) {
  if (token === activeViewerToken && system && camera) {
    frameSystem(now, token);
    return;
  }
  if (token !== activeViewerToken || !board.renderer || !camera) return;
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
  board.renderer.resize();
  const layerZOffsets = stackupOffsets();
  if (board.scene.copperRealism !== copperRealism()) applyCopperColors();
  for (const entry of board.renderer.entries) entry.layerOffset = layerZOffsets[entry.layerId] || 0;
  updateCompareTransition(now);
  compareOffsets = updateCompareLayout(now);
  const compareAlphas = compareLayerAlphas(now);
  panel = {
    layerId: 0,
    viewport: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    matrix: camera.matrix(canvas.width, canvas.height, state.mode === "layer"),
    lod: cameraLod(canvas.height, state.mode === "layer"),
  };
  // The copy holding the selection keeps full detail and its emphasis; none without a selection.
  board.renderer.selectedOccurrence = state.selectedFeatureId || state.activeNetId ? state.selectedOccurrence : -1;
  // SB2-85: all inner copper once the board is exploded or hidden; on an opaque board only the lit nets'.
  board.renderer.setInnerCopperMode(innerCopperMode(!state.showBoard || state.separation > 0.001, emphasizedNetIds().size > 0));
  scheduleTileResidency(now);
  const visibleLayers = state.mode === "3d" ? board.visible3dLayers : compareRenderLayers();
  const inputs = {
    panels: [panel],
    activeNetId: state.activeNetId,
    selectedFeatureId: state.selectedFeatureId,
    time: now / 1000,
    layerOffsets: layerZOffsets,
    visibleLayers,
    showBoard: state.showBoard,
    showComponents: state.showComponents,
    // Paste is a fabrication layer: shown on the assembled board only.
    showPaste: state.separation === 0,
    componentOpacity: clamp(1 - state.separation / 0.1, 0, 1),
    boardOpacity: emphasizedNetIds().size ? 0.34 : 1 - state.separation * 0.72,
    isolateNet: state.isolateNet,
    compareMode: state.mode === "layer",
    compareOffsets,
    layerAlphas: compareAlphas,
    visibleTileIds: state.mode === "3d" ? board.visibleTileIds : null,
  };
  lastFrameInputs = inputs;
  if (frameNeedsRender(now, inputs)) {
    board.renderer.render(inputs);
    drawGizmo();
    updateLayerLabels();
    // IN-60: what the main view shows changed; insets showing it redraw.
    for (const listener of insetListeners) listener();
  }
  // Tiers and the GPU budget (SB2-26) are checked whether or not this frame drew.
  manageTiers(now);
  recordFrameSample(frameInterval, performance.now() - frameStarted);
  updateDiagnostics(now);
  scheduleFrame(token);
}

// The picture only changes with its inputs, so an idle view skips the GPU work.
// Highlights pulse, so they keep drawing; a slow refresh covers anything missed.
const IDLE_REFRESH_MS = 1000;
const lastRender = { key: "", matrix: new Float32Array(16), tiles: null, at: 0 };

// --- IN-60/IN-61: inset views ------------------------------------------
//
// A host (the Visualizer's insets) draws small views of this board through
// cameras of its own. They share the device, pipelines, render bundles and
// resident geometry; each inset frame is its own submit into a grow-only
// offscreen WebGPU canvas, copied into the host's 2D canvas in the same
// task. The main camera, panel and frame state are never touched.

/** The inputs of the last main frame; an inset draws with the same state. */
let lastFrameInputs = null;
/** Grow-only offscreen colour and depth targets shared by every inset. */
const insetGpu = { canvas: null, context: null, depth: null, depthView: null, width: 0, height: 0 };
/** Matrices of insets drawn recently, so copper they show stays resident. */
const insetViews = new Map();
const INSET_VIEW_TTL_MS = 3000;
/** Hosts told when the main frame redrew (tiles arrived, highlights...). */
const insetListeners = new Set();
const insetStats = { frames: 0, cpuMs: 0, gpuMs: 0, lastTriangles: 0 };
/** Switches for A/B measurements. */
const insetSettings = { cullTiles: true };

function activeInsetViews(now = performance.now()) {
  const views = [];
  for (const [key, entry] of insetViews) {
    if (now - entry.at > INSET_VIEW_TTL_MS) insetViews.delete(key);
    else views.push(entry.matrix);
  }
  return views;
}

function ensureInsetTargets(width, height) {
  const renderer = board.renderer;
  if (!insetGpu.canvas) {
    insetGpu.canvas = document.createElement("canvas");
    insetGpu.context = insetGpu.canvas.getContext("webgpu");
  }
  if (insetGpu.width >= width && insetGpu.height >= height && insetGpu.depth) return;
  insetGpu.width = Math.max(insetGpu.width, width);
  insetGpu.height = Math.max(insetGpu.height, height);
  insetGpu.canvas.width = insetGpu.width;
  insetGpu.canvas.height = insetGpu.height;
  insetGpu.context.configure({ device: renderer.device, format: renderer.format, alphaMode: "opaque" });
  insetGpu.depth?.destroy();
  insetGpu.depth = renderer.device.createTexture({
    label: "inset-depth",
    size: [insetGpu.width, insetGpu.height],
    format: renderer.depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  insetGpu.depthView = insetGpu.depth.createView();
}

/** The board surface on one side, as a runtime height. */
function insetSurfaceZ(bottom) {
  const bounds = board.scene.runtimeBounds;
  if (!bounds) return 0;
  return bottom ? bounds[2] : bounds[5];
}

/**
 * Draw an inset view into `target` (a 2D canvas, sized by CSS). `key` names
 * the inset for tile residency. Returns false when nothing could be drawn.
 */
function insetViewReady() {
  return Boolean(!system && board.renderer && lastFrameInputs && state.workspace === "pcb");
}

function renderInsetView(target, view, key = "inset") {
  if (!insetViewReady()) return false;
  const cssWidth = target.clientWidth;
  const cssHeight = target.clientHeight;
  if (!cssWidth || !cssHeight) return false;
  const started = performance.now();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(cssWidth * ratio);
  const height = Math.round(cssHeight * ratio);
  ensureInsetTargets(width, height);
  const radius = boundsRadius(board.scene.runtimeBounds);
  const matrix = insetMatrix(view, cssWidth, cssHeight, radius, view.focusZ ?? 0);
  insetViews.set(key, { matrix, at: started });
  const insetPanel = { layerId: 0, viewport: { x: 0, y: 0, width, height }, matrix, lod: lastFrameInputs.panels[0].lod };
  // Only the copper tiles this inset sees: an inset is a small part of the
  // board, so most tiles the main view draws are off its screen.
  let visibleTileIds = lastFrameInputs.visibleTileIds;
  if (visibleTileIds && insetSettings.cullTiles) {
    const seen = new Set();
    for (const tileId of visibleTileIds) {
      const tile = board.scene.tiles.get(tileId);
      if (tile && tileIntersectsView(tile, matrix, null, 0, board)) seen.add(tileId);
    }
    visibleTileIds = seen;
  }
  const counted = board.renderer.renderInto(
    {
      colorView: insetGpu.context.getCurrentTexture().createView(),
      depthView: insetGpu.depthView,
      width: insetGpu.width,
      height: insetGpu.height,
    },
    insetPanel,
    { ...lastFrameInputs, panels: [insetPanel], visibleTileIds },
  );
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;
  const ctx = target.getContext("2d");
  ctx.drawImage(insetGpu.canvas, 0, 0, width, height, 0, 0, width, height);
  insetStats.frames += 1;
  insetStats.cpuMs += performance.now() - started;
  insetStats.lastTriangles = counted.triangles;
  return true;
}

/**
 * A component (and optionally one of its pads) as an inset target, in KiCad
 * millimetres: the box to frame, the anchor point, and the side.
 */
/** sourceUid → feature, and footprint bodies by designator; built once per board. */
let insetIndex = null;

function insetIndexFor() {
  if (insetIndex?.scene === board.scene) return insetIndex;
  const bySource = new Map();
  const padsByFootprintPin = new Map();
  for (const feature of board.scene.features.values()) {
    if (feature.sourceUid) bySource.set(String(feature.sourceUid), feature);
    if (feature.kind !== "pad") continue;
    // "<footprint lib:name>:pad:<index>:<number>" when the pad carries no designator.
    const match = /^(.*):pad:\d+:(.+)$/.exec(String(feature.sourceUid || ""));
    if (!match) continue;
    const key = `${match[1]}\u0000${match[2]}`;
    if (!padsByFootprintPin.has(key)) padsByFootprintPin.set(key, []);
    padsByFootprintPin.get(key).push(feature);
  }
  const bodies = new Map();
  for (const item of board.topology?.physical_objects || []) {
    if (item.kind === "footprint_body" && item.designator && item.bbox_mm?.length === 4) bodies.set(item.designator, item);
  }
  const objects = new Map((board.topology?.physical_objects || []).map((item) => [item.uid, item]));
  insetIndex = { scene: board.scene, bySource, padsByFootprintPin, bodies, objects };
  return insetIndex;
}

/** A KiCad-mm box {x,y,w,h} from [x0,y0,x1,y1]. */
const boxFromMm = ([x0, y0, x1, y1]) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
const boxCentre = (box) => [box.x + box.w / 2, box.y + box.h / 2];

/**
 * A component (and optionally one of its pads) as an inset target, in KiCad
 * millimetres: the box to frame, the anchor point, and the side. Pads come
 * from the topology (terminal → PCB pad → feature); bundles without pad ids
 * fall back to the footprint's pad of that number nearest the part.
 */
function insetTargetFor(reference, pin) {
  const ref = String(reference);
  const component = board.scene.componentFeatures.get(ref);
  if (!component) return null;
  const index = insetIndexFor();
  const feature = board.scene.features.get(Number(component.featureId));
  const body = index.bodies.get(ref);
  let focus = feature?.bounds ? runtimeBoundsToMm(feature.bounds).box : body ? boxFromMm(body.bbox_mm.map(Number)) : null;
  let bottom = feature?.bounds ? runtimeBoundsToMm(feature.bounds).bottom : String(body?.layer || "").startsWith("B.");
  let pad = null;
  if (pin != null && pin !== "") {
    const terminal = (board.topology?.terminals || []).find((t) => t.designator === ref && String(t.pin) === String(pin));
    const object = terminal?.pcb_pad_id ? index.objects.get(terminal.pcb_pad_id) : null;
    pad = object?.source_ids?.[0] ? index.bySource.get(String(object.source_ids[0])) || null : null;
    if (!pad) {
      const candidates = index.padsByFootprintPin.get(`${component.footprint}\u0000${pin}`) || [];
      const near = focus ? boxCentre(focus) : null;
      let best = Infinity;
      for (const candidate of candidates) {
        const c = boxCentre(runtimeBoundsToMm(candidate.bounds).box);
        const d = near ? Math.hypot(c[0] - near[0], c[1] - near[1]) : 0;
        if (d < best) [best, pad] = [d, candidate];
      }
    }
  }
  const padBox = pad?.bounds ? runtimeBoundsToMm(pad.bounds).box : null;
  if (!focus && padBox) {
    focus = padBox;
    bottom = runtimeBoundsToMm(pad.bounds).bottom;
  }
  if (!focus) return null;
  return {
    reference: ref,
    pin: pad ? String(pin) : null,
    focus,
    anchor: boxCentre(padBox || focus),
    anchorBox: padBox,
    bottom,
    surfaceZ: insetSurfaceZ(bottom),
  };
}

function projectInsetPoint(view, width, height, pointMm) {
  const radius = boundsRadius(board.scene.runtimeBounds);
  const matrix = insetMatrix(view, width, height, radius, view.focusZ ?? 0);
  return projectInset(matrix, width, height, mmToRuntime(pointMm[0], pointMm[1], view.focusZ ?? 0));
}

function frameNeedsRender(now, inputs) {
  const matrix = inputs.panels[0].matrix;
  let moved = false;
  for (let index = 0; index < 16; index += 1) {
    if (matrix[index] !== lastRender.matrix[index]) {
      moved = true;
      break;
    }
  }
  if (moved) {
    // While the camera moves nothing else needs comparing.
    lastRender.matrix.set(matrix);
    lastRender.key = "";
    lastRender.at = now;
    return true;
  }
  const key = [
    canvas.width,
    canvas.height,
    board.renderer.version,
    board.renderer.selectedOccurrence,
    state.workspace,
    state.mode,
    inputs.activeNetId,
    inputs.selectedFeatureId,
    inputs.showBoard,
    inputs.showComponents,
    inputs.showPaste,
    inputs.componentOpacity,
    inputs.boardOpacity,
    inputs.isolateNet,
    board.scene.layerZOffsetSignature,
    [...inputs.visibleLayers].join(","),
    [...inputs.compareOffsets].map(([id, offset]) => `${id}:${offset}`).join(";"),
    inputs.layerAlphas ? [...inputs.layerAlphas].join(";") : "",
  ].join("|");
  const animating = Boolean(inputs.activeNetId || inputs.selectedFeatureId || board.renderer.emphasizedNetIds.size);
  const stale = animating
    || key !== lastRender.key
    || !sameSet(inputs.visibleTileIds, lastRender.tiles)
    || now - lastRender.at > IDLE_REFRESH_MS;
  if (!stale) return false;
  lastRender.key = key;
  // The tile set is replaced, never mutated, so keeping the reference is enough.
  lastRender.tiles = inputs.visibleTileIds;
  lastRender.at = now;
  return true;
}

// The system view's counterpart of `frameNeedsRender` (R1): every board's renderer
// version (placements, moves, tiles and parts loading all bump it), the draw
// state the per-frame inputs carry, and the camera. Lit nets pulse, at 30 fps (R3).
const PULSE_FRAME_MS = 1000 / 30 - 2; // a little under, so a 60 Hz display draws every other frame
const lastSystemRender = { scene: null, key: "", matrix: new Float32Array(16), tiles: new Map(), at: 0 };

function systemFrameNeedsRender(now, inputs, emphasis) {
  const matrix = panel.matrix;
  let moved = false;
  for (let index = 0; index < 16; index += 1) {
    if (matrix[index] !== lastSystemRender.matrix[index]) {
      moved = true;
      break;
    }
  }
  // A new scene (another system, or the same one reloaded) always draws its first frame.
  if (lastSystemRender.scene !== system.scene) {
    lastSystemRender.scene = system.scene;
    moved = true;
  }
  if (moved) {
    lastSystemRender.matrix.set(matrix);
    lastSystemRender.key = "";
    lastSystemRender.at = now;
    return true;
  }
  const parts = [
    canvas.width,
    canvas.height,
    state.showBoard,
    state.showComponents,
    state.isolateNet,
    state.activeNetId,
    state.selectedFeatureId,
    state.selectedOccurrence,
    system.showLabels,
    emphasis,
    copperRealism(),
    selectionKey(),
    system.scene.tubeVersion,
  ];
  for (const renderer of system.scene.renderers) {
    const options = inputs.get(renderer);
    parts.push(
      renderer.version,
      renderer.occurrenceCount,
      renderer.selectedOccurrence,
      renderer.dimCopper,
      renderer.standIn ? renderer.boxColor.join(",") : "",
      options ? [...options.visibleLayers].join(",") : "",
      options?.layerOffsets ? Array.prototype.join.call(options.layerOffsets, ",") : "",
    );
  }
  const key = parts.join("|");
  let tilesChanged = false;
  for (const [renderer, options] of inputs) {
    if (!sameSet(options.visibleTileIds, lastSystemRender.tiles.get(renderer))) tilesChanged = true;
  }
  const animating = Boolean(emphasis || state.activeNetId || state.selectedFeatureId);
  const changed = tilesChanged || key !== lastSystemRender.key;
  // R3: with the view still, only the highlight pulse moves; a slow sine needs no more than 30 fps.
  const pulse = animating && now - lastSystemRender.at >= PULSE_FRAME_MS;
  const stale = changed || pulse || now - lastSystemRender.at > IDLE_REFRESH_MS;
  if (!stale) return false;
  lastSystemRender.key = key;
  // Tile sets are replaced, never mutated, so keeping the references is enough.
  lastSystemRender.tiles = new Map([...inputs].map(([renderer, options]) => [renderer, options.visibleTileIds]));
  lastSystemRender.at = now;
  return true;
}

function sameSet(a, b) {
  if (!a || !b) return a === b;
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
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

function stackupOffsets(b = board) {
  const bounds = sceneRuntimeBounds(b);
  const diagonal = Math.hypot(
    (bounds[3] - bounds[0]) * 1000,
    (bounds[4] - bounds[1]) * 1000,
  );
  const gap = state.separation * state.separation * clamp(diagonal * 0.12, 8, 25) / 1000;
  const signature = `${state.separation}:${gap}:${b.scene.copperLayers.length}`;
  if (b.scene.layerZOffsetSignature === signature) return b.scene.layerZOffsets;
  const output = b.scene.layerZOffsets;
  output.fill(0);
  const middle = (b.scene.copperLayers.length - 1) / 2;
  b.scene.copperLayers.forEach((layer, index) => {
    output[Number(layer.id)] = (middle - index) * gap;
  });
  b.scene.layerZOffsetSignature = signature;
  return output;
}

function updateCompareLayout(now) {
  if (state.mode !== "layer") {
    compareAnimation.key = "3d";
    compareAnimation.current.clear();
    return new Map();
  }
  const selected = board.scene.copperLayers.filter((layer) => board.compareLayers.has(Number(layer.id)));
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
  if (setsEqual(target, board.desiredCompareLayers) && compareTransition.phase !== "idle") return;
  board.desiredCompareLayers = target;
  if (setsEqual(target, board.compareLayers)) {
    compareTransition.phase = "idle";
    compareTransition.previous.clear();
    compareTransition.target.clear();
    return;
  }
  compareTransition.phase = "preload";
  compareTransition.previous = new Set(board.compareLayers);
  compareTransition.target = new Set(target);
  compareTransition.previousOffsets = new Map(compareAnimation.current);
  compareTransition.started = performance.now();
  scheduleTileResidency(compareTransition.started, { force: true });
}

function activatePcbLayerMode({ snap = true } = {}) {
  state.mode = "layer";
  const target = ensurePcbCompareLayers();
  board.desiredCompareLayers = new Set(target);
  if (!board.compareLayers.size && target.size) {
    board.compareLayers = new Set(target);
  }
  compareTransition.phase = "idle";
  compareTransition.previous.clear();
  compareTransition.target.clear();
  compareAnimation.key = "";
  camera.setAxis("z", false);
  board.renderer?.resize();
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
    board.compareLayers = new Set(compareTransition.target);
    compareAnimation.key = "";
    return;
  }
  if (compareTransition.phase === "reveal" && now - compareTransition.started >= COMPARE_REVEAL_DURATION_MS) {
    board.compareLayers = new Set(compareTransition.target);
    compareTransition.phase = "idle";
    compareTransition.previous.clear();
    compareTransition.target.clear();
    compareTransition.previousOffsets.clear();
    scheduleTileResidency(now, { force: true });
  }
}

function compareTargetTilesReady(targetLayers, b = board) {
  for (const tile of b.scene.tiles.values()) {
    if (!targetLayers.has(Number(tile.layerId))) continue;
    if (!b.scene.residentTiles.has(tile.id) && !b.scene.failed.has(tile.id)) return false;
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
  viewerKindEl.textContent = board.viewerReadiness.stage === "semantic-ready"
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
  const nets = board.scene.nets.filter((net) => String(net.name).toLowerCase().includes(value)).slice(0, 8);
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
  const net = board.scene.nets.find((item) => Number(item.id) === netId);
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
  const net = board.scene.nets.find((item) => item.uid === netUid);
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
  const net = selection.netUid ? board.scene.nets.find((item) => item.uid === selection.netUid) : null;
  const component = selection.reference ? board.scene.componentFeatures.get(selection.reference) : null;
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
    const net = board.scene.nets.find((item) => item.uid === feature.netUid);
    if (net) {
      selectSchematicNet(Number(net.id), false);
      state.selectedSchematicFeature = { ...feature, pageId: page.id };
      schematicRenderer.selectedFeatureId = featureId;
      return;
    }
  }
  if (feature.reference) {
    const component = board.scene.componentFeatures.get(feature.reference);
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
  notifyViewStateChange();
}

function layersForActiveNet() {
  const layers = new Set();
  for (const netId of emphasizedNetIds()) {
    for (const layerId of layersForNet(netId)) layers.add(layerId);
  }
  return layers;
}

function layersForNet(netId, b = board) {
  const layers = new Set();
  // The manifest's net record is the source of truth. It is available before
  // tile residency begins, whereas deriving membership only from resident tile
  // state can leave isolation with an empty layer set on its first activation.
  const net = b.scene.nets.find((item) => Number(item.id) === Number(netId));
  const copperLayerIds = new Set(b.scene.copperLayers.map((layer) => Number(layer.id)));
  for (const layerId of Object.keys(net?.layerBoundsMm || {})) {
    const numericId = Number(layerId);
    if (copperLayerIds.has(numericId)) layers.add(numericId);
  }

  // Older manifests may only expose the human-readable layer list.
  if (!layers.size) {
    const idsByName = new Map(b.scene.copperLayers.map((layer) => [layer.name, Number(layer.id)]));
    for (const layerName of net?.metrics?.layers || []) {
      const layerId = idsByName.get(layerName);
      if (layerId != null) layers.add(layerId);
    }
  }

  // Retain compatibility with manifests generated before per-net layer bounds.
  if (layers.size) return layers;
  for (const tile of b.scene.tiles.values()) {
    if (tileHasNet(tile, netId)) layers.add(Number(tile.layerId));
  }
  return layers;
}

function applyNetIsolationLayers() {
  if (system) {
    for (const b of systemBoards()) refreshBoardLayers(b);
    return;
  }
  const layers = layersForActiveNet();
  if (!layers.size) return;
  board.visible3dLayers = new Set(layers);
  if (state.mode === "layer") beginCompareLayerTransition(layers);
  else {
    board.compareLayers = new Set(layers);
    board.desiredCompareLayers = new Set(layers);
  }
  scheduleTileResidency(performance.now(), { force: true });
}

function setNetIsolation(enabled) {
  const next = Boolean(enabled && anyEmphasis());
  const wasIsolating = state.isolateNet;
  if (next && !state.isolateNet && !system) {
    board.preIsolation3dLayers = new Set(board.visible3dLayers);
    board.preIsolationCompareLayers = new Set(board.desiredCompareLayers.size
      ? board.desiredCompareLayers
      : board.compareLayers);
  }
  state.isolateNet = next;
  if (system) {
    // A system board's layers follow its placements and the lit nets (refreshBoardLayers).
    applyNetIsolationLayers();
  } else if (state.isolateNet) {
    applyNetIsolationLayers();
  } else if (board.preIsolation3dLayers || board.preIsolationCompareLayers) {
    if (board.preIsolation3dLayers) {
      board.visible3dLayers = new Set(board.preIsolation3dLayers);
    }
    if (board.preIsolationCompareLayers) {
      const restored = new Set(board.preIsolationCompareLayers);
      if (state.mode === "layer") beginCompareLayerTransition(restored);
      else {
        board.compareLayers = restored;
        board.desiredCompareLayers = new Set(restored);
      }
    }
    board.preIsolation3dLayers = null;
    board.preIsolationCompareLayers = null;
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
  viewControlsEl.querySelector("#show-board").checked = state.showBoard;
  viewControlsEl.querySelector("#show-components").checked = state.showComponents;
  viewControlsEl.querySelector("#separation").value = state.separation;
  const list = layersEl.querySelector(".layer-list");
  const selected = state.mode === "3d" ? board.visible3dLayers : board.desiredCompareLayers;
  list.innerHTML = board.scene.copperLayers.map((layer, index) => `
    <label class="layer-row">
      <input type="checkbox" data-layer="${layer.id}" ${selected.has(Number(layer.id)) ? "checked" : ""}>
      <span class="swatch" style="background:${rgbCss(layerColor(layer))}"></span>
      <span>${escapeHtml(layer.name)}</span><small>${index + 1}</small>
    </label>`).join("");
  list.querySelectorAll("[data-layer]").forEach((input) => input.addEventListener("change", () => {
    setLayerVisible(Number(input.dataset.layer), input.checked);
  }));
  syncNetIsolationControls();
}

function setViewMode(mode) {
  if (mode === "layer") {
    activatePcbLayerMode();
  } else {
    state.mode = "3d";
    camera.frame(sceneRuntimeBounds());
    camera.snap();
    board.visibleTileIds = new Set();
    scheduleTileResidency(performance.now(), { force: true });
  }
  refreshControls();
}

function setLayerVisible(layerId, visible, placementKey = null) {
  if (system) {
    const id = Number(layerId);
    setPlacementLayers(placementKey == null ? null : [placementKey], (hidden) => (visible ? hidden.delete(id) : hidden.add(id)));
    return;
  }
  if (state.mode === "3d") {
    visible ? board.visible3dLayers.add(layerId) : board.visible3dLayers.delete(layerId);
    scheduleTileResidency(performance.now(), { force: true });
  } else {
    const target = new Set(board.desiredCompareLayers);
    visible ? target.add(layerId) : target.delete(layerId);
    beginCompareLayerTransition(target);
  }
  refreshControls();
}

function applyLayerPreset(preset, placementKey = null) {
  if (system) {
    setPlacementLayers(placementKey == null ? null : [placementKey], (hidden, b) => {
      const layers = b?.scene.copperLayers || [];
      hidden.clear();
      layers.forEach((layer, index) => {
        const shown = preset === "all"
          || (preset === "outer" && (index === 0 || index === layers.length - 1))
          || (preset === "inner" && index > 0 && index < layers.length - 1);
        if (!shown) hidden.add(Number(layer.id));
      });
    });
    return;
  }
  const target = state.mode === "3d" ? board.visible3dLayers : new Set();
  target.clear();
  for (const [index, layer] of board.scene.copperLayers.entries()) {
    const include = preset === "all"
      || (preset === "outer" && (index === 0 || index === board.scene.copperLayers.length - 1))
      || (preset === "inner" && index > 0 && index < board.scene.copperLayers.length - 1);
    if (include) target.add(Number(layer.id));
  }
  if (state.mode === "3d") scheduleTileResidency(performance.now(), { force: true });
  else beginCompareLayerTransition(target);
  refreshControls();
}

function setShowBoard(visible) {
  state.showBoard = Boolean(visible);
  state.savedShowBoard = state.showBoard;
  if (state.showBoard && state.isolateNet) setNetIsolation(false);
  else syncNetIsolationControls();
}

function setShowComponents(visible) {
  state.showComponents = Boolean(visible);
  state.savedShowComponents = state.showComponents;
  syncNetIsolationControls();
}

function setShowPlaceholders(visible) {
  state.showPlaceholders = Boolean(visible);
  for (const b of system ? systemBoards() : [board]) b.renderer?.setPlaceholdersVisible(state.showPlaceholders);
  notifyViewStateChange();
}

/** KiCad-like copper (surface finish outside, bare copper inside) or per-layer colours. */
function setRealisticColors(enabled) {
  state.realisticColors = Boolean(enabled);
  applyCopperColors();
  notifyViewStateChange();
}

function applyCopperColors(b = board) {
  if (!b.renderer) return;
  const layers = new Map(b.scene.layers.map((layer) => [Number(layer.id), layer]));
  for (const entry of b.renderer.entries) {
    if (entry.kind === "copper") entry.color = copperColor(layers.get(Number(entry.layerId)), b);
  }
  b.renderer.setBarrelColor(mixColor(DEFAULT_BARREL_COLOR, [...finishColor(b).slice(0, 3), 0.78], copperRealism()));
  b.scene.copperRealism = copperRealism();
}

function setSeparation(value, placementKey = null) {
  if (system) {
    setPlacementSeparation(clamp(Number(value) || 0, 0, 1), placementKey);
    return;
  }
  state.separation = clamp(Number(value) || 0, 0, 1);
  notifyViewStateChange();
}

function bindControlEvents() {
  (modeSwitchEl || layersEl).querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    setViewMode(button.dataset.mode);
  }));
  layersEl.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    applyLayerPreset(button.dataset.preset);
  }));
  viewControlsEl.querySelector("#show-board").addEventListener("change", (event) => {
    setShowBoard(event.target.checked);
  });
  viewControlsEl.querySelector("#show-components").addEventListener("change", (event) => {
    setShowComponents(event.target.checked);
  });
  viewControlsEl.querySelector("#separation").addEventListener("input", (event) => {
    setSeparation(event.target.value);
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
  if (system) {
    showPlacementNetLayers();
    return;
  }
  const net = board.scene.nets.find((item) => Number(item.id) === state.activeNetId);
  if (!net) return;
  const names = new Set(net.metrics?.layers || []);
  const target = state.mode === "3d" ? board.visible3dLayers : new Set();
  target.clear();
  for (const layer of board.scene.copperLayers) {
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
  const nets = board.scene.nets.filter((net) => String(net.name).toLowerCase().includes(value)).slice(0, 8);
  const components = [...board.scene.componentFeatures.values()].filter((item) =>
    !board.hiddenComponents.has(String(item.designator || ""))
    && `${item.designator} ${item.value} ${item.footprint}`.toLowerCase().includes(value)).slice(0, 6);
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
  const net = board.scene.nets.find((item) => Number(item.id) === netId);
  if (state.workspace === "schematic" && net && schematicRenderer) {
    schematicScene.activeNetUid = net.uid;
    schematicRenderer.activeNetUid = net.uid;
  }
  applyNetProbeVisibility();
  selectionEl.textContent = JSON.stringify(net || {}, null, 2);
  updateSelectionCard();
  if (state.isolateNet) applyNetIsolationLayers();
  if (shouldFrame && net?.boundsMm) camera.frame(placedBounds(runtimeBounds(net.boundsMm)));
  scheduleTileResidency(performance.now(), { force: true });
  emitSelectionChange(netSelection(net));
}

function selectFeature(featureId, shouldFrame = false) {
  const feature = board.scene.features.get(featureId);
  if (
    feature?.kind === "component"
    && isComponentHidden(componentReferenceFromFeature(feature), board.hiddenComponents)
  ) return;
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
  if (isComponentHidden(reference, board.hiddenComponents)) return;
  const component = board.scene.componentFeatures.get(reference);
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
    const feature = board.scene.features.get(Number(component.featureId));
    if (feature?.bounds) framePcbFeature(feature, true);
  }
  updateSelectionCard();
}

function componentReferenceFromFeature(feature) {
  return feature?.designator || feature?.reference || feature?.componentDesignator || "";
}

function componentFeatureGroups(b = board) {
  return buildComponentFeatureGroups(
    b.scene.manifest?.components || [],
    b.scene.componentModelCounts,
  );
}

/**
 * Replace the hidden component set (VAR-18). Ambiguous references (alternate
 * footprints) and unknown references are reported and stay visible; hiding the
 * current selection clears it, and search results drop hidden references so
 * nothing can frame an invisible model.
 */
function applyHiddenComponents(references) {
  // Kept so the plan can be redone once component models are known (see loadComponents).
  board.hiddenComponentRequest = references;
  const plan = planComponentVisibility(references, componentFeatureGroups());
  board.hiddenComponents = plan.hiddenReferences;
  board.renderer?.setHiddenFeatureIds(plan.hiddenFeatureIds);
  if (plan.ambiguous.length) {
    console.warn(
      `[prism-semantic-viewer] keeping ambiguous components visible: ${plan.ambiguous.join(", ")}`,
    );
  }
  if (plan.unknown.length) {
    console.warn(
      `[prism-semantic-viewer] ignoring unknown components: ${plan.unknown.join(", ")}`,
    );
  }
  const selectedReference = componentReferenceFromFeature(
    board.scene.features.get(state.selectedFeatureId),
  );
  if (isComponentHidden(selectedReference, board.hiddenComponents)) clearSelection();
  const searchInput = searchControlsEl.querySelector("input");
  if (searchInput?.value) renderSearch(searchInput.value);
  return plan;
}

function framePcbFeature(feature, forceComponent = false) {
  if (!feature?.bounds) return;
  const bounds = placedBounds(feature.bounds);
  const isComponent = forceComponent || feature.kind === "component" || Boolean(componentReferenceFromFeature(feature));
  if (isComponent) {
    const centerZ = (bounds[2] + bounds[5]) * 0.5;
    const isBottomComponent = centerZ < 0;
    // Compare against the destination orientation as well as the current
    // interpolated camera. Repeated cross-probes during an in-progress flip
    // must not cancel or reverse the requested board side.
    const isCameraBottom = camera.isBelow();
    if (isBottomComponent !== isCameraBottom) {
      camera.setAxis("z", isBottomComponent);
    }
  }
  camera.frame(bounds);
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

/**
 * Drop the inspected object. The highlighted net set is the host's: only
 * `setHighlightedNets` changes it, so an empty click or Esc here reads the
 * same as on the board — the inspected object goes, the nets stay lit.
 */
function clearSelection() {
  state.activeNetId = 0;
  state.selectedFeatureId = 0;
  if (system) {
    system.boardSelected = false;
    system.standInKey = null;
  }
  state.selectedSchematicFeature = null;
  state.selectionAnchor = null;
  const stillEmphasised = anyEmphasis();
  const wasIsolating = state.isolateNet;
  if (wasIsolating && !stillEmphasised) setNetIsolation(false);
  else if (!stillEmphasised) {
    // Still clear isolation bookkeeping without forcing substrate ON.
    state.isolateNet = false;
  } else if (wasIsolating) applyNetIsolationLayers();
  if (!stillEmphasised) restoreViewVisibilityPrefs();
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
  const details = board.topology.net_details?.[net.uid] || {};
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
  notifyViewStateChange();
  if (state.workspace === "bom") {
    selectionCardEl.hidden = true;
    selectionCardEl.innerHTML = "";
    return;
  }

  const feature = board.scene.features.get(state.selectedFeatureId);
  let component = feature?.kind === "component" ? feature : null;
  const schematicFeature = state.workspace === "schematic" ? state.selectedSchematicFeature : null;
  const schematicPage = schematicFeature ? schematicScene.byId.get(schematicFeature.pageId) : null;
  let net = state.activeNetId
    ? board.scene.nets.find((item) => Number(item.id) === state.activeNetId)
    : null;

  // Consolidate schematic selections to Net or Component
  if (!net && schematicFeature) {
    if (schematicFeature.netUid) {
      net = board.scene.nets.find(n => n.uid === schematicFeature.netUid);
    } else if (schematicFeature.netName) {
      net = findNetByName(board.scene.nets, schematicFeature.netName);
    }
  }

  if (!component && schematicFeature) {
    const designator = schematicFeature.reference || schematicFeature.componentDesignator || schematicFeature.designator;
    if (designator) {
      component = board.scene.componentFeatures.get(designator) || { designator };
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
        
        const details = board.topology.net_details?.[net.uid] || {};
        const terminals = details.terminals || [];
        const terminal = terminals.find(t => t.designator === ref && t.pin === pin);
        
        const padFeatureId = findTerminalPadFeatureId(terminal);
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
      const targetNet = findNetByName(board.scene.nets, netName);
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
  const feature = board.scene.features.get(state.selectedFeatureId);
  if (feature?.bounds) {
    framePcbFeature(feature);
  } else {
    const net = board.scene.nets.find((item) => Number(item.id) === state.activeNetId);
    if (net?.boundsMm) camera.frame(placedBounds(runtimeBounds(net.boundsMm)));
  }
}

function bindInteractions() {
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (system) system.framed = true;
    if (system && startRouteDrag(event)) return;
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.dragMode =
      state.mode === "layer"
      || event.shiftKey
      || event.button !== 0
        ? "pan"
        : "orbit";
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (system && moveRouteDrag(event)) return;
    // Route mode: a harness under the pointer can be bent.
    if (system?.move.route && !state.dragging) canvas.style.cursor = tubeAt(event) ? "crosshair" : "";
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    if (state.dragMode === "pan") camera.pan(dx, dy, canvas.clientHeight, state.mode === "layer");
    else camera.orbit(dx, dy);
  });
  canvas.addEventListener("pointerup", async (event) => {
    if (system && endRouteDrag(event)) return;
    state.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
    if (Math.hypot(event.clientX - state.pointerStartX, event.clientY - state.pointerStartY) >= 3) return;
    if (event.button === 0) await pickAt(event);
    else if (event.button === 2) await contextPickAt(event);
  });
  canvas.addEventListener("dblclick", async (event) => {
    await pickAt(event);
    frameSelection();
  });
  canvas.addEventListener("wheel", (event) => {
    if (system) system.framed = true;
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
    board.renderer?.resize();
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

// Picks resolve out of order (the GPU read is async): only the latest click selects.
let pickSequence = 0;

async function pickAt(event) {
  if (!panel) return;
  const sequence = ++pickSequence;
  const rect = canvas.getBoundingClientRect();
  state.selectionAnchor = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  // A tube under the cursor wins over the boards behind it (SB2-45b).
  if (system && pickSystemTube(event)) return;
  const hit = await pickHitAtEvent(event);
  if (sequence !== pickSequence) return;
  if (system) {
    selectSystemHit(hit);
    return;
  }
  if (hit.kind === "feature" || hit.kind === "board") state.selectedOccurrence = hit.occurrenceIndex;
  if (hit.featureId) selectFeature(hit.featureId, true);
  // Board context exists only in system scenes; the one-board view clears as it always has.
  else if (hit.kind === "board" && !board.renderer.identityOnly) selectBoardContext();
  else clearSelection();
}

/**
 * Right-click without a drag: report what is under the cursor to the host,
 * which owns the menu. The selection is left alone.
 */
async function contextPickAt(event) {
  if (!panel || !contextMenuCallback) return;
  const hit = await pickHitAtEvent(event);
  // In a system scene the part may be on any board.
  const hitBoard = system ? system.placements.get(hit.occurrenceKey)?.board : board;
  if (!hitBoard) return;
  const feature = hitBoard.scene.features.get(hit.featureId);
  const reference = componentReferenceFromFeature(feature);
  const component = reference ? findTopologyComponent(reference, hitBoard) : null;
  contextMenuCallback({
    clientX: event.clientX,
    clientY: event.clientY,
    reference: reference || undefined,
    value: String(component?.value || feature?.value || "") || undefined,
  });
}

/**
 * Where a client point meets a model occurrence marked `pickSurface` (SB2-48b): `{occurrence, pointMm,
 * normal, toCamera}` in world millimetres, the normal facing the viewer; null on empty space.
 */
function pickSurfaceAt(clientX, clientY) {
  if (!system || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  const ray = cameraRay(camera, ndcX, ndcY, rect.width / Math.max(rect.height, 1));
  const models = system.placed
    .filter((item) => item.primitives && item.occurrence.pickSurface)
    .map((item) => ({ key: item.occurrence.path, matrix: item.matrix, primitives: item.primitives }));
  const hit = surfaceHit(models, ray);
  if (!hit) return null;
  return { occurrence: hit.key, pointMm: hit.point.map((value) => value / MOVE_MM), normal: hit.normal,
    toCamera: ray.direction.map((value) => -value) };
}

/** Select an occurrence for move mode by path (SB2-48b: the host puts the gizmo on a connector). */
function focusMoveTarget(path) {
  const item = path != null ? system?.placements.get(String(path)) : null;
  if (!item) return false;
  selectStandIn(item);
  return true;
}

function pickHitAtEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return pickHit((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
}

// Pick at canvas pixel (x, y): { kind, occurrenceIndex, occurrenceKey, featureId }.
function pickHit(x, y) {
  if (system) return pickSystem(x, y);
  return board.renderer.pick(panel, x, y, {
    activeNetId: state.activeNetId,
    selectedFeatureId: state.selectedFeatureId,
    layerOffsets: stackupOffsets(),
    visibleLayers: state.mode === "3d" ? board.visible3dLayers : board.compareLayers,
    showBoard: state.showBoard,
    showComponents: state.showComponents,
    componentOpacity: clamp(1 - state.separation / 0.1, 0, 1),
    boardOpacity: 1 - state.separation * 0.72,
    isolateNet: state.isolateNet,
    compareMode: state.mode === "layer",
    compareOffsets,
    visibleTileIds: state.mode === "3d" ? board.visibleTileIds : null,
  });
}

async function pickHitAt(clientX, clientY) {
  if (!panel || !(system || board.renderer)) return null;
  const rect = canvas.getBoundingClientRect();
  const hit = await pickHit((clientX - rect.left) * canvas.width / rect.width, (clientY - rect.top) * canvas.height / rect.height);
  // What a click there would select: the same mapping as selectFeature.
  const hitBoard = system ? system.placements.get(hit.occurrenceKey)?.board : board;
  const selection = hit.featureId && hitBoard ? featureSelection(hitBoard.scene.features.get(hit.featureId), hitBoard) : null;
  return { ...hit, renderer: undefined, selection };
}

// A click on a system scene's board away from any feature selects the board
// itself: the host learns which occurrence, and nothing on the board is emphasised.
function selectBoardContext() {
  const occurrence = state.selectedOccurrence;
  // One event for the host: the board selection, not a clear followed by it.
  const quiet = suppressSelectionChange;
  suppressSelectionChange = true;
  try {
    clearSelection();
  } finally {
    suppressSelectionChange = quiet;
  }
  state.selectedOccurrence = occurrence;
  if (system) system.boardSelected = true;
  emitSelectionChange({ kind: "board", sourceContext: "3D" });
}

// A component's top centre for top-side parts, bottom centre for bottom-side ones: the face a click lands on.
function projectComponentCenter(b, reference, project) {
  const component = b.scene.componentFeatures.get(String(reference));
  const bounds = component ? b.scene.features.get(Number(component.featureId))?.bounds : null;
  if (!bounds) return null;
  const top = (bounds[2] + bounds[5]) >= 0;
  return project([(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, top ? bounds[5] : bounds[2]]);
}

/** Client px of a board-local runtime point placed by `model`, or null off screen. */
function projectBoardPoint(local, model) {
  if (!panel) return null;
  const pixel = projectToViewport(panel.matrix, transformPoint(model, local), panel.viewport);
  if (!pixel) return null;
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + pixel.x * rect.width / canvas.width, y: rect.top + pixel.y * rect.height / canvas.height };
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
  if (system && handleSystemKey(event, key)) {
    event.preventDefault();
    return;
  }
  if (key === "/") {
    event.preventDefault();
    openTab("search");
    searchControlsEl.querySelector("#entity-search").focus();
  } else if (key === "escape") clearSelection();
  else if (key === "i" && state.workspace === "pcb" && anyEmphasis()) {
    event.preventDefault();
    setNetIsolation(!state.isolateNet);
  }
  else if (key === "home") camera.frame(system ? system.bounds || sceneRuntimeBounds() : sceneRuntimeBounds());
  else if (key === "`") setStatsOverlay(!state.showStats);
  else if (["x", "y", "z"].includes(key)) camera.setAxis(key, event.shiftKey);
  else if (key === "f") camera.flip();
  else if (key === "r") camera.rotateZ(event.shiftKey ? -1 : 1);
  else if (key === " ") {
    event.preventDefault();
    const feature = board.scene.features.get(state.selectedFeatureId);
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
  labelsEl.innerHTML = board.scene.copperLayers
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
  updateSceneStats();
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
      ["Active net", board.scene.nets.find((net) => net.uid === schematicScene.activeNetUid)?.name || "-"],
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
      ["Active net", board.scene.nets.find((net) => net.uid === schematicScene.activeNetUid)?.name || "-"],
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
    ["Visible layers", state.mode === "3d" ? board.visible3dLayers.size : board.compareLayers.size],
    ["Resident tiles", board.scene.loaded.size],
    ["Loading tiles", board.scene.loading.size],
    ["Failed tiles", board.scene.failed.size],
    ["Triangles", Math.round(board.triangles).toLocaleString()],
    ["Downloaded", `${(board.loadedBytes / 1048576).toFixed(1)} MB`],
    ["Resident GLB", `${(board.residentTileBytes / 1048576).toFixed(1)} MB`],
    ["Resident GPU", `${(board.residentTileGpuBytes / 1048576).toFixed(1)} MB`],
    ["Tile loads", board.tileLoads.toLocaleString()],
    ["Tile evictions", board.tileEvictions.toLocaleString()],
    ["Tile scheduler", `${board.tileSchedulerMs.toFixed(2)} ms`],
    ["Active net", board.scene.nets.find((net) => Number(net.id) === state.activeNetId)?.name || "-"],
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

  const layers = board.scene.layers || [];
  if (!layers.length) {
    stackupWorkspaceViewEl.innerHTML = `<div class="selection-empty" style="padding:40px;text-align:center;">No stackup information available for this board.</div>`;
    return;
  }

  const physicalLayers = layers.filter(
    (l) => ["copper", "dielectric", "paste", "silkscreen", "soldermask"].includes(l.role)
  );
  const stackupMetadata = board.topology.board?.stackup || {};
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
  const copperLayers = board.scene.copperLayers || [];
  let thruCount = 0;
  let blindCount = 0;
  let buriedCount = 0;

  const viaRecords = [
    ...(board.scene.manifest?.barrels || []).filter((barrel) => barrel.kind === "via"),
    ...[...board.scene.features.values()].filter((feature) => feature.kind === "via"),
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
  const netClasses = board.topology.board?.net_classes || [];
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
