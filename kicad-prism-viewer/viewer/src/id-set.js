// Shared id-set normaliser for feature and net ids.
export function normalizeIdSet(ids) {
  const normalized = new Set();
  if (ids == null) return normalized;
  for (const value of ids) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || id > 0xffffffff) continue;
    normalized.add(id);
  }
  return normalized;
}
