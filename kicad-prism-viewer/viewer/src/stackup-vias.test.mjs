import assert from "node:assert/strict";
import test from "node:test";

import { collectStackupViaData } from "./stackup-vias.js";

const layers = [
  { id: 0, name: "F.Cu" },
  { id: 1, name: "In1.Cu" },
  { id: 2, name: "In2.Cu" },
  { id: 31, name: "B.Cu" },
];

test("classifies through, blind, and buried via spans", () => {
  const result = collectStackupViaData(layers, [
    { id: 1, layerIds: [0, 1, 2, 31] },
    { id: 2, layerIds: [0, 1] },
    { id: 3, layerIds: [1, 2] },
  ]);

  assert.deepEqual(result.counts, { thru: 1, blind: 1, buried: 1 });
  assert.deepEqual(
    result.spans.map(({ startName, endName, type }) => ({ startName, endName, type })),
    [
      { startName: "F.Cu", endName: "B.Cu", type: "thru" },
      { startName: "F.Cu", endName: "In1.Cu", type: "blind" },
      { startName: "In1.Cu", endName: "In2.Cu", type: "buried" },
    ],
  );
});

test("accepts endpoint-only and layer-mask via records including layer id zero", () => {
  const result = collectStackupViaData(layers, [
    { id: 1, startLayerId: 0, endLayerId: 1 },
    { id: 2, layerMask: String((1n << 1n) | (1n << 2n)) },
  ]);

  assert.deepEqual(result.counts, { thru: 0, blind: 1, buried: 1 });
});

test("deduplicates manifest barrels and semantic features by feature id", () => {
  const result = collectStackupViaData(layers, [
    { objectFeatureId: 42, layerIds: [0, 31] },
    { id: 42, layerIds: [0, 31] },
    { id: 43, layerIds: [0, 31] },
  ]);

  assert.deepEqual(result.counts, { thru: 2, blind: 0, buried: 0 });
  assert.equal(result.spans[0].count, 2);
});
