import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BARREL_INPUT_WGSL,
  BARREL_INSTANCE_LAYOUT,
  BARREL_INSTANCE_STRIDE,
  BARREL_RECORD_STRIDE,
  BARREL_STORAGE_WGSL,
  barrelRuntime,
  barrelsAtCopperFaces,
  packBarrelInstances,
  packBarrels,
} from "./barrel-records.js";

const RECORDS = [
  { centerMm: [12.5, 7.25], drillWidthMm: 0.3, drillHeightMm: 0.4, outerWidthMm: 0.6, outerHeightMm: 0.5, startZMm: 0.8175, endZMm: -0.8175, netId: 7, objectFeatureId: 42, startLayerId: 1, endLayerId: 4 },
  { centerMm: [-3, 0.1], drillWidthMm: 1.1, drillHeightMm: 1.1, outerWidthMm: 1.7, outerHeightMm: 1.7, startZMm: 0.3, endZMm: 0.1, startLayerId: 2, endLayerId: 3 },
];

const close = (actual, expected) => actual.forEach((value, index) =>
  assert.ok(Math.abs(value - expected[index]) < 1e-12, `${index}: ${value} ≠ ${expected[index]}`));
const hex = (buffer) => Buffer.from(buffer).toString("hex");

test("both layouts pack one 48-byte record: dimensions, span, shape, ids", () => {
  const f32 = new Float32Array(packBarrelInstances(RECORDS.slice(0, 1)));
  const u32 = new Uint32Array(f32.buffer);
  assert.equal(f32.length, 12);
  close([...f32.slice(0, 8)], [0.0125, -0.00725, 0.00015, 0.00025, 0.0008175, -0.0008175, 0.00005, -Math.PI / 2].map(Math.fround));
  assert.deepEqual([...u32.slice(8, 12)], [7, 42, 1, 4]);
  assert.equal(Buffer.from(packBarrels(RECORDS)).toString("hex"), Buffer.from(packBarrelInstances(RECORDS)).toString("hex"));
});

test("barrels convert from KiCad mm (y down) to runtime metres (y up) once", () => {
  const barrel = barrelRuntime(RECORDS[0]);
  assert.equal(barrel.x, 0.0125);
  assert.equal(barrel.y, -0.00725);
  // The narrow side's half width, and that plus the plating (outer less drill, halved).
  assert.equal(barrel.drillRadius, 0.15 / 1000);
  assert.ok(Math.abs(barrel.outerRadius - 0.25 / 1000) < 1e-15);
  // 0.3 × 0.4: a 0.1 mm straight run along y (the height), a quarter turn from x, y flipped.
  assert.ok(Math.abs(barrel.halfLength - 0.05 / 1000) < 1e-15);
  assert.equal(barrel.angle, -Math.PI / 2);
  assert.equal(barrel.startZ, 0.8175 / 1000);
  assert.equal(barrel.endZ, -0.8175 / 1000);
  assert.deepEqual([barrel.netId, barrel.objectId, barrel.startLayerId, barrel.endLayerId], [7, 42, 1, 4]);
  const bare = barrelRuntime(RECORDS[1]);
  assert.deepEqual([bare.netId, bare.objectId], [0, 0]);
  // A round drill is a stadium of length 0.
  assert.deepEqual([bare.halfLength, bare.angle], [0, 0]);
});

test("a slot keeps its rotation; the record's plating wins over outer less drill", () => {
  const slot = barrelRuntime({
    centerMm: [0, 0], drillWidthMm: 1.7, drillHeightMm: 0.6, outerWidthMm: 1.75, outerHeightMm: 0.65,
    platingThicknessMm: 0.02, rotationDeg: 30, startZMm: 1, endZMm: 0,
  });
  assert.ok(Math.abs(slot.halfLength - 0.00055) < 1e-15);
  assert.ok(Math.abs(slot.angle + Math.PI / 6) < 1e-15, "30° in KiCad's y-down frame turns the other way in y-up");
  assert.ok(Math.abs(slot.outerRadius - 0.00032) < 1e-15);
});

test("barrels reach their outer copper faces, less 1 µm", () => {
  const layers = [{ id: 4, thickness_mm: 0.035 }, { id: 14, thickness_mm: 0.035 }];
  const [moved] = barrelsAtCopperFaces([{ startLayerId: 4, endLayerId: 14, startZMm: 1.5019, endZMm: -0.0175 }], layers);
  assert.ok(Math.abs(moved.startZMm - 1.5184) < 1e-12);
  assert.ok(Math.abs(moved.endZMm + 0.0340) < 1e-12);
  const [unknown] = barrelsAtCopperFaces([{ startLayerId: 9, endLayerId: 9, startZMm: 1, endZMm: 0 }], layers);
  assert.deepEqual([unknown.startZMm, unknown.endZMm], [1, 0]);
});

test("the two layouts agree field by field", () => {
  const instances = new DataView(packBarrelInstances(RECORDS));
  const storage = new DataView(packBarrels(RECORDS));
  const idsAt = Object.fromEntries(BARREL_INSTANCE_LAYOUT.attributes.map((item) => [item.shaderLocation, item.offset]));
  for (let index = 0; index < RECORDS.length; index += 1) {
    const a = index * BARREL_INSTANCE_STRIDE;
    const b = index * BARREL_RECORD_STRIDE;
    for (let word = 0; word < 6; word += 1) {
      assert.equal(instances.getFloat32(a + word * 4, true), storage.getFloat32(b + word * 4, true));
    }
    for (let word = 0; word < 4; word += 1) {
      assert.equal(instances.getUint32(a + idsAt[5] + word * 4, true), storage.getUint32(b + 32 + word * 4, true));
    }
  }
});

test("an empty list packs no instances but one zeroed storage record", () => {
  assert.equal(packBarrelInstances([]).byteLength, 0);
  const storage = packBarrels([]);
  assert.equal(storage.byteLength, BARREL_RECORD_STRIDE);
  assert.ok(new Uint8Array(storage).every((byte) => byte === 0));
});

test("the vertex layout matches the WGSL vertex input", () => {
  assert.equal(BARREL_INSTANCE_LAYOUT.arrayStride, BARREL_INSTANCE_STRIDE);
  assert.equal(BARREL_INSTANCE_LAYOUT.stepMode, "instance");
  const formats = { "float32x4": "vec4f", "float32x2": "vec2f", "uint32x4": "vec4u" };
  for (const { shaderLocation, format } of BARREL_INSTANCE_LAYOUT.attributes) {
    assert.match(BARREL_INPUT_WGSL, new RegExp(`@location\\(${shaderLocation}\\) \\w+: ${formats[format]},`));
  }
  const last = BARREL_INSTANCE_LAYOUT.attributes.at(-1);
  assert.equal(last.offset + 16, BARREL_INSTANCE_STRIDE);
});

test("the storage stride is the WGSL size of struct Barrel", () => {
  // vec4f (16) + vec2f (8) + vec2f (8) + vec4u (16, aligned to 16 at byte 32).
  assert.match(BARREL_STORAGE_WGSL, /dimensions: vec4f,\n  span: vec2f,\n  shape: vec2f,\n  ids: vec4u,/);
  assert.match(BARREL_STORAGE_WGSL, /@binding\(6\) var<storage, read> barrels: array<Barrel>;/);
  assert.equal(BARREL_RECORD_STRIDE, 16 + 16 + 16);
});

test("barrel records pack into the storage layout (ids at byte 32)", () => {
  const data = packBarrels([{
    centerMm: [10, 20], drillWidthMm: 0.4, drillHeightMm: 0.6, outerWidthMm: 0.8, outerHeightMm: 0.7,
    startZMm: -0.8, endZMm: 0.8, netId: 7, objectFeatureId: 9, startLayerId: 1, endLayerId: 4,
  }]);
  assert.equal(data.byteLength, BARREL_RECORD_STRIDE);
  const f32 = new Float32Array(data);
  const u32 = new Uint32Array(data);
  close([...f32.slice(0, 8)].map((v) => Math.fround(v)),
    [0.01, -0.02, 0.0002, 0.00035, -0.0008, 0.0008, 0.0001, -Math.PI / 2].map((v) => Math.fround(v)));
  assert.deepEqual([...u32.slice(8, 12)], [7, 9, 1, 4]);
});

test("Rust mesh-pack barrels pack a finite span from their start to their end layer", () => {
  // Written by the native crate's barrel test (mesh_pack.rs), so the reader is
  // checked against what the Rust lane actually emits.
  const records = JSON.parse(readFileSync(
    new URL("../../native/prism-kicad-native/src/testdata/mesh-pack-barrels.json", import.meta.url), "utf8"));
  assert.ok(records.length > 0);
  const f32 = new Float32Array(packBarrels(records));
  const u32 = new Uint32Array(f32.buffer);
  const stride = BARREL_RECORD_STRIDE / 4;
  records.forEach((record, index) => {
    const [startZ, endZ] = [f32[index * stride + 4], f32[index * stride + 5]];
    assert.ok(Number.isFinite(startZ) && Number.isFinite(endZ), `${record.sourceUid}: ${startZ}..${endZ}`);
    assert.equal(startZ, Math.fround(record.startZMm / 1000));
    assert.equal(endZ, Math.fround(record.endZMm / 1000));
    // The start layer is the top of the span.
    assert.ok(startZ > endZ, record.sourceUid);
    assert.deepEqual([...u32.slice(index * stride + 10, index * stride + 12)], [record.startLayerId, record.endLayerId]);
  });
});
