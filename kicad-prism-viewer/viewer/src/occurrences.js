// Per-occurrence transforms (System Builder P2, SB2-23).
//
// One uploaded board is drawn once per occurrence. Each occurrence carries a
// column-major 4×4 model matrix in renderer units (metres, the bundle's
// runtime frame) and the normal matrix derived from it. The one-board viewer
// is a single identity occurrence, which leaves every vertex bit-identical.
//
// Bit-identical means the shader must project exactly as it did before
// occurrences existed. Any per-instance matrix in the position path, even a
// bit-identical copy of the view-projection read from storage, compiles to a
// different float evaluation order, and copper, mask and silkscreen 18 µm apart
// then flip in the depth test. So the shaders branch on a uniform: a single
// identity occurrence takes the original `viewProjection * p` path, and only
// real occurrences pay for `viewProjection * (model * p)`.

export const OCCURRENCE_STRIDE = 128; // model mat4x4f + normal mat4x4f
const OCCURRENCE_FLOATS = OCCURRENCE_STRIDE / 4;
export const BARREL_RECORD_STRIDE = 48; // dimensions vec4f, span vec2f (+pad), ids vec4u

export const OCCURRENCE_WGSL = `
struct Occurrence {
  model: mat4x4f,
  normal: mat4x4f,
};
@group(0) @binding(5) var<storage, read> occurrences: array<Occurrence>;
// The cull pass (SB2-25) lists the occurrences to draw, interleaved by level of
// detail: slot * 4 + list. Components draw for LIST_FULL; copper, barrels,
// silkscreen and paste for LIST_BOARD (full or board); substrate and mask for
// LIST_BODY (full, board or body); the stand-in box for LIST_BOX.
@group(0) @binding(7) var<storage, read> visibleOccurrences: array<u32>;
const LIST_FULL = 0u;
const LIST_BOARD = 1u;
const LIST_BODY = 2u;
const LIST_BOX = 3u;
fn listedOccurrence(list: u32, instance: u32) -> u32 { return visibleOccurrences[instance * 4u + list]; }
`;

export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Validate one occurrence matrix: 16 finite numbers, affine (last row 0 0 0 1). */
export function normalizeMatrix(value) {
  const matrix = value?.matrix ?? value;
  if (!matrix || typeof matrix.length !== "number" || matrix.length !== 16) {
    throw new TypeError("An occurrence matrix must have 16 numbers (column-major)");
  }
  const numbers = Array.from(matrix, Number);
  if (!numbers.every(Number.isFinite)) throw new TypeError("An occurrence matrix must be finite");
  if (numbers[3] !== 0 || numbers[7] !== 0 || numbers[11] !== 0 || numbers[15] !== 1) {
    throw new TypeError("An occurrence matrix must be affine (last row 0 0 0 1)");
  }
  return numbers;
}

/**
 * The normal matrix: the inverse transpose of the upper 3×3, as a mat4 with no
 * translation. Computed as the cofactor matrix with the determinant's sign, so
 * the scale drops out (the shader normalises) and the identity maps to itself
 * exactly.
 */
export function normalMatrix(model) {
  // mRC = row R, column C of the upper 3×3 (the array is column-major).
  const [m00, m10, m20, , m01, m11, m21, , m02, m12, m22] = model;
  const c00 = m11 * m22 - m12 * m21;
  const c01 = m12 * m20 - m10 * m22;
  const c02 = m10 * m21 - m11 * m20;
  const c10 = m02 * m21 - m01 * m22;
  const c11 = m00 * m22 - m02 * m20;
  const c12 = m01 * m20 - m00 * m21;
  const c20 = m01 * m12 - m02 * m11;
  const c21 = m02 * m10 - m00 * m12;
  const c22 = m00 * m11 - m01 * m10;
  const determinant = m00 * c00 + m01 * c01 + m02 * c02;
  if (determinant === 0) throw new TypeError("An occurrence matrix must be invertible");
  const sign = determinant < 0 ? -1 : 1;
  // The inverse transpose is the cofactor matrix over the determinant; written column-major.
  return [
    sign * c00, sign * c10, sign * c20, 0,
    sign * c01, sign * c11, sign * c21, 0,
    sign * c02, sign * c12, sign * c22, 0,
    0, 0, 0, 1,
  ];
}

/** Pack occurrences for the storage buffer. Returns at least one slot. */
export function packOccurrences(matrices) {
  const data = new Float32Array(Math.max(1, matrices.length) * OCCURRENCE_FLOATS);
  matrices.forEach((model, index) => {
    const base = index * OCCURRENCE_FLOATS;
    data.set(model, base);
    data.set(normalMatrix(model), base + 16);
  });
  return data;
}


/** Pack barrel records (bundle manifest units: mm, KiCad y down) for the storage buffer. */
export function packBarrels(records) {
  const data = new ArrayBuffer(Math.max(1, records.length) * BARREL_RECORD_STRIDE);
  const view = new DataView(data);
  records.forEach((record, index) => {
    const offset = index * BARREL_RECORD_STRIDE;
    view.setFloat32(offset, record.centerMm[0] / 1000, true);
    view.setFloat32(offset + 4, -record.centerMm[1] / 1000, true);
    view.setFloat32(offset + 8, Math.min(record.drillWidthMm, record.drillHeightMm) / 2000, true);
    view.setFloat32(offset + 12, Math.max(record.outerWidthMm, record.outerHeightMm) / 2000, true);
    view.setFloat32(offset + 16, record.startZMm / 1000, true);
    view.setFloat32(offset + 20, record.endZMm / 1000, true);
    view.setUint32(offset + 32, record.netId || 0, true);
    view.setUint32(offset + 36, record.objectFeatureId || 0, true);
    view.setUint32(offset + 40, record.startLayerId || 0, true);
    view.setUint32(offset + 44, record.endLayerId || 0, true);
  });
  return data;
}

/** Apply a column-major matrix to a point. */
export function transformPoint(model, point) {
  const [x, y, z] = point;
  return [
    model[0] * x + model[4] * y + model[8] * z + model[12],
    model[1] * x + model[5] * y + model[9] * z + model[13],
    model[2] * x + model[6] * y + model[10] * z + model[14],
  ];
}

/** The axis-aligned box around `bounds` ([minX, minY, minZ, maxX, maxY, maxZ]) after `model`. */
export function transformBounds(model, bounds) {
  if (!bounds) return null;
  const output = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner += 1) {
    const point = transformPoint(model, [
      bounds[corner & 1 ? 3 : 0],
      bounds[corner & 2 ? 4 : 1],
      bounds[corner & 4 ? 5 : 2],
    ]);
    for (let axis = 0; axis < 3; axis += 1) {
      output[axis] = Math.min(output[axis], point[axis]);
      output[axis + 3] = Math.max(output[axis + 3], point[axis]);
    }
  }
  return output;
}

/** The union of `bounds` placed at every occurrence; `bounds` itself for the identity alone. */
export function occurrenceUnionBounds(matrices, bounds) {
  if (!bounds || !matrices.length) return bounds || null;
  if (matrices.length === 1 && isIdentity(matrices[0])) return bounds;
  const boxes = matrices.map((model) => transformBounds(model, bounds));
  return [0, 1, 2, 3, 4, 5].map((axis) => (axis < 3
    ? Math.min(...boxes.map((box) => box[axis]))
    : Math.max(...boxes.map((box) => box[axis]))));
}

export function isIdentity(model) {
  return model.every((value, index) => value === IDENTITY[index]);
}

// Two-channel picking (SB2-24): the pick target is `rg32uint`.
//   R = occurrence index + 1 (0 = nothing under the cursor);
//   G = the local feature id; 0 = the board itself (its context, no feature).
// R values from PICK_GIZMO_BASE up are reserved for overlay handles such as
// the move gizmo (SB2-29), which draw into the same target.
export const PICK_NONE = 0;
export const PICK_GIZMO_BASE = 0xffff0000;
export const MAX_OCCURRENCES = PICK_GIZMO_BASE - 1;

export function decodePick(red, green) {
  const r = red >>> 0;
  const g = green >>> 0;
  if (r === PICK_NONE) return { kind: "none", occurrenceIndex: -1, featureId: 0 };
  if (r >= PICK_GIZMO_BASE) return { kind: "gizmo", occurrenceIndex: -1, featureId: 0, gizmoPart: r - PICK_GIZMO_BASE, gizmoValue: g };
  return { kind: g ? "feature" : "board", occurrenceIndex: r - 1, featureId: g };
}

/**
 * Occurrences as the element accepts them: matrices, or `{ matrix, key }`
 * where `key` names the occurrence to the host (the system scene's occurrence
 * path). Keys default to the index and must be unique.
 */
export function normalizeOccurrences(list) {
  const items = Array.from(list);
  if (items.length > MAX_OCCURRENCES) throw new RangeError("Too many occurrences for the pick target");
  const matrices = items.map(normalizeMatrix);
  const keys = items.map((item, index) => {
    const key = item && !Array.isArray(item) && !ArrayBuffer.isView(item) && item.key != null ? String(item.key) : String(index);
    return key;
  });
  if (new Set(keys).size !== keys.length) throw new TypeError("Occurrence keys must be unique");
  return { matrices, keys };
}

/**
 * Project a runtime point through a clip matrix into a viewport rectangle
 * ({ x, y, width, height }, y down). Null behind the camera or outside clip depth.
 */
export function projectToViewport(clip, point, viewport) {
  const [x, y, z] = point;
  const cx = clip[0] * x + clip[4] * y + clip[8] * z + clip[12];
  const cy = clip[1] * x + clip[5] * y + clip[9] * z + clip[13];
  const cz = clip[2] * x + clip[6] * y + clip[10] * z + clip[14];
  const cw = clip[3] * x + clip[7] * y + clip[11] * z + clip[15];
  if (!(cw > 0) || cz < 0 || cz > cw) return null;
  return {
    x: viewport.x + (cx / cw * 0.5 + 0.5) * viewport.width,
    y: viewport.y + (0.5 - cy / cw * 0.5) * viewport.height,
  };
}

// Level of detail per occurrence (SB2-25, body level SB2-30a), chosen on the GPU
// each frame from the board's projected radius in pixels. These mirror the cull
// shader in renderer.js. Coarser levels only stop drawing parts of the board;
// the bundle's geometry is never simplified.
export const LOD_FULL = 0; // components, inner copper, and everything below
export const LOD_BOARD = 1; // outer copper, barrels, silkscreen and paste, and the body
export const LOD_BODY = 2; // the substrate and solder mask only
export const LOD_BOX = 3; // the board's bounding box
export const LOD_CULLED = 4; // outside the view
export const LOD_NAMES = Object.freeze(["full", "board", "body", "box"]);
export const LOD_THRESHOLDS = Object.freeze({
  fullPx: 140, // projected radius at or above which components draw
  boardPx: 70, // at or above which copper, barrels, silkscreen and paste draw
  boxPx: 18, // below this the board is a box
  keep: 0.8, // hysteresis: a finer level holds until the size drops below threshold × keep
});

export function chooseLod(previous, pixels, thresholds = LOD_THRESHOLDS) {
  const { fullPx, boardPx, boxPx, keep } = thresholds;
  const limits = [fullPx, boardPx, boxPx];
  let lod = limits.findIndex((limit) => pixels >= limit);
  if (lod < 0) lod = LOD_BOX;
  for (let level = LOD_FULL; level < lod; level += 1) {
    if (previous <= level && pixels >= limits[level] * keep) return level;
  }
  return lod;
}

/** Thresholds made consistent: finite, full ≥ board ≥ box ≥ 0, keep in (0, 1]. */
export function normalizeLodThresholds(value = {}) {
  const pick = (key, fallback) => (Number.isFinite(Number(value[key])) ? Math.max(0, Number(value[key])) : fallback);
  const boxPx = pick("boxPx", LOD_THRESHOLDS.boxPx);
  const boardPx = Math.max(boxPx, pick("boardPx", LOD_THRESHOLDS.boardPx));
  const fullPx = Math.max(boardPx, pick("fullPx", LOD_THRESHOLDS.fullPx));
  const keep = Math.min(1, Math.max(0.05, pick("keep", LOD_THRESHOLDS.keep)));
  return { fullPx, boardPx, boxPx, keep };
}

/**
 * The six clip planes of a column-major view-projection with WebGPU depth
 * (0 ≤ z ≤ w), as [a, b, c, d] with a·x + b·y + c·z + d ≥ 0 inside.
 */
export function frustumPlanes(m) {
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
  const add = (a, b) => a.map((value, k) => value + b[k]);
  const sub = (a, b) => a.map((value, k) => value - b[k]);
  return [add(r3, r0), sub(r3, r0), add(r3, r1), sub(r3, r1), r2, sub(r3, r2)];
}

/** True when the box [minX, minY, minZ, maxX, maxY, maxZ] lies wholly outside one plane. */
export function boxOutside(planes, box) {
  return planes.some(([a, b, c, d]) => {
    const x = a >= 0 ? box[3] : box[0];
    const y = b >= 0 ? box[4] : box[1];
    const z = c >= 0 ? box[5] : box[2];
    return a * x + b * y + c * z + d < 0;
  });
}
