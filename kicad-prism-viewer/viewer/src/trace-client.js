// Runs a capture (trace-capture.js) through the trace worker, which the
// element starts beside itself: `prism-semantic-viewer-trace.js`, with
// MuTracer's assets in `prism-trace/`. One worker per render; it ends with it.

export const TRACE_WORKER_NAME = "prism-semantic-viewer-trace.js";

export function traceWorkerUrl() {
  const element = new URL(import.meta.url);
  const key = element.searchParams.get("v");
  return new URL(`${TRACE_WORKER_NAME}${key ? `?v=${key}` : ""}`, element);
}

/** The buffers a capture can hand over instead of copying. */
export function captureTransfers(capture) {
  const buffers = new Set();
  const add = (array) => { if (array?.buffer) buffers.add(array.buffer); };
  for (const board of capture.boards || []) {
    const coverage = board.coverage;
    if (coverage) {
      add(coverage.body);
      for (const side of ["front", "back"]) for (const layer of ["copper", "mask", "silk"]) add(coverage[side]?.[layer]);
    }
    add(board.outlineEdges);
    add(board.holes);
    for (const model of board.components || []) for (const key of ["position", "normal", "indices"]) add(model[key]);
  }
  return [...buffers];
}

/**
 * Path-trace `capture`: resolves to `{ blob, width, height, samples, timings }`;
 * rejects with an AbortError when `signal` aborts. `onProgress` gets the
 * worker's progress messages.
 */
export function traceCapture(capture, { signal, onProgress, workerUrl = traceWorkerUrl(), ...options } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { type: "module", name: "prism-trace" });
    const done = (settle, value) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      settle(value);
    };
    // The worker is asked first, so it lets go of its device; it is ended regardless soon after.
    const abort = () => {
      worker.postMessage({ type: "cancel" });
      setTimeout(() => done(reject, new DOMException("Render cancelled", "AbortError")), 2000);
    };
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException("Render cancelled", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data);
      else if (data.type === "done") done(resolve, data);
      else if (data.type === "cancelled") done(reject, new DOMException("Render cancelled", "AbortError"));
      else if (data.type === "error") done(reject, new Error(data.message));
    };
    worker.onerror = (event) => done(reject, new Error(event.message || "The render worker failed"));
    worker.postMessage({ type: "render", capture, options }, captureTransfers(capture));
  });
}
