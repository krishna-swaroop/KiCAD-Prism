function recordLayerIds(record, copperLayers) {
  let layerIds = Array.isArray(record?.layerIds) ? record.layerIds : [];
  if (layerIds.length < 2 && record?.startLayerId != null && record?.endLayerId != null) {
    layerIds = [record.startLayerId, record.endLayerId];
  }

  if (layerIds.length < 2 && record?.layerMask != null) {
    try {
      const mask = BigInt(String(record.layerMask));
      layerIds = copperLayers
        .filter((_layer, index) => (mask & (1n << BigInt(index))) !== 0n)
        .map((layer) => layer.id);
    } catch {
      layerIds = [];
    }
  }

  return layerIds;
}

function recordIdentity(record) {
  const featureId = record?.objectFeatureId ?? record?.id;
  if (featureId != null && Number.isFinite(Number(featureId)) && Number(featureId) !== 0) {
    return `feature:${Number(featureId)}`;
  }
  const sourceUid = String(record?.sourceUid || "");
  return sourceUid ? `source:${sourceUid}` : "";
}

export function collectStackupViaData(copperLayers, records) {
  const indexById = new Map(copperLayers.map((layer, index) => [Number(layer.id), index]));
  const layerById = new Map(copperLayers.map((layer) => [Number(layer.id), layer]));
  const spansByKey = new Map();
  const seenVias = new Set();
  const counts = { thru: 0, blind: 0, buried: 0 };

  for (const record of records) {
    const identity = recordIdentity(record);
    if (identity) {
      if (seenVias.has(identity)) continue;
      seenVias.add(identity);
    }

    const copperIds = [...new Set(recordLayerIds(record, copperLayers).map(Number))]
      .filter((id) => indexById.has(id))
      .sort((a, b) => indexById.get(a) - indexById.get(b));
    if (copperIds.length < 2) continue;

    const startId = copperIds[0];
    const endId = copperIds[copperIds.length - 1];
    const startIndex = indexById.get(startId);
    const endIndex = indexById.get(endId);
    const reachesTop = startIndex === 0;
    const reachesBottom = endIndex === copperLayers.length - 1;
    const type = reachesTop && reachesBottom ? "thru" : reachesTop || reachesBottom ? "blind" : "buried";
    counts[type] += 1;

    const key = `${startId}:${endId}:${type}`;
    const existing = spansByKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    spansByKey.set(key, {
      startId,
      endId,
      startName: layerById.get(startId)?.name || String(startId),
      endName: layerById.get(endId)?.name || String(endId),
      startIndex,
      endIndex,
      type,
      count: 1,
    });
  }

  return { counts, spans: [...spansByKey.values()] };
}
