import assert from "node:assert/strict";
import test from "node:test";
import { describeAnalyticHit, fieldAlongRay, operationSliceKey, planArrows, sampleFieldRaster } from "./analytic-board.js";

// A 4 x 2 raster of v = x (mm) on a 1 mm pitch, origin at (0, 0); one hole.
const field = {
  originMm: [0, 0],
  pitchMm: [1, 1],
  width: 4,
  height: 2,
  values: new Float32Array([0.5, 1.5, 2.5, 3.5, 0.5, 1.5, NaN, 3.5]),
};

test("the field is sampled bilinearly between texel centres", () => {
  assert.equal(sampleFieldRaster(field, [1.0, 0.5]), 1.0);
  assert.equal(sampleFieldRaster(field, [0.5, 0.5]), 0.5);
});

test("a missing neighbour falls back to the nearest texel, and off the raster is NaN", () => {
  // Near texel (1,1), whose right neighbour (2,1) holds no value.
  assert.equal(sampleFieldRaster(field, [1.6, 1.2]), 1.5);
  assert.ok(Number.isNaN(sampleFieldRaster(field, [9, 9])));
});

test("a ray meets the nearest slice that has a value under it", () => {
  const slice = (key, z, values = field.values) => ({ key, z, layerId: 0, field: { ...field, values } });
  const state = {
    analytic: {
      slices: [
        slice("copper.back", 0.0, field.values.map(() => 7)),
        slice("copper.front", 0.0016),
        { key: "copper.mid", z: 0.0008, layerId: 0, field: null },
      ],
    },
  };
  // Straight down at board (1.0, 0.5) mm: world (0.001, -0.0005), from above.
  const ray = { origin: [0.001, -0.0005, 0.01], direction: [0, 0, -1] };
  const hit = fieldAlongRay(state, ray, null);
  assert.equal(hit.sliceKey, "copper.front");
  assert.equal(hit.value, 1.0);
  assert.deepEqual(hit.boardMm.map((v) => Math.round(v * 1e6) / 1e6), [1, 0.5]);
  // From below, the back slice comes first.
  const below = fieldAlongRay(state, { origin: [0.001, -0.0005, -0.01], direction: [0, 0, 1] }, null);
  assert.equal(below.sliceKey, "copper.back");
});

test("an operation's slice is its chunk's", () => {
  const header = { chunks: [
    { slice_key: "copper.front", first_operation_index: 0, operation_count: 3 },
    { slice_key: "copper.in4", first_operation_index: 3, operation_count: 2 },
  ] };
  assert.equal(operationSliceKey(header, 2), "copper.front");
  assert.equal(operationSliceKey(header, 3), "copper.in4");
  assert.equal(operationSliceKey(header, 5), null);
});

test("the picked slice is read even with another slice nearer the ray's origin", () => {
  const slice = (key, z) => ({ key, z, layerId: 0, field: { ...field } });
  const state = { analytic: { slices: [slice("copper.front", 0.001), slice("copper.in4", 0)] } };
  // The ray starts between the two faces: unrestricted it can only see in4.
  const ray = { origin: [0.001, -0.0005, 0.0005], direction: [0, 0, -1] };
  assert.equal(fieldAlongRay(state, ray, null).sliceKey, "copper.in4");
  const picked = fieldAlongRay(state, ray, null, "copper.front");
  assert.equal(picked.sliceKey, "copper.front");
  assert.deepEqual(picked.world.map((v) => Math.round(v * 1e9) / 1e9), [0.001, -0.0005, 0.001]);
});

test("hidden layers are skipped along the ray", () => {
  const state = { analytic: { slices: [
    { key: "copper.front", z: 0.0016, layerId: 1, field: { ...field } },
    { key: "copper.in4", z: 0.0008, layerId: 4, field: { ...field } },
  ] } };
  const ray = { origin: [0.001, -0.0005, 0.01], direction: [0, 0, -1] };
  assert.equal(fieldAlongRay(state, ray, null, null, new Set([4])).sliceKey, "copper.in4");
  assert.equal(fieldAlongRay(state, ray, null, null, new Set([2])), null);
});

test("with reach, copper smaller than a texel still stops the ray", () => {
  // Front has one texel of copper at (1, 0); the ray lands just outside its reach-0 sample.
  const pad = { ...field, values: new Float32Array([NaN, 9, NaN, NaN, NaN, NaN, NaN, NaN]) };
  const state = { analytic: { slices: [
    { key: "copper.front", z: 0.0016, layerId: 1, field: pad },
    { key: "copper.back", z: 0, layerId: 2, field: { ...field } },
  ] } };
  const ray = { origin: [0.0021, -0.0004, 0.01], direction: [0, 0, -1] };
  assert.equal(fieldAlongRay(state, ray, null).sliceKey, "copper.back");
  const reached = fieldAlongRay(state, ray, null, null, null, 1);
  assert.equal(reached.sliceKey, "copper.front");
  assert.equal(reached.value, 9);
});

test("plane copper with a per-operation value reads the raster, not a via barrel", () => {
  // The run's per-operation values cover planes as well as barrels; only the pack's barrels are barrels.
  const state = {
    overlay: { kind: "field_grid", quantity: "voltage_v", units: "V", barrels: [0.9, 0.8] },
    barrelOperations: new Set([1]),
    pack: { binding: () => null },
  };
  const field = { value: 0.85, sliceKey: "copper.in4", boardMm: [1, 2], world: [0.001, -0.002, 0] };
  const plane = describeAnalyticHit(state, 0, field);
  assert.equal(plane.sliceKey, "copper.in4");
  assert.equal(plane.value, 0.85);
  const barrel = describeAnalyticHit(state, 1, field);
  assert.equal(barrel.sliceKey, "via barrel");
  assert.equal(barrel.value, 0.8);
});

test("arrows follow the field on each copper face, sized against a high quantile", () => {
  // 10 x 10 mm, J = (2, 0) on the left half and (0, 0.5) on the right; board Y down.
  const raster = (f) => ({ originMm: [0, 0], pitchMm: [1, 1], width: 10, height: 10,
    values: Float32Array.from({ length: 100 }, (_, k) => f(k % 10)) });
  const jx = new Map([["copper.front", raster((i) => (i < 5 ? 2 : 0))]]);
  const jy = new Map([["copper.front", raster((i) => (i < 5 ? 0 : 0.5))]]);
  const face = { key: "copper.front", role: "copper", face: "top", bottom: false, z: 0.001, layerId: 3, bounds: [0, 0, 10, 10] };
  const other = { ...face, face: "bottom", z: 0.0009 };
  const arrows = planArrows([face, other], jx, jy, { spacingMm: 2 });
  assert.equal(arrows.count, 25);
  assert.equal(arrows.max, 2);
  assert.equal(arrows.reference, 2);
  const floats = new Float32Array(arrows.data);
  const words = new Uint32Array(arrows.data);
  const round = (values) => [...values].map((v) => Math.round(v * 1e6) / 1e6 + 0);
  // The first arrow, at (1, 1) mm, points +x full length and full colour.
  assert.deepEqual(round(floats.slice(4, 8)), [1, 0, 0.0018, 1]);
  assert.ok(Math.abs(floats[2] - 0.001002) < 1e-9);
  // One at (9, 1) points to world -y (board +y), a quarter of the reference:
  // length 0.3 + 0.7 * sqrt(1/4) of full.
  const right = 20 * 12;
  assert.deepEqual(round(floats.slice(right, right + 2)), [0.009, -0.001]);
  assert.deepEqual(round(floats.slice(right + 4, right + 8)), [0, -1, 0.00117, 0.25]);
  assert.deepEqual([...words.slice(8, 10)], [3, 3]);
});

test("one hot spot does not shrink or hide the other arrows", () => {
  const values = (hot) => Float32Array.from({ length: 400 }, (_, k) => (k === 0 ? hot : 1));
  const raster = (v) => ({ originMm: [0, 0], pitchMm: [1, 1], width: 20, height: 20, values: v });
  const face = { key: "copper.in4", role: "copper", face: "top", bottom: false, z: 0, layerId: 5, bounds: [0, 0, 20, 20] };
  const arrows = planArrows([face], new Map([["copper.in4", raster(values(1000))]]), new Map([["copper.in4", raster(new Float32Array(400))]]), { spacingMm: 1 });
  // The raster's last row and column are edge texels: 19 x 19 arrows.
  assert.equal(arrows.count, 361);
  assert.equal(arrows.reference, 1);
  const floats = new Float32Array(arrows.data);
  // A plain-current arrow is full length and full colour, as is the hot one.
  assert.ok(Math.abs(floats[12 + 6] - 0.0009) < 1e-9);
  assert.equal(floats[7], 1);
});

test("no arrow sits at an edge texel, where copper does not surround it", () => {
  // A 6 x 6 mm square of copper inside a 10 x 10 raster; outside is NaN.
  const inside = (k) => { const [i, j] = [k % 10, Math.floor(k / 10)]; return i >= 2 && i < 8 && j >= 2 && j < 8; };
  const raster = (v) => ({ originMm: [0, 0], pitchMm: [1, 1], width: 10, height: 10,
    values: Float32Array.from({ length: 100 }, (_, k) => (inside(k) ? v : NaN)) });
  const face = { key: "copper.front", role: "copper", face: "top", bottom: false, z: 0, layerId: 0, bounds: [0, 0, 10, 10] };
  const arrows = planArrows([face], new Map([["copper.front", raster(1)]]), new Map([["copper.front", raster(0)]]), { spacingMm: 0.5 });
  const floats = new Float32Array(arrows.data);
  for (let i = 0; i < arrows.count; i++) {
    const [x, y] = [floats[i * 12] * 1000, -floats[i * 12 + 1] * 1000];
    // Texel centres of the copper span 2.5 .. 7.5 mm.
    assert.ok(x >= 2.5 && x <= 7.5 && y >= 2.5 && y <= 7.5, `${x}, ${y}`);
  }
  assert.equal(arrows.count, 100);
});
