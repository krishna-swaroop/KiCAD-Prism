import assert from "node:assert/strict";
import test from "node:test";

import {
  BARREL_RECORD_STRIDE,
  IDENTITY,
  OCCURRENCE_STRIDE,
  normalMatrix,
  normalizeMatrix,
  occurrenceUnionBounds,
  packBarrels,
  packOccurrences,
  transformBounds,
  transformPoint,
} from "./occurrences.js";

const close = (actual, expected) => actual.forEach((value, index) =>
  assert.ok(Math.abs(value - expected[index]) < 1e-12, `${index}: ${value} ≠ ${expected[index]}`));

// Column-major: a quarter turn about z (x → y), then a translation.
const QUARTER_TURN = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1];

test("the identity occurrence maps to itself exactly", () => {
  assert.deepEqual(normalMatrix([...IDENTITY]), [...IDENTITY]);
  const packed = packOccurrences([[...IDENTITY]]);
  assert.equal(packed.byteLength, OCCURRENCE_STRIDE);
  assert.deepEqual([...packed], [...IDENTITY, ...IDENTITY]);
});

test("a rigid transform's normal matrix is its rotation", () => {
  close(normalMatrix(QUARTER_TURN), [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  close(transformPoint(QUARTER_TURN, [1, 0, 0]), [0.1, 1.2, 0.3]);
});

test("non-uniform scale keeps normals perpendicular to the surface", () => {
  const stretch = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  // The plane x = y has normal (1, -1, 0); stretched along x it becomes x = 2y, normal ∝ (1, -2, 0).
  const n = normalMatrix(stretch);
  const mapped = [n[0] * 1 + n[4] * -1, n[1] * 1 + n[5] * -1, 0];
  assert.ok(Math.abs(mapped[0] * 2 + mapped[1] * 1) < 1e-12, "normal ⟂ the stretched tangent (2, 1, 0)");
});

test("a mirror flips the normal matrix's sign back so normals face out", () => {
  const mirror = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  close(normalMatrix(mirror), mirror);
});

test("matrices are validated", () => {
  assert.throws(() => normalizeMatrix([1, 2, 3]), /16 numbers/);
  assert.throws(() => normalizeMatrix([...IDENTITY.slice(0, 15), 2]), /affine/);
  assert.throws(() => normalizeMatrix([NaN, ...IDENTITY.slice(1)]), /finite/);
  assert.deepEqual(normalizeMatrix({ matrix: new Float32Array(IDENTITY) }), [...IDENTITY]);
  assert.throws(() => normalMatrix([0, 0, 0, 0, ...IDENTITY.slice(4)]), /invertible/);
});

test("bounds follow each occurrence and union across them", () => {
  const board = [0, 0, -0.001, 0.05, 0.04, 0.001];
  close(transformBounds(QUARTER_TURN, board), [0.06, 0.2, 0.299, 0.1, 0.25, 0.301]);
  const shifted = [...IDENTITY.slice(0, 12), 0.07, 0, 0, 1];
  close(occurrenceUnionBounds([[...IDENTITY], shifted], board), [0, 0, -0.001, 0.12, 0.04, 0.001]);
  assert.equal(occurrenceUnionBounds([[...IDENTITY]], board), board);
});

test("barrel records pack into the storage layout (ids at byte 32)", () => {
  const data = packBarrels([{
    centerMm: [10, 20], drillWidthMm: 0.4, drillHeightMm: 0.6, outerWidthMm: 0.8, outerHeightMm: 0.7,
    startZMm: -0.8, endZMm: 0.8, netId: 7, objectFeatureId: 9, startLayerId: 1, endLayerId: 4,
  }]);
  assert.equal(data.byteLength, BARREL_RECORD_STRIDE);
  const f32 = new Float32Array(data);
  const u32 = new Uint32Array(data);
  close([f32[0], f32[1], f32[2], f32[3], f32[4], f32[5]].map((v) => Math.fround(v)),
    [0.01, -0.02, 0.0002, 0.0004, -0.0008, 0.0008].map((v) => Math.fround(v)));
  assert.deepEqual([...u32.slice(8, 12)], [7, 9, 1, 4]);
});

test("instanced shader variants place every path by a culled occurrence", async () => {
  const { INSTANCED_SHADERS } = await import("./renderer.js");
  for (const name of ["main", "pick", "barrel", "barrelPick", "box", "boxPick"]) {
    const code = INSTANCED_SHADERS[name];
    assert.match(code, /@builtin\(instance_index\) instance: u32/, name);
    assert.match(code, /listedOccurrence\(/, name);
    assert.match(code, /\.model \* vec4f\(/, name);
    assert.match(code, /selectedOccurrence: u32/, name);
  }
  // Each draw reads the list its class names (material.w): components full only,
  // copper full or board, substrate and mask down to body; barrels at full or board.
  assert.match(INSTANCED_SHADERS.main, /listedOccurrence\(u32\(draw\.material\.w \+ 0\.5\), instance\)/);
  assert.match(INSTANCED_SHADERS.pick, /listedOccurrence\(u32\(draw\.material\.w \+ 0\.5\), instance\)/);
  assert.match(INSTANCED_SHADERS.main, /visibleOccurrences\[instance \* 4u \+ list\]/);
  for (const name of ["barrel", "barrelPick"]) {
    assert.match(INSTANCED_SHADERS[name], /barrels\[instance % count\]/);
    assert.match(INSTANCED_SHADERS[name], /listedOccurrence\(LIST_BOARD, instance \/ count\)/);
    assert.doesNotMatch(INSTANCED_SHADERS[name], /@location\(3\) dimensions/);
  }
  assert.match(INSTANCED_SHADERS.box, /listedOccurrence\(LIST_BOX, instance\)/);
  // The inspected selection lights only its own copy.
  assert.match(INSTANCED_SHADERS.main, /let here = input\.occurrence == globals\.selectedOccurrence;/);
  assert.match(INSTANCED_SHADERS.barrel, /input\.occurrence == globals\.selectedOccurrence && globals\.activeNet/);
  assert.match(INSTANCED_SHADERS.main, /occurrence\.normal \* vec4f\(input\.normal, 0\.0\)/);
  // The cull shader applies the same LOD rule as chooseLod and fills indirect counts.
  assert.match(INSTANCED_SHADERS.cull, /fn chooseLod\(previous: u32, pixels: f32\)/);
  assert.match(INSTANCED_SHADERS.cull, /args\[slot \* 5u \+ 1u\] = count;/);
});

test("pick values decode to occurrence, board and gizmo hits", async () => {
  const { decodePick, PICK_GIZMO_BASE } = await import("./occurrences.js");
  assert.deepEqual(decodePick(0, 0), { kind: "none", occurrenceIndex: -1, featureId: 0 });
  assert.deepEqual(decodePick(0, 77), { kind: "none", occurrenceIndex: -1, featureId: 0 });
  assert.deepEqual(decodePick(1, 877), { kind: "feature", occurrenceIndex: 0, featureId: 877 });
  assert.deepEqual(decodePick(2, 0), { kind: "board", occurrenceIndex: 1, featureId: 0 });
  assert.equal(decodePick(PICK_GIZMO_BASE + 3, 1).kind, "gizmo");
  assert.equal(decodePick(PICK_GIZMO_BASE + 3, 1).gizmoPart, 3);
  assert.equal(decodePick(PICK_GIZMO_BASE - 1, 5).occurrenceIndex, PICK_GIZMO_BASE - 2);
});

test("occurrences carry host keys, defaulting to their index", async () => {
  const { normalizeOccurrences } = await import("./occurrences.js");
  const shifted = [...IDENTITY.slice(0, 12), 0.152, 0, 0, 1];
  assert.deepEqual(normalizeOccurrences([[...IDENTITY], shifted]).keys, ["0", "1"]);
  const named = normalizeOccurrences([{ matrix: IDENTITY, key: "inst_obc1" }, { matrix: new Float32Array(shifted), key: "inst_obc2" }]);
  assert.deepEqual(named.keys, ["inst_obc1", "inst_obc2"]);
  close(named.matrices[1], shifted.map(Math.fround));
  assert.throws(() => normalizeOccurrences([{ matrix: IDENTITY, key: "a" }, { matrix: IDENTITY, key: "a" }]), /unique/);
});

test("points project into the viewport, y down", async () => {
  const { projectToViewport } = await import("./occurrences.js");
  const viewport = { x: 10, y: 20, width: 200, height: 100 };
  assert.deepEqual(projectToViewport(IDENTITY, [0, 0, 0.5], viewport), { x: 110, y: 70 });
  assert.deepEqual(projectToViewport(IDENTITY, [1, 1, 0.5], viewport), { x: 210, y: 20 });
  assert.equal(projectToViewport(IDENTITY, [0, 0, -0.5], viewport), null);
});

test("level of detail follows projected size, with hysteresis", async () => {
  const { chooseLod, LOD_FULL, LOD_BOARD, LOD_BODY, LOD_BOX, LOD_CULLED } = await import("./occurrences.js");
  const t = { fullPx: 140, boardPx: 70, boxPx: 18, keep: 0.8 };
  assert.equal(chooseLod(LOD_CULLED, 200, t), LOD_FULL);
  assert.equal(chooseLod(LOD_CULLED, 100, t), LOD_BOARD);
  assert.equal(chooseLod(LOD_CULLED, 40, t), LOD_BODY);
  assert.equal(chooseLod(LOD_CULLED, 10, t), LOD_BOX);
  // Shrinking just below a threshold holds the finer level; well below drops it.
  assert.equal(chooseLod(LOD_FULL, 130, t), LOD_FULL);
  assert.equal(chooseLod(LOD_FULL, 100, t), LOD_BOARD);
  assert.equal(chooseLod(LOD_BOARD, 60, t), LOD_BOARD);
  assert.equal(chooseLod(LOD_BOARD, 50, t), LOD_BODY);
  assert.equal(chooseLod(LOD_BODY, 16, t), LOD_BODY);
  assert.equal(chooseLod(LOD_BODY, 12, t), LOD_BOX);
  // A big drop passes through: board straight to body when it is still above the box hold.
  assert.equal(chooseLod(LOD_BOARD, 16, t), LOD_BODY);
  // Growing needs the full threshold: no flicker back and forth around it.
  assert.equal(chooseLod(LOD_BOARD, 130, t), LOD_BOARD);
  assert.equal(chooseLod(LOD_BODY, 60, t), LOD_BODY);
  assert.equal(chooseLod(LOD_BOX, 16, t), LOD_BOX);
});

test("level-of-detail thresholds stay ordered and finite", async () => {
  const { normalizeLodThresholds, LOD_THRESHOLDS } = await import("./occurrences.js");
  assert.deepEqual(normalizeLodThresholds({}), { ...LOD_THRESHOLDS });
  assert.deepEqual(normalizeLodThresholds({ fullPx: 50, boardPx: 90, boxPx: 120, keep: 3 }),
    { fullPx: 120, boardPx: 120, boxPx: 120, keep: 1 });
  assert.deepEqual(normalizeLodThresholds({ fullPx: "x", boardPx: -4, boxPx: 10, keep: 0 }),
    { fullPx: LOD_THRESHOLDS.fullPx, boardPx: 10, boxPx: 10, keep: 0.05 });
});

test("frustum planes cull boxes outside the clip volume", async () => {
  const { frustumPlanes, boxOutside } = await import("./occurrences.js");
  // An orthographic-style matrix: x, y in [-1, 1], z in [0, 1].
  const planes = frustumPlanes(IDENTITY);
  assert.equal(boxOutside(planes, [-0.5, -0.5, 0.2, 0.5, 0.5, 0.8]), false);
  assert.equal(boxOutside(planes, [0.9, 0.9, 0.2, 2, 2, 0.8]), false, "straddling an edge stays");
  assert.equal(boxOutside(planes, [1.1, -0.5, 0.2, 2, 0.5, 0.8]), true, "right of the view");
  assert.equal(boxOutside(planes, [-0.5, -0.5, -2, 0.5, 0.5, -0.1]), true, "behind the near plane");
  assert.equal(boxOutside(planes, [-0.5, -0.5, 1.1, 0.5, 0.5, 2]), true, "beyond the far plane");
});
