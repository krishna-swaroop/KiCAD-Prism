import { ANALYTIC_BUNDLE_SCHEMA } from "./analytic-scene.js";
import viewerCss from "../styles.css";
import { AssetCache } from "./asset-cache.js";
import { absolutizeAssetPaths, bundleIsFinal } from "./bundle-urls.js";
import { mountStandaloneViewer, mountSystemViewer } from "./main.js";
import { createReloadOwner, runSemanticViewerReload, shouldReloadStaleScene, viewerIsShown } from "./semantic-viewer-reload.js";
import { BoardModeController, SystemModeController, createSharedState, installModeMembers } from "./viewer-controllers.js";

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
      /* System mode (SB2-31f): board labels, the move gizmo and the key list. */
      #system-labels { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
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
      /* Harness handles and flags (4c): an overlay projected every frame. */
      #harness-overlay { position: absolute; inset: 0; z-index: 3; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      #harness-overlay[hidden] { display: none; }
      #harness-overlay .harness-handle { pointer-events: all; cursor: pointer; }
      #harness-overlay .handle-body { fill: #fff; stroke: #0f172a; stroke-width: 1.5; }
      #harness-overlay .handle-dot { fill: #0f172a; pointer-events: none; }
      #harness-overlay .harness-handle.auto .handle-body { fill: rgb(255 255 255 / 0.8); stroke-dasharray: 3 2; }
      #harness-overlay .handle-halo { fill: none; stroke: #38bdf8; stroke-width: 3; opacity: 0.9; }
      #harness-overlay .harness-flag { pointer-events: none; }
      #harness-overlay .flag-ring { fill: rgb(220 38 38 / 0.12); stroke: #dc2626; stroke-width: 2; stroke-dasharray: 4 3; }
      #harness-overlay .flag-pill { fill: #dc2626; }
      #harness-overlay .flag-label { fill: #fff; font: 600 10px system-ui, -apple-system, "Segoe UI", sans-serif; }
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
        <div id="system-labels" hidden></div>
        <svg id="move-gizmo" hidden aria-hidden="true"></svg>
        <svg id="harness-overlay" hidden aria-hidden="true"></svg>
        <dl id="system-help" hidden aria-label="Keyboard shortcuts">
          <h2>Keyboard</h2>
          <dt><kbd>Home</kbd> <kbd>A</kbd></dt><dd>Frame every board</dd>
          <dt><kbd>Double-click</kbd></dt><dd>Select and frame</dd>
          <dt><kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd></dt><dd>Look along an axis (Shift: from the other side)</dd>
          <dt><kbd>F</kbd> <kbd>R</kbd></dt><dd>Flip the view, turn it a quarter</dd>
          <dt><kbd>I</kbd></dt><dd>Isolate the lit nets' copper, or back</dd>
          <dt><kbd>M</kbd></dt><dd>Move mode on or off (editors)</dd>
          <dt><kbd>L</kbd></dt><dd>Gizmo axes: world or the board's own</dd>
          <dt><kbd>Shift</kbd></dt><dd>While dragging: the fine steps</dd>
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
  // An analytic bundle names the design bundle's members; the viewer builds
  // the scene from the pack (main.js openAnalyticSource). There are no mesh
  // bundles any more (System Builder v2, stage 0).
  if (bundle.schema !== ANALYTIC_BUNDLE_SCHEMA) {
    throw new Error(`Unsupported visualizer bundle schema: ${bundle.schema || "missing"}`);
  }
  const semanticGeometry = { analytic: true, cache_key: bundle.cache_key || "", readiness: bundle.readiness, assets: bundle.assets || {} };
  return {
    bundle,
    topology: {},
    semanticGeometry: absolutizeAssetPaths(semanticGeometry, absoluteBundleUrl, bundle, cacheKey),
    assetCache,
  };
}

export class PrismSemanticViewerElement extends HTMLElement {
  static get observedAttributes() {
    return ["bundle-url", "workspace", "mode", "move-allowed", "active"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.reloadOwner = createReloadOwner();
    this.reloadQueued = false;
    this.reloadSource = null;
    // AC-30: one controller per mode for the element's whole life. Each holds
    // what the host asked for and replays it onto every scene a reload mounts.
    const shared = createSharedState();
    this.modes = Object.freeze({ board: new BoardModeController(shared), system: new SystemModeController(shared) });
    /** The controller with a mounted scene, or null between mounts. */
    this.mounted = null;
    /** Whether the element currently intersects the viewport (see `visibilityObserver`). */
    this.intersecting = false;
    /** Answers "is this element shown"; null when the browser has no IntersectionObserver. */
    this.visibilityObserver = null;
  }

  /** The controller common members go to: the mounted one, else the one the `mode` attribute names. */
  get activeMode() {
    return this.mounted ?? (this.systemMode ? this.modes.system : this.modes.board);
  }

  detachModes() {
    this.modes.board.detach();
    this.modes.system.detach();
    this.mounted = null;
  }

  connectedCallback() {
    this.#observeVisibility();
    this.queueReload();
  }

  disconnectedCallback() {
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = null;
    this.intersecting = false;
    this.reloadOwner.cancel();
    this.detachModes();
    this.reloadSource = null;
  }

  /**
   * Watch this element's own visibility. A host that shows it again without
   * touching `active` (a section switch) leaves a scene that another element
   * has since taken, so becoming visible is the reload trigger.
   */
  #observeVisibility() {
    if (this.visibilityObserver || typeof IntersectionObserver !== "function") return;
    this.visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      this.intersecting = entry.isIntersecting;
      if (entry.isIntersecting) this.queueReload();
    });
    this.visibilityObserver.observe(this);
  }

  /** Whether this element is shown (intersecting, or the host's `active` attribute on older browsers). */
  get shown() {
    return viewerIsShown({
      observed: Boolean(this.visibilityObserver),
      intersecting: this.intersecting,
      active: this.getAttribute("active") === "true",
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected || oldValue === newValue) return;
    if (name === "workspace") {
      this.modes.board.setWorkspace(this.workspace);
      return;
    }
    // mode="system": whether this reader may move boards (the host sets it for editors).
    if (name === "move-allowed") {
      this.modes.system.setMoveAllowed(newValue === "true");
      return;
    }
    // `active` is the host's "this element is shown" signal on browsers without
    // IntersectionObserver; it stays a trigger everywhere. A scene it no longer
    // owns must be rebuilt when it comes back (queueReload checks).
    if (name === "active") {
      if (newValue === "true") this.queueReload();
      return;
    }
    this.queueReload();
  }

  get workspace() {
    return this.getAttribute("workspace") === "stackup" ? "stackup" : "pcb";
  }

  /** `mode="system"`: several boards from a system scene descriptor instead of one bundle. */
  get systemMode() {
    return this.getAttribute("mode") === "system";
  }

  queueReload() {
    const source = this.systemMode ? "system" : this.getAttribute("bundle-url");
    if (!source) return;
    // A second element's mount disposes this element's renderer and takes over
    // the page-wide session (main.js beginViewerSession). When this element is
    // shown again it owns a dead scene, so it rebuilds even though its source
    // is unchanged; render-on-demand then starts afresh with the new mount.
    const stale = shouldReloadStaleScene({
      shown: this.shown,
      mounted: this.mounted,
      isCurrent: () => this.mounted?.attachedPort?.isCurrent?.() ?? true,
    });
    if (source === this.reloadSource && !stale) return;
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
    this.detachModes();
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
      const port = await mountSystemViewer({
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
        onHarness: (detail) => {
          if (signal.aborted || !detail) return;
          const { type, ...event } = detail;
          if (type === "select") this.emit("harness-select", event);
          else if (type === "drag") this.emit("harness-drag", event);
        },
      });
      if (!isCurrent()) {
        port?.dispose?.();
        return;
      }
      this.mounted = this.modes.system;
      this.mounted.attach(port, { moveAllowed: this.getAttribute("move-allowed") === "true" });
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

  /** runSemanticViewerReload's hand-off: the board scene it mounted, now this element's. */
  publishController(port) {
    this.mounted = this.modes.board;
    this.mounted.attach(port, { workspace: this.workspace });
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
}

// AC-30: the board, system and common members, routed to the mode controllers.
installModeMembers(PrismSemanticViewerElement.prototype);

export function definePrismSemanticViewer() {
  if (!customElements.get("prism-semantic-viewer")) {
    customElements.define("prism-semantic-viewer", PrismSemanticViewerElement);
  }
}
