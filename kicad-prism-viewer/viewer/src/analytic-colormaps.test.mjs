import assert from "node:assert/strict";
import test from "node:test";
import { COLORMAPS, DEFAULT_ANALYTIC_STYLE, colormapStops, resolveStyle, sampleColormap } from "./analytic-colormaps.js";

test("a colormap samples linearly between its stops, ends exact", () => {
  const ramp = sampleColormap(["#000000", "#ff0000", "#ffffff"], 5);
  assert.deepEqual([...ramp.slice(0, 4)], [0, 0, 0, 1]);
  assert.deepEqual([...ramp.slice(8, 12)], [1, 0, 0, 1]);
  assert.deepEqual([...ramp.slice(4, 8)], [0.5, 0, 0, 1]);
  assert.deepEqual([...ramp.slice(16, 20)], [1, 1, 1, 1]);
});

test("named and custom colormaps resolve; bad ones are refused", () => {
  assert.deepEqual(colormapStops("viridis"), COLORMAPS.viridis);
  assert.throws(() => colormapStops("rainbow"), /unknown colormap/);
  assert.throws(() => colormapStops(["#123456"]), /two or more/);
  assert.throws(() => colormapStops(["#123456", "red"]), /#rrggbb/);
});

test("a style overrides the defaults field by field and is checked", () => {
  const style = resolveStyle({ fieldColormap: "inferno", arrowDensity: 40 });
  assert.equal(style.fieldColormap, "inferno");
  assert.equal(style.arrowDensity, 40);
  assert.equal(style.arrowColormap, DEFAULT_ANALYTIC_STYLE.arrowColormap);
  assert.equal(resolveStyle({ arrowWidth: 0.1 }, style).fieldColormap, "inferno");
  assert.throws(() => resolveStyle({ arrowDensity: 0 }), /arrowDensity/);
});
