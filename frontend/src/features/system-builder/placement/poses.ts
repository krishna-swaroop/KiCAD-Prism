/**
 * Poses, the default row and member placement (CONTRACTS_P2 §14.1, §14.3).
 *
 * The twin of `backend/app/services/systems/placement/poses.py`. Both run the
 * shared goldens in `backend/tests/fixtures/system_builder/placement_cases.json`;
 * change the two together. A pose maps an instance's own frame into its
 * parent's as `T·R`; matrices are 4×4, column-major (WebGPU's layout), in mm.
 */

import type { Vec3 } from "./frames";

export type Quat = [number, number, number, number];

export interface Pose {
  translationMm: Vec3;
  /** Unit quaternion `[x, y, z, w]`, canonical `w ≥ 0`. */
  rotation: Quat;
}

export type PoseSource = "auto" | "manual" | "default";

export interface PlacedPose extends Pose {
  source: PoseSource;
}

export interface Bounds {
  minMm: Vec3;
  maxMm: Vec3;
}

export const DEFAULT_GAP_MM = 20;
export const MAX_TRANSLATION_MM = 1_000_000;

/** Round away float noise (1e-9) and fold -0, so equal poses serialise equally. */
function clean(value: number): number {
  return Math.round(value * 1e9) / 1e9 + 0;
}

/** §14.1: normalised, `w ≥ 0` (the first non-zero of w, x, y, z positive). */
export function canonicalRotation(q: readonly number[]): Quat {
  const size = Math.hypot(...q) || 1;
  const unit = q.map((c) => c / size);
  const leading = [unit[3], unit[0], unit[1], unit[2]].find((c) => Math.abs(c) > 1e-12) ?? 1;
  return unit.map((c) => clean(leading < 0 ? -c : c)) as Quat;
}

export function rotate(q: readonly number[], v: readonly number[]): Vec3 {
  const [x, y, z, w] = q;
  // v' = v + 2w(u × v) + 2u × (u × v), u = (x, y, z)
  const cx = y * v[2] - z * v[1];
  const cy = z * v[0] - x * v[2];
  const cz = x * v[1] - y * v[0];
  return [
    v[0] + 2 * (w * cx + y * cz - z * cy),
    v[1] + 2 * (w * cy + z * cx - x * cz),
    v[2] + 2 * (w * cz + x * cy - y * cx),
  ];
}

function multiply(a: readonly number[], b: readonly number[]): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** `parent · child`: the child's frame expressed in the parent's parent. */
export function compose(parent: Pose, child: Pose): Pose {
  const moved = rotate(parent.rotation, child.translationMm);
  return {
    translationMm: parent.translationMm.map((a, k) => clean(a + moved[k])) as Vec3,
    rotation: canonicalRotation(multiply(parent.rotation, child.rotation)),
  };
}

/** Column-major 4×4 of `T·R`. */
export function matrix(pose: Pose): number[] {
  const [x, y, z, w] = pose.rotation;
  const [tx, ty, tz] = pose.translationMm;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    tx, ty, tz, 1,
  ].map(clean);
}

/** The axis-aligned box around `bounds`' eight corners after `pose`. */
export function transformBounds(pose: Pose, bounds: Bounds | null): Bounds | null {
  if (!bounds) return null;
  const corners = Array.from({ length: 8 }, (_, i) =>
    rotate(pose.rotation, [0, 1, 2].map((k) => ((i >> k) & 1 ? bounds.maxMm : bounds.minMm)[k])),
  );
  const t = pose.translationMm;
  const axis = (k: number, pick: (...values: number[]) => number) => clean(pick(...corners.map((c) => c[k])) + t[k]);
  return {
    minMm: [axis(0, Math.min), axis(1, Math.min), axis(2, Math.min)],
    maxMm: [axis(0, Math.max), axis(1, Math.max), axis(2, Math.max)],
  };
}

export function union(boxes: readonly (Bounds | null)[]): Bounds | null {
  const present = boxes.filter((b): b is Bounds => b !== null);
  if (present.length === 0) return null;
  const pick = (side: "minMm" | "maxMm", f: (...values: number[]) => number) =>
    [0, 1, 2].map((k) => f(...present.map((b) => b[side][k]))) as Vec3;
  return { minMm: pick("minMm", Math.min), maxMm: pick("maxMm", Math.max) };
}

/**
 * §14.3 default poses: along +x in the given order, `gapMm` between bounding
 * boxes. Each box's minimum x sits `gapMm` after the previous box's maximum
 * (the first at x = 0) and its minimum y on y = 0. An item without bounds
 * takes an empty slot at the cursor. Rotation is the identity.
 */
export function defaultRow(items: readonly (readonly [string, Bounds | null])[], gapMm = DEFAULT_GAP_MM): Record<string, Pose> {
  const out: Record<string, Pose> = {};
  let cursor = 0;
  for (const [key, bounds] of items) {
    const translation: Vec3 = bounds ? [cursor - bounds.minMm[0], -bounds.minMm[1], 0] : [cursor, 0, 0];
    const width = bounds ? bounds.maxMm[0] - bounds.minMm[0] : 0;
    out[key] = { translationMm: translation.map(clean) as Vec3, rotation: [0, 0, 0, 1] };
    cursor += width + gapMm;
  }
  return out;
}

/** A pose from user input, canonical (§14.1); throws when it is not one. */
export function poseFrom(translationMm: readonly number[], rotation: readonly number[]): Pose {
  if (translationMm.length !== 3 || rotation.length !== 4) {
    throw new Error("translationMm takes 3 numbers and rotation 4 (x, y, z, w)");
  }
  if ([...translationMm, ...rotation].some((v) => !Number.isFinite(v))) throw new Error("pose values must be finite");
  if (translationMm.some((v) => Math.abs(v) > MAX_TRANSLATION_MM)) {
    throw new Error(`translation is limited to ±${MAX_TRANSLATION_MM} mm`);
  }
  if (Math.hypot(...rotation) < 1e-6) throw new Error("rotation must be a non-zero quaternion");
  return { translationMm: translationMm.map(clean) as Vec3, rotation: canonicalRotation(rotation) };
}

/**
 * Every member's pose in its system's frame, with its source. `items` are the
 * members in §14.3 order (label, then instance ID) with their own-frame
 * bounds; `stored` the poses kept for some of them. A stored pose wins; the
 * rest take their slot in the default row, laid out over every member so
 * moving one board never shifts the others. M4 adds the tree solve.
 */
export function place(
  items: readonly (readonly [string, Bounds | null])[],
  stored: Readonly<Record<string, PlacedPose>>,
  gapMm = DEFAULT_GAP_MM,
): Record<string, PlacedPose> {
  const defaults = defaultRow(items, gapMm);
  const out: Record<string, PlacedPose> = {};
  for (const [key] of items) {
    const pose = stored[key];
    out[key] = pose
      ? { translationMm: pose.translationMm.map(clean) as Vec3, rotation: canonicalRotation(pose.rotation), source: pose.source }
      : { ...defaults[key], source: "default" };
  }
  return out;
}
