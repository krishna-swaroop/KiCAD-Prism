import {
  composeFieldRasters,
  denseOperationValues,
  openAnalyticPack,
  operationCount,
  planBarrels,
  planBoardSlices,
  planWalls,
  valueRange,
} from "./analytic-pack.js";
import { AnalyticRenderer } from "./analytic-renderer.js";

/**
 * Height of the loaded copper geometry above the manifest's centred stackup
 * frame, in world metres, from a resident copper mesh's middle height. A
 * flat mesh has a degenerate z extent, which `quantisationOf` stores as size
 * 1; its plane is then `quantMin`. Zero when no copper is resident.
 */
export function copperZOffset(entries, layers) {
  const byId = new Map((layers || []).map((layer) => [Number(layer.id), layer]));
  for (const entry of entries || []) {
    const layer = byId.get(Number(entry.layerId));
    if (entry.kind !== "copper" || !layer || !entry.quantMin || !entry.quantSize) continue;
    const flat = entry.quantSize[2] === 1;
    const middle = entry.quantMin[2] + (flat ? 0 : entry.quantSize[2] / 2);
    return middle - Number(layer.z_mm || 0) / 1000;
  }
  return 0;
}

/**
 * The world height of the face a layer's mesh copper shows, before the
 * layer's exploded offset, or null when none of its copper is resident. A
 * flat mesh lies on `quantMin`; an extruded one shows its top face, or its
 * underside on the bottom layer. Analytic copper drawn there replaces the
 * mesh face exactly, so it meets the substrate, mask and barrels as it does.
 */
export function copperPlane(entries, layerId, bottom = false) {
  for (const entry of entries || []) {
    if (entry.kind !== "copper" || Number(entry.layerId) !== Number(layerId)) continue;
    if (!entry.quantMin || !entry.quantSize) continue;
    if (entry.quantSize[2] === 1 || bottom) return entry.quantMin[2];
    return entry.quantMin[2] + entry.quantSize[2];
  }
  return null;
}

/**
 * Open `bytes` (a kicad_monkey materialization pack) and draw the board from
 * it on `renderer`: dielectrics with their walls, copper, barrels and drill
 * walls, solder mask, paste and silkscreen, in place of the mesh layers they
 * replace. `colorFor(layer)` gives each copper layer's linear RGBA.
 */
export async function attachAnalyticPack({ renderer, layers, colorFor, bytes, wasm, toleranceNm }) {
  const pack = await openAnalyticPack(bytes, { wasm });
  const zOffset = copperZOffset(renderer.entries, layers);
  const { planned, unmatched } = planBoardSlices(pack.header, layers, zOffset);
  const byId = new Map(layers.map((layer) => [Number(layer.id), layer]));
  const started = performance.now();
  const lowered = new Map();
  for (const slice of planned) {
    if (!lowered.has(slice.key)) lowered.set(slice.key, pack.lowerSlice(slice.key, toleranceNm));
  }
  const slices = planned.map((slice) => ({
    ...slice,
    color: slice.role === "copper" ? colorFor(byId.get(slice.layerId)) : [1, 1, 1, 1],
    lowered: lowered.get(slice.key),
  }));
  const lowerMs = performance.now() - started;
  const analytic = new AnalyticRenderer(renderer);
  analytic.setSlices(slices);
  // Barrels and drill walls from the pack's holes replace the bundle's mesh barrels.
  analytic.setBarrels(planBarrels(pack.header, pack.barrels(), slices));
  analytic.setWalls(planWalls(slices, lowered, layers, zOffset));
  renderer.setAnalytic(analytic);
  return { pack, analytic, unmatched, lowerMs, zOffset, operations: operationCount(pack.header), overlay: null };
}

/**
 * Apply a synthetic or engine result to an attached pack:
 *   { kind: "operation_values", quantity, units, values, range? }
 *     `values` per operation index (array) or { index: value };
 *   { kind: "field_tiles", quantity, units, tiles, range? }
 *     tiles on the materialization's tile grid (see composeFieldRasters);
 *   null clears it.
 */
export function applyAnalyticOverlay(state, overlay) {
  if (!overlay) {
    state.analytic.clearOverlay();
    state.overlay = null;
    return null;
  }
  if (overlay.kind === "operation_values") {
    const values = denseOperationValues(overlay.values, state.operations);
    const range = overlay.range || valueRange(values);
    state.analytic.setOperationValues(values, range);
    state.overlay = { ...overlay, values, range };
  } else if (overlay.kind === "field_tiles") {
    const rasters = composeFieldRasters(overlay.tiles);
    const range = overlay.range || valueRange([...rasters.values()].flatMap((raster) => [...valueRange(raster.values)]));
    state.analytic.setFieldRasters(rasters, range);
    state.overlay = { ...overlay, range, slices: [...rasters.keys()] };
  } else {
    throw new TypeError(`unknown analytic overlay kind ${overlay.kind}`);
  }
  return { kind: overlay.kind, range: state.overlay.range };
}

/** What lies under an analytic pick: the operation, its binding, and its value. */
export function describeAnalyticHit(state, operationIndex) {
  const overlay = state.overlay;
  const value = overlay?.kind === "operation_values" ? overlay.values[operationIndex] : undefined;
  return {
    operationIndex,
    binding: state.pack.binding(operationIndex),
    ...(Number.isFinite(value) ? { value, quantity: overlay.quantity, units: overlay.units } : {}),
  };
}
