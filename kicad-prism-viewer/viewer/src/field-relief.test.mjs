import assert from "node:assert/strict";
import test from "node:test";
import { fillRaster, maskSize, topDownMatrix } from "./field-relief.js";
import { netIdByName, reliefSlices } from "./analytic-board.js";

test("every empty raster cell takes its nearest copper cell's value", () => {
  assert.deepEqual([...fillRaster(new Float32Array([2, NaN, NaN, 6]), 4, 1)], [2, 2, 6, 6]);
  // 3 x 2: a value in one corner reaches every cell.
  assert.deepEqual([...fillRaster(new Float32Array([NaN, NaN, NaN, NaN, NaN, 5]), 3, 2)], [5, 5, 5, 5, 5, 5]);
  assert.ok(Number.isNaN(fillRaster(new Float32Array([NaN, NaN]), 2, 1)[0]));
});

test("the top-down matrix puts the bounds' corners on the clip square, higher z nearer", () => {
  const m = topDownMatrix([10, 20, 30, 60], -0.001, 0.002);
  const clip = ([x, y, z]) => [0, 1, 2].map((row) => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row]);
  const round = (values) => values.map((v) => Math.round(v * 1e6) / 1e6 + 0);
  // Board (10, 20) mm is world (0.010, -0.020): the top-left corner.
  assert.deepEqual(round(clip([0.010, -0.020, -0.001])), [-1, 1, 0]);
  assert.deepEqual(round(clip([0.030, -0.060, 0.002])), [1, -1, 1]);
});

test("the mask keeps the board's aspect, its longer side at the pixel budget", () => {
  assert.deepEqual(maskSize([0, 0, 40, 20], 2048), [2048, 1024]);
});

test("one relief slice per layer, its top face, with its copper cells counted", () => {
  const field = (values) => ({ values: new Float32Array(values) });
  const state = { analytic: { slices: [
    { key: "copper.in4.bottom", layerId: 4, z: 0.0007, field: field([1, NaN]) },
    { key: "copper.in4", layerId: 4, z: 0.0008, field: field([1, 2]) },
    { key: "mask.front", layerId: 1, role: "soldermask", z: 0.002, field: field([1]) },
    { key: "copper.back", layerId: 2, z: 0, field: null },
  ] } };
  assert.deepEqual(reliefSlices(state).map(({ key, cells }) => [key, cells]), [["copper.in4", 2]]);
});

test("a net is found by its name, then by an alias", () => {
  const nets = [{ id: 3, name: "/SFPs/S1.TXN", aliases: ["/S1.TXN"] }, { id: 7, name: "+0V9" }];
  assert.equal(netIdByName(nets, "+0V9"), 7);
  assert.equal(netIdByName(nets, "/S1.TXN"), 3);
  assert.equal(netIdByName(nets, "GND"), 0);
});
