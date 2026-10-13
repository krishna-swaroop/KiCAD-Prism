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
function replay(calls, pixels, cover, initial = {}, hidden = () => false) {
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
          // A depth-tested draw behind a nearer surface takes its depth-fail op.
          const occluded = passed && Boolean(plan.depth || plan.depthTest) && hidden(step, call, pixel);
          const op = !passed ? plan.face.failOp : occluded ? plan.face.depthFailOp : plan.face.passOp;
          const result = stencilOp(op, stored, reference);
          stencil.set(pixel, (stored & ~plan.write) | (result & plan.write));
          if (passed && !occluded && plan.color) {
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
    setBindGroup: (index, group) => { calls.group = group; },
    draw: (count, instances = 1, first = 0, firstInstance = 0) => calls.push({ op: "draw", count, instances, first, firstInstance, ...(calls.group ? { group: calls.group } : {}) }),
  };
}

test("the stencil plan removes subtracts, keeps region holes, and cleans up", () => {
  const renderer = Object.create(AnalyticRenderer.prototype);
  const names = Object.fromEntries(Object.keys(STENCIL_STEPS).map((name) => [name, name]));
  // Instance 0 is a hole; 1 a pad; 2 a track. Batch 0 subtracts a region,
  // batch 1 adds a zone with a hole (its fan covers the hole twice). The pad
  // and track overlap at "joint"; the zone also covers the pad at "padZone".
  // The outward face of an outer copper slab: it marks bit 0.
  const slice = {
    outer: true,
    mark: true,
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

test("shape walls are drawn only where a slab's walls can span a third of a pixel", () => {
  const extent = [[0, -0.1, -0.0008], [0.1, 0, 0.0008]];
  const pixels = (matrix, eye) => AnalyticRenderer.prototype.wallPixels.call({
    viewMatrix: matrix, extent, eye, renderer: { canvas: { width: 2560, height: 1600 } },
  }, 0.000035);
  // Straight down, orthographic: a wall projects to nothing.
  const down = mat4Multiply(orthographic(0.06, 0.06, -3, 3), lookAt([0.05, -0.05, 1], [0.05, -0.05, 0], [0, 1, 0]));
  assert.ok(pixels(down, viewEye(down)) < 1e-6);
  // The whole board, obliquely: a 35 um wall is under half a pixel.
  const far = mat4Multiply(perspective(Math.PI / 4, 1.6, 0.01, 2), lookAt([0.05, -0.25, 0.15], [0.05, -0.05, 0], [0, 0, 1]));
  const overview = pixels(far, viewEye(far));
  assert.ok(overview > 0 && overview < 0.5, `${overview}`);
  // Close in: many pixels.
  const near = mat4Multiply(perspective(Math.PI / 4, 1.6, 0.0001, 2), lookAt([0.05, -0.052, 0.002], [0.05, -0.05, 0], [0, 0, 1]));
  assert.ok(pixels(near, viewEye(near)) > 10);
});

test("a conformal mask rises over copper, lies low on laminate, steps between, and cleans up", () => {
  const renderer = Object.create(AnalyticRenderer.prototype);
  // The step pipelines run the coat plan.
  renderer.pipelines = { color: { ...Object.fromEntries(Object.keys(STENCIL_STEPS).map((name) => [name, name])), step: "coat", regionStep: "coat" } };
  renderer.writeSlice = () => {};
  renderer.wallPixels = () => 10;
  // The mask: one region (its fan leaves "opening", a hole, twice covered).
  const region = { shapeCount: 0, subtractShapes: 0, fans: {}, batches: [{ subtract: false, firstVertex: 0, vertexCount: 3, firstCover: 0, coverCount: 1 }] };
  const mask = { ...region, role: "mask", key: "mask" };
  const low = { ...region, role: "mask", key: "low" };
  // The footprint: one trace; its walls (a region edge and a skirt).
  const foot = { shapeCount: 1, subtractShapes: 0, batches: [], regionEdges: 1, skirtEdges: 1, zTop: 1, zBottom: 0 };
  const silk = { shapeCount: 1, subtractShapes: 0, batches: [], role: "silk", key: "silk" };
  const silkLow = { ...silk, key: "silkLow" };
  renderer.twins = new Map([[silk, { low: silkLow }]]);
  const pass = recordingPass();
  renderer.encodeConformal(pass, mask, { low, foot }, [silk], null, () => null);
  // Calls are recorded per pipeline; bind groups are not, so step names
  // stand in for which slice draws (shape steps are the trace or the silk).
  // "joint": a step that lies inside other copper (a track's end inside the
  // next segment), reaching past the mask's face there.
  const pixels = ["copper", "laminate", "opening", "wall", "joint", "silkOnCopper", "silkOnLaminate"];
  const inMask = ["copper", "laminate", "wall", "joint", "silkOnCopper", "silkOnLaminate"];
  const cover = (step, call, pixel) => {
    if (step === "fan") return pixel === "opening" ? 2 : inMask.includes(pixel) ? 1 : 0;
    if (step === "footShape") return ["copper", "joint", "silkOnCopper"].includes(pixel) ? 1 : 0;
    if (step === "shapeOnFoot" || step === "shapeOffFoot") return pixel.startsWith("silk") ? 1 : 0;
    if (step === "coat") return pixel === "wall" || pixel === "joint" ? 1 : 0;
    return 1;
  };
  const { stencil } = replay(pass.calls, pixels, cover);
  // The last colour step to pass at each pixel.
  const coloured = (pixel) => replay(pass.calls, [pixel], cover).colouredBy.get(pixel);
  assert.equal(coloured("copper"), "tintHigh");
  assert.equal(coloured("laminate"), "tintLow");
  assert.equal(coloured("opening"), undefined);
  // The step shows off the footprint only, never over the mask on copper
  // (depth aside: the mask over laminate lies behind a step's face).
  const unlaid = (step, call, pixel) => (step === "tintLow" ? 0 : cover(step, call, pixel));
  assert.equal(replay(pass.calls, ["wall"], unlaid).colouredBy.get("wall"), "coat");
  assert.equal(replay(pass.calls, ["joint"], unlaid).colouredBy.get("joint"), "tintHigh");
  assert.equal(coloured("silkOnCopper"), "shapeOnFoot");
  assert.equal(coloured("silkOnLaminate"), "shapeOffFoot");
  // Both kinds of step draw, between the mask over copper and the mask over laminate.
  const names = pass.calls.filter((call) => call.op === "pipeline").map((call) => call.name);
  const coat = names.indexOf("coat");
  assert.ok(coat > names.indexOf("tintHigh") && coat < names.indexOf("tintLow"));
  assert.equal(names.filter((name) => name === "coat").length, 2);
  for (const [pixel, value] of stencil) assert.equal(value & 0xe2, 0, `${pixel}: bits 1, 5, 6 and 7 clear`);
});

test("silkscreen on a trace survives the mask over laminate hidden beneath it", () => {
  const renderer = Object.create(AnalyticRenderer.prototype);
  renderer.pipelines = { color: { ...Object.fromEntries(Object.keys(STENCIL_STEPS).map((name) => [name, name])), step: "coat", regionStep: "coat" } };
  renderer.writeSlice = () => {};
  renderer.wallPixels = () => 10;
  const batches = [{ subtract: false, firstVertex: 0, vertexCount: 3, firstCover: 0, coverCount: 1 }];
  // Every layer here is one region over the pixel: a trace's footprint, the
  // mask (high and low) and a silkscreen box (high, and its low twin).
  const slice = (key) => ({ shapeCount: 0, subtractShapes: 0, fans: {}, batches, bindGroup: key, key });
  const mask = { ...slice("mask"), role: "mask" };
  const low = { ...slice("low"), role: "mask" };
  const foot = { ...slice("foot"), regionEdges: 0, skirtEdges: 0, zTop: 1, zBottom: 0 };
  const silk = { ...slice("silk"), role: "silk" };
  renderer.twins = new Map([[silk, { low: slice("silkLow") }]]);
  const pass = recordingPass();
  renderer.encodeConformal(pass, mask, { low, foot }, [silk], null, () => null);
  // On the trace, the low mask lies under the high one: its cover fails depth.
  const hidden = (step, call) => step === "coverLay" && call.group === "low";
  const { stencil, colouredBy } = replay(pass.calls, ["trace"], () => 1, {}, hidden);
  assert.equal(colouredBy.get("trace"), "coverOnFoot");
  assert.equal(stencil.get("trace") & 0xe2, 0);
});
