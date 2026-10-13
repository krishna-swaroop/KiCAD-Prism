import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  composeFieldRasters,
  denseOperationValues,
  dielectricColor,
  loadAnalyticWasm,
  openAnalyticPack,
  operationCount,
  planBoardSlices,
  planCopperSlices,
  planWalls,
  WALL_BAND,
  WALL_SLAB,
  sliceBoundsMm,
  valueRange,
} from "./analytic-pack.js";
import { analyticFeatureId, copperPlane, copperZOffset } from "./analytic-board.js";
import { BARREL_FLAGS, BARREL_FLOATS, BARREL_WORDS, castellationEdge, operationNetIds, planBarrels } from "./analytic-pack.js";
import { BATCH_WORDS, COVER_WORDS, SHAPE_WORDS } from "./analytic-shaders.js";

const vendor = new URL("../vendor/kicad-monkey-analytic/", import.meta.url);
const provenance = JSON.parse(readFileSync(new URL("provenance.json", vendor), "utf8"));
const fixture = readFileSync(new URL("../../tests/fixtures/analytic/demo.kmpack", import.meta.url));

test("the vendored WASM is the build its provenance records", () => {
  assert.match(provenance.source.revision, /^[0-9a-f]{40}$/);
  assert.deepEqual(provenance.build.features, ["materialization"]);
  for (const [file, sha] of Object.entries(provenance.files)) {
    const actual = createHash("sha256").update(readFileSync(new URL(file, vendor))).digest("hex");
    assert.equal(actual, sha, file);
  }
});

test("a pack opens and its copper lowers to records in Node", async () => {
  await loadAnalyticWasm(readFileSync(new URL("kicad_monkey_analytic_bg.wasm", vendor)));
  const pack = await openAnalyticPack(fixture);
  try {
    assert.equal(pack.header.schema, "kicad_monkey.materialization.a0");
    assert.equal(pack.header.binding.length, 0, "the header leaves the binding out");
    assert.equal(operationCount(pack.header), 20);
    const front = pack.lowerSlice("copper.front");
    assert.equal(front.shapes.length % SHAPE_WORDS, 0);
    assert.equal(front.covers.length % COVER_WORDS, 0);
    assert.equal(front.batches.length % BATCH_WORDS, 0);
    // The via and the through pad cut front copper first.
    assert.equal(front.subtractShapes, 2);
    assert.equal(front.fanVertices.length % 6, 0);
    assert.equal(front.stats.cubics_flattened, 1);
    const index = front.shapes[SHAPE_WORDS * 2 + 1];
    assert.equal(typeof pack.binding(index).source_uid, "string");
    assert.throws(() => pack.lowerSlice("no.such.slice"));
  } finally {
    pack.free();
  }
});

test("copper slices map to the viewer's layers by KiCad name", async () => {
  await loadAnalyticWasm(readFileSync(new URL("kicad_monkey_analytic_bg.wasm", vendor)));
  const pack = await openAnalyticPack(fixture);
  const layers = [
    { id: 4, name: "F.Cu", z_mm: 0.7597, thickness_mm: 0.035 },
    { id: 14, name: "B.Cu", z_mm: -0.7597, thickness_mm: 0.035 },
  ];
  const { planned, unmatched } = planCopperSlices(pack.header, layers);
  assert.deepEqual(unmatched, []);
  assert.deepEqual(planned.map((slice) => [slice.key, slice.layerId, slice.outer]), [
    ["copper.front", 4, true],
    ["copper.back", 14, true],
  ]);
  // The mesh copper's plane: each layer's centre.
  assert.ok(Math.abs(planned[0].z - 0.0007597) < 1e-12);
  assert.ok(Math.abs(planned[1].z + 0.0007597) < 1e-12);
  assert.deepEqual(sliceBoundsMm(pack.header, "no.such.slice"), null);
  const missing = planCopperSlices(pack.header, layers.slice(0, 1));
  assert.deepEqual(missing.unmatched, ["copper.back"]);
  pack.free();
});

test("the copper height offset comes from loaded mesh copper", () => {
  const layers = [{ id: 4, name: "F.Cu", z_mm: 0.7597 }];
  const entry = { kind: "copper", layerId: 4, quantMin: [0, 0, 0.0014844, 0], quantSize: [1, 1, 0.000035, 0] };
  assert.ok(Math.abs(copperZOffset([entry], layers) - 0.0007422) < 1e-12);
  assert.equal(copperZOffset([], layers), 0);
  // A flat mesh (degenerate z, stored as size 1) lies on its plane.
  const flat = { kind: "copper", layerId: 4, quantMin: [0, 0, 0.0007597, 0], quantSize: [1, 1, 1, 0] };
  assert.ok(Math.abs(copperZOffset([flat], layers)) < 1e-12);
});

test("each slice lies on its own layer's mesh copper face", () => {
  const top = { kind: "copper", layerId: 4, quantMin: [0, 0, 0.0014844, 0], quantSize: [1, 1, 0.000035, 0] };
  const flat = { kind: "copper", layerId: 6, quantMin: [0, 0, 0.0002, 0], quantSize: [1, 1, 1, 0] };
  assert.ok(Math.abs(copperPlane([top, flat], 4) - 0.0015194) < 1e-12);
  assert.ok(Math.abs(copperPlane([top, flat], 4, true) - 0.0014844) < 1e-12);
  assert.equal(copperPlane([top, flat], 6), 0.0002);
  assert.equal(copperPlane([top, flat], 9), null);
});

test("operation values are dense with gaps as NaN", () => {
  const dense = denseOperationValues({ 1: 5, 3: -2, 9: 1 }, 4);
  assert.equal(dense.length, 4);
  assert.ok(Number.isNaN(dense[0]) && Number.isNaN(dense[2]));
  assert.deepEqual([dense[1], dense[3]], [5, -2]);
  assert.deepEqual(valueRange(dense), [-2, 5]);
  assert.deepEqual(valueRange([Number.NaN]), [0, 1]);
  assert.deepEqual([...denseOperationValues([1, 2, 3], 2)], [1, 2]);
});

test("field tiles of a slice compose into one raster on their grid", () => {
  const tile = (x, y, values) => ({ slice_key: "copper.front", origin_nm: [x, y], pitch_nm: 500_000, width: 2, height: 1, values: Float32Array.from(values) });
  const rasters = composeFieldRasters([tile(1_000_000, 0, [1, 2]), tile(2_000_000, 500_000, [3, 4])]);
  const raster = rasters.get("copper.front");
  assert.deepEqual([raster.originMm, raster.pitchMm, raster.width, raster.height], [[1, 0], 0.5, 4, 2]);
  assert.deepEqual([...raster.values].map((v) => (Number.isNaN(v) ? null : v)), [1, 2, null, null, null, null, 3, 4]);
  assert.throws(() => composeFieldRasters([tile(0, 0, [1, 2]), { ...tile(250_000, 0, [1, 2]) }]), /off its pitch grid/);
  assert.throws(() => composeFieldRasters([tile(0, 0, [1, 2]), { ...tile(0, 0, [1, 2]), pitch_nm: 1 }]), /share one positive pitch/);
});

test("barrels span their drawn conductors, less what a backdrill bores", () => {
  const header = { stack: { slices: [
    { key: "copper.front", order: 3, role: "conductor", thickness_nm: 35000 },
    { key: "dielectric.1", order: 4, role: "dielectric" },
    { key: "copper.in1", order: 5, role: "conductor", thickness_nm: 15000 },
    { key: "copper.back", order: 7, role: "conductor", thickness_nm: 35000 },
  ] } };
  const slices = [
    { key: "copper.front", layerId: 4, z: 0.0015, bottom: false },
    { key: "copper.in1", layerId: 6, z: 0.0008, bottom: false },
    { key: "copper.back", layerId: 14, z: 0, bottom: true },
  ];
  const NONE = 0xffffffff;
  const floats = new Float32Array(3 * BARREL_FLOATS);
  const words = new Uint32Array(3 * BARREL_WORDS);
  floats.set([10, 20, 0.4, Math.PI / 2, 0.3, 0.025, 0, 0], 0);
  words.set([9, 3, 7, NONE, NONE, 0, 0, 0], 0);
  // Back-drilled through In1: the barrel keeps only the front copper.
  floats.set([1, 1, 0, 0, 0.1, 0.025, 0, 0], BARREL_FLOATS);
  words.set([11, 3, 7, NONE, 5, 0, 0, 0], BARREL_WORDS);
  // A span with no drawn conductor is skipped.
  words.set([12, 8, 9, NONE, NONE, 0, 0, 0], 2 * BARREL_WORDS);
  const planned = planBarrels(header, { floats, words, skipped: 1 }, slices);
  assert.equal(planned.count, 2);
  assert.equal(planned.skipped, 2);
  const f = new Float32Array(planned.data);
  const w = new Uint32Array(planned.data);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // World metres, y up, the angle turned with it; top face of F.Cu to underside of B.Cu.
  assert.ok([0.01, -0.02, 0.0004, -Math.PI / 2, 0.0003, 0.000025, 0.0015, 0].every((value, i) => near(f[i], Math.fround(value))));
  assert.deepEqual([...w.slice(8, 12)], [9, 4, 14, 0]);
  // Not castellated: the whole plane (0 <= 1 everywhere).
  assert.deepEqual([...f.slice(12, 16)], [0, 0, 1, 0]);
  assert.ok(near(f[16 + 6], 0.0015) && near(f[16 + 7], Math.fround(0.0015 - 0.000035)));
  assert.deepEqual([...w.slice(24, 28)], [11, 4, 4, 0]);
});

test("a castellated hole keeps the board's side of its nearest outline edge", () => {
  // A 10 mm square board (board mm, y down), each edge with the board on its
  // left normal (-y, x), as the lowering writes them: the right edge runs
  // from (10, 0) to (10, 10).
  const square = [0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0];
  const edge = castellationEdge(square, [10, 5], 0.5);
  // Outward is +x in the world; the board is where x <= 10 mm.
  assert.ok(Math.abs(edge.normal[0] - 1) < 1e-12 && Math.abs(edge.normal[1]) < 1e-12);
  assert.ok(Math.abs(edge.offset - 0.01) < 1e-12);
  // The bottom edge (board y = 10, world y = -0.01): outward is the world's -y.
  const bottom = castellationEdge(square, [5, 10], 0.5);
  assert.ok(Math.abs(bottom.normal[1] + 1) < 1e-12 && Math.abs(bottom.offset - 0.01) < 1e-12);
  assert.equal(castellationEdge(square, [5, 5], 0.5), null);
  // Planned: the flag rides through, the half-plane with it.
  const header = { stack: { slices: [{ key: "copper.front", role: "conductor", order: 0 }, { key: "copper.back", role: "conductor", order: 2 }] } };
  const slices = [
    { key: "copper.front", role: "copper", layerId: 1, zTop: 0.0008, zBottom: 0.00077 },
    { key: "copper.back", role: "copper", layerId: 2, zTop: -0.00077, zBottom: -0.0008 },
  ];
  const floats = new Float32Array([10, 5, 0, 0, 0.4, 0.025, 0, 0]);
  const words = new Uint32Array([3, 0, 2, 0xffffffff, 0xffffffff, BARREL_FLAGS.castellated | BARREL_FLAGS.filled, 0, 0]);
  const planned = planBarrels(header, { floats, words }, slices, square);
  const f = new Float32Array(planned.data);
  assert.equal(new Uint32Array(planned.data)[11], BARREL_FLAGS.castellated | BARREL_FLAGS.filled);
  assert.ok(Math.abs(f[12] - 1) < 1e-6 && Math.abs(f[14] - 0.01) < 1e-6);
});

test("operations carry the viewer's net ids, and name the feature a click selects", async () => {
  const pack = await openAnalyticPack(fixture);
  const netIds = operationNetIds(pack, [{ id: 0, name: "" }, { id: 7, name: "GND" }]);
  // The track (1) and a via land (3) are on GND; the profile (0) and an unnetted graphic (11) on none.
  assert.deepEqual([netIds[0], netIds[1], netIds[3], netIds[11]], [0, 7, 7, 0]);
  // A hierarchical net's pack name may be any of the viewer net's aliases; a net's own name wins.
  const aliased = operationNetIds(pack, [{ id: 9, name: "/Power/GND", aliases: ["GND"] }]);
  assert.deepEqual([aliased[1], aliased[3]], [9, 9]);
  const named = operationNetIds(pack, [{ id: 9, name: "/Power/GND", aliases: ["GND"] }, { id: 7, name: "GND" }]);
  assert.equal(named[1], 7);
  const features = [{ id: 40, sourceUid: "v1", netId: 0 }, { id: 41, sourceUid: "v1", netId: 7 }, { id: 42, sourceUid: "t1", netId: 7 }];
  const featuresBySource = new Map();
  for (const feature of features) featuresBySource.set(feature.sourceUid, [...(featuresBySource.get(feature.sourceUid) || []), feature]);
  const state = { pack, netIds, featuresBySource };
  assert.equal(analyticFeatureId(state, 1), 42);
  // Of a source's features, the one on the operation's net.
  assert.equal(analyticFeatureId(state, 3), 41);
  assert.equal(analyticFeatureId(state, 0), 0);
  pack.free();
});

test("a board's outside faces are the top of its highest dielectric and the bottom of its lowest", () => {
  const bounds = { min_x_nm: 0, min_y_nm: 0, max_x_nm: 1e7, max_y_nm: 1e7 };
  const names = ["F.Cu", "core1", "In1.Cu", "core2", "B.Cu"];
  const roles = ["conductor", "dielectric", "conductor", "dielectric", "conductor"];
  const header = {
    stack: { slices: names.map((name, order) => ({ key: `s${order}`, order, role: roles[order], kicad_layer: name })) },
    chunks: names.map((_, order) => ({ slice_key: `s${order}`, bounds })),
  };
  const z = [0.8, 0.4, 0, -0.4, -0.8];
  const layers = names.map((name, index) => ({ id: index + 1, name, z_mm: z[index], thickness_mm: roles[index] === "dielectric" ? 0.7 : 0.035 }));
  const { planned } = planBoardSlices(header, layers);
  const faces = planned.filter((slice) => slice.role === "dielectric");
  assert.equal(faces.length, 4);
  const skins = faces.filter((slice) => slice.skin).map((slice) => [slice.key, slice.face]);
  assert.deepEqual(skins.sort(), [["s1", "top"], ["s3", "bottom"]]);
  assert.ok(planned.filter((slice) => slice.role !== "dielectric").every((slice) => slice.skin === undefined));
});

test("each dielectric has walls of its own height; copper levels have bands on a solid board", () => {
  const bounds = { min_x_nm: 0, min_y_nm: 0, max_x_nm: 1e7, max_y_nm: 1e7 };
  const names = ["F.Mask", "F.Cu", "core1", "In1.Cu", "core2", "B.Cu", "B.Mask"];
  const roles = ["solder_mask", "conductor", "dielectric", "conductor", "dielectric", "conductor", "solder_mask"];
  const header = {
    stack: { slices: names.map((name, order) => ({ key: `s${order}`, order, role: roles[order], kicad_layer: name, side: order < 3 ? "front" : "back" })) },
    chunks: names.map((_, order) => ({ slice_key: `s${order}`, bounds })),
  };
  // Millimetres: copper 0.035 (outer) and 0.015, cores 0.7, masks 0.01, stacked flush.
  const z = [0.7875, 0.765, 0.3975, 0, -0.3575, -0.725, -0.7475];
  const thickness = [0.01, 0.035, 0.7, 0.015, 0.7, 0.035, 0.01];
  const layerRole = { solder_mask: "soldermask", conductor: "copper", dielectric: "dielectric" };
  const layers = names.map((name, index) => ({ id: index + 1, name, role: layerRole[roles[index]], z_mm: z[index], thickness_mm: thickness[index] }));
  const { planned } = planBoardSlices(header, layers);
  const square = new Float32Array([0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0]);
  const lowered = new Map(planned.map((slice) => [slice.key, { contourEdges: slice.role === "dielectric" ? square : new Float32Array(0) }]));
  const { data, count } = planWalls(planned, lowered, layers);
  const floats = new Float32Array(data);
  const words = new Uint32Array(data);
  const walls = Array.from({ length: count }, (_, i) => ({ top: floats[i * 12 + 4], bottom: floats[i * 12 + 5], layers: [words[i * 12 + 8], words[i * 12 + 9]], kind: words[i * 12 + 10] }));
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // Two cores, four edges each, exactly their slabs.
  assert.equal(walls.filter((wall) => wall.kind === WALL_SLAB).length, 8);
  const slabs = walls.filter((wall) => wall.kind === WALL_SLAB);
  assert.ok(slabs.every((wall) => (near(wall.top, 0.0007475) && near(wall.bottom, 0.0000475)) || (near(wall.top, -0.0000075) && near(wall.bottom, -0.0007075))));
  // Bands: F.Cu up to the mask's outer face, In1 its own, B.Cu down to the back mask's.
  assert.equal(walls.filter((wall) => wall.kind === WALL_BAND).length, 12);
  const bands = walls.filter((wall) => wall.kind === WALL_BAND);
  assert.ok(bands.some((wall) => near(wall.top, 0.0007925) && near(wall.bottom, 0.0007475) && wall.layers[0] === 2));
  assert.ok(bands.some((wall) => near(wall.top, 0.0000075) && near(wall.bottom, -0.0000075) && wall.layers[0] === 4));
  assert.ok(bands.some((wall) => near(wall.top, -0.0007075) && near(wall.bottom, -0.0007525) && wall.layers[0] === 6));
});

test("a dielectric takes its stackup colour: a KiCad name, a hex colour, else FR4 natural", () => {
  const close = (actual, expected) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-3, `${actual} ~ ${expected}`));
  // FR4 natural is sRGB (109, 116, 75).
  close(dielectricColor("FR4 natural"), [109 / 255, 116 / 255, 75 / 255, 1]);
  close(dielectricColor(" fr4 NATURAL "), dielectricColor("FR4 natural"));
  close(dielectricColor("Polyimide"), [205 / 255, 130 / 255, 0, 1]);
  close(dielectricColor("#FFFFFF80"), [1, 1, 1, 1]);
  close(dielectricColor("Not specified"), dielectricColor("FR4 natural"));
  close(dielectricColor(undefined), dielectricColor("FR4 natural"));
});
