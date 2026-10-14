/**
 * The semantic viewer's mode controllers (AC-30).
 *
 * `<prism-semantic-viewer>` runs in one of two modes: one board from a bundle
 * (the default) or several boards from a system scene (`mode="system"`). Each
 * mode is a controller instance the element keeps for its whole life. A
 * controller holds what the host asked for, and while a scene is mounted it
 * drives that scene through a port; when a reload mounts a new scene, the
 * controller replays the host's state onto it.
 *
 * The ports are the narrow, synchronous surface `main.js` returns from
 * `mountStandaloneViewer` (board) and `mountSystemViewer` (system). Everything
 * here runs without a GPU or a DOM, so tests drive it against a fake scene.
 *
 * @typedef {object} ScenePort Both modes.
 * @property {Record<string, number>} [performance] Timings of the mount.
 * @property {() => void} dispose
 * @property {() => Array<{id: number, uid?: string, name?: string, aliases?: string[]}>} nets
 *   The scene nets selections resolve against (the focused board's in a system).
 * @property {(apply: () => void) => void} quietly Run `apply` without echoing selection events.
 * @property {(id: number, frame: boolean) => void} selectNet
 * @property {(id: number, frame: boolean) => void} selectFeature
 * @property {(reference: string, frame: boolean) => void} selectComponent
 * @property {() => void} clearSelection
 * @property {() => boolean} anyEmphasis Whether any net is drawn lit.
 * @property {() => void} showNetProbe Hide board and components, as a net probe does.
 * @property {() => void} restoreVisibility Bring back the board and components the probe hid.
 * @property {() => boolean} isolating Whether net isolation is on.
 * @property {() => void} isolateLitNets Show only the layers the lit nets use.
 * @property {(enabled: boolean) => void} setNetIsolation
 * @property {(bytes: number) => void} setGpuBudget A normalised budget (`gpuBudgetBytes`).
 * The remaining members are the view controls both modes share (see COMMON_MEMBERS):
 * resize, getViewState, setLayerVisible, applyLayerPreset, setShowBoard, setShowComponents,
 * setShowPlaceholders, setRealisticColors, setBoardLayerVisible, setSeparation, showNetLayers, setStatsOverlay,
 * stats, setLodOverride, pickAt, projectComponent, projectPoint.
 *
 * @typedef {ScenePort & object} BoardScenePort One board (mountStandaloneViewer).
 * @property {(key: string) => void} selectOccurrence
 * @property {(ids: Set<number>) => void} setHighlightedNetIds
 * @property {() => void} refreshResidency Reschedule copper tiles now (what is lit changed).
 * @property {(workspace: "pcb" | "stackup") => void} setWorkspace
 * @property {(references: string[]) => unknown} setHiddenComponents
 * @property {() => string[]} getComponentReferences
 * @property {(mode: "3d" | "layer") => void} setViewMode
 * @property {(canvas: object, view: object, key?: string) => boolean} renderInset
 * @property {() => boolean} insetReady
 * @property {(key: string) => void} releaseInset
 * @property {() => {scene: object, topology: object}} insetBoard The board insets look at.
 * @property {(listener: () => void) => () => void} onSceneChange The main view redrew.
 * @property {() => object} insetStats
 * @property {(settings?: object) => object} insetSettings
 * @property {() => Promise<void>} gpuIdle
 * @property {(bytes: Uint8Array, options?: object) => Promise<object | null>} loadAnalyticPack
 * @property {(overlay: object | null) => unknown} setAnalyticOverlay
 * @property {(vectors: object | null) => unknown} setAnalyticVectors
 * @property {(style: object) => unknown} setAnalyticStyle
 * @property {() => object} analyticColormaps
 * @property {(clientX: number, clientY: number) => object | null} analyticProbe
 * @property {(clientX: number, clientY: number) => Promise<object | null>} analyticAt
 * @property {() => object | null} analyticStats
 * @property {() => void} unloadAnalyticPack
 *
 * @typedef {ScenePort & object} SystemScenePort Several boards (mountSystemViewer).
 * @property {(occurrence: string | undefined) => "board" | "stand-in" | null} focusPlacement
 *   Select a placement for a host selection: its board is focused ("board"), it
 *   is selected as itself ("stand-in"), or it is not placed (null).
 * @property {() => void} selectBoardContext Select the focused placement's board itself.
 * @property {(sets: object[]) => object[] | null} setEmphasisSets Light normalised sets; returns the
 *   report, or null when the scene's system is gone.
 * Plus the system members in SYSTEM_MEMBERS (setSystemScene, setMoveAllowed, setMoveMode, …).
 */

import { EMPHASIS_PALETTE, findNetByName, packEmphasisColor, resolveNetIds } from "./net-emphasis.js";
import { insetSurfaceZ, insetTarget, projectInsetPoint } from "./inset-view.js";

/** The GPU memory budget when the host sets none, or an unusable one. */
export const DEFAULT_GPU_BUDGET_BYTES = 1.5 * 1024 * 1024 * 1024;

/** A host's GPU budget as bytes the scene can use. */
export function gpuBudgetBytes(bytes) {
  const value = Number(bytes);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GPU_BUDGET_BYTES;
}

/**
 * What a host selection (`PrismRendererSelection`) asks for on a board:
 * `net` (by uid, then name or alias, then id), `feature`, `component`;
 * `unresolved` when a named net is not on the board; `board` when the
 * selection names nothing on it.
 */
export function selectionTarget(nets, selection) {
  if (selection.netName || selection.netUid) {
    const match = (selection.netUid && nets.find((item) => item.uid === selection.netUid))
      || (selection.netName && findNetByName(nets, selection.netName));
    return match ? { kind: "net", id: Number(match.id) } : { kind: "unresolved" };
  }
  if (selection.netId) return { kind: "net", id: Number(selection.netId) };
  if (selection.featureId) return { kind: "feature", id: Number(selection.featureId) };
  if (selection.reference) return { kind: "component", reference: String(selection.reference) };
  return { kind: "board" };
}

/** Select a resolved target on the port, framing it. False for `board` and `unresolved`. */
function selectTarget(port, target) {
  if (target.kind === "net") port.selectNet(target.id, true);
  else if (target.kind === "feature") port.selectFeature(target.id, true);
  else if (target.kind === "component") port.selectComponent(target.reference, true);
  else return false;
  return true;
}

/** Whether lit nets appeared (`enter`), went (`leave`) or neither, around a change. */
export function emphasisChange(had, has) {
  if (has && !had) return "enter";
  if (!has && had) return "leave";
  return null;
}

/**
 * The host's system net sets as the scene lights them: a key, a packed colour
 * (the next palette colour when none is given) and its "#rrggbb", and only
 * well-formed members and wires.
 */
export function normalizeEmphasisSets(sets) {
  return (Array.isArray(sets) ? sets : []).map((set, index) => {
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
}

/**
 * Host state both modes replay: the last selection and GPU budget. One object
 * is shared by an element's two controllers, so a value set while one mode
 * is mounted reaches the other after a mode switch, as it always has.
 */
export function createSharedState() {
  return { selection: null, gpuBudget: null };
}

/** Members both modes have; the element sends them to the mounted mode. */
export const COMMON_MEMBERS = Object.freeze([
  "setSelection", "resize", "getViewState", "setLayerVisible", "applyLayerPreset", "setShowBoard",
  "setShowComponents", "setShowPlaceholders", "setRealisticColors", "setBoardLayerVisible", "setSeparation", "showNetLayers",
  "setNetIsolation", "setStatsOverlay", "getStats", "setLodOverride", "setGpuBudget", "pickAt",
  "projectComponent", "projectPoint",
]);

class ModeController {
  #port = null;

  constructor(shared = createSharedState()) {
    this.shared = shared;
  }

  /** The mounted scene, or null between mounts. */
  get port() {
    return this.#port;
  }

  /** Drive a freshly mounted scene and replay the host's state onto it. */
  attach(port) {
    if (!port) throw new TypeError("A mode controller attaches to a mounted scene port");
    this.detach();
    this.#port = port;
    this.replay(port);
  }

  /** Dispose the mounted scene, if any. The host's state stays for the next one. */
  detach() {
    const port = this.#port;
    this.#port = null;
    this.release();
    port?.dispose?.();
  }

  /** Mode hooks: replay state onto a new port, release what tied to the old one. */
  replay() {}

  release() {}

  setSelection(selection) {
    this.shared.selection = selection || null;
    const port = this.#port;
    if (port) port.quietly(() => this.applySelection(port, this.shared.selection));
  }

  setGpuBudget(bytes) {
    this.shared.gpuBudget = bytes;
    this.#port?.setGpuBudget(gpuBudgetBytes(bytes));
  }

  resize() {
    this.#port?.resize();
  }

  /** The host-rendered 3D controls' state; null until mounted. */
  getViewState() {
    return this.#port?.getViewState() ?? null;
  }

  setLayerVisible(layerId, visible, placement = null) {
    this.#port?.setLayerVisible(layerId, visible, placement);
  }

  applyLayerPreset(preset, placement = null) {
    this.#port?.applyLayerPreset(preset, placement);
  }

  setShowBoard(visible) {
    this.#port?.setShowBoard(visible);
  }

  setShowComponents(visible) {
    this.#port?.setShowComponents(visible);
  }

  setShowPlaceholders(visible) {
    this.#port?.setShowPlaceholders(visible);
  }

  setRealisticColors(enabled) {
    this.#port?.setRealisticColors(enabled);
  }

  setBoardLayerVisible(role, side, visible) {
    this.#port?.setBoardLayerVisible(role, side, visible);
  }

  setSeparation(value, placement = null) {
    this.#port?.setSeparation(value, placement);
  }

  showNetLayers() {
    this.#port?.showNetLayers();
  }

  setNetIsolation(enabled) {
    this.#port?.setNetIsolation(enabled);
  }

  setStatsOverlay(visible) {
    this.#port?.setStatsOverlay(visible);
  }

  getStats() {
    return this.#port?.stats() ?? null;
  }

  setLodOverride(lod) {
    this.#port?.setLodOverride(lod);
  }

  /** What is under a client point, without selecting it; resolves null before mount. */
  pickAt(clientX, clientY) {
    return Promise.resolve(this.#port?.pickAt(clientX, clientY) ?? null);
  }

  projectComponent(reference, occurrenceKey) {
    return this.#port?.projectComponent(reference, occurrenceKey) ?? null;
  }

  projectPoint(point, occurrenceKey) {
    return this.#port?.projectPoint(point, occurrenceKey) ?? null;
  }
}

/** Members only the one-board mode has. */
export const BOARD_MEMBERS = Object.freeze([
  "setHighlightedNets", "setHiddenComponents", "getComponentReferences", "setViewMode",
  "renderInset", "insetReady", "insetSurfaceZ", "releaseInset", "insetTarget", "projectInset",
  "onSceneChange", "insetStats", "insetSettings", "gpuIdle",
  "loadAnalyticPack", "setAnalyticOverlay", "setAnalyticVectors", "setAnalyticStyle", "analyticColormaps", "analyticProbe", "analyticAt", "analyticStats", "unloadAnalyticPack",
]);

/**
 * One board from a bundle. Replays the workspace, hidden components, GPU
 * budget, selection and highlighted nets onto each mount, and keeps inset
 * hosts' scene listeners across reloads.
 */
export class BoardModeController extends ModeController {
  #highlightedNets = [];
  #hiddenComponents = null;
  #workspace = "pcb";
  #sceneListeners = new Set();
  #unhookScene = null;
  // The analytic pack and overlay outlive reloads, like the other view state.
  #analytic = null;

  attach(port, { workspace = "pcb" } = {}) {
    this.#workspace = workspace;
    super.attach(port);
  }

  replay(port) {
    this.#unhookScene = port.onSceneChange?.(() => this.#notifyScene()) ?? null;
    this.#notifyScene();
    port.setWorkspace(this.#workspace);
    // The hidden set is view state that outlives a reload.
    if (this.#hiddenComponents) port.setHiddenComponents(this.#hiddenComponents);
    if (this.shared.gpuBudget != null) port.setGpuBudget(gpuBudgetBytes(this.shared.gpuBudget));
    // A fresh viewer is already unselected: no redundant clear while it sets up its first frame.
    if (this.shared.selection) port.quietly(() => this.applySelection(port, this.shared.selection));
    if (this.#highlightedNets.length) this.#applyHighlightedNets(port, this.#highlightedNets);
    if (this.#analytic) void this.#replayAnalytic(port, this.#analytic);
  }

  async #replayAnalytic(port, analytic) {
    await port.loadAnalyticPack(analytic.bytes, analytic.options);
    if (analytic.overlay) port.setAnalyticOverlay(analytic.overlay);
    if (analytic.style) port.setAnalyticStyle(analytic.style);
    if (analytic.vectors) port.setAnalyticVectors(analytic.vectors);
  }

  release() {
    this.#unhookScene?.();
    this.#unhookScene = null;
  }

  applySelection(port, selection) {
    if (selection?.occurrence != null) port.selectOccurrence(selection.occurrence);
    if (!selection) port.clearSelection();
    else selectTarget(port, selectionTarget(port.nets(), selection));
  }

  setWorkspace(workspace) {
    this.#workspace = workspace;
    this.port?.setWorkspace(workspace);
  }

  /**
   * Replace the highlighted nets (Prism #305), resolved by uid then name;
   * unresolved ones are dropped. Lighting the first net hides the board and
   * components as a net probe does, and clearing the last brings them back.
   */
  setHighlightedNets(nets) {
    this.#highlightedNets = Array.isArray(nets) ? [...nets] : [];
    const port = this.port;
    if (port) this.#applyHighlightedNets(port, this.#highlightedNets);
  }

  #applyHighlightedNets(port, refs) {
    const ids = resolveNetIds(port.nets(), refs);
    const had = port.anyEmphasis();
    port.setHighlightedNetIds(ids);
    const has = port.anyEmphasis();
    const change = emphasisChange(had, has);
    if (change === "enter") port.showNetProbe();
    else if (change === "leave") port.restoreVisibility();
    if (port.isolating() && has) port.isolateLitNets();
    port.refreshResidency();
  }

  /** Replace the hidden component references (VAR-18). */
  setHiddenComponents(references) {
    this.#hiddenComponents = Array.isArray(references) ? [...references] : [];
    this.port?.setHiddenComponents(this.#hiddenComponents);
  }

  getComponentReferences() {
    return this.port?.getComponentReferences() ?? [];
  }

  setViewMode(mode) {
    this.port?.setViewMode(mode);
  }

  // --- Insets (IN-60/IN-61; the PCB workspace only) ---

  renderInset(canvas, view, key) {
    return Boolean(this.port?.renderInset(canvas, view, key));
  }

  insetReady() {
    return Boolean(this.port?.insetReady());
  }

  insetSurfaceZ(bottom) {
    const port = this.port;
    return port ? insetSurfaceZ(port.insetBoard().scene.runtimeBounds, Boolean(bottom)) : 0;
  }

  releaseInset(key) {
    this.port?.releaseInset(String(key));
  }

  insetTarget(reference, pin) {
    const port = this.port;
    return port ? insetTarget(port.insetBoard(), reference, pin) : null;
  }

  projectInset(view, width, height, pointMm) {
    const port = this.port;
    return port ? projectInsetPoint(port.insetBoard().scene.runtimeBounds, view, width, height, pointMm) : null;
  }

  /** Call `listener` whenever the main view redrew or a scene mounted; survives reloads. */
  onSceneChange(listener) {
    this.#sceneListeners.add(listener);
    return () => this.#sceneListeners.delete(listener);
  }

  #notifyScene() {
    for (const listener of this.#sceneListeners) listener();
  }

  insetStats() {
    return this.port?.insetStats() ?? null;
  }

  insetSettings(settings) {
    return this.port?.insetSettings(settings) ?? null;
  }

  gpuIdle() {
    return this.port?.gpuIdle() ?? Promise.resolve();
  }

  async loadAnalyticPack(bytes, options = {}) {
    const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.#analytic = { bytes: copy, options, overlay: null, vectors: null, style: this.#analytic?.style ?? null };
    return this.port ? this.port.loadAnalyticPack(copy, options) : null;
  }

  setAnalyticOverlay(overlay) {
    if (this.#analytic) this.#analytic.overlay = overlay;
    return this.port?.setAnalyticOverlay(overlay) ?? null;
  }

  setAnalyticVectors(vectors) {
    if (this.#analytic) this.#analytic.vectors = vectors;
    return this.port?.setAnalyticVectors(vectors) ?? null;
  }

  setAnalyticStyle(style) {
    if (this.#analytic) this.#analytic.style = { ...(this.#analytic.style || {}), ...style };
    return this.port?.setAnalyticStyle(style) ?? null;
  }

  analyticColormaps() {
    return this.port?.analyticColormaps() ?? null;
  }

  analyticProbe(clientX, clientY) {
    return this.port?.analyticProbe(clientX, clientY) ?? null;
  }

  analyticAt(clientX, clientY) {
    return this.port?.analyticAt(clientX, clientY) ?? Promise.resolve(null);
  }

  analyticStats() {
    return this.port?.analyticStats() ?? null;
  }

  unloadAnalyticPack() {
    this.#analytic = null;
    this.port?.unloadAnalyticPack();
  }
}

/** Members only the system mode has. */
export const SYSTEM_MEMBERS = Object.freeze([
  "setSystemScene", "setNetEmphasis", "frameNetEmphasis", "frameAll", "frameBoard", "frameParts",
  "setMoveMode", "setRouteMode", "setMoveSpace", "previewPose", "cancelMove", "getMoveState",
  "targetHarnessNode", "selectHarness", "previewHarnessNode", "cancelHarnessNode", "getHarnessState",
  "setLabelsVisible", "setHarnessesVisible", "setHelpVisible", "isHelpVisible", "setLodThresholds",
  "pickSurfaceAt", "focusMoveTarget", "viewAxis",
]);

/**
 * Several boards from a system scene. Replays the GPU budget, the scene, the
 * lit net sets, who may move boards and the labels onto each mount.
 */
export class SystemModeController extends ModeController {
  #scene = null;
  #netEmphasis = null;
  #labels = null;
  #moveAllowed = false;

  attach(port, { moveAllowed = false } = {}) {
    this.#moveAllowed = Boolean(moveAllowed);
    super.attach(port);
  }

  replay(port) {
    if (this.shared.gpuBudget != null) port.setGpuBudget(gpuBudgetBytes(this.shared.gpuBudget));
    if (this.#scene) port.setSystemScene(this.#scene);
    if (this.#netEmphasis) this.#applyNetEmphasis(port, this.#netEmphasis);
    port.setMoveAllowed(this.#moveAllowed);
    if (this.#labels != null) port.setLabelsVisible(this.#labels);
  }

  applySelection(port, selection) {
    if (!selection) {
      port.clearSelection();
      return;
    }
    if (port.focusPlacement(selection.occurrence) !== "board") return;
    const target = selectionTarget(port.nets(), selection);
    if (target.kind === "board") port.selectBoardContext();
    else selectTarget(port, target);
  }

  /** The `prism.system_scene.a0` descriptor to show; the last one is replayed on the next mount. */
  setSystemScene(descriptor) {
    this.#scene = descriptor || null;
    if (descriptor) this.port?.setSystemScene(descriptor);
  }

  /** Light system nets on every board they reach; the report, or [] before mount. */
  setNetEmphasis(sets) {
    this.#netEmphasis = Array.isArray(sets) ? sets : [];
    const port = this.port;
    return port ? this.#applyNetEmphasis(port, this.#netEmphasis) : [];
  }

  #applyNetEmphasis(port, sets) {
    const had = port.anyEmphasis();
    const report = port.setEmphasisSets(normalizeEmphasisSets(sets));
    // Null: the scene's system is gone (its session ended); nothing is lit or changed.
    if (!report) return [];
    const has = port.anyEmphasis();
    const change = emphasisChange(had, has);
    if (change === "enter") port.showNetProbe();
    else if (change === "leave") {
      if (port.isolating()) port.setNetIsolation(false);
      port.restoreVisibility();
    }
    if (port.isolating() && has) port.isolateLitNets();
    return report;
  }

  frameNetEmphasis(key = null, occurrence = null) {
    return this.port?.frameNetEmphasis(key, occurrence) ?? false;
  }

  frameAll() {
    this.port?.frameAll();
  }

  frameBoard(key) {
    return this.port?.frameBoard(key) ?? false;
  }

  frameParts(parts) {
    return this.port?.frameParts(parts) ?? false;
  }

  /** Whether this reader may move boards (the `move-allowed` attribute). */
  setMoveAllowed(allowed) {
    this.#moveAllowed = Boolean(allowed);
    this.port?.setMoveAllowed(this.#moveAllowed);
  }

  setMoveMode(enabled, options) {
    this.port?.setMoveMode(enabled, options);
  }

  /** Route mode (D-P2-51): move mode for harness routes only. */
  setRouteMode(enabled) {
    this.port?.setMoveMode(enabled, { route: true });
  }

  setMoveSpace(space) {
    this.port?.setMoveSpace(space);
  }

  previewPose(pose) {
    this.port?.previewPose(pose);
  }

  cancelMove() {
    this.port?.cancelMove();
  }

  getMoveState() {
    return this.port?.getMoveState() ?? null;
  }

  targetHarnessNode(id) {
    this.port?.targetHarnessNode(id);
  }

  selectHarness(id) {
    return this.port?.selectHarness(id) ?? false;
  }

  previewHarnessNode(positionMm) {
    this.port?.previewHarnessNode(positionMm);
  }

  cancelHarnessNode() {
    this.port?.cancelHarnessNode();
  }

  getHarnessState() {
    return this.port?.getHarnessState() ?? null;
  }

  /** Board name labels (on by default); the last call is replayed on the next mount. */
  setLabelsVisible(visible) {
    this.#labels = Boolean(visible);
    this.port?.setLabelsVisible(this.#labels);
  }

  setHarnessesVisible(visible) {
    this.port?.setHarnessesVisible(Boolean(visible));
  }

  setHelpVisible(visible) {
    this.port?.setHelpVisible(visible);
  }

  isHelpVisible() {
    return Boolean(this.port?.isHelpVisible());
  }

  setLodThresholds(thresholds) {
    return this.port?.setLodThresholds(thresholds) ?? null;
  }

  pickSurfaceAt(clientX, clientY) {
    return this.port?.pickSurfaceAt(clientX, clientY) ?? null;
  }

  focusMoveTarget(path) {
    return Boolean(this.port?.focusMoveTarget(path));
  }

  viewAxis(axis, opposite = false) {
    this.port?.viewAxis(axis, opposite);
  }
}

/**
 * Give a viewer element its mode interfaces. The element keeps its two
 * controllers in `modes` and names the mounted one `activeMode`. Common
 * members go to the active mode; board and system members go to their own
 * mode's controller, which keeps the call for its next mount when that mode
 * is not the mounted one. Each member returns what its controller returns.
 */
export function installModeMembers(prototype) {
  const route = (names, controllerOf) => {
    for (const name of names) {
      Object.defineProperty(prototype, name, {
        configurable: true,
        writable: true,
        value(...args) {
          return controllerOf(this)[name](...args);
        },
      });
    }
  };
  route(COMMON_MEMBERS, (element) => element.activeMode);
  route(BOARD_MEMBERS, (element) => element.modes.board);
  route(SYSTEM_MEMBERS, (element) => element.modes.system);
}
