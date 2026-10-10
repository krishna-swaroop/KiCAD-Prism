import assert from "node:assert/strict";
import test from "node:test";

import { insetMatrix, mmToRuntime, projectInset, runtimeBoundsToMm } from "./inset-view.js";

// The 2D inset camera from ecad-viewer (insets/camera.ts): translate to the
// canvas centre, lean (screen y × cos tilt), rotate clockwise, mirror x,
// scale, translate by -centre.
function inset2d(view, w, h, [x, y]) {
  let dx = (x - view.center[0]) * view.zoom * (view.mirror ? -1 : 1);
  let dy = (y - view.center[1]) * view.zoom;
  const c = Math.cos(view.rotation);
  const s = Math.sin(view.rotation);
  // Clockwise on a y-down screen.
  [dx, dy] = [c * dx - s * dy, s * dx + c * dy];
  return [w / 2 + dx, h / 2 + dy * Math.cos(view.tilt || 0)];
}

const views = [
  { center: [10, 20], zoom: 8, rotation: 0, mirror: false, tilt: 0 },
  { center: [10, 20], zoom: 8, rotation: Math.PI / 6, mirror: false, tilt: 0 },
  { center: [-3, 7], zoom: 3, rotation: 0, mirror: true, tilt: 0 },
  { center: [-3, 7], zoom: 12, rotation: -1.1, mirror: true, tilt: 0 },
];

test("untilted inset views land board points where the 2D inset does", () => {
  for (const view of views) {
    const m = insetMatrix(view, 320, 220, 0.2);
    for (const p of [[10, 20], [14, 18], [-3, 7], [0, 0], [25, -4]]) {
      const got = projectInset(m, 320, 220, mmToRuntime(p[0], p[1]));
      const want = inset2d(view, 320, 220, p);
      assert.ok(Math.abs(got[0] - want[0]) < 1e-3, `${JSON.stringify(view)} x ${got} vs ${want}`);
      assert.ok(Math.abs(got[1] - want[1]) < 1e-3, `${JSON.stringify(view)} y ${got} vs ${want}`);
    }
  }
});

test("tilting keeps the centre fixed and leans the board away", () => {
  const flat = { center: [10, 20], zoom: 8, rotation: 0, mirror: false, tilt: 0 };
  const tilted = { ...flat, tilt: Math.PI / 4 };
  const m = insetMatrix(tilted, 320, 220, 0.2);
  const centre = projectInset(m, 320, 220, mmToRuntime(10, 20));
  assert.ok(Math.abs(centre[0] - 160) < 1e-3 && Math.abs(centre[1] - 110) < 1e-3);
  // A point 5 mm further down the board (screen-down) foreshortens by cos(tilt).
  const below = projectInset(m, 320, 220, mmToRuntime(10, 25));
  assert.ok(Math.abs(below[1] - 110 - 5 * 8 * Math.cos(Math.PI / 4)) < 1e-3);
  // Height now shows: a component top 2 mm up moves up the screen.
  const raised = projectInset(m, 320, 220, mmToRuntime(10, 20, 0.002));
  assert.ok(raised[1] < 110 - 1);
});

test("on the pivot surface a tilted view is ecad-viewer's 2D lean (IN-61)", () => {
  // Leaders, outlines and hover in the inset use the 2D camera: it must put
  // surface points where the 3D view draws them, at any rotation and side.
  for (const base of views) {
    for (const tilt of [0.3, (40 * Math.PI) / 180, 1.2]) {
      const view = { ...base, tilt };
      const surface = view.mirror ? -0.0008 : 0.0008;
      const m = insetMatrix(view, 320, 220, 0.2, surface);
      for (const p of [[14, 18], [-3, 9], [25, -4]]) {
        const got = projectInset(m, 320, 220, mmToRuntime(p[0], p[1], surface));
        const want = inset2d(view, 320, 220, p);
        assert.ok(Math.abs(got[0] - want[0]) < 1e-3, `${JSON.stringify(view)} x ${got} vs ${want}`);
        assert.ok(Math.abs(got[1] - want[1]) < 1e-3, `${JSON.stringify(view)} y ${got} vs ${want}`);
      }
    }
  }
});

test("runtime bounds convert back to KiCad millimetres and a side", () => {
  const top = runtimeBoundsToMm([0.01, -0.03, 0.0016, 0.02, -0.02, 0.003]);
  assert.deepEqual(top.box, { x: 10, y: 20, w: 10, h: 10 });
  assert.equal(top.bottom, false);
  assert.equal(runtimeBoundsToMm([0, 0, -0.003, 0.001, 0.001, -0.0016]).bottom, true);
});
