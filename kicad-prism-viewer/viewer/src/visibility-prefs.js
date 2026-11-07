// Visibility preference transitions shared by the viewer and its tests (IS-15).
//
// `state` is the viewer's visibility slice: showBoard, showComponents,
// savedShowBoard, savedShowComponents, isolateNet and preIsolationShowBoard.
// Keeping these transitions pure lets the probe -> isolate -> show-board
// ordering stay covered without a WebGPU context.

/**
 * Snapshot the user's last ON prefs and hide substrate and parts for a net
 * probe. Chained probes must not overwrite the snapshot with the previous
 * probe's false values.
 */
export function applyNetProbePrefs(state) {
  if (state.showBoard || state.showComponents) {
    state.savedShowBoard = state.showBoard;
    state.savedShowComponents = state.showComponents;
  }
  state.showBoard = false;
  state.showComponents = false;
}

/** Esc/clear: return to the pre-probe preference, defaulting to visible. */
export function applyRestorePrefs(state) {
  state.showBoard = state.savedShowBoard !== false;
  state.showComponents = state.savedShowComponents !== false;
}

/**
 * Substrate coupling for the Isolate toggle. Entering snapshots showBoard and
 * hides the substrate; leaving restores the snapshot. Parts are unrelated.
 */
export function applyIsolationPrefs(state, wasIsolating, next) {
  if (next && !wasIsolating) {
    state.preIsolationShowBoard = state.showBoard;
    state.showBoard = false;
  } else if (!next && wasIsolating) {
    if (typeof state.preIsolationShowBoard === "boolean") {
      state.showBoard = state.preIsolationShowBoard;
    }
    state.preIsolationShowBoard = null;
  }
}

/**
 * Plan an explicit "Show board" toggle. Turning it on exits isolation first so
 * the toggle wins over the snapshot Isolate would restore, and drops the
 * snapshot so a later exit cannot override it.
 */
export function planShowBoard(state, visible) {
  const next = Boolean(visible);
  const exitIsolation = next && Boolean(state.isolateNet);
  return {
    exitIsolation,
    showBoard: next,
    preIsolationShowBoard: exitIsolation ? null : state.preIsolationShowBoard,
  };
}
