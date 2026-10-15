// Runs analytic-lower-worker.js for one load. The worker bundle is served
// beside the element bundle with the element's own cache key; where no worker
// can start (Node tests, the standalone IIFE build, a missing file), callers
// lower on the main thread instead.

/** File name the served worker bundle has next to the element bundle. */
export const ANALYTIC_LOWER_WORKER_NAME = "prism-semantic-viewer-lower.js";

function workerUrl() {
  if (typeof Worker === "undefined") return null;
  try {
    const element = new URL(import.meta.url);
    const key = element.searchParams.get("v");
    return new URL(`${ANALYTIC_LOWER_WORKER_NAME}${key ? `?v=${key}` : ""}`, element);
  } catch {
    return null;
  }
}

/**
 * Lower `keys` of the pack `bytes` in a worker. Resolves to a Map of key to
 * lowered slice, or null when no worker can do it (the caller then lowers on
 * the main thread). `bytes` is copied, so the caller's buffer stays usable.
 */
export function lowerSlicesInWorker(bytes, keys, toleranceNm, wasmUrl) {
  const url = workerUrl();
  if (!url || typeof wasmUrl !== "string") return Promise.resolve(null);
  let worker;
  try {
    worker = new Worker(url, { type: "module", name: "analytic-lower" });
  } catch {
    return Promise.resolve(null);
  }
  const copy = (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).slice();
  return new Promise((resolve) => {
    // A worker that dies (bad URL, out of memory) resolves null: the board still loads.
    const finish = (result) => {
      worker.terminate();
      resolve(result);
    };
    worker.onmessage = ({ data }) => finish(data.error ? null : new Map(Object.entries(data.lowered)));
    worker.onerror = (event) => {
      event.preventDefault?.();
      finish(null);
    };
    worker.postMessage({ id: 1, bytes: copy.buffer, keys, toleranceNm, wasmUrl }, [copy.buffer]);
  });
}
