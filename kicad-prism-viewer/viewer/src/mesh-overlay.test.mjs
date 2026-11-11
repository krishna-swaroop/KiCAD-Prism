import assert from "node:assert/strict";
import test from "node:test";
import { demoMeshPack } from "../../tests/browser/mesh/fixture.mjs";
import { DEFAULT_MESH_STYLE, EDGE_LIFT_M, MeshOverlay, PIECE_LIFT_M, meshSlicePlacements, netTint, resolveMeshStyle } from "./mesh-overlay.js";
import { openMeshPack } from "./mesh-pack.js";
import { Renderer } from "./renderer.js";

// A two-layer board as planBoardSlices lays it out: copper slabs, mask and silk on both sides.
const slices = [
  { key: "dielectric.1", role: "dielectric", layerId: 0, z: 0.0008, faceDown: false },
  { key: "copper.front", role: "copper", layerId: 1, face: "top", z: 0.000835, zTop: 0.000835, zBottom: 0.0008, bottom: false, outer: true },
  { key: "copper.front", role: "copper", layerId: 1, face: "bottom", z: 0.0008, zTop: 0.000835, zBottom: 0.0008, bottom: false, outer: true, faceDown: true },
  { key: "copper.in1", role: "copper", layerId: 2, face: "top", z: 0.0002, zTop: 0.0002, zBottom: 0.000165, bottom: false, outer: false },
  { key: "copper.back", role: "copper", layerId: 3, face: "bottom", z: -0.000835, zTop: -0.0008, zBottom: -0.000835, bottom: true, outer: true, faceDown: true },
  { key: "mask.front", role: "mask", layerId: 4, z: 0.000855, faceDown: false },
  { key: "silkscreen.front", role: "silk", layerId: 5, z: 0.000857, faceDown: false },
  { key: "mask.back", role: "mask", layerId: 6, z: -0.000855, faceDown: true },
];

test("slices draw on their copper's outward face, past the coating on it", () => {
  const placed = meshSlicePlacements(["copper.front", "copper.in1", "copper.back", "copper.nowhere"], slices);
  const front = placed.get("copper.front");
  assert.equal(front.layerId, 1);
  assert.equal(front.face, 0.000835);
  assert.equal(front.sign, 1);
  assert.ok(Math.abs(front.coat - 0.000022) < 1e-12, "past the silkscreen, the highest coat");
  assert.deepEqual(placed.get("copper.in1"), { layerId: 2, face: 0.0002, sign: 1, coat: 0 });
  const back = placed.get("copper.back");
  assert.equal(back.sign, -1);
  assert.equal(back.face, -0.000835);
  assert.ok(Math.abs(back.coat - 0.00002) < 1e-12);
  assert.equal(placed.has("copper.nowhere"), false);
});

test("styles are checked against the pack", async () => {
  const pack = await openMeshPack(demoMeshPack({ pitchMm: 10 }));
  assert.equal(resolveMeshStyle().colorBy, null, "plain by default");
  assert.equal(resolveMeshStyle({ colorBy: "min_angle" }, DEFAULT_MESH_STYLE, pack).colorBy, "min_angle");
  assert.throws(() => resolveMeshStyle({ colorBy: "indicator" }, DEFAULT_MESH_STYLE, pack), /no element field indicator/);
  assert.throws(() => resolveMeshStyle({ threshold: { value: 1 } }, DEFAULT_MESH_STYLE, pack), /needs a field/);
  assert.deepEqual(resolveMeshStyle({ colorBy: "size", threshold: { value: "2", hide: "above" } }, DEFAULT_MESH_STYLE, pack).threshold, { value: 2, hide: "above", field: null });
  assert.throws(() => resolveMeshStyle({ colormap: "rainbow" }), /unknown colormap/);
  assert.throws(() => resolveMeshStyle({ pieces: "some" }), /pieces must be/);
});

test("net tints are neutral and distinct", () => {
  const [a, b] = [netTint(0), netTint(1)];
  assert.notDeepEqual(a, b);
  for (const tint of [a, b]) for (const value of tint) assert.ok(value > 0.3 && value < 1);
});

/** A device that records what it is asked for. */
function fakeDevice() {
  const created = [];
  return {
    created,
    createBuffer: (descriptor) => {
      const buffer = { ...descriptor, destroyed: false, destroy() { this.destroyed = true; } };
      created.push(buffer);
      return buffer;
    },
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: (descriptor) => ({ label: descriptor.label }),
    createBindGroup: (descriptor) => descriptor,
    queue: { writeBuffer() {} },
  };
}

test("the overlay draws per shown slice and layer, and accounts its memory", async () => {
  globalThis.GPUBufferUsage ??= { UNIFORM: 1, STORAGE: 2, COPY_DST: 4 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2 };
  const device = fakeDevice();
  const renderer = { device, format: "bgra8unorm", depthFormat: "depth32float", sampleCount: 4, canvas: { width: 800, height: 600 }, analytic: { slices }, invalidate() {} };
  const overlay = new MeshOverlay(renderer);
  assert.equal(overlay.gpuMemoryBytes(), 0, "nothing while no pack is shown");
  const pack = await openMeshPack(demoMeshPack({ pitchMm: 10 }));
  overlay.setPack(pack);
  assert.ok(overlay.gpuMemoryBytes() > pack.nodes.byteLength + pack.triangles.byteLength);
  assert.deepEqual(overlay.unmatchedSlices(), []);
  const calls = [];
  const pass = { setPipeline: (p) => calls.push(p.label), setBindGroup() {}, draw: (...args) => calls.push(args) };
  const offsets = new Float32Array(256);
  const counted = overlay.encode(pass, new Float32Array(16), offsets, new Set([1, 3]));
  // Two piece layers, two slices of edges, one marker draw.
  assert.equal(counted.draws, 5);
  assert.deepEqual(calls.filter(Array.isArray).slice(2, 4), [[pack.elementCount * 3, 1, 0, 0], [pack.elementCount * 3, 1, 0, 1]]);
  // A hidden layer draws nothing of its own; the separation moves it.
  assert.equal(overlay.encode(pass, new Float32Array(16), offsets, new Set([1])).draws, 3);
  offsets[1] = 0.004;
  assert.ok(Math.abs(overlay.sliceZ("copper.front", offsets) - (0.000835 + Math.fround(0.004) + 0.000022 + EDGE_LIFT_M)) < 1e-12);
  assert.ok(overlay.sliceZ("copper.front", offsets, false) < overlay.sliceZ("copper.front", offsets, true));
  assert.ok(Math.abs(overlay.sliceZ("copper.back", offsets, false) - (-0.000835 - 0.00002 - PIECE_LIFT_M)) < 1e-12);
  // Colouring uploads the field once.
  overlay.setStyle({ colorBy: "min_angle" });
  const before = device.created.length;
  overlay.setStyle({ colorBy: "min_angle", threshold: { value: 30 } });
  assert.equal(device.created.length, before);
  // Renderer accounting includes it.
  const owner = Object.create(Renderer.prototype);
  Object.assign(owner, { canvas: { width: 0, height: 0 }, entries: [], shareFrom: {}, meshOverlay: overlay });
  assert.equal(owner.gpuMemoryBytes(), overlay.gpuMemoryBytes());
  assert.equal(owner.gpuMemoryBreakdown().mesh, overlay.gpuMemoryBytes());
  const buffers = device.created.filter((buffer) => !buffer.destroyed).length;
  overlay.setPack(null);
  assert.ok(device.created.filter((buffer) => !buffer.destroyed).length < buffers);
  assert.equal(overlay.gpuMemoryBytes(), 0);
});
