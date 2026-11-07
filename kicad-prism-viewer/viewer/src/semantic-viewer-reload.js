// Per-attempt ownership for semantic viewer reloads.
//
// Every reload captures its own AbortController. A newer reload aborts the
// older one, so after each await an attempt checks that it is still the
// owner's current attempt before it touches the shadow DOM, publishes a
// mounted controller, or emits ready/error events. Late results from a
// superseded or disconnected attempt are disposed silently.

/**
 * Whether the element is shown: whether it currently intersects the viewport.
 * Older browsers without IntersectionObserver fall back to the host's `active`
 * attribute. A hidden section (the `hidden` attribute) never intersects.
 */
export function viewerIsShown({ observed, intersecting, active }) {
  return observed ? Boolean(intersecting) : Boolean(active);
}

/**
 * Whether a viewer element must remount because it no longer owns the
 * page-wide viewer session. Mounting another element disposes the previous
 * element's renderer without telling it (main.js `beginViewerSession`), so a
 * shown element whose port is stale rebuilds through the normal reload path.
 *
 * `mounted` is the element's mode controller, or null between mounts;
 * `isCurrent` is that controller's mounted port session check.
 */
export function shouldReloadStaleScene({ shown, mounted, isCurrent }) {
  return Boolean(shown) && Boolean(mounted) && typeof isCurrent === "function" && !isCurrent();
}

export function createReloadOwner() {
  let current = null;
  return {
    begin() {
      current?.abort();
      current = new AbortController();
      return current;
    },
    owns(attempt) {
      return attempt !== null && attempt === current && !attempt.signal.aborted;
    },
    cancel() {
      current?.abort();
      current = null;
    },
  };
}

/**
 * Run one reload attempt against a host.
 *
 * `host` is the custom element (or a test double) exposing:
 *   isConnected, renderLoading(), renderShell(), renderError(error),
 *   mountViewer({ topology, semanticGeometry, readiness, signal }) -> controller,
 *   publishController(controller), emitReady(detail), emitError(error).
 *
 * Only the current, connected attempt may publish. A stale attempt disposes
 * anything it mounted and returns without rendering or emitting.
 */
export async function runSemanticViewerReload(host, attempt, { owner, bundleUrl, loadBundle, now = () => performance.now() }) {
  const reloadStarted = now();
  const timings = {};
  const { signal } = attempt;
  const isCurrent = () => owner.owns(attempt) && host.isConnected;
  try {
    host.renderLoading();
    const bundleStarted = now();
    const { bundle, topology, semanticGeometry, assetCache } = await loadBundle(bundleUrl, timings, signal);
    timings.bundle_group_total_ms = now() - bundleStarted;
    if (!isCurrent()) return;
    host.renderShell();
    const mountStarted = now();
    const controller = await host.mountViewer({ topology, semanticGeometry, readiness: bundle.readiness, assetCache, signal });
    if (!isCurrent()) {
      controller?.dispose?.();
      return;
    }
    host.publishController(controller);
    timings.mount_and_first_frame_ms = now() - mountStarted;
    Object.assign(timings, controller?.performance || {});
    timings.reload_to_visible_ms = now() - reloadStarted;
    host.emitReady({
      schema: "prism.semantic_viewer_performance.a0",
      milestone: "board-visible",
      readiness_stage: bundle.readiness?.stage || "semantic-ready",
      readiness_progress: bundle.readiness?.progress ?? 100,
      timings,
    });
  } catch (error) {
    // An aborted or superseded attempt must not replace the newer attempt's
    // content with its own error state.
    if (!isCurrent()) return;
    host.renderError(error);
    host.emitError(error);
  }
}
