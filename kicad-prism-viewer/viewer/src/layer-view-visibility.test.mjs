import assert from "node:assert/strict";
import test from "node:test";

import { Renderer } from "./renderer.js";

// The flat layer view draws mesh copper; analytic slices never draw there.
test("the flat layer view keeps mesh copper the analytic board covers in 3D", () => {
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, {
    showPlaceholders: true,
    analytic: { coversLayer: () => true, coversRole: () => true },
  });
  const copper = { kind: "copper", layerId: 4, tileId: "layer-4-tile-0-0" };
  const layers = new Set([4]);
  const visible = (compareMode) => renderer.visible(copper, 0, layers, true, true, 1, compareMode, new Set());
  assert.equal(visible(false), false);
  assert.equal(visible(true), true);
  assert.equal(renderer.visible({ ...copper, layerId: 26 }, 0, layers, true, true, 1, true), false);
});
