import viewerCss from "../styles.css";
import { AssetCache } from "./asset-cache.js";
import { absolutizeAssetPaths, bundleIsFinal } from "./bundle-urls.js";
import { mountStandaloneViewer, mountSystemViewer } from "./main.js";
import { createReloadOwner, runSemanticViewerReload } from "./semantic-viewer-reload.js";

const SUPPORTED_SCHEMA = "prism.visualizer_bundle.a0";

function shellHtml() {
  return `
    <style>
      ${viewerCss}
      #app { grid-template-columns: minmax(0, 1fr) 376px; }
      #app.panel-collapsed { grid-template-columns: minmax(0, 1fr) 46px; }
      #app.workspace-stackup { grid-template-columns: minmax(0, 1fr); }
      #selection-card { display: none !important; }
      #scene-stats {
        position: absolute; top: 12px; right: 12px; z-index: 4; margin: 0; padding: 8px 10px;
        display: grid; grid-template-columns: auto auto; gap: 2px 12px;
        background: rgb(15 20 28 / 0.82); color: #dbe4f0; border-radius: 6px;
        font: 11px/1.4 "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums;
        pointer-events: none;
      }
      #scene-stats[hidden] { display: none; }
      #scene-stats dt { color: #8a97a8; }
      #scene-stats dd { margin: 0; text-align: right; }
      /* SB2-30a: level-of-detail thresholds, beside the stats in mode="system". */
      #lod-tuning {
        position: absolute; right: 12px; bottom: 12px; z-index: 4; width: 230px; padding: 8px 10px;
        background: rgb(15 20 28 / 0.86); color: #dbe4f0; border-radius: 6px;
        font: 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      #lod-tuning[hidden] { display: none; }
      #lod-tuning h2 { margin: 0 0 6px; font-size: 11px; font-weight: 600; }
      #lod-tuning label { display: grid; grid-template-columns: 64px 1fr 30px; align-items: center; gap: 6px; }
      #lod-tuning input { width: 100%; margin: 0; }
      #lod-tuning output { text-align: right; font: 11px "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums; }
      #lod-tuning button {
        margin-top: 6px; font: inherit; color: inherit; background: rgb(255 255 255 / 0.12);
        border: 0; border-radius: 4px; padding: 2px 8px; cursor: pointer;
      }
      /* System mode (SB2-31f): board labels, the move gizmo and the key list. */
      #system-labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
      /* SB2-34: proxy harnesses, straight segments between connectors until M5's geometry. */
      #system-harnesses { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: hidden; }
      #system-harnesses[hidden] { display: none; }
      #system-harnesses .segment { stroke: #1e293b; stroke-width: 2.5; stroke-dasharray: 7 5; stroke-linecap: round; filter: drop-shadow(0 0 1.5px rgb(255 255 255 / 0.9)); }
      #system-harnesses .segment.dim { opacity: 0.25; }
      #system-harnesses .segment.lit { stroke-width: 4.5; stroke-dasharray: none; opacity: 1; filter: drop-shadow(0 0 4px currentColor); }
      #system-harnesses .end { fill: #f8fafc; stroke: #1e293b; stroke-width: 2; }
      #system-harnesses .end.dim { opacity: 0.3; }
      #system-harnesses .end.lit { stroke: #fff; animation: harness-glow 1.9s ease-in-out infinite; }
      @keyframes harness-glow { 50% { opacity: 0.65; } }
      #system-labels[hidden] { display: none; }
      .scene-label {
        position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center;
        padding: 2px 7px; border-radius: 5px; background: rgb(15 20 28 / 0.72); color: #f1f5f9;
        font: 500 11px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap; margin-top: -6px;
      }
      .scene-label[hidden] { display: none; }
      .scene-label span { font-weight: 400; color: #cbd5e1; font-size: 10px; }
      .scene-label.stand-in { background: rgb(71 85 105 / 0.78); }
      .scene-label.restricted { background: rgb(55 65 81 / 0.85); }
      .scene-label.failed { background: rgb(153 27 27 / 0.8); }
      .scene-label.selected { background: rgb(37 99 235 / 0.92); }
      /* SB2-45b: the picked harness's breakouts and waypoints in move mode, under the gizmo. */
      #harness-nodes { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      #harness-nodes[hidden] { display: none; }
      #harness-nodes .node { fill: #f8fafc; stroke: #3e63dd; stroke-width: 2.5; pointer-events: visiblePainted; cursor: pointer; }
      #harness-nodes .node.breakout { fill: #3e63dd; stroke: #fff; }
      #harness-nodes .node.auto { fill: none; stroke: #3e63dd; stroke-dasharray: 3 2; }
      #harness-nodes .node { cursor: grab; }
      #harness-nodes .node.pinned { fill: #0f172a; }
      #harness-nodes .node.target { stroke: #f59e0b; stroke-width: 3.5; }
      #harness-nodes .node:hover { stroke-width: 4; }
      #move-gizmo { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      #move-gizmo[hidden] { display: none; }
      #move-gizmo .ring { stroke-width: 2.5; opacity: 0.75; pointer-events: stroke; cursor: grab; }
      #move-gizmo .ring:hover { stroke-width: 5; opacity: 1; }
      #move-gizmo .arrow { pointer-events: visiblePainted; cursor: grab; }
      #move-gizmo .arrow line { stroke-width: 4; stroke-linecap: round; }
      #move-gizmo .arrow:hover line { stroke-width: 6; }
      #move-gizmo .arrow text { font: 700 11px system-ui, -apple-system, "Segoe UI", sans-serif; paint-order: stroke; }
      #move-gizmo .pivot { fill: #0f172a; stroke: #fff; stroke-width: 1.5; }
      #move-gizmo .readout { font: 600 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: #0f172a;
        paint-order: stroke; stroke: #fff; stroke-width: 3px; }
      #system-help { position: absolute; right: 12px; bottom: 12px; z-index: 4; margin: 0; padding: 10px 12px; max-width: 340px;
        display: grid; grid-template-columns: auto 1fr; gap: 3px 12px;
        background: rgb(15 20 28 / 0.9); color: #e2e8f0; border-radius: 8px;
        font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
      #system-help[hidden] { display: none; }
      #system-help h2 { grid-column: 1 / -1; margin: 0 0 4px; font-size: 12px; font-weight: 600; }
      #system-help kbd { font: 600 11px "SFMono-Regular", Consolas, monospace; color: #fff; }
      #system-help dd { margin: 0; color: #cbd5e1; }
      /* The host renders the PCB controls itself (see getViewState). */
      :host([hide-panel]) #app,
      :host([hide-panel]) #app.panel-collapsed { grid-template-columns: minmax(0, 1fr); }
      :host([hide-panel]) .panel { display: none !important; }
    </style>
    <main id="app">
      <section class="viewport-shell">
        <canvas id="viewport"></canvas>
        <div id="stackup-workspace-view" hidden></div>
        <div id="panel-labels"></div>
        <div id="selection-card" hidden></div>
        <canvas id="axis-gizmo" width="112" height="112" title="Click an axis to align the camera"></canvas>
        <dl id="scene-stats" hidden></dl>
        <div id="lod-tuning" role="group" aria-label="Level of detail thresholds" hidden></div>
        <svg id="system-harnesses" hidden aria-hidden="true"></svg>
        <div id="system-labels" hidden></div>
        <svg id="harness-nodes" hidden aria-hidden="true"></svg>
        <svg id="move-gizmo" hidden aria-hidden="true"></svg>
        <dl id="system-help" hidden aria-label="Keyboard shortcuts">
          <h2>Keyboard</h2>
          <dt><kbd>Home</kbd> <kbd>A</kbd></dt><dd>Frame every board</dd>
          <dt><kbd>Double-click</kbd></dt><dd>Select and frame</dd>
          <dt><kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd></dt><dd>Look along an axis (Shift: from the other side)</dd>
          <dt><kbd>F</kbd> <kbd>R</kbd></dt><dd>Flip the view, turn it a quarter</dd>
          <dt><kbd>I</kbd></dt><dd>Isolate the lit nets' copper, or back</dd>
          <dt><kbd>M</kbd></dt><dd>Move mode on or off (editors)</dd>
          <dt><kbd>L</kbd></dt><dd>Gizmo axes: world or the board's own</dd>
          <dt><kbd>Shift</kbd></dt><dd>While dragging: 0.1 mm and 1° steps (else 1 mm, 15°)</dd>
          <dt><kbd>Enter</kbd></dt><dd>Save the shown position</dd>
          <dt><kbd>Esc</kbd></dt><dd>Undo the drag, leave move mode, or clear the selection</dd>
          <dt><kbd>\`</kbd></dt><dd>Scene stats</dd>
          <dt><kbd>?</kbd></dt><dd>This list</dd>
        </dl>
        <div id="fallback" hidden></div>
      </section>
      <aside class="panel">
        <nav class="panel-rail" aria-label="Viewer tools">
          <button class="rail-tab active" data-tab="layers" title="Layers">Layers</button>
          <button class="rail-tab" data-tab="search" title="Search and selection">Find</button>
          <button class="rail-tab" data-tab="view" title="View controls">View</button>
        </nav>
        <div class="panel-drawer">
          <header class="panel-mode-header">
            <div id="mode-switch"></div>
          </header>
          <section class="tab-panel active" data-panel="layers">
            <div class="section-heading"><h2 id="primary-heading">Layers</h2><span id="primary-description">Visibility and compare</span></div>
            <div id="layers"></div>
          </section>
          <section class="tab-panel" data-panel="search">
            <div class="section-heading"><h2>Find</h2><span>Nets, components and pins</span></div>
            <div id="search-controls"></div>
          </section>
          <section class="tab-panel" data-panel="view">
            <div class="section-heading"><h2>View</h2><span>Camera and stackup</span></div>
            <div id="view-controls"></div>
          </section>
        </div>
      </aside>
    </main>
  `;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

async function fetchJson(url, timings = null, label = "fetch", signal = undefined) {
  const started = performance.now();
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const value = await response.json();
  if (timings) {
    timings[`${label}_fetch_parse_ms`] = performance.now() - started;
    timings[`${label}_content_length`] = Number(response.headers.get("content-length") || 0);
  }
  return value;
}

async function loadBundle(bundleUrl, timings, signal) {
  const absoluteBundleUrl = new URL(bundleUrl, document.baseURI).toString();
  const cacheKey = new URL(absoluteBundleUrl).searchParams.get("viewer") || "";
  // SB2-26: a final bundle is read from the browser cache; earlier stages
  // rewrite bundle.json in place, so only a final one is ever stored.
  const cache = AssetCache.open();
  let bundle = await cache.peekJson(absoluteBundleUrl).catch(() => null);
  const cachedBundle = Boolean(bundle);
  if (!bundle) {
    bundle = await fetchJson(absoluteBundleUrl, timings, "bundle", signal);
    if (bundleIsFinal(bundle)) void cache.store(absoluteBundleUrl, new TextEncoder().encode(JSON.stringify(bundle)));
  }
  if (timings) timings.bundle_from_cache = cachedBundle;
  const assetCache = bundleIsFinal(bundle) && cache.enabled ? cache : null;
  if (bundle.schema !== SUPPORTED_SCHEMA) {
    throw new Error(`Unsupported visualizer bundle schema: ${bundle.schema || "missing"}`);
  }
  const topologyUrl = new URL(bundle.topology || "topology.json", absoluteBundleUrl);
  const semanticGeometryUrl = new URL(bundle.semantic_geometry || "semantic_geometry.json", absoluteBundleUrl);
  const load = (url, label) => (assetCache ? assetCache.fetchJson(url.toString(), { signal }) : fetchJson(url, timings, label, signal));
  const [topology, semanticGeometry] = await Promise.all([
    load(topologyUrl, "topology"),
    load(semanticGeometryUrl, "semantic_geometry"),
  ]);
  return {
    bundle,
    topology,
    semanticGeometry: absolutizeAssetPaths(semanticGeometry, absoluteBundleUrl, bundle, cacheKey),
    assetCache,
  };
}

export class PrismSemanticViewerElement extends HTMLElement {
  static get observedAttributes() {
    return ["bundle-url", "workspace", "mode", "move-allowed"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.controller = null;
    this.reloadOwner = createReloadOwner();
    this.pendingSelection = null;
    this.pendingHiddenComponents = null;
    this.reloadQueued = false;
    this.reloadSource = null;
  }

  connectedCallback() {
    this.queueReload();
  }

  disconnectedCallback() {
    this.reloadOwner.cancel();
    this.controller?.dispose?.();
    this.controller = null;
    this.reloadSource = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected || oldValue === newValue) return;
    if (name === "workspace") {
      this.controller?.setWorkspace?.(this.workspace);
      return;
    }
    // mode="system": whether this reader may move boards (the host sets it for editors).
    if (name === "move-allowed") {
      this.controller?.setMoveAllowed?.(newValue === "true");
      return;
    }
    this.queueReload();
  }

  get workspace() {
    return this.getAttribute("workspace") === "stackup" ? "stackup" : "pcb";
  }

  /** `mode="system"`: several boards from a system scene descriptor (SB2-31e) instead of one bundle. */
  get systemMode() {
    return this.getAttribute("mode") === "system";
  }

  queueReload() {
    const source = this.systemMode ? "system" : this.getAttribute("bundle-url");
    if (!source || source === this.reloadSource) return;
    this.reloadSource = source;
    if (this.reloadQueued) return;
    this.reloadQueued = true;
    queueMicrotask(() => {
      this.reloadQueued = false;
      if (this.isConnected) void this.reload();
    });
  }

  async reload() {
    const bundleUrl = this.getAttribute("bundle-url");
    const attempt = this.reloadOwner.begin();
    this.controller?.dispose?.();
    this.controller = null;
    if (this.systemMode) {
      await this.reloadSystem(attempt);
      return;
    }
    if (!bundleUrl) {
      this.shadowRoot.innerHTML = `<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>`;
      return;
    }
    await runSemanticViewerReload(this, attempt, { owner: this.reloadOwner, bundleUrl, loadBundle });
  }

  async reloadSystem(attempt) {
    const { signal } = attempt;
    const isCurrent = () => this.reloadOwner.owns(attempt) && this.isConnected;
    try {
      this.renderShell();
      const controller = await mountSystemViewer({
        root: this.shadowRoot,
        loadBundle: (bundleUrl, boardSignal) => loadBundle(bundleUrl, null, boardSignal),
        isActive: () => this.getAttribute("active") === "true",
        onSelectionChange: (selection) => {
          if (!signal.aborted) this.emit("selectionchange", { selection });
        },
        onContextMenu: (detail) => {
          if (!signal.aborted) this.emit("contextmenu", detail);
        },
        onViewStateChange: (detail) => {
          if (!signal.aborted) this.emitViewState(detail);
        },
        onEmphasis: (results) => {
          if (!signal.aborted) this.emit("emphasis", { results });
        },
        onMove: (state) => {
          if (!signal.aborted) this.emit("move", state);
        },
        onHarness: (state) => {
          if (!signal.aborted) this.emit("harness", state);
        },
      });
      if (!isCurrent()) {
        controller?.dispose?.();
        return;
      }
      this.controller = controller;
      if (this.pendingGpuBudget != null) controller.setGpuBudget(this.pendingGpuBudget);
      if (this.pendingSystemScene) controller.setSystemScene(this.pendingSystemScene);
      if (this.pendingNetEmphasis) controller.setNetEmphasis(this.pendingNetEmphasis);
      controller.setMoveAllowed(this.getAttribute("move-allowed") === "true");
      if (this.pendingLabels != null) controller.setLabelsVisible(this.pendingLabels);
      const viewState = this.getViewState();
      if (viewState) this.emitViewState(viewState);
      this.emitReady({ schema: "prism.semantic_viewer_performance.a0", milestone: "system-mounted" });
    } catch (error) {
      if (!isCurrent()) return;
      this.renderError(error);
      this.emitError(error);
    }
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(`prism-semantic-viewer:${name}`, { bubbles: true, composed: true, detail }));
  }

  /**
   * The system to show (mode="system"): a `prism.system_scene.a0` descriptor.
   * Boards already loaded are kept. Safe before the viewer is ready; the last
   * call is replayed on the next controller.
   */
  setSystemScene(descriptor) {
    this.pendingSystemScene = descriptor || null;
    if (descriptor) this.controller?.setSystemScene?.(descriptor);
  }

  /**
   * Light system nets on every board they reach (mode="system"):
   * `[{ key, color?, members: [{ occurrence, net }] }]`. Returns the report
   * (also sent as `prism-semantic-viewer:emphasis` when boards load), or [] before ready.
   */
  setNetEmphasis(sets) {
    this.pendingNetEmphasis = Array.isArray(sets) ? sets : [];
    return this.controller?.setNetEmphasis?.(this.pendingNetEmphasis) ?? [];
  }

  /** Frame the copper of a lit set (or of all), on one placement or all; false when nothing is lit there. */
  frameNetEmphasis(key = null, occurrence = null) {
    return this.controller?.frameNetEmphasis?.(key, occurrence) ?? false;
  }

  /**
   * Move mode (mode="system", SB2-29): `move` events carry `{ phase, allowed,
   * enabled, space, dragging, target }` with phases mode, target, preview,
   * commit, cancel and sync. On "commit" the host saves the target's pose and
   * passes the re-read scene, or calls `cancelMove()` when the save fails.
   * Whether this reader may move boards is the `move-allowed` attribute.
   */
  setMoveMode(enabled, options) {
    this.controller?.setMoveMode?.(enabled, options);
  }

  /** Route mode (D-P2-51): move mode for harness routes only; boards stay put. */
  setRouteMode(enabled) {
    this.controller?.setMoveMode?.(enabled, { route: true });
  }

  setMoveSpace(space) {
    this.controller?.setMoveSpace?.(space);
  }

  /** Show a pose for the move target without saving it; null shows the saved pose. */
  previewPose(pose) {
    this.controller?.previewPose?.(pose);
  }

  cancelMove() {
    this.controller?.cancelMove?.();
  }

  getMoveState() {
    return this.controller?.getMoveState?.() ?? null;
  }

  /**
   * Harness picking and node editing (mode="system", SB2-45b): `harness` events
   * carry `{ phase, harness, segment, pointMm, autoMm, node, editable }` with
   * phases select, target, preview, commit, delete, cancel and sync; points are
   * in the harness's level frame (mm). On "commit" the host saves the node list
   * with `node.positionMm` and passes the re-read scene, or calls
   * `cancelHarnessNode()` when the save fails; on "delete" it removes the node.
   */
  targetHarnessNode(id) {
    this.controller?.targetHarnessNode?.(id);
  }

  /** Pick a root-level harness by id, as clicking it would (SB2-61); null drops the pick. False when it is not drawn. */
  selectHarness(id) {
    return this.controller?.selectHarness?.(id) ?? false;
  }

  /** Show the targeted node at a level-frame position without saving it; null shows its saved place. */
  previewHarnessNode(positionMm) {
    this.controller?.previewHarnessNode?.(positionMm);
  }

  cancelHarnessNode() {
    this.controller?.cancelHarnessNode?.();
  }

  getHarnessState() {
    return this.controller?.getHarnessState?.() ?? null;
  }

  /** Board name labels over the system scene (on by default). */
  setLabelsVisible(visible) {
    this.pendingLabels = Boolean(visible);
    this.controller?.setLabelsVisible?.(this.pendingLabels);
  }

  /** mode="system": the proxy harnesses (SB2-34), shown by default. */
  setHarnessesVisible(visible) {
    this.controller?.setHarnessesVisible?.(Boolean(visible));
  }

  /** The keyboard list (also `?`). */
  setHelpVisible(visible) {
    this.controller?.setHelpVisible?.(visible);
  }

  /** Whether the keyboard list is open, so a host button can toggle it. */
  isHelpVisible() {
    return Boolean(this.controller?.isHelpVisible?.());
  }

  /** Frame every placed board (mode="system"). */
  frameAll() {
    this.controller?.frameAll?.();
  }

  /** Frame one placed board (mode="system"). */
  frameBoard(key) {
    return this.controller?.frameBoard?.(key) ?? false;
  }

  /** mode="system": frame parts on their placements, `[{ occurrence, reference }]` (SB2-32). */
  frameParts(parts) {
    return this.controller?.frameParts?.(parts) ?? false;
  }

  renderLoading() {
    this.shadowRoot.innerHTML = `<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>`;
  }

  renderShell() {
    this.shadowRoot.innerHTML = shellHtml();
  }

  renderError(error) {
    console.error(error);
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
        .error{height:100%;display:grid;place-items:center;padding:24px}
        pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
      </style>
      <div class="error"><pre>${escapeHtml(error?.stack || error?.message || String(error))}</pre></div>
    `;
  }

  mountViewer({ topology, semanticGeometry, readiness, assetCache = null, signal }) {
    // Callbacks are bound to this attempt: a superseded mount that is still
    // booting must not report selection or performance for the newer load.
    return mountStandaloneViewer({
      root: this.shadowRoot,
      topology,
      semanticGeometry,
      readiness,
      workspaceScope: "3d",
      assetCache,
      isActive: () => this.getAttribute("active") === "true",
      onSelectionChange: (selection) => {
        if (signal.aborted) return;
        this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange", {
          bubbles: true,
          composed: true,
          detail: { selection },
        }));
      },
      onContextMenu: (detail) => {
        if (signal.aborted) return;
        this.dispatchEvent(new CustomEvent("prism-semantic-viewer:contextmenu", {
          bubbles: true,
          composed: true,
          detail,
        }));
      },
      onViewStateChange: (detail) => {
        if (signal.aborted) return;
        this.emitViewState(detail);
      },
      onPerformanceEvent: (detail) => {
        if (signal.aborted) return;
        console.info("[prism-3d-perf]", detail);
        this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance", {
          bubbles: true,
          composed: true,
          detail,
        }));
      },
    });
  }

  publishController(controller) {
    this.controller = controller;
    this.controller?.setWorkspace?.(this.workspace);
    // The hidden set is view state that must outlive a reload: a controller
    // that was created after the last setHiddenComponents call replays it.
    if (this.pendingHiddenComponents) {
      this.controller?.setHiddenComponents?.(this.pendingHiddenComponents);
    }
    if (this.pendingGpuBudget != null) this.controller?.setGpuBudget?.(this.pendingGpuBudget);
    // A fresh viewer is already unselected. Avoid a redundant clearSelection()
    // while the staged shell is completing its first-frame setup.
    if (this.pendingSelection) this.controller?.setSelection?.(this.pendingSelection);
    if (this.pendingHighlightedNets?.length) {
      this.controller?.setHighlightedNets?.(this.pendingHighlightedNets);
    }
    const viewState = this.getViewState();
    if (viewState) this.emitViewState(viewState);
  }

  emitViewState(detail) {
    this.dispatchEvent(new CustomEvent("prism-semantic-viewer:viewstatechange", {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  emitReady(detail) {
    console.info("[prism-3d-perf]", detail);
    this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready", {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  emitError(error) {
    this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error", { bubbles: true, detail: { error } }));
  }

  setSelection(selection) {
    this.pendingSelection = selection || null;
    this.controller?.setSelection?.(this.pendingSelection);
  }

  /**
   * Replace the highlighted nets (Prism #305): every listed net renders
   * emphasised alongside the inspected selection. Idempotent and safe before
   * the viewer is ready or after a reload; the last call is replayed on the
   * next controller. Unresolved references are dropped.
   */
  setHighlightedNets(nets) {
    this.pendingHighlightedNets = Array.isArray(nets) ? [...nets] : [];
    this.controller?.setHighlightedNets?.(this.pendingHighlightedNets);
  }

  /**
   * Replace the hidden component references (VAR-18). Idempotent and safe
   * before the viewer is ready or after a reload: the last call is replayed on
   * the next controller.
   */
  setHiddenComponents(references) {
    this.pendingHiddenComponents = Array.isArray(references)
      ? [...references]
      : [];
    this.controller?.setHiddenComponents?.(this.pendingHiddenComponents);
  }

  /**
   * What is under a client point (SB2-24), without selecting it:
   * `{ kind: "none" | "feature" | "board", occurrenceKey, occurrenceIndex, featureId }`.
   * Resolves null before the viewer is ready.
   */
  pickAt(clientX, clientY) {
    return Promise.resolve(this.controller?.pickAt?.(clientX, clientY) ?? null);
  }

  /** In mode="system": where a client point meets a `pickSurface` model, `{occurrence, pointMm, normal, toCamera}` or null. */
  pickSurfaceAt(clientX, clientY) {
    return this.controller?.pickSurfaceAt?.(clientX, clientY) ?? null;
  }

  /** In mode="system": look along a world axis from its + side (`opposite`: its − side), framing the scene. */
  viewAxis(axis, opposite = false) {
    this.controller?.viewAxis?.(axis, opposite);
  }

  /** In mode="system": put the move gizmo on an occurrence by path; false when it is not placed (yet). */
  focusMoveTarget(path) {
    return Boolean(this.controller?.focusMoveTarget?.(path));
  }

  /** Client coordinates of a component's centre (in mode="system", on one placement), or null when off screen. */
  projectComponent(reference, occurrenceKey) {
    return this.controller?.projectComponent?.(reference, occurrenceKey) ?? null;
  }

  /** Show the scene stats overlay (occurrences by detail, triangles, GPU memory, frame times); the backquote key toggles it. */
  setStatsOverlay(visible) {
    this.controller?.setStatsOverlay?.(visible);
  }

  /** The numbers behind the stats overlay, or null before ready. */
  getStats() {
    return this.controller?.stats?.() ?? null;
  }

  /** Force a level of detail on every occurrence (0 full, 1 board, 2 body, 3 box), or null for automatic. */
  setLodOverride(lod) {
    this.controller?.setLodOverride?.(lod);
  }

  /**
   * mode="system" (SB2-30a): level-of-detail thresholds in CSS pixels of a
   * board's projected radius, `{ fullPx, boardPx, boxPx, keep }`, merged into
   * the current ones; null restores the defaults. Kept per browser. Returns
   * the thresholds in force, or null before ready.
   */
  setLodThresholds(thresholds) {
    return this.controller?.setLodThresholds?.(thresholds) ?? null;
  }

  /** The GPU memory budget in bytes (default 1.5 GB); over it, unused tiers are evicted. */
  setGpuBudget(bytes) {
    this.pendingGpuBudget = bytes;
    this.controller?.setGpuBudget?.(bytes);
  }

  /** Client coordinates of a board-local point (runtime metres; in mode="system", on one placement), or null. */
  projectPoint(point, occurrenceKey) {
    return this.controller?.projectPoint?.(point, occurrenceKey) ?? null;
  }

  /** Every component reference on the board; empty until the viewer is ready. */
  getComponentReferences() {
    return this.controller?.getComponentReferences?.() ?? [];
  }

  // --- IN-60 spike: inset views (one-board mode only) ---

  /**
   * Draw the board into `canvas` (a 2D canvas sized by CSS) through an inset
   * camera `{ center: [x, y] mm, zoom: px/mm, rotation, mirror, tilt, focusZ }`.
   * `key` names the inset so the copper it shows stays loaded. False when
   * nothing could be drawn (not ready, system mode, hidden canvas).
   */
  renderInset(canvas, view, key) {
    return Boolean(this.controller?.renderInset?.(canvas, view, key));
  }

  /** `{ focus, anchor, anchorBox, bottom, surfaceZ }` in KiCad mm for a part (and pad), or null. */
  insetTarget(reference, pin) {
    return this.controller?.insetTarget?.(reference, pin) ?? null;
  }

  /** Inset CSS pixels of a KiCad-mm point on the inset's surface, or null. */
  projectInset(view, width, height, pointMm) {
    return this.controller?.projectInset?.(view, width, height, pointMm) ?? null;
  }

  /** Call `listener` whenever the main view redrew; returns an unsubscribe. */
  onSceneChange(listener) {
    return this.controller?.onSceneChange?.(listener) ?? (() => {});
  }

  insetStats() {
    return this.controller?.insetStats?.() ?? null;
  }

  insetSettings(settings) {
    return this.controller?.insetSettings?.(settings) ?? null;
  }

  gpuIdle() {
    return this.controller?.gpuIdle?.() ?? Promise.resolve();
  }

  resize() {
    this.controller?.resize?.();
  }

  /** PCB 3D controls for a host that sets `hide-panel`. Null until ready. */
  getViewState() {
    return this.controller?.getViewState?.() ?? null;
  }

  setViewMode(mode) {
    this.controller?.setViewMode?.(mode);
  }

  /** In a system scene, `placement` names the board placement (all placements of the selected board when omitted). */
  setLayerVisible(layerId, visible, placement = null) {
    this.controller?.setLayerVisible?.(layerId, visible, placement);
  }

  applyLayerPreset(preset, placement = null) {
    this.controller?.applyLayerPreset?.(preset, placement);
  }

  setShowBoard(visible) {
    this.controller?.setShowBoard?.(visible);
  }

  setShowComponents(visible) {
    this.controller?.setShowComponents?.(visible);
  }

  setShowPlaceholders(visible) {
    this.controller?.setShowPlaceholders?.(visible);
  }

  setRealisticColors(enabled) {
    this.controller?.setRealisticColors?.(enabled);
  }

  /** In a system scene, `placement` names one placed board (every placement of the selected board when omitted). */
  setSeparation(value, placement = null) {
    this.controller?.setSeparation?.(value, placement);
  }

  showNetLayers() {
    this.controller?.showNetLayers?.();
  }

  setNetIsolation(enabled) {
    this.controller?.setNetIsolation?.(enabled);
  }
}

export function definePrismSemanticViewer() {
  if (!customElements.get("prism-semantic-viewer")) {
    customElements.define("prism-semantic-viewer", PrismSemanticViewerElement);
  }
}
