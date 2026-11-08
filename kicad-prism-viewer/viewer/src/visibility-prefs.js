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
 * An explicit "Show board" toggle. Turning it on during isolation exits
 * isolation first (`exitIsolation` runs the viewer's full transition, which
 * restores the pre-isolation snapshot and the layers), then the requested value
 * wins and the snapshot is dropped so a later exit cannot override it.
 */
export function applyShowBoard(state, visible, exitIsolation) {
  const next = Boolean(visible);
  const exiting = next && Boolean(state.isolateNet);
  if (exiting) exitIsolation();
  state.showBoard = next;
  state.savedShowBoard = next;
  if (exiting) state.preIsolationShowBoard = null;
  return exiting;
}
