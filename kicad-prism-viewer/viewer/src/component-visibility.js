// Component visibility controller semantics (VAR-18): translate requested
// references into renderer feature ids, and refuse to guess when a reference
// owns more than one model.
//
// A reference is ambiguous when the manifest lists it twice (alternate
// footprints carry separate entries) or when the GLB contains more than one
// top-level node named for it. Ambiguous references stay visible as a pair and
// are reported; they are never collapsed to one feature id.

export function buildComponentFeatureGroups(
  manifestComponents,
  modelCounts = new Map(),
) {
  const groups = new Map();
  for (const component of manifestComponents || []) {
    const reference = String(component?.designator || "");
    if (!reference) continue;
    const group = groups.get(reference) || {
      reference,
      featureIds: new Set(),
      modelCount: 0,
    };
    const featureId = Number(component?.featureId) || 0;
    if (featureId > 0) group.featureIds.add(featureId);
    groups.set(reference, group);
  }
  for (const [reference, count] of modelCounts || []) {
    const group = groups.get(String(reference));
    if (!group) continue;
    group.modelCount = Math.max(group.modelCount, Number(count) || 0);
  }
  const resolved = new Map();
  for (const [reference, group] of groups) {
    resolved.set(reference, {
      reference,
      featureIds: [...group.featureIds].sort((left, right) => left - right),
      ambiguous: group.featureIds.size > 1 || group.modelCount > 1,
    });
  }
  return resolved;
}

/**
 * Replace semantics: the returned plan describes the whole new hidden set.
 * Unknown and ambiguous references are reported instead of hidden, so a typo
 * or an alternate-footprint pair can never blank a component silently.
 */
export function planComponentVisibility(references, groups) {
  const requested = [
    ...new Set(
      (Array.isArray(references) ? references : [])
        .map((reference) => String(reference || ""))
        .filter(Boolean),
    ),
  ];
  const applied = [];
  const ambiguous = [];
  const unknown = [];
  const hiddenFeatureIds = new Set();
  const hiddenReferences = new Set();
  for (const reference of requested) {
    const group = groups.get(reference);
    if (!group) {
      unknown.push(reference);
      continue;
    }
    if (group.ambiguous) {
      ambiguous.push(reference);
      continue;
    }
    applied.push(reference);
    hiddenReferences.add(reference);
    for (const featureId of group.featureIds) hiddenFeatureIds.add(featureId);
  }
  return { requested, applied, ambiguous, unknown, hiddenFeatureIds, hiddenReferences };
}

export function isComponentHidden(reference, hiddenReferences) {
  return Boolean(reference) && hiddenReferences.has(String(reference));
}
