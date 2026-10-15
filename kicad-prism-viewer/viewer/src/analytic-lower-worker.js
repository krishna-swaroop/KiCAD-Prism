// Lowers an analytic pack's slices off the main thread: the WASM work that
// otherwise blocks the page for seconds on a large board. It opens its own
// copy of the pack, lowers the slices asked for, and transfers the typed
// arrays back; the host keeps its pack for the cheap queries.
import init, { AnalyticPack } from "../vendor/kicad-monkey-analytic/kicad_monkey_analytic.js";

import { loweredBuffers, lowerPackSlice } from "./analytic-pack.js";

let ready = null;

self.onmessage = async ({ data }) => {
  const { id, bytes, keys, toleranceNm, wasmUrl } = data;
  let pack = null;
  try {
    ready ??= init({ module_or_path: wasmUrl });
    await ready;
    pack = new AnalyticPack(new Uint8Array(bytes));
    const lowered = {};
    const transfer = [];
    for (const key of keys) {
      lowered[key] = lowerPackSlice(pack, key, toleranceNm);
      transfer.push(...loweredBuffers(lowered[key]));
    }
    self.postMessage({ id, lowered }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    pack?.free();
  }
};
