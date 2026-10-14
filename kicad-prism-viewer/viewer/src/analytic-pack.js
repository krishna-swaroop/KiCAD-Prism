import init, { AnalyticPack } from "../vendor/kicad-monkey-analytic/kicad_monkey_analytic.js";
import provenance from "../vendor/kicad-monkey-analytic/provenance.json" with { type: "json" };

/** File name the served WASM has next to the element bundle. */
export const ANALYTIC_WASM_NAME = "kicad-monkey-analytic.wasm";
export const ANALYTIC_SCHEMA = "kicad_monkey.materialization.a0";
/** Flattening tolerance for regions and cubic segments, in nanometres. */
export const DEFAULT_TOLERANCE_NM = 1000;

let wasmReady = null;

function defaultWasmUrl() {
  const key = String(provenance.files?.["kicad_monkey_analytic_bg.wasm"] || "").slice(0, 16);
  try {
    return new URL(`${ANALYTIC_WASM_NAME}?v=${key}`, import.meta.url);
  } catch {
    return `/${ANALYTIC_WASM_NAME}?v=${key}`;
  }
}

/** Load the WASM once; `module` may be a URL or the module's bytes. */
export function loadAnalyticWasm(module = defaultWasmUrl()) {
  wasmReady ??= init({ module_or_path: module }).catch((error) => {
    wasmReady = null;
    throw error;
  });
  return wasmReady;
}

/**
 * Open a pack. Returns its header (identity, stack, nets, components, chunk
 * directory; no binding), `lowerSlice(key, toleranceNm)` returning typed
 * arrays, and `binding(index)` for one operation.
 */
export async function openAnalyticPack(bytes, { wasm } = {}) {
  await loadAnalyticWasm(wasm);
  const pack = new AnalyticPack(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const header = JSON.parse(pack.headerJson());
  if (header.schema !== ANALYTIC_SCHEMA) throw new Error(`unsupported materialization schema ${header.schema}`);
  return {
    header,
    lowerSlice(key, toleranceNm = DEFAULT_TOLERANCE_NM) {
      const records = pack.lowerSlice(key, toleranceNm);
      try {
        return {
          shapes: new Uint32Array(records.shapes()),
          subtractShapes: records.subtractShapes(),
          fanVertices: new Float32Array(records.fanVertices()),
          covers: new Uint32Array(records.covers()),
          batches: new Uint32Array(records.batches()),
          contourEdges: new Float32Array(records.contourEdges()),
          contourEdgeOperations: new Uint32Array(records.contourEdgeOperations()),
          shapeCuts: new Uint32Array(records.shapeCuts()),
          edgeCuts: new Uint32Array(records.edgeCuts()),
          cutIndices: new Uint32Array(records.cutIndices()),
          outlineEdges: new Float32Array(records.outlineEdges()),
          outlineShapes: new Uint32Array(records.outlineShapes()),
          stats: JSON.parse(records.statsJson()),
        };
      } finally {
        records.free();
      }
    },
    /** The plated holes' barrels: `BARREL_FLOATS` floats and `BARREL_WORDS` words each. */
    barrels() {
      const records = pack.barrelRecords();
      try {
        return { floats: new Float32Array(records.floats()), words: new Uint32Array(records.words()), skipped: records.skipped() };
      } finally {
        records.free();
      }
    },
    binding(index) {
      return JSON.parse(pack.bindingJson(index));
    },
    free() {
      pack.free();
    },
  };
}

/** Operation count of a pack header (its chunk directory covers them all). */
export function operationCount(header) {
  return (header.chunks || []).reduce((sum, chunk) => sum + Number(chunk.operation_count || 0), 0);
}

/** Board-millimetre extent of a slice's chunks, or null. */
export function sliceBoundsMm(header, key) {
  let bounds = null;
  for (const chunk of header.chunks || []) {
    if (chunk.slice_key !== key) continue;
    const b = chunk.bounds;
    const next = [b.min_x_nm, b.min_y_nm, b.max_x_nm, b.max_y_nm].map((nm) => nm / 1e6);
    bounds = bounds
      ? [Math.min(bounds[0], next[0]), Math.min(bounds[1], next[1]), Math.max(bounds[2], next[2]), Math.max(bounds[3], next[3])]
      : next;
  }
  return bounds;
}

/**
 * The conductor slices of `header` matched to the viewer's copper layers by
 * KiCad layer name. Each gets the layer's id, its height in the manifest's
 * centred stackup frame (metres; the mesh copper's plane), and whether it is
 * an outer layer and the bottom one (whose faces look down). Slices without
 * a viewer layer are reported in `unmatched`.
 */
export function planCopperSlices(header, layers) {
  const byName = new Map((layers || []).map((layer) => [String(layer.name), layer]));
  const conductors = (header.stack?.slices || []).filter((slice) => slice.role === "conductor");
  const planned = [];
  const unmatched = [];
  conductors.forEach((slice, position) => {
    const layer = byName.get(String(slice.kicad_layer || ""));
    const bounds = sliceBoundsMm(header, slice.key);
    if (!layer || !bounds) {
      unmatched.push(slice.key);
      return;
    }
    const outer = position === 0 || position === conductors.length - 1;
    const bottom = position === conductors.length - 1 && conductors.length > 1;
    planned.push({ key: slice.key, layerId: Number(layer.id), z: Number(layer.z_mm || 0) / 1000, outer, mark: outer, bottom, bounds });
  });
  return { planned, unmatched };
}

const ROLE_OF = { conductor: "copper", solder_mask: "mask", silkscreen: "silk", paste: "paste", dielectric: "dielectric" };
// Over the mask's outer face: paste, then silkscreen (which may cross paste).
const PASTE_LIFT = 0.000001;
const SILK_LIFT = 0.000002;
// A dielectric's faces sit this far (metres) inside its slab: the copper
// and mask laid on it share its planes exactly, and a camera inside the
// board would otherwise see the two fight by depth rounding.
const DIELECTRIC_INSET = 0.0000001;

/**
 * KiCad's predefined stackup colours for dielectric layers (sRGB 0-255), by
 * the name a board's `(stackup (layer "dielectric 1" (color ...)))` gives.
 */
const KICAD_DIELECTRIC_COLORS = {
  "fr4 natural": [109, 116, 75],
  "ptfe natural": [252, 252, 250],
  polyimide: [205, 130, 0],
  "phenolic natural": [92, 17, 6],
  aluminum: [213, 213, 213],
};

/**
 * A dielectric's RGBA from its stackup colour: a KiCad name, or a
 * user-defined `#RRGGBB[AA]`. Laminate that names none (or "Not specified")
 * is FR4 natural, as bare board edges are. Opaque: a board edge is solid.
 * Display values, as the viewer's other colours are.
 */
export function dielectricColor(name) {
  const text = String(name || "").trim();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
  const srgb = hex
    ? [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16))
    : KICAD_DIELECTRIC_COLORS[text.toLowerCase()] || KICAD_DIELECTRIC_COLORS["fr4 natural"];
  return [...srgb.map((channel) => channel / 255), 1];
}

/**
 * Every slice of `header` the viewer can draw, matched to its layer in
 * `layers` (the manifest's, by KiCad layer name; heights are the layer centres
 * in the stackup frame) and placed in the mesh frame by `zOffset` (metres).
 * Each is `{ key, role, layerId, side, z, faceDown, outer, offsetLayers,
 * bounds }`: `z` the face it shows (world metres before exploded offsets),
 * `faceDown` whether that face looks down, and `offsetLayers` the copper
 * layers whose exploded offsets it takes the mean of. A dielectric gives two
 * entries, its top and bottom faces (`face`: "top" or "bottom"), sharing one
 * key. Order: dielectrics, copper, mask, paste, silkscreen.
 */
export function planBoardSlices(header, layers, zOffset = 0) {
  const byName = new Map((layers || []).map((layer) => [String(layer.name), layer]));
  const stack = [...(header.stack?.slices || [])].sort((a, b) => a.order - b.order);
  const conductors = stack.filter((slice) => slice.role === "conductor");
  const copperLayer = (slice) => Number(byName.get(String(slice?.kicad_layer || ""))?.id || 0);
  const front = copperLayer(conductors[0]);
  const back = copperLayer(conductors[conductors.length - 1]);
  const planned = [];
  const unmatched = [];
  for (const slice of stack) {
    const role = ROLE_OF[slice.role];
    const layer = byName.get(String(slice.kicad_layer || ""));
    const bounds = sliceBoundsMm(header, slice.key);
    if (!role || !layer || !bounds) {
      if (role) unmatched.push(slice.key);
      continue;
    }
    const centre = Number(layer.z_mm || 0) / 1000 + zOffset;
    const half = (Number(layer.thickness_mm) || Number(slice.thickness_nm || 0) / 1e6) / 2000;
    const backSide = slice.side === "back" || (role !== "dielectric" && role !== "copper" && centre < zOffset);
    const base = { key: slice.key, role, layerId: Number(layer.id), side: slice.side || null, bounds };
    if (role === "dielectric") {
      base.color = dielectricColor(layer.color);
      // Between two copper layers: it moves by the mean of their offsets.
      const above = [...conductors].reverse().find((c) => c.order < slice.order);
      const below = conductors.find((c) => c.order > slice.order);
      const offsetLayers = [copperLayer(above) || copperLayer(below), copperLayer(below) || copperLayer(above)];
      const slab = { zTop: centre + half, zBottom: centre - half };
      planned.push({ ...base, ...slab, face: "top", z: centre + half - DIELECTRIC_INSET, faceDown: false, outer: false, offsetLayers });
      planned.push({ ...base, ...slab, face: "bottom", z: centre - half + DIELECTRIC_INSET, faceDown: true, outer: false, offsetLayers });
    } else if (role === "copper") {
      // A slab of its stackup thickness: both faces, and side walls drawn
      // with the face that looks out (the top one inside the board).
      const position = conductors.indexOf(slice);
      const bottom = position === conductors.length - 1 && conductors.length > 1;
      const outer = position === 0 || bottom;
      const slab = { ...base, bottom, outer, zTop: centre + half, zBottom: centre - half, offsetLayers: [Number(layer.id), Number(layer.id)] };
      // Only the outward face of an outer layer marks copper for the mask's tint.
      planned.push({ ...slab, face: "top", z: centre + half, faceDown: false, mark: outer && !bottom, walls: !bottom });
      planned.push({ ...slab, face: "bottom", z: centre - half, faceDown: true, mark: bottom, walls: bottom });
    } else {
      // Mask, paste and silkscreen face out from their side, and move with its outer copper.
      const lift = role === "silk" ? SILK_LIFT : role === "paste" ? PASTE_LIFT : 0;
      const outerLayer = backSide ? back : front;
      planned.push({
        ...base,
        z: backSide ? centre - half - lift : centre + half + lift,
        faceDown: backSide,
        outer: false,
        thickness: half * 2,
        offsetLayers: [outerLayer, outerLayer],
      });
    }
  }
  conformOuterLayers(planned);
  // The board's outside: the top face of the highest dielectric and the
  // bottom face of the lowest. A solid board hides every other face.
  const faces = planned.filter((slice) => slice.role === "dielectric");
  const top = faces.filter((slice) => !slice.faceDown).sort((a, b) => b.z - a.z)[0];
  const under = faces.filter((slice) => slice.faceDown).sort((a, b) => a.z - b.z)[0];
  for (const slice of faces) slice.skin = slice === top || slice === under;
  const rank = { dielectric: 0, copper: 1, mask: 2, paste: 3, silk: 4 };
  planned.sort((a, b) => rank[a.role] - rank[b.role]);
  return { planned, unmatched };
}

/**
 * The solder mask coats its side's laminate and copper alike, one
 * thickness deep: over copper its face is where the stackup puts it (the
 * copper's outer face plus the mask), over bare laminate one copper
 * thickness lower. A mask gets `coat` (its thickness) and `zLow`, its face
 * over laminate; silkscreen, printed on the mask, gets its `zLow` too; paste
 * lies on its pads' copper.
 */
function conformOuterLayers(planned) {
  for (const slice of planned) {
    if (slice.role !== "mask" && slice.role !== "silk" && slice.role !== "paste") continue;
    const copper = planned.find((other) => other.role === "copper" && other.mark && other.faceDown === slice.faceDown);
    if (!copper) continue;
    const sign = slice.faceDown ? -1 : 1;
    // The laminate under this side's copper, and the copper's outer face.
    const laminate = slice.faceDown ? copper.zTop : copper.zBottom;
    const face = slice.faceDown ? copper.zBottom : copper.zTop;
    const mask = planned.find((other) => other.role === "mask" && other.faceDown === slice.faceDown);
    const coat = mask?.thickness || 0;
    if (slice.role === "mask") {
      slice.coat = coat;
      slice.zLow = laminate + sign * coat;
    } else if (slice.role === "silk") {
      slice.zLow = laminate + sign * (coat + SILK_LIFT);
    } else {
      slice.z = face + sign * PASTE_LIFT;
    }
  }
}

/** Dense per-operation values (NaN where absent) from an array or a map. */
export function denseOperationValues(values, count) {
  const dense = new Float32Array(Math.max(1, count)).fill(Number.NaN);
  if (ArrayBuffer.isView(values) || Array.isArray(values)) {
    for (let index = 0; index < Math.min(count, values.length); index += 1) dense[index] = Number(values[index]);
  } else {
    for (const [index, value] of Object.entries(values || {})) {
      const position = Number(index);
      if (Number.isInteger(position) && position >= 0 && position < count) dense[position] = Number(value);
    }
  }
  return dense;
}

/** The finite minimum and maximum of `values`, or [0, 1]. */
export function valueRange(values) {
  let low = Infinity;
  let high = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return Number.isFinite(low) ? [low, high] : [0, 1];
}

/**
 * Combine field tiles into one raster per slice. A tile is `{ slice_key,
 * origin_nm: [x, y], pitch_nm, width, height, values }` on the
 * materialization's tile grid; tiles of one slice must share their pitch and
 * align to it. Cells no tile covers hold NaN.
 */
/**
 * Rasters of a `prism.sim.field` grid document (sim-adr-0018): `slices` are
 * `{ slice_key, ix0, iy0, nx, ny, values }` with float32 `values`, on the
 * grid `origin_x_m`, `origin_y_m`, `dx_m`, `dy_m`.
 */
export function gridFieldRasters(grid) {
  const rasters = new Map();
  const mm = 1e3;
  for (const slice of grid.slices || []) {
    if (!(slice.nx > 0 && slice.ny > 0) || slice.values.length !== slice.nx * slice.ny) {
      throw new Error(`grid field slice ${slice.slice_key} has ${slice.values.length} values for ${slice.nx} x ${slice.ny} cells`);
    }
    rasters.set(slice.slice_key, {
      originMm: [(grid.origin_x_m + slice.ix0 * grid.dx_m) * mm, (grid.origin_y_m + slice.iy0 * grid.dy_m) * mm],
      pitchMm: [grid.dx_m * mm, grid.dy_m * mm],
      width: slice.nx,
      height: slice.ny,
      values: slice.values,
    });
  }
  return rasters;
}

export function composeFieldRasters(tiles) {
  const bySlice = new Map();
  for (const tile of tiles || []) {
    if (!bySlice.has(tile.slice_key)) bySlice.set(tile.slice_key, []);
    bySlice.get(tile.slice_key).push(tile);
  }
  const rasters = new Map();
  for (const [key, group] of bySlice) {
    const pitch = Number(group[0].pitch_nm);
    if (!(pitch > 0) || group.some((tile) => Number(tile.pitch_nm) !== pitch)) {
      throw new Error(`field tiles of ${key} must share one positive pitch`);
    }
    const x0 = Math.min(...group.map((tile) => tile.origin_nm[0]));
    const y0 = Math.min(...group.map((tile) => tile.origin_nm[1]));
    const cell = (value, origin) => {
      const steps = (value - origin) / pitch;
      if (!Number.isInteger(steps)) throw new Error(`field tile of ${key} is off its pitch grid`);
      return steps;
    };
    const width = Math.max(...group.map((tile) => cell(tile.origin_nm[0], x0) + tile.width));
    const height = Math.max(...group.map((tile) => cell(tile.origin_nm[1], y0) + tile.height));
    const values = new Float32Array(width * height).fill(Number.NaN);
    for (const tile of group) {
      const left = cell(tile.origin_nm[0], x0);
      const top = cell(tile.origin_nm[1], y0);
      for (let row = 0; row < tile.height; row += 1) {
        values.set(tile.values.subarray
          ? tile.values.subarray(row * tile.width, (row + 1) * tile.width)
          : tile.values.slice(row * tile.width, (row + 1) * tile.width), (top + row) * width + left);
      }
    }
    rasters.set(key, { originMm: [x0 / 1e6, y0 / 1e6], pitchMm: pitch / 1e6, width, height, values });
  }
  return rasters;
}

/** Per pack barrel: floats (centre x, y, half length, angle, radius, plating mm) and words. */
export const BARREL_FLOATS = 8;
export const BARREL_WORDS = 8;
const NO_BACKDRILL = 0xffffffff;
/** Barrel flags (the pack's barrel words, kicad_monkey's `FLAG_*`). */
export const BARREL_FLAGS = Object.freeze({
  unplated: 1 << 1,
  tentedFront: 1 << 2,
  tentedBack: 1 << 3,
  coveredFront: 1 << 4,
  coveredBack: 1 << 5,
  pluggedFront: 1 << 6,
  pluggedBack: 1 << 7,
  filled: 1 << 8,
  capped: 1 << 9,
  castellated: 1 << 10,
});
const BARREL_INSTANCE_FLOATS = 16;

/**
 * The board edge a castellated hole is cut by, as a half-plane in world
 * metres (y up): the board lies where dot(p, normal) <= offset. From the
 * dielectric outline edges (board mm, y down, material on the left) the
 * one nearest the hole's centre within its reach; null when none is.
 */
export function castellationEdge(edges, centre, reach) {
  let best = null;
  for (let i = 0; edges && i + 3 < edges.length; i += 4) {
    const a = [edges[i], edges[i + 1]];
    const b = [edges[i + 2], edges[i + 3]];
    const along = [b[0] - a[0], b[1] - a[1]];
    const length2 = along[0] * along[0] + along[1] * along[1];
    if (length2 <= 0) continue;
    const t = Math.max(0, Math.min(1, ((centre[0] - a[0]) * along[0] + (centre[1] - a[1]) * along[1]) / length2));
    const distance = Math.hypot(centre[0] - a[0] - t * along[0], centre[1] - a[1] - t * along[1]);
    if (distance > reach || (best && distance >= best.distance)) continue;
    // Outward, in the world (y up): the board's y is the world's -y.
    const length = Math.sqrt(length2);
    const normal = [along[1] / length, along[0] / length];
    best = { distance, normal, offset: (normal[0] * a[0] - normal[1] * a[1]) / 1000 };
  }
  return best && { normal: best.normal, offset: best.offset };
}

/**
 * Barrel instances for the analytic renderer from a pack's barrels and the
 * drawn copper slices (`{ key, layerId, z, bottom }`, z the face the slice
 * shows): world metres, y up, each `shape (x, y, half length, angle)`,
 * `size (radius, plating, top z, bottom z)`, `ids (operation, top layer,
 * bottom layer, flags)` (`BARREL_FLAGS`) and `edge (normal x, normal y,
 * offset, 0)`: a castellated hole keeps only the board's side of its edge
 * (`castellationEdge`, from `outline`: the dielectric outline edges, board
 * mm), any other the whole plane. A barrel spans its conductors less any a backdrill bores
 * (from its side through its until-slice, inclusive), from the top face of
 * the first to the bottom face of the last. Barrels whose span has no drawn
 * slice are skipped.
 */
export function planBarrels(header, barrels, slices, outline = null) {
  const conductors = (header.stack?.slices || [])
    .filter((slice) => slice.role === "conductor")
    .sort((a, b) => a.order - b.order);
  const drawn = new Map((slices || []).filter((slice) => slice.role === undefined || slice.role === "copper").map((slice) => [slice.key, slice]));
  const faces = (conductor) => {
    const slice = drawn.get(conductor.key);
    if (!slice) return null;
    if (slice.zTop !== undefined) return { top: slice.zTop, bottom: slice.zBottom, layerId: slice.layerId };
    const thickness = Number(conductor.thickness_nm || 0) / 1e9;
    return slice.bottom
      ? { top: slice.z + thickness, bottom: slice.z, layerId: slice.layerId }
      : { top: slice.z, bottom: slice.z - thickness, layerId: slice.layerId };
  };
  const count = Math.floor(barrels.floats.length / BARREL_FLOATS);
  const data = new ArrayBuffer(count * BARREL_INSTANCE_FLOATS * 4);
  const floats = new Float32Array(data);
  const words = new Uint32Array(data);
  let placed = 0;
  let skipped = barrels.skipped || 0;
  for (let index = 0; index < count; index += 1) {
    const f = barrels.floats.subarray(index * BARREL_FLOATS, (index + 1) * BARREL_FLOATS);
    const w = barrels.words.subarray(index * BARREL_WORDS, (index + 1) * BARREL_WORDS);
    const [low, high] = [Math.min(w[1], w[2]), Math.max(w[1], w[2])];
    const span = conductors.filter((conductor) => conductor.order >= low && conductor.order <= high
      && (w[3] === NO_BACKDRILL || conductor.order > w[3])
      && (w[4] === NO_BACKDRILL || conductor.order < w[4]));
    const top = span.length ? faces(span[0]) : null;
    const bottom = span.length ? faces(span[span.length - 1]) : null;
    if (!top || !bottom) {
      skipped += 1;
      continue;
    }
    const at = placed * BARREL_INSTANCE_FLOATS;
    floats.set([f[0] / 1000, -f[1] / 1000, f[2] / 1000, -f[3], f[4] / 1000, f[5] / 1000, top.top, bottom.bottom], at);
    words.set([w[0], top.layerId, bottom.layerId, w[5]], at + 8);
    const edge = (w[5] & BARREL_FLAGS.castellated) ? castellationEdge(outline, [f[0], f[1]], f[4] + f[2]) : null;
    floats.set(edge ? [edge.normal[0], edge.normal[1], edge.offset, 0] : [0, 0, 1, 0], at + 12);
    placed += 1;
  }
  return { data: data.slice(0, placed * BARREL_INSTANCE_FLOATS * 4), count: placed, skipped };
}

const WALL_FLOATS = 12;

/** A wall's kind (its ids.z): a dielectric slab's own, or a band at a copper level. */
export const WALL_SLAB = 0;
export const WALL_BAND = 1;

/**
 * The board's side walls from the dielectrics' contour edges (board mm, y
 * down): world metres, y up. Each dielectric slab has its own walls,
 * exactly its height, moving with it when the stack separates. Each copper
 * level has a band on the same outline in the board's colour, which only a
 * solid, unseparated board shows: the resin around inner copper, and at
 * the outer levels up to the mask's outer face. Returns `{ data, count }`,
 * `WALL_FLOATS` per wall (see ANALYTIC_WALL_SHADER).
 */
export function planWalls(slices, lowered, layers, zOffset = 0) {
  const masks = (layers || []).filter((layer) => layer.role === "soldermask").map((layer) => Number(layer.z_mm) / 1000 + zOffset + Math.sign(Number(layer.z_mm)) * Number(layer.thickness_mm || 0) / 2000);
  const maskTop = masks.length ? Math.max(...masks) : null;
  const maskBottom = masks.length ? Math.min(...masks) : null;
  const dielectrics = slices.filter((slice) => slice.role === "dielectric" && slice.face === "top" && lowered.get(slice.key)?.contourEdges?.length);
  const walls = [];
  const along = (slice, zTop, zBottom, above, below, kind) => {
    const edges = lowered.get(slice.key).contourEdges;
    for (let i = 0; i + 3 < edges.length; i += 4) walls.push([edges[i], edges[i + 1], edges[i + 2], edges[i + 3], zTop, zBottom, above, below, kind]);
  };
  for (const slice of dielectrics) along(slice, slice.zTop, slice.zBottom, slice.offsetLayers[0], slice.offsetLayers[1], WALL_SLAB);
  // One band per copper level, on its nearest dielectric's outline.
  for (const copper of slices.filter((slice) => slice.role === "copper" && slice.face === "top")) {
    const gap = (slice) => Math.min(Math.abs(slice.zBottom - copper.zTop), Math.abs(slice.zTop - copper.zBottom));
    const outline = [...dielectrics].sort((a, b) => gap(a) - gap(b))[0];
    if (!outline) continue;
    const front = copper.outer && !copper.bottom;
    const back = copper.outer && copper.bottom;
    const zTop = front && maskTop != null ? Math.max(maskTop, copper.zTop) : copper.zTop;
    const zBottom = back && maskBottom != null ? Math.min(maskBottom, copper.zBottom) : copper.zBottom;
    along(outline, zTop, zBottom, copper.layerId, copper.layerId, WALL_BAND);
  }
  const data = new ArrayBuffer(walls.length * WALL_FLOATS * 4);
  const floats = new Float32Array(data);
  const words = new Uint32Array(data);
  walls.forEach(([x0, y0, x1, y1, zTop, zBottom, a, b, kind], index) => {
    floats.set([x0 / 1000, -y0 / 1000, x1 / 1000, -y1 / 1000, zTop, zBottom, 0, 0], index * WALL_FLOATS);
    words.set([a, b, kind, 0], index * WALL_FLOATS + 8);
  });
  return { data, count: walls.length };
}

/**
 * Each operation's viewer net id (0 for none): the binding's net key, through
 * the pack's nets, matched to the viewer's `nets` (`{ id, name }`) by name.
 */
export function operationNetIds(pack, nets) {
  // The pack names a hierarchical net by any of its labels ("/S1.TXN" for
  // "/SFPs/S1.TXN"): match aliases too, a net's own name first.
  const byName = new Map();
  for (const net of nets || []) {
    for (const alias of net?.aliases || []) if (!byName.has(String(alias))) byName.set(String(alias), Number(net.id));
  }
  for (const net of nets || []) if (net?.name) byName.set(String(net.name), Number(net.id));
  const names = new Map((pack.header.nets || []).map((net) => [net.key, net.name]));
  const count = operationCount(pack.header);
  const ids = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    const key = pack.binding(index)?.net_key;
    if (key) ids[index] = byName.get(names.get(key) ?? key) || 0;
  }
  return ids;
}
