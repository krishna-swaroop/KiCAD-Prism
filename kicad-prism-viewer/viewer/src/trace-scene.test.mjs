import assert from "node:assert/strict";
import test from "node:test";

import { mapGrid } from "./trace-capture.js";
import {
  HOLE_FLAGS,
  HOLE_FLOATS,
  RELIEF_UM,
  TRACE_FRAME,
  TRACE_FRAME_INVERSE,
  composeFaceMaps,
  faceGeometry,
  holeFinish,
  multiply,
  normalMap,
  studioEnvironment,
  toTraceFrame,
  traceFinishColor,
  traceMaskColor,
  wallGeometry,
} from "./trace-scene.js";

const look = { maskColor: [0.012, 0.072, 0.02], finishColor: [0.8, 0.56, 0.24] };
const ON = 255;

function face(pixels, extra = {}) {
  const size = pixels.copper.length;
  return { width: size, height: 1, pitchMm: 0.01, ...pixels, ...extra };
}

test("the trace frame turns z up into y up and back", () => {
  assert.deepEqual(toTraceFrame([1, 2, 3]), [1, 3, -2]);
  const identity = multiply(TRACE_FRAME, TRACE_FRAME_INVERSE);
  assert.deepEqual([...identity], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

test("a face's materials follow its layers", () => {
  const maps = composeFaceMaps(face({
    copper: Uint8Array.of(0, ON, ON, 0),
    mask: Uint8Array.of(ON, ON, 0, 0),
    silk: Uint8Array.of(0, 0, 0, 0),
    body: Uint8Array.of(ON, ON, ON, 0),
  }), look);
  const coat = [0, 1, 2, 3].map((i) => maps.data[i * 4]);
  const metal = [0, 1, 2, 3].map((i) => maps.data[i * 4 + 2]);
  const alpha = [0, 1, 2, 3].map((i) => maps.color[i * 4 + 3]);
  assert.deepEqual(coat, [255, 255, 0, 0], "only the mask is coated");
  assert.deepEqual(metal, [0, 0, 255, 0], "only exposed copper is metal");
  assert.deepEqual(alpha, [255, 255, 255, 0], "the body cuts the face");
  // Copper under the mask reads lighter than bare mask.
  assert.ok(maps.color[4 + 1] > maps.color[1]);
});

test("silkscreen prints over everything, matte and raised", () => {
  const maps = composeFaceMaps(face({ copper: Uint8Array.of(ON), mask: Uint8Array.of(ON), silk: Uint8Array.of(ON), body: Uint8Array.of(ON) }), look);
  assert.equal(maps.data[0], 0);
  assert.equal(maps.data[2], 0);
  assert.ok(maps.color[0] > 200);
});

test("relief normals lean away from a raised edge", () => {
  const heights = Float32Array.of(0, 0, RELIEF_UM.finish, RELIEF_UM.finish);
  const normals = normalMap(heights, 4, 1, 10);
  // Rising along +x: the normal tips towards -x (red below the middle).
  assert.ok(normals[4] < 128);
  assert.equal(normals[0], 128);
});

test("hole finishes by IPC-4761 protection", () => {
  assert.equal(holeFinish(0, true), "open");
  assert.equal(holeFinish(HOLE_FLAGS.tentedFront, true), "tented");
  assert.equal(holeFinish(HOLE_FLAGS.tentedFront, false), "open");
  assert.equal(holeFinish(HOLE_FLAGS.coveredBack, false), "tented");
  assert.equal(holeFinish(HOLE_FLAGS.pluggedBack | HOLE_FLAGS.tentedBack, false), "plugged");
  assert.equal(holeFinish(HOLE_FLAGS.filled | HOLE_FLAGS.pluggedFront, true), "filled");
  assert.equal(holeFinish(HOLE_FLAGS.capped | HOLE_FLAGS.filled, true), "capped");
});

test("a capped hole closes in the pad's finish; an open one stays cut", () => {
  // A 9-pixel strip, a hole of radius 0.02 mm at its middle, no body where it is drilled.
  const strip = (values) => Uint8Array.from(values);
  const layers = {
    copper: strip([0, 0, ON, ON, 0, ON, ON, 0, 0]),
    mask: strip([ON, ON, 0, 0, 0, 0, 0, ON, ON]),
    silk: strip(new Array(9).fill(0)),
    body: strip([ON, ON, ON, ON, 0, ON, ON, ON, ON]),
  };
  const hole = (flags) => Float32Array.of(0.045, 0.005, 0, 0, 0.012, flags);
  assert.equal(HOLE_FLOATS, 6);
  const open = composeFaceMaps(face(layers, { holes: hole(0) }), look);
  assert.equal(open.color[4 * 4 + 3], 0);
  const capped = composeFaceMaps(face(layers, { holes: hole(HOLE_FLAGS.capped) }), look);
  assert.equal(capped.color[4 * 4 + 3], 255);
  assert.equal(capped.data[4 * 4 + 2], 255, "capped copper is metal");
  const filled = composeFaceMaps(face(layers, { holes: hole(HOLE_FLAGS.filled) }), look);
  assert.equal(filled.color[4 * 4 + 3], 255);
  assert.equal(filled.data[4 * 4 + 2], 0, "resin is not metal");
  // Tenting spans a hole only where there is mask: a pad's opening leaves it open.
  const tented = composeFaceMaps(face(layers, { holes: hole(HOLE_FLAGS.tentedFront) }), look);
  assert.equal(tented.color[4 * 4 + 3], 0);
});

test("faces, walls and the camera in the trace frame", () => {
  const top = faceGeometry([0, 0, 10, 20], 0.001, true);
  assert.deepEqual([...top.position.subarray(6, 9)].map((v) => +v.toFixed(6)), [0.01, 0.001, 0.02]);
  assert.equal(top.tangent[3], -1);
  assert.equal(faceGeometry([0, 0, 10, 20], -0.001, false).tangent[3], 1);
  const walls = wallGeometry(Float32Array.of(0, 0, 10, 0), -0.001, 0.001);
  assert.equal(walls.indices.length, 6);
  assert.deepEqual([...walls.normal.subarray(0, 3)].map((v) => +v.toFixed(6) + 0), [0, 0, 1]);
});

test("the map grid is square, padded to whole 256-pixel rows and covers the bounds", () => {
  const grid = mapGrid([10, 20, 60, 45], 4096);
  assert.equal(grid.width % 256, 0);
  assert.equal(grid.height % 256, 0);
  assert.ok(grid.boundsMm[0] <= 10 && grid.boundsMm[2] >= 60 && grid.boundsMm[1] <= 20 && grid.boundsMm[3] >= 45);
  assert.ok(Math.abs((grid.boundsMm[2] - grid.boundsMm[0]) / grid.width - grid.pitchMm) < 1e-9);
});

test("looks: named masks, finishes and a studio lit from the camera's side", () => {
  assert.deepEqual(traceMaskColor("Green"), traceMaskColor("green"));
  assert.deepEqual(traceMaskColor("#123456", [0.1, 0.2, 0.3]), [0.1, 0.2, 0.3]);
  assert.notDeepEqual(traceFinishColor("HASL"), traceFinishColor("ENIG"));
  const env = studioEnvironment({ position: [0, 1, 1], target: [0, 0, 0] }, 64, 32);
  assert.equal(env.data.length, 64 * 32 * 4);
  assert.ok(Math.max(...env.data) > 3, "has a key light");
});
