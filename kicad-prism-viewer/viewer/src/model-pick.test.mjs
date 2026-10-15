import assert from "node:assert/strict";
import test from "node:test";

import { cameraRay, invert4, rayTriangles, surfaceHit } from "./model-pick.js";

const close = (actual, expected, tolerance = 1e-9) =>
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${actual} != ${expected}`));

// A unit cube, [0, 1]³, as a triangle list with indices: 12 triangles, outward winding.
function cube() {
  const corners = [];
  for (let z = 0; z <= 1; z += 1) for (let y = 0; y <= 1; y += 1) for (let x = 0; x <= 1; x += 1) corners.push(x, y, z);
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const indices = faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return [{ position: new Float32Array(corners), indices: new Uint32Array(indices), bounds: [0, 0, 0, 1, 1, 1] }];
}

test("invert4 undoes an affine matrix", () => {
  const m = [0, 2, 0, 0, -2, 0, 0, 0, 0, 0, 2, 0, 5, 6, 7, 1]; // a quarter turn about z, ×2, then a move
  const product = [];
  const inv = invert4(m);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    product.push([0, 1, 2, 3].reduce((sum, k) => sum + m[k * 4 + r] * inv[c * 4 + k], 0));
  }
  close(product, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(invert4(new Array(16).fill(0)), null);
});

test("a ray meets the cube's near face first", () => {
  const hit = rayTriangles(cube(), [0.5, 0.5, 5], [0, 0, -1]);
  assert.ok(Math.abs(hit.t - 4) < 1e-9);
  assert.ok(hit.normal[2] > 0, "the top face's normal points up");
  assert.equal(rayTriangles(cube(), [5, 5, 5], [0, 0, -1]), null);
});

test("surface hits come back in world space, facing the viewer", () => {
  // The cube moved to x = 10 and scaled ×2: it spans [10, 12] × [0, 2] × [0, 2].
  const matrix = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 10, 0, 0, 1];
  const hit = surfaceHit([{ key: "/m", matrix, primitives: cube() }], { origin: [5, 1, 1], direction: [1, 0, 0] });
  assert.equal(hit.key, "/m");
  close(hit.point, [10, 1, 1]);
  close(hit.normal, [-1, 0, 0]);
  assert.equal(surfaceHit([{ key: "/m", matrix, primitives: cube() }], { origin: [5, 9, 1], direction: [1, 0, 0] }), null);
});

test("the camera ray through the centre runs from the eye to the focus", () => {
  const camera = { focus: [1, 2, 3], distance: 10, fov: Math.PI / 4,
    basis: () => ({ right: [1, 0, 0], up: [0, 1, 0], back: [0, 0, 1] }) };
  const ray = cameraRay(camera, 0, 0, 1.5);
  close(ray.origin, [1, 2, 13]);
  close(ray.direction, [0, 0, -1]);
  const corner = cameraRay(camera, 1, 1, 1.5);
  close(corner.direction, [Math.tan(Math.PI / 8) * 1.5, Math.tan(Math.PI / 8), -1].map((value, _i, all) => value / Math.hypot(...all)));
});

test("matrixRay starts at the camera and points into the scene under reversed depth", async () => {
  const { lookAt, mat4Multiply, orthographic, perspective } = await import("./math.js");
  const { matrixRay } = await import("./model-pick.js");
  const view = lookAt([0, 0, 1], [0, 0, 0], [0, 1, 0]);
  for (const projection of [perspective(Math.PI / 4, 1, 0.01, 10), orthographic(1, 1, 0.01, 10)]) {
    const ray = matrixRay(mat4Multiply(projection, view), 0, 0);
    // From the camera (above the board, near z = 1) down towards it.
    assert.ok(ray.origin[2] > 0.9 && ray.origin[2] <= 1, `origin ${ray.origin}`);
    assert.ok(ray.direction[2] < -0.999, `direction ${ray.direction}`);
    // So of two copper planes, the upper (front) one is met first.
    const t = (z) => (z - ray.origin[2]) / ray.direction[2];
    assert.ok(t(0.0008) > 0 && t(0.0008) < t(-0.0008));
  }
});
