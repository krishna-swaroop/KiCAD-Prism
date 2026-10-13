import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AnalyticRenderer, viewEye } from "./analytic-renderer.js";
import { lookAt, mat4Multiply, orthographic, perspective } from "./math.js";
import { ANALYTIC_SHADER, STENCIL_STEPS } from "./analytic-shaders.js";

// WebGPU stencil semantics on one 8-bit value.
function stencilTest(face, reference, stored, readMask) {
  const ref = reference & readMask;
  const value = stored & readMask;
  switch (face.compare) {
    case "always": return true;
    case "equal": return ref === value;
    case "not-equal": return ref !== value;
    case "greater": return ref > value;
    default: throw new Error(face.compare);
  }
}
function stencilOp(op = "keep", stored, reference) {
  switch (op) {
    case "keep": return stored;
    case "zero": return 0;
    case "replace": return reference;
    case "invert": return ~stored & 0xff;
    default: throw new Error(op);
  }
}

/**
 * Replay the recorded draws of one slice over a few pixels. `cover(step,
 * draw)` says how many times a draw rasterises each pixel (fans may cover a
 * pixel more than once). Returns the final stencil values and the pixels
 * colour reached.
 */
function replay(calls, pixels, cover, initial = {}) {
  const stencil = new Map(pixels.map((pixel) => [pixel, initial[pixel] || 0]));
  const coloured = new Set();
  const writes = new Map();
  const colouredBy = new Map();
  let step = null;
  let reference = 0;
  for (const call of calls) {
    if (call.op === "pipeline") step = call.name;
    else if (call.op === "reference") reference = call.value;
    else if (call.op === "draw") {
      const plan = STENCIL_STEPS[step];
      for (const pixel of pixels) {
        for (let n = 0; n < cover(step, call, pixel); n += 1) {
          const stored = stencil.get(pixel);
          const passed = stencilTest(plan.face, reference, stored, plan.read);
          const result = stencilOp(passed ? plan.face.passOp : plan.face.failOp, stored, reference);
          stencil.set(pixel, (stored & ~plan.write) | (result & plan.write));
          if (passed && plan.color) {
            coloured.add(pixel);
            writes.set(pixel, (writes.get(pixel) || 0) + 1);
            colouredBy.set(pixel, step);
          }
        }
      }
    }
  }
  return { stencil, coloured, writes, colouredBy };
}

function recordingPass() {
  const calls = [];
  return {
    calls,
    setPipeline: (name) => calls.push({ op: "pipeline", name }),
    setStencilReference: (value) => calls.push({ op: "reference", value }),
    setVertexBuffer: () => {},
    setBindGroup: () => {},
    draw: (count, instances = 1, first = 0, firstInstance = 0) => calls.push({ op: "draw", count, instances, first, firstInstance }),
  };
}

test("the stencil plan removes subtracts, keeps region holes, and cleans up", () => {
  const renderer = Object.create(AnalyticRenderer.prototype);
  const names = Object.fromEntries(Object.keys(STENCIL_STEPS).map((name) => [name, name]));
  // Instance 0 is a hole; 1 a pad; 2 a track. Batch 0 subtracts a region,
  // batch 1 adds a zone with a hole (its fan covers the hole twice). The pad
  // and track overlap at "joint"; the zone also covers the pad at "padZone".
  const slice = {
    outer: true,
    shapeCount: 3,
    subtractShapes: 1,
    fans: {},
    batches: [
      { subtract: true, firstVertex: 0, vertexCount: 3, firstCover: 0, coverCount: 1 },
      { subtract: false, firstVertex: 3, vertexCount: 6, firstCover: 1, coverCount: 1 },
    ],
  };
  const pass = recordingPass();
  renderer.encodeStencilled(pass, names, slice);
  const pixels = ["hole", "pad", "track", "joint", "padZone", "zone", "zoneHole", "cutZone", "outside"];
  const instancesOf = (call) => Array.from({ length: call.instances }, (_, i) => call.firstInstance + i);
  const covers = {
    shapeMask: { 0: ["hole"] },
    shapeAdd: { 1: ["hole", "pad", "joint", "padZone"], 2: ["track", "joint"] },
    coverSubtract: { 0: ["cutZone"] },
    coverMark: { 1: ["zone", "zoneHole", "cutZone", "padZone"] },
    coverAdd: { 1: ["zone", "zoneHole", "cutZone", "padZone"] },
    coverClear: { 1: ["zone", "zoneHole", "cutZone", "padZone"] },
  };
  const fans = { 0: { cutZone: 1 }, 3: { zone: 1, zoneHole: 2, cutZone: 1, padZone: 1 } };
  const cover = (step, call, pixel) => {
    if (step === "clear") return pixel === "outside" ? 0 : 1;
    if (step === "fan") return fans[call.first]?.[pixel] || 0;
    return instancesOf(call).filter((i) => covers[step]?.[i]?.includes(pixel)).length;
  };
  const { stencil, coloured, writes } = replay(pass.calls, pixels, cover);
  assert.deepEqual([...coloured].sort(), ["joint", "pad", "padZone", "track", "zone"]);
  // The first operation to colour a pixel keeps it: overlaps in one plane
  // never fight by depth rounding.
  for (const [pixel, count] of writes) assert.equal(count, 1, `${pixel} coloured once`);
  for (const [pixel, value] of stencil) assert.equal(value & 0xe0, 0, `${pixel} bits 5, 6 and 7 cleared`);
  // Outer copper shapes mark bit 0 for the mask, as mesh copper does.
  assert.equal(stencil.get("pad") & 1, 1);
  assert.equal(stencil.get("hole") & 1, 0);
  // So do outer regions, but not their holes or the parts a subtract cuts.
  assert.equal(stencil.get("zone") & 1, 1);
  assert.equal(stencil.get("zoneHole") & 1, 0);
  assert.equal(stencil.get("cutZone") & 1, 0);
});

test("without the stencil feature only the add shapes draw", () => {
  const renderer = Object.create(AnalyticRenderer.prototype);
  const pass = recordingPass();
  renderer.encodeAddsOnly(pass, { shapeAdd: "shapeAdd" }, { shapeCount: 5, subtractShapes: 2 });
  assert.deepEqual(pass.calls.filter((call) => call.op === "draw"), [{ op: "draw", count: 6, instances: 3, first: 0, firstInstance: 2 }]);
});

test("the analytic family leaves the pinned base shaders alone", () => {
  const renderer = readFileSync(new URL("./renderer.js", import.meta.url), "utf8");
  assert.ok(!renderer.includes("ANALYTIC_SHADER"), "the base shader sources do not embed the analytic one");
  for (const entry of ["vs_shape", "fs_shape", "fs_shape_pick", "vs_fan", "vs_cover", "fs_cover", "fs_cover_pick", "vs_clear"]) {
    assert.match(ANALYTIC_SHADER, new RegExp(`fn ${entry}\\(`), entry);
  }
});

test("barrels find the camera from the view matrix, perspective or orthographic", () => {
  const view = lookAt([0.1, -0.2, 0.3], [0, 0, 0], [0, 0, 1]);
  const eye = viewEye(mat4Multiply(perspective(Math.PI / 4, 1.5, 0.01, 2), view));
  assert.equal(eye[3], 1);
  [0.1, -0.2, 0.3].forEach((value, axis) => assert.ok(Math.abs(eye[axis] - value) < 1e-5, `eye ${axis}: ${eye[axis]}`));
  const flat = viewEye(mat4Multiply(orthographic(0.2, 0.1, -3, 3), lookAt([0, 0, 1], [0, 0, 0], [0, 1, 0])));
  assert.equal(flat[3], 0);
  // Looking down: the view direction is -z (into the scene).
  assert.ok(Math.abs(flat[2] + 1) < 1e-6 && Math.abs(flat[0]) < 1e-6 && Math.abs(flat[1]) < 1e-6);
});

test("a solid board hides the slices facing away from the eye, and nothing else", () => {
  const behind = (eye, slice, { mode = "none", context = {} } = {}) => AnalyticRenderer.prototype.behindBoard.call({
    skin: { top: 0.0008, bottom: -0.0008 },
    eye,
    renderer: { innerCopperMode: mode },
    boardShown: AnalyticRenderer.prototype.boardShown,
  }, slice, context);
  const up = { faceDown: false };
  const down = { faceDown: true };
  const above = [0.01, 0.02, 0.05, 1];
  const below = [0.01, 0.02, -0.05, 1];
  const edgeOn = [0.01, 0.02, 0, 1];
  assert.deepEqual([behind(above, down), behind(above, up)], [true, false]);
  assert.deepEqual([behind(below, up), behind(below, down)], [true, false]);
  assert.deepEqual([behind(edgeOn, up), behind(edgeOn, down)], [false, false]);
  // Orthographic eyes are view directions.
  assert.deepEqual([behind([0, 0, -1, 0], down), behind([0, 0, 1, 0], up)], [true, true]);
  // Separated (all inner copper shows), hidden, or fading: everything draws.
  assert.equal(behind(above, down, { mode: "all" }), false);
  assert.equal(behind(above, down, { context: { showBoard: false } }), false);
  assert.equal(behind(above, down, { context: { boardOpacity: 0.5 } }), false);
});

test("a mask slice lays itself down, then tints over outer copper and elsewhere", () => {
  const renderer = Object.create(AnalyticRenderer.prototype);
  const names = Object.fromEntries(Object.keys(STENCIL_STEPS).map((name) => [name, name]));
  // The board profile is one region; a pad opening is a subtract shape.
  const slice = {
    role: "mask",
    shapeCount: 1,
    subtractShapes: 1,
    fans: {},
    batches: [{ subtract: false, firstVertex: 0, vertexCount: 3, firstCover: 0, coverCount: 1 }],
  };
  const pass = recordingPass();
  renderer.encodeStencilled(pass, names, slice, "mask");
  const pixels = ["overCopper", "overBoard", "opening"];
  const cover = (step, call, pixel) => {
    if (step === "clear" || step === "tintCovered" || step === "tintPlain") return 1;
    if (step === "fan" || step === "coverLay" || step === "coverClear") return 1;
    if (step === "shapeMask") return pixel === "opening" ? 1 : 0;
    return 0;
  };
  // Outer copper marked bit 0 under "overCopper" and "opening" (a pad).
  const { stencil, writes, colouredBy } = replay(pass.calls, pixels, cover, { overCopper: 1, opening: 1 });
  const tints = pass.calls.filter((call) => call.op === "pipeline").map((call) => call.name).filter((name) => name.startsWith("tint"));
  assert.deepEqual(tints, ["tintCovered", "tintPlain"]);
  // Each mask pixel is tinted once; the opening is not tinted at all.
  assert.equal(writes.get("overCopper"), 1);
  assert.equal(writes.get("overBoard"), 1);
  assert.equal(writes.get("opening"), undefined);
  assert.equal(colouredBy.get("overCopper"), "tintCovered");
  assert.equal(colouredBy.get("overBoard"), "tintPlain");
  // The copper mark survives for the mesh's own blended layers; the slice's bits are cleared.
  assert.deepEqual([stencil.get("overCopper"), stencil.get("overBoard"), stencil.get("opening")], [1, 0, 1]);
});
