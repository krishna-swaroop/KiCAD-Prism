import assert from "node:assert/strict";
import test from "node:test";

import { EXPLODE_CLEARANCE_MARGIN, boardContextOffset, explodeClearance, explodeGap } from "./explode-stackup.js";

const MM = 0.001;
// FRE205 (two layers, no stackup): copper faces at -0.035 and 1.58916 mm,
// the pipeline's mask 20 um outside them, KiCad's silkscreen under the copper.
const copper = [0, 0, -0.035 * MM, 0.04, 0.04, 1.58916 * MM];
const board = (boardRole, z) => ({ kind: "board", boardRole, bounds: [0, 0, z, 0.04, 0.04, z] });
const entries = [
  board("substrate", 0),
  board("soldermask", 1.60916 * MM),
  board("soldermask", -0.055 * MM),
  board("silkscreen", 1.53916 * MM),
  board("silkscreen", -0.075 * MM),
  { kind: "copper", bounds: [0, 0, 1.58916 * MM, 0.04, 0.04, 1.58916 * MM] },
];

test("context lifts move mask and silkscreen out from their side", () => {
  assert.equal(boardContextOffset(board("soldermask", 1.6 * MM)), 0.000018);
  assert.equal(boardContextOffset(board("silkscreen", -0.07 * MM)), -0.000035);
  assert.equal(boardContextOffset(board("paste", 1.6 * MM)), 0);
  assert.equal(boardContextOffset(board("substrate", 0)), 0);
});

test("clearance reaches past the highest lifted context face", () => {
  // Bottom silkscreen: 40 um under the bottom copper, plus its 35 um lift.
  const clearance = explodeClearance(copper, entries);
  assert.ok(Math.abs(clearance - (0.000075 + EXPLODE_CLEARANCE_MARGIN)) < 1e-9);
  // Top mask alone: 20 um over the copper, plus its 18 um lift.
  const top = explodeClearance(copper, entries.slice(0, 2));
  assert.ok(Math.abs(top - (0.000038 + EXPLODE_CLEARANCE_MARGIN)) < 1e-9);
  assert.equal(explodeClearance(copper, [board("silkscreen", 1.5 * MM)]), 0);
  assert.equal(explodeClearance(null, entries), 0);
});

test("outer copper clears the context at any separation", () => {
  const clearance = explodeClearance(copper, entries);
  for (let step = 1; step <= 100; step += 1) {
    const separation = step / 100;
    // Two layers: the outer ones move half a gap out.
    const outer = explodeGap(separation, 52, clearance, 2) / 2;
    assert.ok(outer >= clearance, `separation ${separation}: outer copper ${outer} under ${clearance}`);
  }
});

test("the assembled board does not move, and the spread is unchanged above the step", () => {
  assert.equal(explodeGap(0, 52, 0.0001, 2), 0);
  assert.equal(explodeGap(0.5, 52, 0, 2), 0.5 * 0.5 * 8 / 1000);
  // Four layers: the outer ones sit 1.5 gaps out, so the step is a third of a gap's worth each.
  assert.ok(Math.abs(explodeGap(0.5, 200, 0.00006, 4) - (0.25 * 24 / 1000 + 0.00004)) < 1e-12);
  assert.equal(explodeGap(0.5, 52, 0.0001, 1), 0.5 * 0.5 * 8 / 1000);
});
