import assert from "node:assert/strict";
import test from "node:test";
import { demoMeshPack, demoQuadtreePacks } from "../../tests/browser/mesh/fixture.mjs";
import { DEFAULT_MESH_STYLE, EDGE_LIFT_M, MeshOverlay, PIECE_LIFT_M, copperBoundaryMasks, meshSlicePlacements, netTint, outlineTriangles, resolveMeshStyle } from "./mesh-overlay.js";
import { mergeMeshPacks, openMeshPack } from "./mesh-pack.js";
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
  // By default edges are drawn on copper, in the piece pass: two piece layers and the markers.
  assert.equal(overlay.encode(pass, new Float32Array(16), offsets, new Set([1, 3])).draws, 3);
  // Pieces off: the piece pass still runs for the edges on copper; edges off too: markers only.
  overlay.setStyle({ pieces: "none" });
  assert.equal(overlay.encode(pass, new Float32Array(16), offsets, new Set([1, 3])).draws, 3);
  overlay.setStyle({ edges: "off" });
  assert.equal(overlay.encode(pass, new Float32Array(16), offsets, new Set([1, 3])).draws, 1);
  overlay.setStyle({ pieces: "layers", edges: "all" });
  calls.length = 0;
  const counted = overlay.encode(pass, new Float32Array(16), offsets, new Set([1, 3]));
  // The whole mesh: two piece layers, two slices of edges, one marker draw.
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

test("outline triangles never draw a quad's diagonal", () => {
  // A triangle (0) and a quad (1).
  const pack = { corners: new Uint32Array([0, 1, 2, 3, 4, 5, 6]), cornerStart: new Uint32Array([0, 3, 7]), elementCount: 2 };
  const { start, corners, owners } = outlineTriangles(pack);
  assert.deepEqual([...start], [0, 1, 3]);
  assert.deepEqual([...corners], [0, 1, 2, 3, 4, 5, 3, 5, 6]);
  const element = (owner) => owner & 0x1fffffff;
  const sides = (owner) => owner >>> 29;
  assert.deepEqual([...owners].map(element), [0, 1, 1]);
  // Triangle: all sides. Quad halves (3,4,5) and (3,5,6): the side 3-5 is opposite corner 1, then corner 2.
  assert.deepEqual([...owners].map(sides), [0b111, 0b101, 0b011]);
});

test("a quadtree group draws each pack's edges on its own slice only, and colours by a layer's values", async () => {
  globalThis.GPUBufferUsage ??= { UNIFORM: 1, STORAGE: 2, COPY_DST: 4 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2 };
  const device = fakeDevice();
  const renderer = { device, format: "bgra8unorm", depthFormat: "depth32float", sampleCount: 4, canvas: { width: 800, height: 600 }, analytic: { slices }, invalidate() {} };
  const overlay = new MeshOverlay(renderer);
  const packs = await Promise.all(demoQuadtreePacks().map((bytes) => openMeshPack(bytes)));
  overlay.setPack(mergeMeshPacks(packs.map((pack, k) => ({ key: `p${k}`, pack }))));
  overlay.setStyle({ edges: "all" });
  const draws = [];
  const pass = { setPipeline() {}, setBindGroup() {}, draw: (...args) => draws.push(args) };
  overlay.encode(pass, new Float32Array(16), new Float32Array(256), new Set([1, 3]));
  const halves = (pack) => pack.elementCount * 2 * 3;
  // Two piece layers, then the edges: the front pack's on slot 0, the back pack's on slot 1.
  assert.deepEqual(draws.slice(2), [[halves(packs[0]), 1, 0, 0], [halves(packs[1]), 1, halves(packs[0]), 1]]);
  assert.equal(overlay.setStyle({ colorBy: "potential_v" }).colorBy, "potential_v");
  assert.equal(overlay.scopeOf("potential_v"), "layer");
  assert.ok(overlay.colorRange()[1] > 0.019);
  assert.equal(overlay.layerBase(0, "potential_v"), 0);
  assert.equal(overlay.layerBase(1, "potential_v"), packs[0].elementCount);
  assert.equal(overlay.layerBase(0, "nothing"), 0xffffffff);
});

test("the copper's boundary inside an element is outlined; sides it shares or that lie on the element's are not", () => {
  // One element, the square (0,0)-(10,10) as two triangles; copper is its left half,
  // two triangles with a shared diagonal, each with repeated (unshared) vertex copies.
  const pack = { nodes: new Int32Array([0, 0, 10, 0, 10, 10, 0, 10]), corners: new Uint32Array([0, 1, 2, 3]), cornerStart: new Uint32Array([0, 4]) };
  const layer = {
    vertices: new Int32Array([0, 0, 5, 0, 5, 10, 0, 0, 5, 10, 0, 10]),
    triangles: new Uint32Array([0, 1, 2, 3, 4, 5]),
    element: new Uint32Array([0, 0]),
  };
  const masks = copperBoundaryMasks(layer, pack);
  // Triangle 0 (0,0)-(5,0)-(5,10): the side x = 5 (opposite corner 0) is boundary; (0,0)-(5,0) lies on the element; the diagonal is shared.
  assert.equal(masks[0], 0b001);
  // Triangle 1 (0,0)-(5,10)-(0,10): its side x = 5 is... none: (5,10)-(0,10) and (0,10)-(0,0) lie on the element.
  assert.equal(masks[1], 0);
  assert.equal(resolveMeshStyle({ edges: true }).edges, "copper");
  assert.equal(resolveMeshStyle({ edges: false }).edges, "off");
  assert.throws(() => resolveMeshStyle({ edges: "some" }), /edges must be/);
});
