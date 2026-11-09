// Net-emphasis mask semantics shared by the renderer and its tests.
//
// A single `activeNet` uniform can only emphasise one net, so a host that
// accumulates highlighted nets (Prism #305) saw only the last one lit. The
// renderer now also keeps a u32 storage array indexed by net id: a non-zero
// slot marks that net as emphasised, and the fragment shaders light a copper
// fragment when its net is the active net or is marked here. Net id 0 is
// "no net" and is never emphasised.

import { normalizeIdSet } from "./id-set.js";

export const MIN_NET_MASK_CAPACITY = 64;
export const NET_EMPHASIS_ON = 1;
export const NET_EMPHASIS_OFF = 0;

/**
 * The WGSL guard the copper shaders call. `netMask` is a runtime-sized
 * read-only storage array, so ids past the uploaded capacity read as off.
 */
export const NET_MASK_WGSL = `
fn netEmphasized(id: u32) -> bool {
  return id != 0u && id < arrayLength(&netMask) && netMask[id] != 0u;
}
`;

/** Accept only real net ids: positive 32-bit integers. */
export const normalizeNetIds = normalizeIdSet;

/**
 * Buffer capacity (u32 slots) covering every id, a power of two with a floor
 * so an empty mask still has a valid buffer. Grow-only, like the feature
 * mask: shrinking would recreate the buffer and rebind every draw.
 */
export function netMaskCapacityFor(ids, currentCapacity = 0) {
  let maxId = 0;
  for (const id of normalizeNetIds(ids)) maxId = Math.max(maxId, id);
  let required = MIN_NET_MASK_CAPACITY;
  while (required < maxId + 1) required *= 2;
  return Math.max(required, Math.floor(currentCapacity) || 0);
}

/** A fresh all-off mask with exactly the given ids on. */
export function packNetEmphasis(ids, capacity) {
  const size = Math.max(MIN_NET_MASK_CAPACITY, Math.floor(capacity) || 0);
  const data = new Uint32Array(size);
  data.fill(NET_EMPHASIS_OFF);
  for (const id of normalizeNetIds(ids)) {
    if (id < size) data[id] = NET_EMPHASIS_ON;
  }
  return data;
}

/**
 * The scene net a name stands for: its own name, or one of the aliases the
 * compiler recorded when the board and the schematic netlist call the same
 * net differently. Scene order is id order, so a net that merged others
 * (the lowest id of the group) wins over the empty records it absorbed.
 */
export function findNetByName(nets, name) {
  if (!Array.isArray(nets) || !name) return null;
  return nets.find((item) => item.name === name
    || (Array.isArray(item.aliases) && item.aliases.includes(name))) || null;
}

/**
 * Resolve host net references against the scene's net records. A reference
 * matches by uid first, then by exact name or alias; unresolved references
 * are dropped rather than guessed.
 */
export function resolveNetIds(nets, refs) {
  const ids = new Set();
  if (!Array.isArray(nets) || !Array.isArray(refs)) return ids;
  for (const ref of refs) {
    if (!ref) continue;
    const match = (ref.netUid && nets.find((item) => item.uid === ref.netUid))
      || (ref.netName && findNetByName(nets, ref.netName));
    const id = Number(match?.id);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return ids;
}

// ----- Emphasis per occurrence (System Builder SB2-31) ------------------------
//
// In a system scene one board asset draws several occurrences, and a system
// net lights a board net on some of them only (OBC-1's SPI_SCK, not OBC-2's).
// The instanced shaders then read the same `netMask` buffer as a table, one
// row of `stride` slots per occurrence of the asset: slot = local occurrence ×
// stride + net id. A slot holds 0 (off) or a packed colour 0x01RRGGBB, so
// several nets light at once in their own colours without a palette buffer.
// A plain 1 (the one-board mask) still means "the default emphasis colour".

export const EMPHASIS_PALETTE = Object.freeze([
  [0.08, 1.0, 0.2], // green: the one-board viewer's emphasis colour
  [1.0, 0.72, 0.1], // amber
  [0.2, 0.75, 1.0], // sky
  [1.0, 0.3, 0.75], // magenta
  [0.65, 0.45, 1.0], // violet
  [1.0, 0.45, 0.2], // orange
  [0.3, 1.0, 0.85], // aqua
  [0.95, 0.95, 0.3], // yellow
]);

/** The WGSL helpers the instanced shaders use (after `globals` and `netMask`). */
export const OCCURRENCE_EMPHASIS_WGSL = `
// 0: off; 1: the default colour; 0x01RRGGBB: that colour.
fn emphasisOf(occurrence: u32, id: u32) -> u32 {
  if (id == 0u) { return 0u; }
  if (globals.emphasisStride == 0u) { return select(0u, 1u, netEmphasized(id)); }
  if (id >= globals.emphasisStride || occurrence <= globals.occurrenceBase) { return 0u; }
  let slot = (occurrence - 1u - globals.occurrenceBase) * globals.emphasisStride + id;
  if (slot >= arrayLength(&netMask)) { return 0u; }
  return netMask[slot];
}
fn emphasisColor(mark: u32, fallback: vec3f) -> vec3f {
  if ((mark >> 24u) == 0u) { return fallback; }
  return vec3f(f32((mark >> 16u) & 255u), f32((mark >> 8u) & 255u), f32(mark & 255u)) / 255.0;
}
`;

/** A colour as 0x01RRGGBB: `[r, g, b]` in 0…1, or "#rrggbb". Anything else is the default colour (1). */
export function packEmphasisColor(color) {
  let rgb = null;
  if (Array.isArray(color) && color.length >= 3 && color.slice(0, 3).every((value) => Number.isFinite(Number(value)))) {
    rgb = color.slice(0, 3).map((value) => Math.round(Math.min(1, Math.max(0, Number(value))) * 255));
  } else if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  }
  if (!rgb) return NET_EMPHASIS_ON;
  return ((1 << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) >>> 0;
}

/**
 * The table for one asset: `rows[i]` is a Map of net id → packed colour for
 * its i-th occurrence (or null). Returns `{ stride, data }`; stride is the
 * largest net id + 1, and the table has at least MIN_NET_MASK_CAPACITY slots.
 */
export function packOccurrenceEmphasis(rows) {
  let stride = 1;
  for (const row of rows) for (const id of row?.keys() || []) stride = Math.max(stride, id + 1);
  const data = new Uint32Array(Math.max(MIN_NET_MASK_CAPACITY, rows.length * stride));
  rows.forEach((row, index) => {
    for (const [id, mark] of row || []) {
      if (Number.isInteger(id) && id > 0) data[index * stride + id] = mark >>> 0;
    }
  });
  return { stride, data };
}
