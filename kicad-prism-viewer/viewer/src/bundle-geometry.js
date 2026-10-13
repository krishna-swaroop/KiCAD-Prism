// Bundle geometry helpers shared by the one-board viewer (main.js) and the
// system scene (SB2-27): board-role grouping, material merging, bounds and
// copper layer colours. Moved out of main.js unchanged.

export function boardRole(primitive) {
  const name = `${primitive.nodeName || ""} ${primitive.meshName || ""} ${primitive.material?.name || ""}`.toLowerCase();
  if (name.includes("_pad") || name.includes(".pad") || name.endsWith("pad")) return "pad";
  if (name.includes("silkscreen")) return "silkscreen";
  if (name.includes("soldermask")) return "soldermask";
  if (name.includes("paste")) return "paste";
  return "substrate";
}

/**
 * The side a merged solder mask, silkscreen or paste primitive lies on:
 * "back" for a `*_bottom` material, "front" for `*_top`, else by which side
 * of the centred stackup its bounds sit (`[min x, y, z, max x, y, z]`).
 */
export function boardSide(primitive) {
  const name = String(primitive.material?.name || "").toLowerCase();
  if (name.endsWith("_bottom")) return "back";
  if (name.endsWith("_top")) return "front";
  const bounds = primitive.bounds;
  return bounds && (bounds[2] + bounds[5]) / 2 < 0 ? "back" : "front";
}

export function mergePrimitivesByMaterial(primitives, classifier = () => "") {
  const groups = new Map();
  for (const primitive of primitives) {
    const groupKey = classifier(primitive);
    const key = `${groupKey}:${JSON.stringify(primitive.material)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(primitive);
  }
  return [...groups.values()].map((group) => {
    const vertexCount = group.reduce((sum, item) => sum + item.position.length / 3, 0);
    const indexCount = group.reduce((sum, item) => sum + item.indices.length, 0);
    const position = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const netId = new Uint32Array(vertexCount);
    const objectFeatureId = new Uint32Array(vertexCount);
    const indices = new Uint32Array(indexCount);
    let vertexOffset = 0;
    let indexOffset = 0;
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const item of group) {
      const count = item.position.length / 3;
      position.set(item.position, vertexOffset * 3);
      normal.set(item.normal, vertexOffset * 3);
      netId.set(item.netId, vertexOffset);
      objectFeatureId.set(item.objectFeatureId, vertexOffset);
      for (let index = 0; index < item.indices.length; index += 1) {
        indices[indexOffset + index] = Number(item.indices[index]) + vertexOffset;
      }
      if (item.bounds) {
        bounds[0] = Math.min(bounds[0], item.bounds[0]);
        bounds[1] = Math.min(bounds[1], item.bounds[1]);
        bounds[2] = Math.min(bounds[2], item.bounds[2]);
        bounds[3] = Math.max(bounds[3], item.bounds[3]);
        bounds[4] = Math.max(bounds[4], item.bounds[4]);
        bounds[5] = Math.max(bounds[5], item.bounds[5]);
      }
      vertexOffset += count;
      indexOffset += item.indices.length;
    }
    return {
      position,
      normal,
      netId,
      objectFeatureId,
      indices,
      material: group[0].material,
      groupKey: classifier(group[0]),
      bounds: Number.isFinite(bounds[0]) ? bounds : null,
    };
  });
}

export function runtimeBounds(bounds) {
  if (!bounds || bounds.length !== 6) return null;
  return [
    bounds[0] / 1000,
    -bounds[4] / 1000,
    bounds[2] / 1000,
    bounds[3] / 1000,
    -bounds[1] / 1000,
    bounds[5] / 1000,
  ];
}

export function runtimeBoundsFromGltf(bounds) {
  const minimum = bounds?.min || [0, 0, 0];
  const maximum = bounds?.max || [0.08, 0.0016, 0.05];
  return [minimum[0], -maximum[2], minimum[1], maximum[0], -minimum[2], maximum[1]];
}

export function mergeBounds(boundsList) {
  const valid = boundsList.filter((bounds) => Array.isArray(bounds) && bounds.length === 6);
  if (!valid.length) return null;
  return valid.reduce((merged, bounds) => [
    Math.min(merged[0], bounds[0]),
    Math.min(merged[1], bounds[1]),
    Math.min(merged[2], bounds[2]),
    Math.max(merged[3], bounds[3]),
    Math.max(merged[4], bounds[4]),
    Math.max(merged[5], bounds[5]),
  ], [...valid[0]]);
}

export function hex(value) {
  const clean = value.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
}

export function copperLayerColor(layer, copperLayers) {
  if (typeof layer?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(layer.color)) {
    return [...hex(layer.color), 1];
  }
  const colors = {
    "F.Cu": "#a9423c",
    "B.Cu": "#315b9a",
    "In1.Cu": "#477a55",
    "In2.Cu": "#806244",
    "In3.Cu": "#347c86",
    "In4.Cu": "#685889",
    "In5.Cu": "#92793e",
  };
  const inner = ["#477a55", "#806244", "#347c86", "#685889", "#92793e", "#82556e"];
  const name = String(layer?.name || "");
  const index = Math.max(0, copperLayers.findIndex((item) => item.name === name) - 1);
  return [...hex(colors[name] || inner[index % inner.length]), 1];
}

export function innerCopperLayer(layerId, copperLayers) {
  const heights = copperLayers.map((layer) => [Number(layer.id), Number(layer.z_mm || 0)]);
  if (heights.length < 3) return false;
  heights.sort((a, b) => a[1] - b[1]);
  return layerId !== heights[0][0] && layerId !== heights[heights.length - 1][0];
}

// KiCad-like copper (PR #427): exposed outer copper in the surface finish
// colour, inner copper and via barrels in copper. Shared by the one-board
// viewer and the system scene.
export const FINISH_COLORS = Object.freeze({
  gold: [0.83, 0.69, 0.37, 1],
  silver: [0.74, 0.75, 0.77, 1],
  copper: [0.76, 0.47, 0.28, 1],
});

/** Exposed outer copper by surface finish; gold (ENIG, KiCad's default look) when unknown. */
export function finishColorFor(finish) {
  const value = String(finish || "").toLowerCase();
  if (/hasl|hal\b|tin|silver|lead/.test(value)) return FINISH_COLORS.silver;
  if (/osp|bare|none/.test(value)) return FINISH_COLORS.copper;
  return FINISH_COLORS.gold;
}

/** The first and last copper layers by stackup order are the outer ones. */
export function isOuterCopperLayer(layer, copperLayers) {
  const name = String(layer?.name || "");
  return Boolean(name) && (name === copperLayers[0]?.name || name === copperLayers[copperLayers.length - 1]?.name);
}

/** Paste belongs to its side's outer copper layer: shown and hidden with it. */
export function pasteLayerIdFor(primitive, copperLayers) {
  const bottom = String(primitive.material?.name || "").endsWith("_bottom");
  const layer = copperLayers.find((item) => item.name === (bottom ? "B.Cu" : "F.Cu"))
    || (bottom ? copperLayers[copperLayers.length - 1] : copperLayers[0]);
  return Number(layer?.id || 0);
}
