// IS-15: an explicit "Show board" must win over the pre-isolation snapshot.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyIsolationPrefs,
  applyNetProbePrefs,
  applyRestorePrefs,
  applyShowBoard,
} from "./visibility-prefs.js";

function visibleState() {
  return {
    showBoard: true,
    showComponents: true,
    savedShowBoard: true,
    savedShowComponents: true,
    isolateNet: false,
    preIsolationShowBoard: null,
  };
}

// Mirrors main.js setNetIsolation's visibility coupling, so the assertions
// describe the state the viewer ends up in; setShowBoard is the real code.
function probe(state) {
  applyNetProbePrefs(state);
}

function isolate(state) {
  const wasIsolating = state.isolateNet;
  state.isolateNet = true;
  applyIsolationPrefs(state, wasIsolating, true);
}

// The viewer's setNetIsolation(false), reduced to its visibility coupling.
function exitIsolation(state) {
  applyIsolationPrefs(state, state.isolateNet, false);
  state.isolateNet = false;
}

function showBoard(state, visible) {
  applyShowBoard(state, visible, () => exitIsolation(state));
}

describe("explicit show-board during isolation", () => {
  it("wins over the pre-isolation snapshot after probe -> isolate", () => {
    const state = visibleState();
    probe(state);
    assert.equal(state.showBoard, false);
    assert.equal(state.savedShowBoard, true);

    isolate(state);
    assert.equal(state.showBoard, false);
    assert.equal(state.isolateNet, true);
    assert.equal(state.preIsolationShowBoard, false);

    showBoard(state, true);
    assert.equal(state.showBoard, true);
    assert.equal(state.savedShowBoard, true);
    assert.equal(state.isolateNet, false);
    assert.equal(state.preIsolationShowBoard, null);
  });

  it("does not let a later exit restore the snapshot", () => {
    const state = visibleState();
    probe(state);
    isolate(state);
    showBoard(state, true);
    // No-op exit: the snapshot is gone, so the explicit toggle stands.
    applyIsolationPrefs(state, false, false);
    assert.equal(state.showBoard, true);
    applyRestorePrefs(state);
    assert.equal(state.showBoard, true);
  });

  it("keeps isolation when the board stays hidden", () => {
    const state = visibleState();
    probe(state);
    isolate(state);
    showBoard(state, false);
    assert.equal(state.showBoard, false);
    assert.equal(state.isolateNet, true);
    assert.equal(state.preIsolationShowBoard, false);
  });

  it("leaves the snapshot alone outside isolation", () => {
    const state = visibleState();
    showBoard(state, true);
    assert.equal(state.showBoard, true);
    assert.equal(state.isolateNet, false);
    assert.equal(state.preIsolationShowBoard, null);
  });
});
