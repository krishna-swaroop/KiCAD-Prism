import assert from "node:assert/strict";
import test from "node:test";
import { deflateMeshPack, demoMeshPack, demoQuadtreePacks, encodeMeshPack } from "../../tests/browser/mesh/fixture.mjs";
import {
  elementAt,
  elementInfo,
  colourFields,
  elementCorners,
  finiteRange,
  mergeMeshPacks,
  inflateMeshPack,
  isInflatedMeshPack,
  meshNets,
  meshPackSummary,
  meshSlices,
  openMeshPack,
  pieceAt,
  readMeshPack,
  thresholdKeeps,
  worstElements,
} from "./mesh-pack.js";

/** Two elements sharing the diagonal of a 2 x 2 mm square; copper on the lower one's left half. */
function twoElements(extra = {}) {
  const mm = 1e6;
  return encodeMeshPack({
    header: { bundle_sha256: "b".repeat(64), label: "two", kind: "background", ...extra.header },
    nodes: new Int32Array([0, 0, 2 * mm, 0, 2 * mm, 2 * mm, 0, 2 * mm]),
    triangles: new Uint32Array([0, 1, 2, 0, 2, 3]),
    layers: [{
      slice_key: "copper.front",
      net_key: "GND",
      vertices: new Int32Array([0, 0, mm, 0, mm, mm]),
      triangles: new Uint32Array([0, 1, 2]),
      element: new Uint32Array([0]),
      piece: new Uint32Array([4]),
    }],
    fields: extra.fields ?? [
      { name: "min_angle", unit: "deg", values: new Float32Array([45, 30]) },
      { name: "cut_fraction", unit: "1", values: new Float32Array([0.25, NaN]) },
    ],
    markers: [{ kind: "port", id: 3, x: mm, y: mm, radius: 1000, slice_keys: ["copper.front", "copper.in1"], net_key: "GND" }],
  });
}

test("reads a deflated pack as written, and an inflated one as it is", async () => {
  const inflated = twoElements();
  assert.ok(isInflatedMeshPack(inflated));
  const deflated = deflateMeshPack(inflated);
  assert.ok(!isInflatedMeshPack(deflated));
  for (const bytes of [deflated, inflated]) {
    const pack = await openMeshPack(bytes);
    assert.equal(pack.elementCount, 2);
    assert.equal(pack.nodeCount, 4);
    assert.deepEqual([...pack.triangles], [0, 1, 2, 0, 2, 3]);
    assert.equal(pack.layers[0].sliceKey, "copper.front");
    assert.equal(pack.layers[0].pieceCount, 1);
    assert.deepEqual([...pack.layers[0].piece], [4]);
    assert.deepEqual(pack.fields.map((field) => field.name), ["min_angle", "cut_fraction"]);
    assert.equal(pack.markers[0].id, 3);
  }
  // Views over the inflated buffer, uncopied.
  const buffer = await inflateMeshPack(deflated);
  const pack = readMeshPack(buffer);
  assert.equal(pack.nodes.buffer, buffer);
});

test("keys a reader does not know (spec 11 §6 lines, links, unmodelled) are ignored", async () => {
  const pack = await openMeshPack(twoElements({ header: { lines: [{ offset: 7 }], links: { count: "x" }, unmodelled: [{ kind: "trace" }] } }));
  assert.equal(pack.elementCount, 2);
});

test("a pack with no element fields is valid", async () => {
  const pack = await openMeshPack(twoElements({ fields: [] }));
  assert.deepEqual(pack.fields, []);
  assert.deepEqual(meshPackSummary(pack, "k").fields, []);
});

test("refuses other files, other versions and indices out of range", () => {
  assert.throws(() => readMeshPack(new TextEncoder().encode("PRSQPK01\0\0\0\0{}").buffer), /not a mesh pack/);
  const inflated = twoElements({ header: { version: "a9" } });
  assert.throws(() => readMeshPack(inflated.buffer), /version a9/);
  const bad = encodeMeshPack({
    header: {},
    nodes: new Int32Array([0, 0, 1, 0, 0, 1]),
    triangles: new Uint32Array([0, 1, 3]),
    layers: [],
  });
  assert.throws(() => readMeshPack(bad.buffer), /triangles: index 3 at 2 is out of range/);
});

test("summary, slices and nets", async () => {
  const pack = await openMeshPack(twoElements());
  const summary = meshPackSummary(pack, "p1");
  assert.equal(summary.key, "p1");
  assert.equal(summary.elements, 2);
  assert.equal(summary.pieceTriangles, 1);
  assert.deepEqual(summary.fields.find((field) => field.name === "cut_fraction").range, [0.25, 0.25]);
  assert.deepEqual(meshSlices(pack), ["copper.front", "copper.in1"]);
  assert.deepEqual(meshNets(pack), ["GND"]);
  assert.equal(finiteRange(new Float32Array([NaN, NaN])), null);
});

test("finds the element and the copper under a point", async () => {
  const pack = await openMeshPack(twoElements());
  const mm = 1e6;
  assert.equal(elementAt(pack, 1.5 * mm, 0.5 * mm), 0);
  assert.equal(elementAt(pack, 0.5 * mm, 1.5 * mm), 1);
  assert.equal(elementAt(pack, 2 * mm, 2 * mm) >= 0, true, "the far corner belongs to the mesh");
  assert.equal(elementAt(pack, 3 * mm, 1 * mm), -1);
  // A threshold that hides element 0 leaves the point outside.
  assert.equal(elementAt(pack, 1.5 * mm, 0.5 * mm, (e) => e !== 0), -1);
  assert.deepEqual(pieceAt(pack, pack.layers[0], 0, 0.9 * mm, 0.5 * mm), { triangle: 0, piece: 4 });
  assert.equal(pieceAt(pack, pack.layers[0], 0, 1.5 * mm, 0.5 * mm), null);
  const info = elementInfo(pack, 1);
  assert.deepEqual(info.fields, { min_angle: 30, cut_fraction: null });
  assert.deepEqual(info.cornersMm, [[0, 0], [2, 2], [0, 2]]);
  assert.equal(elementInfo(pack, 2), null);
});

test("ranks the worst elements by a field's own order, NaN skipped", async () => {
  const pack = await openMeshPack(demoMeshPack({ pitchMm: 4 }));
  const byAngle = worstElements(pack, "min_angle", { count: 3 });
  assert.equal(byAngle.length, 3);
  assert.ok(byAngle[0].value <= byAngle[1].value && byAngle[1].value <= byAngle[2].value);
  const bySize = worstElements(pack, "size", { count: 2 });
  assert.ok(bySize[0].value >= bySize[1].value);
  const cut = worstElements(pack, "cut_fraction", { count: 1e9 });
  assert.ok(cut.every((item) => Number.isFinite(item.value)));
  assert.equal(cut.length, pack.header.summary.cut_elements);
  assert.throws(() => worstElements(pack, "nothing"), /no element field nothing/);
});

test("thresholds hide one side and NaN", () => {
  assert.equal(thresholdKeeps(null, NaN), true);
  assert.equal(thresholdKeeps({ value: 0.5, hide: "below" }, 0.4), false);
  assert.equal(thresholdKeeps({ value: 0.5, hide: "below" }, 0.5), true);
  assert.equal(thresholdKeeps({ value: 0.5, hide: "above" }, 0.6), false);
  assert.equal(thresholdKeeps({ value: 0.5, hide: "above" }, NaN), false);
});

test("the demo mesh covers its board and cuts elements on the copper's sides", async () => {
  const pack = await openMeshPack(deflateMeshPack(demoMeshPack()));
  assert.equal(pack.elementCount, 600);
  assert.equal(pack.layers.length, 2);
  assert.ok(pack.header.summary.cut_elements > 0);
  // Every element is found at its centroid.
  for (let e = 0; e < pack.elementCount; e += 37) {
    const [cx, cy] = elementInfo(pack, e).centroidMm;
    assert.equal(elementAt(pack, cx * 1e6, cy * 1e6), e);
  }
});

test("quad elements follow the triangles, and a quadtree's cells are found with hanging nodes", async () => {
  const [front] = await Promise.all(demoQuadtreePacks().map((bytes) => openMeshPack(bytes)));
  assert.equal(front.triangleCount, 0);
  assert.ok(front.quadCount > 0);
  assert.equal(front.elementCount, front.quadCount);
  assert.equal(front.group, "dc");
  assert.equal(elementCorners(front, 0).length, 4);
  // Every cell is found at its centre, coarse or fine.
  for (let e = 0; e < front.elementCount; e += 1) {
    const [cx, cy] = elementInfo(front, e).centroidMm;
    assert.equal(elementAt(front, cx * 1e6, cy * 1e6), e);
  }
  const fine = elementAt(front, 19.5e6, 14.5e6);
  const coarse = elementAt(front, 2e6, 2e6);
  assert.ok(elementInfo(front, fine).boundsMm[2] - elementInfo(front, fine).boundsMm[0] < elementInfo(front, coarse).boundsMm[2] - elementInfo(front, coarse).boundsMm[0]);
});

test("a group merges into one pack with each pack's elements on its own slice", async () => {
  const packs = await Promise.all(demoQuadtreePacks().map((bytes) => openMeshPack(bytes)));
  const merged = mergeMeshPacks(packs.map((pack, k) => ({ key: `p${k}`, pack })));
  assert.equal(merged.elementCount, packs[0].elementCount + packs[1].elementCount);
  assert.deepEqual(merged.edgeRanges, [
    { sliceKey: "copper.front", first: 0, count: packs[0].elementCount },
    { sliceKey: "copper.back", first: packs[0].elementCount, count: packs[1].elementCount },
  ]);
  assert.equal(merged.layers[1].elementBase, packs[0].elementCount);
  assert.ok(merged.layers[1].element.every((e) => e >= packs[0].elementCount));
  const second = packs[0].elementCount + 3;
  assert.deepEqual(elementCorners(merged, second), elementCorners(packs[1], 3));
  assert.equal(elementInfo(merged, second).source, "p1");
  assert.equal(elementInfo(merged, second).sourceIndex, 3);
  // Per-layer values: listed, ranked over both layers, read per layer.
  assert.deepEqual(colourFields(merged).map((field) => [field.name, field.scope]), [["potential_v", "layer"]]);
  const worst = worstElements(merged, "potential_v", { count: 2 });
  assert.equal(worst[0].layer, 0, "the front plane's potential is the higher");
  const info = elementInfo(merged, worst[0].index);
  assert.equal(info.layers[0].sliceKey, "copper.front");
  assert.equal(info.layers[0].fields.potential_v, worst[0].value);
  assert.equal(mergeMeshPacks([{ key: "one", pack: packs[0] }]), packs[0]);
});
