// Feature-visibility mask semantics shared by the renderer and its tests.
//
// Material merging combines many component models into one primitive, so
// hiding a component cannot be done per draw. Instead the renderer keeps a
// default-visible u32 storage array indexed by feature id; fragment shaders
// discard a fragment when its component feature is marked hidden. Feature id 0
// is the "no feature" sentinel and is never hidden.

export const MIN_FEATURE_MASK_CAPACITY = 64;
export const VISIBLE_MASK_VALUE = 1;
export const HIDDEN_MASK_VALUE = 0;

/**
 * The WGSL guard every component-capable fragment shader calls. `hiddenMask`
 * is a runtime-sized read-only storage array, so the bounds check keeps the
 * default-visible behaviour for ids past the uploaded capacity.
 */
export const FEATURE_MASK_WGSL = `
fn featureHidden(id: u32) -> bool {
  return id < arrayLength(&hiddenMask) && hiddenMask[id] == 0u;
}
`;

/**
 * Accept only real feature ids: positive 32-bit integers. Anything else
 * (null, 0, fractional, negative, overflow) means "no feature" and must not
 * hide anything.
 */
export function normalizeHiddenFeatureIds(ids) {
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
 * The buffer capacity (in u32 slots) that covers every hidden id, rounded up
 * to a power of two with a floor so an empty mask still has a valid buffer.
 * Capacity only grows: shrinking would recreate the buffer and rebind every
 * draw for no behavioural gain.
 */
export function featureMaskCapacityFor(ids, currentCapacity = 0) {
  let maxId = 0;
  for (const id of normalizeHiddenFeatureIds(ids)) maxId = Math.max(maxId, id);
  let required = MIN_FEATURE_MASK_CAPACITY;
  const needed = maxId + 1;
  while (required < needed) required *= 2;
  return Math.max(required, Math.floor(currentCapacity) || 0);
}

/**
 * A fresh all-visible mask for the given capacity with exactly the hidden ids
 * cleared. Rebuilt from scratch on every call so a smaller hidden set can
 * never retain an older mask's zeros.
 */
export function packFeatureVisibility(ids, capacity) {
  const size = Math.max(
    MIN_FEATURE_MASK_CAPACITY,
    Math.floor(capacity) || 0,
  );
  const data = new Uint32Array(size);
  data.fill(VISIBLE_MASK_VALUE);
  for (const id of normalizeHiddenFeatureIds(ids)) {
    if (id < size) data[id] = HIDDEN_MASK_VALUE;
  }
  return data;
}
