// Surface picks on catalog models (System Builder SB2-48b): where a click meets a
// model and which way that surface faces. The GPU pick (an rg32uint id texture)
// says only what was hit, so this casts the camera ray against the model's
// triangles on the CPU. Kept free of the DOM and WebGPU so it can be tested on
// its own.

import { cross, dot, normalize, scale, add } from "./math.js";

/** The camera ray through a viewport point (NDC, y up), in the renderer's space: perspective only. */
export function cameraRay(camera, ndcX, ndcY, aspect) {
  const { right, up, back } = camera.basis();
  const half = Math.tan(camera.fov / 2);
  const origin = add(camera.focus, scale(back, camera.distance));
  const direction = normalize(add(add(scale(back, -1), scale(right, ndcX * half * aspect)), scale(up, ndcY * half)));
  return { origin, direction };
}

/**
 * The view ray through normalized device point (ndcX, ndcY) of a
 * view-projection `matrix`, from the camera into the scene. The projections
 * use reversed depth (math.js: near -> 1, far -> 0), so the near plane is
 * unprojected at depth 1. Null when the matrix is singular.
 */
export function matrixRay(matrix, ndcX, ndcY) {
  const inverse = invert4(Array.from(matrix, Number));
  if (!inverse) return null;
  const unproject = (depth) => {
    const out = [0, 1, 2, 3].map((row) => inverse[row] * ndcX + inverse[4 + row] * ndcY + inverse[8 + row] * depth + inverse[12 + row]);
    return out.slice(0, 3).map((value) => value / out[3]);
  };
  const near = unproject(1);
  const far = unproject(0);
  const direction = far.map((value, k) => value - near[k]);
  const length = Math.hypot(...direction);
  return length > 0 ? { origin: near, direction: direction.map((value) => value / length) } : null;
}

/** A general 4×4 inverse (column-major); null when singular. */
export function invert4(m) {
  const inv = new Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-30) return null;
  return inv.map((value) => value / det);
}

function point(m, p) {
  return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
}

function direction(m, d) {
  return [0, 1, 2].map((r) => m[r] * d[0] + m[4 + r] * d[1] + m[8 + r] * d[2]);
}

function hitsBox(origin, dir, b) {
  let near = -Infinity;
  let far = Infinity;
  for (let k = 0; k < 3; k += 1) {
    if (Math.abs(dir[k]) < 1e-15) {
      if (origin[k] < b[k] || origin[k] > b[k + 3]) return false;
      continue;
    }
    const a = (b[k] - origin[k]) / dir[k];
    const c = (b[k + 3] - origin[k]) / dir[k];
    near = Math.max(near, Math.min(a, c));
    far = Math.min(far, Math.max(a, c));
  }
  return far >= Math.max(near, 0);
}

/**
 * The nearest triangle a local-space ray meets (Möller–Trumbore), as the ray parameter and the
 * triangle's geometric normal; null without a hit. Primitives are `loadGltf`'s: `position`, `indices`
 * (or none: a triangle list), `bounds`.
 */
export function rayTriangles(primitives, origin, dir) {
  let best = null;
  for (const primitive of primitives) {
    if (primitive.bounds && !hitsBox(origin, dir, primitive.bounds)) continue;
    const p = primitive.position;
    const indices = primitive.indices;
    const count = indices ? indices.length : p.length / 3;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = (indices ? indices[i] : i) * 3;
      const b = (indices ? indices[i + 1] : i + 1) * 3;
      const c = (indices ? indices[i + 2] : i + 2) * 3;
      const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const h = cross(dir, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-18) continue;
      const s = [origin[0] - p[a], origin[1] - p[a + 1], origin[2] - p[a + 2]];
      const u = dot(s, h) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1);
      const v = dot(dir, q) / det;
      if (v < 0 || u + v > 1) continue;
      const t = dot(e2, q) / det;
      if (t > 1e-12 && (!best || t < best.t)) best = { t, normal: cross(e1, e2) };
    }
  }
  return best;
}

/**
 * Where a world ray meets the nearest of `models` (`{key, matrix, primitives}`, matrix: model space →
 * world, column-major): `{key, point, normal}` in world space, the normal unit length and facing the
 * ray's origin; null when nothing is hit.
 */
export function surfaceHit(models, ray) {
  let best = null;
  for (const model of models) {
    const inverse = invert4(model.matrix);
    if (!inverse) continue;
    const origin = point(inverse, ray.origin);
    const dir = direction(inverse, ray.direction);
    const hit = rayTriangles(model.primitives, origin, dir);
    if (!hit) continue;
    const world = point(model.matrix, add(origin, scale(dir, hit.t)));
    const distance = Math.hypot(...world.map((value, index) => value - ray.origin[index]));
    if (best && distance >= best.distance) continue;
    // Normals take the inverse transpose; for the rigid, uniformly scaled models here that is the
    // matrix itself up to length, which normalising removes.
    const transposed = [inverse[0], inverse[4], inverse[8], 0, inverse[1], inverse[5], inverse[9], 0,
      inverse[2], inverse[6], inverse[10], 0, 0, 0, 0, 1];
    let normal = normalize(direction(transposed, hit.normal));
    if (dot(normal, ray.direction) > 0) normal = scale(normal, -1);
    best = { key: model.key, point: world, normal, distance };
  }
  if (!best) return null;
  return { key: best.key, point: best.point, normal: best.normal };
}
