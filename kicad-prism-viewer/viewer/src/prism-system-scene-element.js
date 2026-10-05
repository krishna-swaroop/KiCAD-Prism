// <prism-system-scene>: a system's boards in one WebGPU view (SB2-27).
//
// The host page passes the `prism.system_scene.a0` descriptor with
// `setScene(descriptor)` (again whenever it re-reads it, e.g. while bundles
// build). Events: `prism-system-scene:ready`, `…:selectionchange`
// ({ selection }), `…:status` ({ status }), `…:move` (SB2-29: { phase,
// allowed, enabled, space, dragging, target }; phases mode, target, preview,
// commit, cancel and sync) and `…:error`.
//
// Move mode (SB2-29) only previews: on `move` with phase "commit" the host
// saves the target's pose and gives the element the re-read scene, or calls
// `cancelMove()` when the save fails.

import { SystemScene } from "./system-scene.js";

const SHELL = `
  <style>
    :host { display: block; position: relative; overflow: hidden; background: #e8edf0; contain: strict; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
    canvas:focus-visible { box-shadow: inset 0 0 0 2px rgb(59 130 246 / 0.6); }
    #labels { position: absolute; inset: 0; pointer-events: none; }
    #labels[hidden] { display: none; }
    .scene-label {
      position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center;
      padding: 2px 7px; border-radius: 5px; background: rgb(15 20 28 / 0.72); color: #f1f5f9;
      font: 500 11px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap;
      margin-top: -6px;
    }
    .scene-label[hidden] { display: none; }
    .scene-label span { font-weight: 400; color: #cbd5e1; font-size: 10px; }
    .scene-label.stand-in { background: rgb(71 85 105 / 0.78); }
    .scene-label.restricted { background: rgb(55 65 81 / 0.85); }
    .scene-label.failed { background: rgb(153 27 27 / 0.8); }
    .scene-label.selected { background: rgb(37 99 235 / 0.92); }
    #stats {
      position: absolute; top: 12px; right: 12px; margin: 0; padding: 8px 10px;
      display: grid; grid-template-columns: auto auto; gap: 2px 12px;
      background: rgb(15 20 28 / 0.82); color: #dbe4f0; border-radius: 6px;
      font: 11px/1.4 "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums; pointer-events: none;
    }
    #stats[hidden] { display: none; }
    #stats dt { color: #8a97a8; }
    #stats dd { margin: 0; text-align: right; }
    #gizmo { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
    #gizmo[hidden] { display: none; }
    #gizmo .ring { stroke-width: 2.5; opacity: 0.75; pointer-events: stroke; cursor: grab; }
    #gizmo .ring:hover { stroke-width: 5; opacity: 1; }
    #gizmo .arrow { pointer-events: visiblePainted; cursor: grab; }
    #gizmo .arrow line { stroke-width: 4; stroke-linecap: round; }
    #gizmo .arrow:hover line { stroke-width: 6; }
    #gizmo .arrow text { font: 700 11px system-ui, -apple-system, "Segoe UI", sans-serif; paint-order: stroke; }
    #gizmo .pivot { fill: #0f172a; stroke: #fff; stroke-width: 1.5; }
    #gizmo .readout { font: 600 12px system-ui, -apple-system, "Segoe UI", sans-serif; fill: #0f172a;
      paint-order: stroke; stroke: #fff; stroke-width: 3px; }
    #tuning { position: absolute; right: 12px; bottom: 12px; margin: 0; padding: 8px 10px; width: 230px;
      background: rgb(15 20 28 / 0.86); color: #dbe4f0; border-radius: 6px;
      font: 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    #tuning[hidden] { display: none; }
    #tuning h2 { margin: 0 0 6px; font-size: 11px; font-weight: 600; }
    #tuning label { display: grid; grid-template-columns: 74px 1fr 30px; align-items: center; gap: 6px; }
    #tuning input { width: 100%; margin: 0; }
    #tuning output { text-align: right; font: 11px "SFMono-Regular", Consolas, monospace; font-variant-numeric: tabular-nums; }
    #tuning button { margin-top: 6px; font: inherit; color: inherit; background: rgb(255 255 255 / 0.12);
      border: 0; border-radius: 4px; padding: 2px 8px; cursor: pointer; }
    #help { position: absolute; left: 12px; bottom: 12px; margin: 0; padding: 10px 12px; max-width: 320px;
      display: grid; grid-template-columns: auto 1fr; gap: 3px 12px;
      background: rgb(15 20 28 / 0.88); color: #e2e8f0; border-radius: 8px;
      font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    #help[hidden] { display: none; }
    #help h2 { grid-column: 1 / -1; margin: 0 0 4px; font-size: 12px; font-weight: 600; }
    #help kbd { font: 600 11px "SFMono-Regular", Consolas, monospace; color: #fff; }
    #help dd { margin: 0; color: #cbd5e1; }
    #fallback { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center;
      font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #475569; }
    #fallback[hidden] { display: none; }
  </style>
  <canvas id="viewport" aria-label="System 3D view"></canvas>
  <div id="labels"></div>
  <svg id="gizmo" hidden aria-hidden="true"></svg>
  <dl id="help" hidden aria-label="Keyboard shortcuts">
    <h2>Keyboard (while the view has focus)</h2>
    <dt><kbd>F</kbd></dt><dd>Frame the selection</dd>
    <dt><kbd>A</kbd></dt><dd>Frame everything</dd>
    <dt><kbd>M</kbd></dt><dd>Move mode on or off (editors)</dd>
    <dt><kbd>L</kbd></dt><dd>Gizmo axes: world or the board's own</dd>
    <dt><kbd>Shift</kbd></dt><dd>While dragging: 0.1 mm and 1° steps (else 1 mm, 15°)</dd>
    <dt><kbd>Enter</kbd></dt><dd>Save the shown position</dd>
    <dt><kbd>Esc</kbd></dt><dd>Undo the drag, or leave move mode, or clear the selection</dd>
    <dt><kbd>\`</kbd></dt><dd>Scene stats</dd>
    <dt><kbd>?</kbd></dt><dd>This list</dd>
  </dl>
  <dl id="stats" hidden></dl>
  <div id="tuning" role="group" hidden aria-label="Level of detail thresholds"></div>
  <div id="fallback" hidden></div>
`;

export function definePrismSystemScene() {
  if (customElements.get("prism-system-scene")) return;

  class PrismSystemScene extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.controller = null;
      this.pendingScene = null;
      this.pendingStats = null;
      this.pendingBudget = null;
      this.pendingMoveAllowed = false;
      this.starting = null;
    }

    connectedCallback() {
      if (this.starting || this.controller) return;
      this.shadowRoot.innerHTML = SHELL;
      this.starting = this.start();
    }

    disconnectedCallback() {
      this.controller?.dispose();
      this.controller = null;
      this.starting = null;
    }

    async start() {
      const root = this.shadowRoot;
      const fallback = root.getElementById("fallback");
      if (!navigator.gpu) {
        fallback.hidden = false;
        fallback.textContent = "The 3D view needs WebGPU, which this browser does not provide.";
        this.emit("error", { error: "webgpu-unavailable" });
        return;
      }
      const controller = new SystemScene({
        canvas: root.getElementById("viewport"),
        labelsEl: root.getElementById("labels"),
        statsEl: root.getElementById("stats"),
        gizmoEl: root.getElementById("gizmo"),
        helpEl: root.getElementById("help"),
        tuningEl: root.getElementById("tuning"),
        onSelectionChange: (selection) => this.emit("selectionchange", { selection }),
        onStatus: (status) => this.emit("status", { status }),
        onMove: (state) => this.emit("move", state),
      });
      try {
        await controller.init();
      } catch (error) {
        controller.dispose();
        fallback.hidden = false;
        fallback.textContent = `The 3D view could not start: ${error?.message || error}`;
        this.emit("error", { error: error?.message || String(error) });
        return;
      }
      if (!this.isConnected) {
        controller.dispose();
        return;
      }
      this.controller = controller;
      if (this.pendingBudget != null) controller.setGpuBudget(this.pendingBudget);
      if (this.pendingStats != null) controller.setStatsOverlay(this.pendingStats);
      controller.setMoveAllowed(this.pendingMoveAllowed);
      if (this.pendingScene) this.applyScene(this.pendingScene);
      this.emit("ready", {});
    }

    emit(name, detail) {
      this.dispatchEvent(new CustomEvent(`prism-system-scene:${name}`, { detail, bubbles: true, composed: true }));
    }

    applyScene(descriptor) {
      try {
        this.controller.setDescriptor(descriptor);
      } catch (error) {
        this.emit("error", { error: error?.message || String(error) });
      }
    }

    /** Show (or update) the `prism.system_scene.a0` descriptor. */
    setScene(descriptor) {
      this.pendingScene = descriptor;
      if (this.controller) this.applyScene(descriptor);
    }

    /** Select an occurrence by path (and optionally a feature id of it); null clears. */
    select(path, featureId = 0) {
      return this.controller?.select(path, featureId) ?? null;
    }

    frameAll() {
      this.controller?.frameAll();
    }

    frameOccurrence(path) {
      this.controller?.frameOccurrence(path);
    }

    pickAt(clientX, clientY) {
      return this.controller ? this.controller.pickAt(clientX, clientY) : Promise.resolve(null);
    }

    projectOccurrence(path) {
      return this.controller?.projectOccurrence(path) ?? null;
    }

    setStatsOverlay(visible) {
      this.pendingStats = Boolean(visible);
      this.controller?.setStatsOverlay(visible);
    }

    setLabelsVisible(visible) {
      if (this.controller) this.controller.showLabels = Boolean(visible);
    }

    setGpuBudget(bytes) {
      this.pendingBudget = bytes;
      this.controller?.setGpuBudget(bytes);
    }

    /** Level-of-detail thresholds ({ fullPx, boardPx, boxPx, keep }); null restores the defaults. */
    setLodThresholds(thresholds) {
      return this.controller?.setLodThresholds(thresholds) ?? null;
    }

    getStats() {
      return this.controller?.stats() ?? null;
    }

    /** Whether this reader may move boards (SB2-29); false also leaves move mode. */
    setMoveAllowed(allowed) {
      this.pendingMoveAllowed = Boolean(allowed);
      this.controller?.setMoveAllowed(allowed);
    }

    setMoveMode(enabled) {
      this.controller?.setMoveMode(enabled);
    }

    /** "world" or "local" gizmo axes. */
    setMoveSpace(space) {
      this.controller?.setMoveSpace(space);
    }

    /** Show a pose for the move target without saving it; null shows the saved pose. */
    previewPose(pose) {
      this.controller?.previewPose(pose);
    }

    /** Throw away an unsaved position (Esc, or after a failed save). */
    cancelMove() {
      this.controller?.cancelMove();
    }

    getMoveState() {
      return this.controller?.moveState() ?? null;
    }

    setHelpVisible(visible) {
      this.controller?.setHelpVisible(visible);
    }
  }

  customElements.define("prism-system-scene", PrismSystemScene);
}
