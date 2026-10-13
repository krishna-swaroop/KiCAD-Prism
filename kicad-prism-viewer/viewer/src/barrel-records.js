/**
 * Barrel records: the conductive spans of vias and plated holes (AC-30).
 *
 * The bundle manifest lists barrels in KiCad millimetres (y down). The GPU
 * reads them in runtime metres (y up) through one of two layouts:
 *
 * - the one-board pipelines take them as a per-instance vertex buffer
 *   (`BARREL_INSTANCE_LAYOUT`, declared by `BARREL_INPUT_WGSL`);
 * - the instanced pipelines read them from a storage buffer
 *   (`BARREL_STORAGE_WGSL`).
 *
 * Both use one 48-byte layout, converted once by `barrelRuntime`.
 */

/**
 * A barrel in runtime units: centre (m, y up), the drill's half width across
 * its narrow side and that plus the plating (m), z span (m), its stadium shape
 * (half the straight length along the long axis, m, and that axis' angle from
 * +x, radians, y up), and its ids. A round drill is a stadium of length 0.
 * Records carry the drill's width along `rotationDeg` (KiCad's y-down frame).
 */
export function barrelRuntime(record) {
  const width = Number(record.drillWidthMm) || 0;
  const height = Number(record.drillHeightMm) || width;
  const narrow = Math.min(width, height);
  const outerNarrow = Math.min(Number(record.outerWidthMm) || 0, Number(record.outerHeightMm) || 0);
  const plating = Number.isFinite(record.platingThicknessMm)
    ? record.platingThicknessMm
    : Math.max(0, (outerNarrow - narrow) / 2);
  // The long axis is the width's, or the height's a quarter turn on; y flips sign.
  const axis = (Number(record.rotationDeg) || 0) * Math.PI / 180 + (height > width ? Math.PI / 2 : 0);
  return {
    x: record.centerMm[0] / 1000,
    y: -record.centerMm[1] / 1000,
    drillRadius: narrow / 2000,
    outerRadius: (narrow / 2 + plating) / 1000,
    halfLength: Math.abs(width - height) / 2000,
    angle: Math.abs(width - height) > 0 ? -axis : 0,
    startZ: record.startZMm / 1000,
    endZ: record.endZMm / 1000,
    netId: record.netId || 0,
    objectId: record.objectFeatureId || 0,
    startLayerId: record.startLayerId || 0,
    endLayerId: record.endLayerId || 0,
  };
}

/**
 * Barrel records whose ends reach their outer copper layers' faces. Records
 * span the copper layers' centres; plating runs to the pad surface, so each
 * end moves out by half its layer's thickness, less 1 µm so the end caps
 * never share the copper face's plane.
 */
export function barrelsAtCopperFaces(records, layers) {
  const thickness = new Map((layers || []).map((layer) => [Number(layer.id), Number(layer.thickness_mm) || 0]));
  return (records || []).map((record) => {
    const reach = (layerId) => Math.max(0, (thickness.get(Number(layerId)) || 0) / 2 - 0.001);
    const down = record.startZMm >= record.endZMm ? 1 : -1;
    return {
      ...record,
      startZMm: record.startZMm + down * reach(record.startLayerId),
      endZMm: record.endZMm - down * reach(record.endLayerId),
    };
  });
}

// One layout for both buffers: dimensions (x, y, drill, outer), span (start,
// end), shape (half length, angle), then the ids. WGSL places the vec4u at 32.
const DIMENSIONS_OFFSET = 0;
const SPAN_OFFSET = 16;
const SHAPE_OFFSET = 24;
const IDS_OFFSET = 32;

/** The one-board per-instance vertex layout (shader locations 3–6 of `BARREL_INPUT_WGSL`). */
export const BARREL_INSTANCE_STRIDE = 48;
export const BARREL_INSTANCE_LAYOUT = Object.freeze({
  arrayStride: BARREL_INSTANCE_STRIDE,
  stepMode: "instance",
  attributes: Object.freeze([
    Object.freeze({ shaderLocation: 3, offset: DIMENSIONS_OFFSET, format: "float32x4" }),
    Object.freeze({ shaderLocation: 4, offset: SPAN_OFFSET, format: "float32x2" }),
    Object.freeze({ shaderLocation: 6, offset: SHAPE_OFFSET, format: "float32x2" }),
    Object.freeze({ shaderLocation: 5, offset: IDS_OFFSET, format: "uint32x4" }),
  ]),
});

/** The instanced storage layout: dimensions vec4f, span vec2f, shape vec2f, ids vec4u. */
export const BARREL_RECORD_STRIDE = 48;

/** The one-board vertex input: the unit-cylinder vertex (locations 0–2) and the barrel instance (3–5). */
export const BARREL_INPUT_WGSL = `struct Input {
  @location(0) unit: vec3f,
  @location(1) normal: vec3f,
  @location(2) radiusMix: f32,
  @location(3) dimensions: vec4f,
  @location(4) span: vec2f,
  @location(5) ids: vec4u,
  @location(6) shape: vec2f,
};`;

/** The instanced pipelines' barrel record, bound at group 0 binding 6. */
export const BARREL_STORAGE_WGSL = `struct Barrel {
  dimensions: vec4f,
  span: vec2f,
  shape: vec2f,
  ids: vec4u,
};
@group(0) @binding(6) var<storage, read> barrels: array<Barrel>;`;

function writeBarrels(records, stride, minimumCount) {
  const data = new ArrayBuffer(Math.max(minimumCount, records.length) * stride);
  const view = new DataView(data);
  records.forEach((record, index) => {
    const offset = index * stride;
    const barrel = barrelRuntime(record);
    view.setFloat32(offset + DIMENSIONS_OFFSET, barrel.x, true);
    view.setFloat32(offset + DIMENSIONS_OFFSET + 4, barrel.y, true);
    view.setFloat32(offset + DIMENSIONS_OFFSET + 8, barrel.drillRadius, true);
    view.setFloat32(offset + DIMENSIONS_OFFSET + 12, barrel.outerRadius, true);
    view.setFloat32(offset + SPAN_OFFSET, barrel.startZ, true);
    view.setFloat32(offset + SPAN_OFFSET + 4, barrel.endZ, true);
    view.setFloat32(offset + SHAPE_OFFSET, barrel.halfLength, true);
    view.setFloat32(offset + SHAPE_OFFSET + 4, barrel.angle, true);
    view.setUint32(offset + IDS_OFFSET, barrel.netId, true);
    view.setUint32(offset + IDS_OFFSET + 4, barrel.objectId, true);
    view.setUint32(offset + IDS_OFFSET + 8, barrel.startLayerId, true);
    view.setUint32(offset + IDS_OFFSET + 12, barrel.endLayerId, true);
  });
  return data;
}

/** Pack barrels for the one-board instance vertex buffer (`BARREL_INSTANCE_LAYOUT`). */
export function packBarrelInstances(records) {
  return writeBarrels(records, BARREL_INSTANCE_STRIDE, 0);
}

/** Pack barrels for the instanced storage buffer (`BARREL_STORAGE_WGSL`); never empty, as a binding needs bytes. */
export function packBarrels(records) {
  return writeBarrels(records, BARREL_RECORD_STRIDE, 1);
}
