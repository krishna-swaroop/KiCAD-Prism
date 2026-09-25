// Net-emphasis mask semantics shared by the renderer and its tests.
//
// A single `activeNet` uniform can only emphasise one net, so a host that
// accumulates highlighted nets (Prism #305) saw only the last one lit. The
// renderer now also keeps a u32 storage array indexed by net id: a non-zero
// slot marks that net as emphasised, and the fragment shaders light a copper
// fragment when its net is the active net or is marked here. Net id 0 is
// "no net" and is never emphasised.

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
export function normalizeNetIds(ids) {
  const normalized = new Set();
  if (ids == null) return normalized;
  for (const value of ids) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || id > 0xffffffff) continue;
    normalized.add(id);
  }
  return normalized;
}

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
