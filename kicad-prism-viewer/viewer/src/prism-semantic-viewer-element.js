import viewerCss from "../styles.css";
import { mountStandaloneViewer } from "./main.js";

const SUPPORTED_SCHEMA = "prism.visualizer_bundle.a0";

function shellHtml() {
  return `
    <style>
      ${viewerCss}
      #app { grid-template-columns: minmax(0, 1fr) 376px; }
      #app.panel-collapsed { grid-template-columns: minmax(0, 1fr) 46px; }
      #app.workspace-stackup { grid-template-columns: minmax(0, 1fr); }
      #selection-card { display: none !important; }
    </style>
    <main id="app">
      <section class="viewport-shell">
        <canvas id="viewport"></canvas>
        <div id="stackup-workspace-view" hidden></div>
        <div id="panel-labels"></div>
        <div id="selection-card" hidden></div>
        <canvas id="axis-gizmo" width="112" height="112" title="Click an axis to align the camera"></canvas>
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

async function fetchJson(url, timings = null, label = "fetch") {
  const started = performance.now();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  const value = await response.json();
  if (timings) {
    timings[`${label}_fetch_parse_ms`] = performance.now() - started;
    timings[`${label}_content_length`] = Number(response.headers.get("content-length") || 0);
  }
  return value;
}

function withCacheKey(url, cacheKey) {
  if (!cacheKey) return url;
  const next = new URL(url);
  next.searchParams.set("viewer", cacheKey);
  return next.toString();
}

function absolutizeAssetPaths(semanticGeometry, bundleUrl, bundle, cacheKey) {
  const assetBase = new URL(bundle.asset_base || "./", bundleUrl);
  const output = structuredClone(semanticGeometry || {});
  const absolutize = (value) => {
    if (!value || typeof value !== "string") return value;
    return withCacheKey(new URL(value, assetBase).toString(), cacheKey);
  };
  for (const groupName of ["assets", "semantic_gltf", "schematic_world", "schematic_vector", "schematic_scene", "bom"]) {
    const group = output[groupName];
    if (!group || typeof group !== "object") continue;
    for (const [key, value] of Object.entries(group)) group[key] = absolutize(value);
  }
  return output;
}

async function loadBundle(bundleUrl, timings) {
  const absoluteBundleUrl = new URL(bundleUrl, document.baseURI).toString();
  const cacheKey = new URL(absoluteBundleUrl).searchParams.get("viewer") || "";
  const bundle = await fetchJson(absoluteBundleUrl, timings, "bundle");
  if (bundle.schema !== SUPPORTED_SCHEMA) {
    throw new Error(`Unsupported visualizer bundle schema: ${bundle.schema || "missing"}`);
  }
  const topologyUrl = new URL(bundle.topology || "topology.json", absoluteBundleUrl);
  const semanticGeometryUrl = new URL(bundle.semantic_geometry || "semantic_geometry.json", absoluteBundleUrl);
  const [topology, semanticGeometry] = await Promise.all([
    fetchJson(topologyUrl, timings, "topology"),
    fetchJson(semanticGeometryUrl, timings, "semantic_geometry"),
  ]);
  return {
    bundle,
    topology,
    semanticGeometry: absolutizeAssetPaths(semanticGeometry, absoluteBundleUrl, bundle, cacheKey),
  };
}

export class PrismSemanticViewerElement extends HTMLElement {
  static get observedAttributes() {
    return ["bundle-url", "workspace"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.controller = null;
    this.abortController = null;
    this.pendingSelection = null;
    this.reloadQueued = false;
    this.reloadSource = null;
  }

  connectedCallback() {
    this.queueReload();
  }

  disconnectedCallback() {
    this.abortController?.abort();
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
    this.queueReload();
  }

  get workspace() {
    return this.getAttribute("workspace") === "stackup" ? "stackup" : "pcb";
  }

  queueReload() {
    const source = this.getAttribute("bundle-url");
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
    const reloadStarted = performance.now();
    const timings = {};
    const bundleUrl = this.getAttribute("bundle-url");
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.controller?.dispose?.();
    this.controller = null;
    if (!bundleUrl) {
      this.shadowRoot.innerHTML = `<style>:host{display:block;height:100%;font:14px system-ui;color:#94a3b8}</style><div>Semantic bundle URL is missing.</div>`;
      return;
    }
    try {
      this.shadowRoot.innerHTML = `<style>:host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}</style><div style="display:grid;place-items:center;height:100%">Loading semantic visualizer...</div>`;
      const bundleStarted = performance.now();
      const { bundle, topology, semanticGeometry } = await loadBundle(bundleUrl, timings);
      timings.bundle_group_total_ms = performance.now() - bundleStarted;
      if (this.abortController.signal.aborted) return;
      this.shadowRoot.innerHTML = shellHtml();
      const mountStarted = performance.now();
      this.controller = await mountStandaloneViewer({
        root: this.shadowRoot,
        topology,
        semanticGeometry,
        readiness: bundle.readiness,
        workspaceScope: "3d",
        isActive: () => this.getAttribute("active") === "true",
        onSelectionChange: (selection) => {
          this.dispatchEvent(new CustomEvent("prism-semantic-viewer:selectionchange", {
            bubbles: true,
            composed: true,
            detail: { selection },
          }));
        },
        onPerformanceEvent: (detail) => {
          console.info("[prism-3d-perf]", detail);
          this.dispatchEvent(new CustomEvent("prism-semantic-viewer:performance", {
            bubbles: true,
            composed: true,
            detail,
          }));
        },
      });
      this.controller?.setWorkspace?.(this.workspace);
      timings.mount_and_first_frame_ms = performance.now() - mountStarted;
      Object.assign(timings, this.controller?.performance || {});
      // A fresh viewer is already unselected. Avoid a redundant clearSelection()
      // while the staged shell is completing its first-frame setup.
      if (this.pendingSelection) this.controller?.setSelection?.(this.pendingSelection);
      timings.reload_to_visible_ms = performance.now() - reloadStarted;
      const detail = {
        schema: "prism.semantic_viewer_performance.a0",
        milestone: "board-visible",
        readiness_stage: bundle.readiness?.stage || "semantic-ready",
        readiness_progress: bundle.readiness?.progress ?? 100,
        timings,
      };
      console.info("[prism-3d-perf]", detail);
      this.dispatchEvent(new CustomEvent("prism-semantic-viewer:ready", {
        bubbles: true,
        composed: true,
        detail,
      }));
    } catch (error) {
      console.error(error);
      this.shadowRoot.innerHTML = `
        <style>
          :host{display:block;height:100%;background:#020817;color:#e5e7eb;font:14px system-ui}
          .error{height:100%;display:grid;place-items:center;padding:24px}
          pre{max-width:100%;white-space:pre-wrap;color:#fecaca;background:#111827;border:1px solid #374151;padding:16px}
        </style>
        <div class="error"><pre>${escapeHtml(error?.stack || error?.message || String(error))}</pre></div>
      `;
      this.dispatchEvent(new CustomEvent("prism-semantic-viewer:error", { bubbles: true, detail: { error } }));
    }
  }

  setSelection(selection) {
    this.pendingSelection = selection || null;
    this.controller?.setSelection?.(this.pendingSelection);
  }

  resize() {
    this.controller?.resize?.();
  }
}

export function definePrismSemanticViewer() {
  if (!customElements.get("prism-semantic-viewer")) {
    customElements.define("prism-semantic-viewer", PrismSemanticViewerElement);
  }
}
